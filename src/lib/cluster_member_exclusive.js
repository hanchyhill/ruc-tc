const sdbscan = require('sdbscan');
const { transCluster2EnhancedFormat } = require('./cluster_legacy');

const HOUR = 60 * 60 * 1000;
const GRID = 6 * HOUR;
const EARTH_RADIUS_KM = 6371;

const DEFAULTS = Object.freeze({
  epsilon: 10,
  baseMinPoints: 4,
  minDistinctMembers: 4,
  maxInterpolationHours: 12,
  minOverlapPoints: 3,
  minOverlapHours: 12,
  minCoverage: 0.4,
  maxPairScoreKm: 900,
  minScoreMarginKm: 75,
  minSupport: 2,
  minReassignmentFraction: 0.25,
  minNewClusterMembers: 5,
  maxRefinePasses: 8
});

function median(values) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function longitudeDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function euclideanKm(a, b) {
  const radians = Math.PI / 180;
  const meanLatitude = (a.lat + b.lat) * radians / 2;
  const dx = EARTH_RADIUS_KM * Math.cos(meanLatitude) *
    longitudeDelta(a.lon, b.lon) * radians;
  const dy = EARTH_RADIUS_KM * (b.lat - a.lat) * radians;
  return Math.hypot(dx, dy);
}

function gridPath(track, initTime, config) {
  const start = Date.parse(initTime);
  if (!Number.isFinite(start) || !Array.isArray(track)) return new Map();

  const points = track.map(point => ({
    time: start + Number(point && point[0]) * HOUR,
    lon: Number(point && point[1] && point[1][0]),
    lat: Number(point && point[1] && point[1][1])
  })).filter(point => Number.isFinite(point.time) && Number.isFinite(point.lon) &&
    Number.isFinite(point.lat) && Math.abs(point.lat) <= 90);
  points.sort((a, b) => a.time - b.time);
  const unique = points.filter((point, index) => !index || point.time !== points[index - 1].time);
  const grid = new Map();

  for (let i = 0; i < unique.length; i++) {
    const point = unique[i];
    if (point.time % GRID === 0) grid.set(point.time, point);
    if (!i) continue;
    const previous = unique[i - 1];
    const duration = point.time - previous.time;
    if (duration <= 0 || duration > config.maxInterpolationHours * HOUR) continue;
    for (let time = Math.ceil(previous.time / GRID) * GRID; time < point.time; time += GRID) {
      const fraction = (time - previous.time) / duration;
      grid.set(time, {
        time,
        lon: normalizeLongitude(previous.lon + longitudeDelta(previous.lon, point.lon) * fraction),
        lat: previous.lat + (point.lat - previous.lat) * fraction
      });
    }
  }
  return grid;
}

function pairComparison(a, b, config, cache) {
  const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  if (cache.has(key)) return cache.get(key);
  const distances = [];
  const commonTimes = [];
  const [smaller, larger] = a.grid.size < b.grid.size ? [a.grid, b.grid] : [b.grid, a.grid];
  for (const [time, point] of smaller) {
    if (!larger.has(time)) continue;
    distances.push(euclideanKm(point, larger.get(time)));
    commonTimes.push(time);
  }
  const coverage = distances.length / Math.max(1, Math.min(a.grid.size, b.grid.size));
  const spanHours = commonTimes.length ?
    (Math.max(...commonTimes) - Math.min(...commonTimes)) / HOUR : 0;
  const result = distances.length >= config.minOverlapPoints &&
    spanHours >= config.minOverlapHours && coverage >= config.minCoverage ? {
      score: median(distances) + 0.5 * percentile(distances, 0.8) + 200 * (1 - coverage),
      coverage,
      points: distances.length
    } : null;
  cache.set(key, result);
  return result;
}

