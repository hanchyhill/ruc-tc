const fs = require('fs');
const path = require('path');
const { processFNV3CSVData } = require('./resolve.CSV_fnv3');
const { processWPCycloneCluster } = require('./lib/cluster_legacy');
const { DEFAULT_CLUSTER_OPTIONS, processWPCycloneClusterMemberExclusive } =
  require('./lib/cluster_member_exclusive');

const HOUR = 60 * 60 * 1000;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function haversine(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (((b[0] - a[0] + 540) % 360) - 180) * radians;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) *
    Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(q)));
}

function pairDistance(a, b) {
  const byTime = new Map(a.points.map(point => [Date.parse(a.initTime) + point[0] * HOUR, point]));
  const distances = [];
  const times = [];
  for (const point of b.points) {
    const time = Date.parse(b.initTime) + point[0] * HOUR;
    if (!byTime.has(time)) continue;
    distances.push(haversine(byTime.get(time).slice(1), point.slice(1)));
    times.push(time);
  }
  if (distances.length < 3 || Math.max(...times) - Math.min(...times) < 12 * HOUR) return null;
  return median(distances);
}

function groupMetrics(records, labelKey, includeNoise) {
  const groups = new Map();
  for (const record of records) {
    const label = record[labelKey];
    if (label === null || (!includeNoise && label === 9999)) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(record);
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([id, members]) => {
    const pairDistances = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const distance = pairDistance(members[i], members[j]);
        if (distance !== null) pairDistances.push(distance);
      }
    }
    return {
      id,
      count: members.length,
      distinctMembers: new Set(members.map(record => record.member)).size,
      medianPairKm: median(pairDistances),
      comparablePairs: pairDistances.length,
      totalPairs: members.length * (members.length - 1) / 2
    };
  });
}

function readInput(filePath) {
  if (path.extname(filePath).toLowerCase() === '.csv') {
    const result = processFNV3CSVData(filePath);
    if (!result || !Array.isArray(result.data)) throw new Error('CSV parsing failed');
    return result.data;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = Array.isArray(parsed) ? parsed : parsed.data;
  if (!Array.isArray(data)) throw new TypeError('Expected a JSON array or an object with data[]');
  return data;
}

function buildDataset(data, inputName, options) {
  const oldResult = processWPCycloneCluster(JSON.parse(JSON.stringify(data)));
  const newResult = processWPCycloneClusterMemberExclusive(data, options);
  const oldTracks = oldResult.cyclones_WP_list.flatMap(cyclone => cyclone.tracks || []);
  const newById = new Map();
  for (const group of newResult.tracks_list) {
    for (const track of group.tracks) newById.set(track.trackId, { cluster: group.clusters_id, reason: null });
  }
  for (const track of newResult.unassignedTracks) {
    newById.set(track.trackId, { cluster: null, reason: track.reason });
  }
  const records = [];
  for (const cyclone of data.filter(item => item && item.basinShort2 === 'WP' &&
      String(item.cycloneNumber || '').startsWith('I'))) {
    for (const track of cyclone.tracks || []) {
      const id = records.length;
      const assignment = newById.get(id);
      if (!assignment) throw new Error(`Missing new assignment for track ${id}`);
      records.push({
        id,
        member: track.ensembleNumber,
        tcID: cyclone.tcID,
        initTime: cyclone.initTime,
        fcType: track.fcType,
        oldCluster: oldTracks[id].clusters_id,
        newCluster: assignment.cluster,
        reason: assignment.reason,
        points: (track.track || []).filter(point => Array.isArray(point) &&
          Array.isArray(point[1]) && Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1][0])) && Number.isFinite(Number(point[1][1])))
          .map(point => [Number(point[0]), Number(point[1][0]), Number(point[1][1])])
      });
    }
  }
  const oldGroups = groupMetrics(records, 'oldCluster', true);
  const newGroups = groupMetrics(records, 'newCluster', false);
  const duplicateOld = oldGroups.filter(group => group.id !== 9999 &&
    group.count > group.distinctMembers);
  const noConflictOld = oldGroups.filter(group => group.id !== 9999 &&
    group.count === group.distinctMembers);
  const preservedNoConflict = noConflictOld.filter(group => {
    const destinations = new Set(records.filter(record => record.oldCluster === group.id)
      .map(record => record.newCluster));
    return destinations.size === 1 && !destinations.has(null);
  });
  const oldClusterCount = oldGroups.filter(group => group.id !== 9999).length;
  return {
    inputName,
    generatedAt: new Date().toISOString(),
    options: { ...DEFAULT_CLUSTER_OPTIONS, ...options },
    summary: {
      inputTracks: records.length,
      oldClusters: oldClusterCount,
      oldNoise: records.filter(record => record.oldCluster === 9999).length,
      oldDuplicateGroups: duplicateOld.length,
      oldExtraDuplicates: duplicateOld.reduce((sum, group) =>
        sum + group.count - group.distinctMembers, 0),
      noConflictOldClusters: noConflictOld.length,
      preservedNoConflictClusters: preservedNoConflict.length,
      newClusters: newGroups.length,
      newClustersFromPool: newResult.clusterStats.newClusters,
      reassignedToExisting: newResult.clusterStats.reassigned,
      sameMemberSwaps: newResult.clusterStats.swappedMembers,
      newAssigned: records.filter(record => record.newCluster !== null).length,
      newUnassigned: records.filter(record => record.newCluster === null).length,
      newDuplicateGroups: newGroups.filter(group => group.count > group.distinctMembers).length,
      newExtraDuplicates: newGroups.reduce((sum, group) =>
        sum + group.count - group.distinctMembers, 0)
    },
    oldGroups,
    newGroups,
    records
  };
}

function build(inputFile, outputFile, options = {}) {
  const dataset = buildDataset(readInput(inputFile), path.basename(inputFile), options);
  const template = fs.readFileSync(path.join(__dirname, 'fnv3_cluster_visualization.template.html'), 'utf8');
  const json = JSON.stringify(dataset).replace(/</g, '\\u003c');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, template.replace('__FNV3_DATA__', json), 'utf8');
  return { output: outputFile, summary: dataset.summary };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const input = path.resolve(args[0] || path.join(__dirname, '../demo/fnv3_basic_result.json'));
  const output = path.resolve(args[1] || path.join(__dirname, '../doc/fnv3_cluster_comparison.html'));
  try {
    const options = args[2] ? JSON.parse(fs.readFileSync(path.resolve(args[2]), 'utf8')) : {};
    console.log(JSON.stringify(build(input, output, options), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { build };
