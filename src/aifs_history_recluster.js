const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { processWPCycloneClusterMemberExclusive } = require('./lib/cluster_member_exclusive');

const INSTITUTIONS = Object.freeze(['aifs-cai']);
const CLUSTER_NUMBER = /^C-\d+$/;
const RAW_NUMBER = /^IC/;

function parseBoundary(value) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:00|06|12|18))?$/.test(value || '')) {
    throw new Error('Expected UTC YYYY-MM-DD or YYYY-MM-DDT00/T06/T12/T18');
  }
  const cycle = value.length === 10 ? `${value}T00` : value;
  const date = new Date(`${cycle}:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 13) !== cycle) {
    throw new Error(`Invalid UTC boundary: ${value}`);
  }
  return date;
}

// Ignore per-track MongoDB subdocument IDs and derived fields in accounting.
function trackKey(track) {
  return JSON.stringify([track.fcType, track.ensembleNumber, track.track]);
}

function trackInventory(records) {
  return records.flatMap(record => record.tracks || []).map(trackKey).sort();
}

async function reclusterCycle(collection, date, ins, {
  apply = false, sourceRecords = null, backupDir = path.resolve(__dirname, '../../ruc-tc-backups')
} = {}) {
  if (!INSTITUTIONS.includes(ins) || !(date instanceof Date) ||
      !Number.isFinite(date.getTime())) {
    throw new Error('Expected aifs-cai and a valid initTime');
  }
  const scope = { ins, basinShort2: 'WP', initTime: date };
  const existing = await collection.find(scope).sort({ tcID: 1, _id: 1 }).toArray();
  const raw = existing.filter(record => RAW_NUMBER.test(record.cycloneNumber || ''));
  const oldClusters = existing.filter(record => CLUSTER_NUMBER.test(record.cycloneNumber || ''));
  // Prefer original IC tracks; otherwise reconstruct previously generated C-* clusters.
  if (sourceRecords !== null && (!Array.isArray(sourceRecords) || !sourceRecords.length ||
      sourceRecords.some(record => record.ins !== ins || record.basinShort2 !== 'WP' ||
        !RAW_NUMBER.test(record.cycloneNumber || '') || +new Date(record.initTime) !== +date))) {
    throw new Error('Expected a complete IC snapshot for the same institution, basin and initTime');
  }
  const sources = sourceRecords !== null ? sourceRecords : raw.length ? raw : oldClusters;
  const summary = { ins, initTime: date.toISOString(), source: sourceRecords !== null ? 'download' : raw.length ? 'raw' : 'clusters',
    sourceRecords: sources.length, oldClusters: oldClusters.length, rawRecords: raw.length, dryRun: !apply };
  if (!sources.length) return { ...summary, status: 'skipped', reason: 'no_disturbances' };
  if (sources.some(record => !Array.isArray(record.tracks) || !record.tracks.length)) {
    throw new Error('Source contains a disturbance without ensemble tracks');
  }
  const input = sources.map((record, index) => ({ ...record,
    cycloneNumber: `IC-history-${index}`, initTime: date.toISOString() }));
  // History repairs always use the new algorithm, regardless of live rollback settings.
  const result = processWPCycloneClusterMemberExclusive(input, { ins });
  const output = result.tracks_list_enhanced.data.map(record => ({ ...record, initTime: date, fillStatus: 2 }));
  if (!output.length || new Set(output.map(record => record.tcID)).size !== output.length ||
      !isDeepStrictEqual(trackInventory(sources), trackInventory(output))) {
    throw new Error('Clustering returned invalid IDs or changed the source track inventory');
  }
  Object.assign(summary, { sourceTracks: trackInventory(sources).length,
    outputRecords: output.length, clustering: result.clusterStats });
  if (!apply) return { ...summary, status: 'previewed' };

  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `cyclones-${ins}-${date.toISOString().slice(0, 13)
    .replace(/[-:T]/g, '')}-${Date.now()}-${process.pid}.bson`);
  const bson = new (require('bson').BSON)();
  fs.writeFileSync(backup, Buffer.concat(existing.map(record => bson.serialize(record))), { flag: 'wx' });
  try {
    // Write and verify the replacement before removing obsolete cluster IDs.
    // Delete consumed IC records only after the replacement clusters are verified.
    const now = new Date();
    for (const record of output) {
      const previous = oldClusters.find(old => old.tcID === record.tcID);
      await collection.replaceOne({ ...scope, tcID: record.tcID }, {
        ...record, ...(previous ? { _id: previous._id } : {}),
        createdAt: previous && previous.createdAt || now, updatedAt: now
      }, { upsert: true });
    }
    async function verify() {
      const written = await collection.find({ ...scope, cycloneNumber: CLUSTER_NUMBER }).toArray();
      for (const record of output) {
        const matches = written.filter(item => item.tcID === record.tcID);
        if (matches.length !== 1 || Object.keys(record).some(key =>
          !isDeepStrictEqual(matches[0][key], record[key]))) {
          throw new Error(`Post-write verification failed: ${record.tcID}`);
        }
      }
      return written;
    }
    await verify();
    await collection.deleteMany({ ...scope, cycloneNumber: CLUSTER_NUMBER,
      tcID: { $nin: output.map(record => record.tcID) } });
    const written = await verify();
    if (written.length !== output.length) throw new Error('Stale or duplicate clusters remain');
    if (raw.length) {
      await collection.deleteMany({ ...scope, cycloneNumber: RAW_NUMBER,
        _id: { $in: raw.map(record => record._id) } });
      const remainingRaw = await collection.find({ ...scope, cycloneNumber: RAW_NUMBER }).toArray();
      if (remainingRaw.length) throw new Error('IC disturbances remain after cleanup');
    }
  } catch (error) {
    throw new Error(`${error.message}; backup: ${backup}`);
  }
  return { ...summary, removedRaw: raw.length, status: 'repaired', backup };
}

async function reclusterHistory(collection, { start = null, before = null,
  institutions = INSTITUTIONS, delayMs = 0, rawOnly = false, onCycle = () => {}, ...options } = {}) {
  if ((before !== null && (!(before instanceof Date) || !Number.isFinite(before.getTime()))) ||
      (start !== null && (!(start instanceof Date) || !Number.isFinite(start.getTime()) || (before !== null && start >= before))) ||
      !Number.isSafeInteger(delayMs) || delayMs < 0 || !institutions.length ||
      institutions.some(ins => !INSTITUTIONS.includes(ins))) {
    throw new Error('Invalid historical range, institutions, or delay');
  }
  const summary = { cycles: 0, repaired: 0, previewed: 0, skipped: 0, sourceTracks: 0, outputRecords: 0, removedRaw: 0 };
  // Discover actual stored initialization times, one batch at a time. No full
  // history prefetch and no assumption that the oldest record is a 6-hour cycle.
  for (const ins of institutions) {
    let last = null;
    while (true) {
      const timeRange = { ...(before ? { $lt: before } : {}), ...(last ? { $gt: last } : start ? { $gte: start } : {}) };
      const next = await collection.findOne({ ins, basinShort2: 'WP',
        ...(Object.keys(timeRange).length ? { initTime: timeRange } : {}),
        cycloneNumber: rawOnly ? RAW_NUMBER : /^(?:IC|C-\d+$)/ }, { sort: { initTime: 1 }, projection: { initTime: 1 } });
      if (!next) break;
      const date = new Date(next.initTime);
      if (summary.cycles && delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      try {
        const result = await reclusterCycle(collection, date, ins, options);
        await onCycle(result);
        summary.cycles++;
        summary[result.status]++;
        summary.sourceTracks += result.sourceTracks || 0;
        summary.outputRecords += result.outputRecords || 0;
        summary.removedRaw += result.removedRaw || 0;
      } catch (error) {
        throw new Error(`${ins} ${date.toISOString()} failed; stopped. Resume with --ins ${ins} ` +
          `--start ${date.toISOString().slice(0, 13)} after checking the backup: ${error.message}`);
      }
      last = date;
    }
  }
  return summary;
}

module.exports = { INSTITUTIONS, parseBoundary, reclusterCycle, reclusterHistory };