function candidateScore(candidate, references, config, cache, local = false) {
  const matches = references.filter(reference => reference.ensembleNumber !== candidate.ensembleNumber)
    .map(reference => pairComparison(candidate, reference, config, cache))
    .filter(Boolean);
  const compatible = matches.filter(match => match.score <= config.maxPairScoreKm);
  if (compatible.length < config.minSupport) return null;
  return {
    score: median((local ? compatible : matches).map(match => match.score)),
    support: compatible.length,
    coverage: median(compatible.map(match => match.coverage))
  };
}

function pickCandidate(group, references, config, cache) {
  const scored = group.map(record => ({
    record,
    result: candidateScore(record, references, config, cache, true)
  })).filter(item => item.result && item.result.score <= config.maxPairScoreKm);
  scored.sort((a, b) => b.result.support - a.result.support ||
    a.result.score - b.result.score || a.record.id - b.record.id);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].result.support === scored[1].result.support &&
      scored[1].result.score - scored[0].result.score < config.minScoreMarginKm) {
    const byCoverage = scored.filter(item => item.result.support === scored[0].result.support &&
      item.result.score - scored[0].result.score < config.minScoreMarginKm)
      .sort((a, b) => b.result.coverage - a.result.coverage || a.record.id - b.record.id);
    if (byCoverage[0].result.coverage - byCoverage[1].result.coverage < 0.2) return null;
    return byCoverage[0];
  }
  return scored[0];
}

function growSelection(groups, initial, config, cache) {
  const selected = new Map(initial.map(record => [record.ensembleNumber, record]));
  while (true) {
    const choices = [];
    for (const [member, group] of groups) {
      if (selected.has(member)) continue;
      const choice = pickCandidate(group, [...selected.values()], config, cache);
      if (choice) choices.push(choice);
    }
    if (!choices.length) break;
    choices.sort((a, b) => a.result.score - b.result.score || a.record.id - b.record.id);
    selected.set(choices[0].record.ensembleNumber, choices[0].record);
  }

  // Revisiting the choices lets a later member displace an earlier same-number choice.
  for (let pass = 0; pass < config.maxRefinePasses; pass++) {
    let changed = false;
    for (const [member, group] of groups) {
      if (group.length < 2) continue;
      const references = [...selected.values()].filter(record => record.ensembleNumber !== member);
      const choice = pickCandidate(group, references, config, cache);
      const previous = selected.get(member);
      if (choice && (!previous || previous.id !== choice.record.id)) {
        selected.set(member, choice.record);
        changed = true;
      } else if (!choice && previous) {
        selected.delete(member);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return [...selected.values()];
}

function resolveProposal(proposal, config, cache, initialRound = false) {
  const groups = new Map();
  for (const record of proposal) {
    if (!groups.has(record.ensembleNumber)) groups.set(record.ensembleNumber, []);
    groups.get(record.ensembleNumber).push(record);
  }
  // DBSCAN already defines the provisional storm. Path similarity is needed only
  // to choose between tracks of the same ensemble member; it must not split a
  // cluster whose member numbers are already unique.
  if (groups.size === proposal.length) {
    return initialRound || proposal.length >= config.minDistinctMembers ? proposal : [];
  }
  if (groups.size < config.minDistinctMembers) return [];

  const unique = [...groups.values()].filter(group => group.length === 1).map(group => group[0]);
  if (unique.length >= config.minDistinctMembers) {
    return growSelection(groups, unique, config, cache);
  }

  const alternatives = [];
  if (unique.length >= 2) alternatives.push(growSelection(groups, unique, config, cache));

  let seed = null;
  for (let i = 0; i < proposal.length; i++) {
    for (let j = i + 1; j < proposal.length; j++) {
      if (proposal[i].ensembleNumber === proposal[j].ensembleNumber) continue;
      const pair = pairComparison(proposal[i], proposal[j], config, cache);
      if (pair && pair.score <= config.maxPairScoreKm && (!seed || pair.score < seed.score)) {
        seed = { score: pair.score, records: [proposal[i], proposal[j]] };
      }
    }
  }
  if (seed) alternatives.push(growSelection(groups, seed.records, config, cache));
  alternatives.sort((a, b) => b.length - a.length || (a[0] ? a[0].id : Infinity) -
    (b[0] ? b[0].id : Infinity));
  return alternatives.find(alternative => alternative.length >= config.minDistinctMembers) || [];
}

function dbscanProposals(pool, config) {
  if (!pool.length) return [];
  const points = pool.map(record => record.firstPoint);
  const byPoint = new Map(points.map((point, index) => [point, pool[index]]));
  const minimum = Math.max(2, Math.min(config.baseMinPoints, pool.length));
  return sdbscan(points, config.epsilon, minimum).clusters.map(cluster =>
    [...new Map(cluster.data.map(point => {
      const record = byPoint.get(point);
      return [record.id, record];
    })).values()]);
}

function clusterFit(record, references, config, cache) {
  if (!references.length) return null;
  const compatible = references.map(reference => pairComparison(record, reference, config, cache))
    .filter(pair => pair && pair.score <= config.maxPairScoreKm);
  if (compatible.length < config.minSupport ||
      compatible.length / references.length < config.minReassignmentFraction) return null;
  return {
    fraction: compatible.length / references.length,
    support: compatible.length,
    score: median(compatible.map(pair => pair.score))
  };
}

function assignToExisting(pool, clusters, config, cache) {
  const remaining = [];
  const displaced = [];
  let moved = 0;
  let swaps = 0;
  for (const record of pool) {
    const choices = [];
    for (let index = 0; index < clusters.length; index++) {
      if (index === record.rejectedFrom) continue;
      const cluster = clusters[index];
      const incumbent = cluster.find(member => member.ensembleNumber === record.ensembleNumber);
      const references = incumbent ? cluster.filter(member => member.id !== incumbent.id) : cluster;
      const fit = clusterFit(record, references, config, cache);
      if (!fit) continue;
      if (incumbent) {
        const currentFit = clusterFit(incumbent, references, config, cache);
        const betterSupport = !currentFit || fit.fraction > currentFit.fraction + 1e-9;
        const betterDistance = currentFit && fit.fraction >= currentFit.fraction - 1e-9 &&
          fit.score + config.minScoreMarginKm < currentFit.score;
        if (!betterSupport && !betterDistance) continue;
      }
      choices.push({ index, fit, incumbent });
    }
    choices.sort((a, b) => b.fit.fraction - a.fit.fraction ||
      a.fit.score - b.fit.score || b.fit.support - a.fit.support || a.index - b.index);
    if (!choices.length || (choices.length > 1 &&
        Math.abs(choices[0].fit.fraction - choices[1].fit.fraction) < 1e-9 &&
        choices[1].fit.score - choices[0].fit.score < config.minScoreMarginKm)) {
      remaining.push(record);
      continue;
    }
    const choice = choices[0];
    if (choice.incumbent) {
      clusters[choice.index].splice(clusters[choice.index].findIndex(member =>
        member.id === choice.incumbent.id), 1);
      choice.incumbent.rejectedFrom = choice.index;
      displaced.push(choice.incumbent);
      swaps++;
    }
    clusters[choice.index].push(record);
    moved++;
  }
  return { remaining: [...remaining, ...displaced], moved, swaps };
}

function normalizeOptions(options) {
  const config = { ...DEFAULTS, ...options };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) {
      throw new TypeError(`${key} must be a positive number`);
    }
  }
  if (config.minCoverage > 1) throw new TypeError('minCoverage must be at most 1');
  if (config.minReassignmentFraction > 1) {
    throw new TypeError('minReassignmentFraction must be at most 1');
  }
  return config;
}

/**
 * Member-exclusive alternative to processWPCycloneCluster. Does not mutate input.
 * Returns the existing cluster result fields plus unassignedTracks and round statistics.
 */
function processWPCycloneClusterMemberExclusive(cycloneDataList, options = {}) {
  if (!Array.isArray(cycloneDataList)) throw new TypeError('cycloneDataList must be an array');
  const config = normalizeOptions(options);
  const cyclones_WP_list = cycloneDataList.filter(cyclone => cyclone &&
    cyclone.basinShort2 === 'WP' && String(cyclone.cycloneNumber || '').startsWith('I'));
  const batches = new Map();
  const unassignedTracks = [];
  const track0_info_list = [];
  let nextId = 0;

  for (const cyclone of cyclones_WP_list) {
    const initMillis = Date.parse(cyclone.initTime);
    const batchKey = `${cyclone.ins || options.ins || 'fnv3-gen'}|${Number.isFinite(initMillis) ?
      new Date(initMillis).toISOString() : 'invalid'}`;
    if (!batches.has(batchKey)) batches.set(batchKey, []);
    for (const trackInfo of cyclone.tracks || []) {
      const id = nextId++;
      const record = {
        id,
        tcID: cyclone.tcID,
        basinShort2: cyclone.basinShort2,
        initTime: cyclone.initTime,
        ins: cyclone.ins || options.ins || 'fnv3-gen',
        cycloneName: cyclone.cycloneName,
        ensembleNumber: trackInfo.ensembleNumber,
        fcType: trackInfo.fcType,
        track: trackInfo.track
      };
      const first = Array.isArray(record.track) ? record.track[0] : null;
      const validMember = Number.isSafeInteger(record.ensembleNumber) && record.ensembleNumber >= 0;
      const validFirst = Number.isFinite(initMillis) && first && Number.isFinite(Number(first[0])) && first[1] &&
        Number.isFinite(Number(first[1][0])) && Number.isFinite(Number(first[1][1])) &&
        Math.abs(Number(first[1][1])) <= 90;
      if (!validMember || !validFirst) {
        unassignedTracks.push({ ...record, reason: validMember ? 'invalid_track' : 'invalid_member' });
        continue;
      }
      record.firstPoint = [Number(first[1][0]), Number(first[1][1]), Number(first[0]) * 20 / 110];
      record.grid = gridPath(record.track, record.initTime, config);
      track0_info_list.push({ trackId: id, tcID: record.tcID, ensembleNumber: record.ensembleNumber,
        step: Number(first[0]), lon: record.firstPoint[0], lat: record.firstPoint[1],
        pres: first[2], wind: first[3] });
      batches.get(batchKey).push(record);
    }
  }

  const clusters = [];
  const cache = new Map();
  let rounds = 0;
  let rejectedDuplicates = 0;
  let reassigned = 0;
  let swappedMembers = 0;
  let initialClusters = 0;
  let newClusters = 0;
  for (const records of batches.values()) {
    let pool = [...records];
    const batchClusters = [];
    const reasons = new Map();
    if (pool.length) {
      rounds++;
      const acceptedIds = new Set();
      for (const proposal of dbscanProposals(pool, config)) {
        const selected = resolveProposal(proposal, config, cache, true);
        if (!selected.length) {
          for (const record of proposal) reasons.set(record.id, 'insufficient_support');
          continue;
        }
        const clusterIndex = batchClusters.length;
        batchClusters.push(selected);
        for (const record of selected) acceptedIds.add(record.id);
        for (const record of proposal) {
          if (!acceptedIds.has(record.id)) {
            const duplicate = selected.some(member => member.ensembleNumber === record.ensembleNumber);
            reasons.set(record.id, duplicate ? 'duplicate_member' : 'insufficient_support');
            record.rejectedFrom = clusterIndex;
            if (duplicate) rejectedDuplicates++;
          }
        }
      }
      pool = pool.filter(record => !acceptedIds.has(record.id));
      initialClusters += batchClusters.length;
    }

    // Revisit every rejected track and original DBSCAN noise against the existing
    // clusters before running DBSCAN on the residual pool. Swapped-out incumbents
    // join that residual pool and are not reconsidered here, avoiding cycles.
    const assignment = assignToExisting(pool, batchClusters, config, cache);
    pool = assignment.remaining;
    reassigned += assignment.moved;
    swappedMembers += assignment.swaps;

    if (pool.length) {
      rounds++;
      const acceptedIds = new Set();
      for (const proposal of dbscanProposals(pool, config)) {
        const selected = resolveProposal(proposal, config, cache);
        if (selected.length < config.minNewClusterMembers) {
          for (const record of proposal) reasons.set(record.id, 'small_new_cluster');
          continue;
        }
        batchClusters.push(selected);
        newClusters++;
        for (const record of selected) acceptedIds.add(record.id);
        for (const record of proposal) {
          if (!acceptedIds.has(record.id)) reasons.set(record.id, 'duplicate_member');
        }
      }
      pool = pool.filter(record => !acceptedIds.has(record.id));
    }
    clusters.push(...batchClusters);
    for (const record of pool) unassignedTracks.push({ ...record,
      reason: reasons.get(record.id) || (record.grid.size < config.minOverlapPoints ?
        'insufficient_overlap' : 'no_matching_cluster') });
  }

  const tracks_list = clusters.map((records, index) => ({
    clusters_id: index,
    tracks: records.map(record => ({
      trackId: record.id,
      tcID: record.tcID,
      basinShort2: record.basinShort2,
      initTime: record.initTime,
      cycloneName: record.cycloneName,
      ensembleNumber: record.ensembleNumber,
      fcType: record.fcType,
      track: record.track
    }))
  }));
  const enhancedData = tracks_list.map((group, index) =>
    transCluster2EnhancedFormat([group], clusters[index][0].ins).data[0]);
  const tracks_list_enhanced = {
    method: 'enhanced',
    stormGroups: enhancedData.length,
    originalCount: tracks_list.length,
    processedCount: enhancedData.length,
    data: enhancedData
  };
  const publicUnassigned = unassignedTracks.map(record => ({
    trackId: record.id, tcID: record.tcID, initTime: record.initTime, ins: record.ins,
    ensembleNumber: record.ensembleNumber, fcType: record.fcType,
    track: record.track, reason: record.reason
  }));
  const assignedIds = tracks_list.flatMap(group => group.tracks.map(track => track.trackId));
  const allIds = [...assignedIds, ...publicUnassigned.map(track => track.trackId)];
  if (allIds.length !== nextId || new Set(allIds).size !== nextId ||
      tracks_list.some(group => new Set(group.tracks.map(track => track.ensembleNumber)).size !== group.tracks.length)) {
    throw new Error('Member-exclusive clustering violated track accounting or member uniqueness');
  }
  const clusterByTrackId = new Map(tracks_list.flatMap(group =>
    group.tracks.map(track => [track.trackId, group.clusters_id])));
  for (const point of track0_info_list) {
    point.clusters_id = clusterByTrackId.has(point.trackId) ? clusterByTrackId.get(point.trackId) : 9999;
  }
  let nextTrackId = 0;
  const cyclonesWithClusters = cyclones_WP_list.map(cyclone => ({
    ...cyclone,
    tracks: (cyclone.tracks || []).map(track => {
      const id = nextTrackId++;
      return { ...track, clusters_id: clusterByTrackId.has(id) ? clusterByTrackId.get(id) : 9999 };
    })
  }));
  return {
    cyclones_WP_list: cyclonesWithClusters,
    track0_info_list,
    tracks_list,
    tracks_list_enhanced,
    unassignedTracks: publicUnassigned,
    clusterStats: { clusters: tracks_list.length, noise: publicUnassigned.length,
      initialClusters, newClusters, unassigned: publicUnassigned.length, rounds, rejectedDuplicates,
      reassigned, swappedMembers }
  };
}

module.exports = {
  DEFAULT_CLUSTER_OPTIONS: DEFAULTS,
  processWPCycloneClusterMemberExclusive
};
