const fs = require('fs');
const path = require('path');
const { processFNV3CSVData } = require('./resolve.CSV_fnv3');
const { processWPCycloneCluster } = require('./lib/cluster_legacy');
const { DEFAULT_CLUSTER_OPTIONS, processWPCycloneClusterMemberExclusive } =
  require('./lib/cluster_member_exclusive');

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

function summarizeOld(result) {
  const groups = result.tracks_list.filter(group => group.clusters_id !== 9999);
  const duplicateGroups = groups.map(group => {
    const seen = new Set();
    let duplicateTracks = 0;
    for (const track of group.tracks) {
      if (seen.has(track.ensembleNumber)) duplicateTracks++;
      seen.add(track.ensembleNumber);
    }
    return { clusterId: group.clusters_id, members: group.tracks.length, duplicateTracks };
  }).filter(group => group.duplicateTracks);
  const noise = result.tracks_list.find(group => group.clusters_id === 9999);
  return {
    clusters: groups.length,
    assignedTracks: groups.reduce((sum, group) => sum + group.tracks.length, 0),
    noiseTracks: noise ? noise.tracks.length : 0,
    clustersWithRepeatedMembers: duplicateGroups.length,
    extraTracksWithRepeatedMembers: duplicateGroups.reduce((sum, group) => sum + group.duplicateTracks, 0),
    duplicateGroups
  };
}

function summarizeNew(result) {
  const groups = result.tracks_list.filter(group => group.clusters_id !== 9999);
  const duplicateGroups = groups.filter(group =>
    new Set(group.tracks.map(track => track.ensembleNumber)).size !== group.tracks.length);
  return {
    clusters: groups.length,
    assignedTracks: groups.reduce((sum, group) => sum + group.tracks.length, 0),
    unassignedTracks: result.unassignedTracks.length,
    clustersWithRepeatedMembers: duplicateGroups.length,
    rounds: result.clusterStats.rounds,
    initialClusters: result.clusterStats.initialClusters,
    newClustersFromPool: result.clusterStats.newClusters,
    reassignedToExisting: result.clusterStats.reassigned,
    sameMemberSwaps: result.clusterStats.swappedMembers,
    unassignedByReason: result.unassignedTracks.reduce((counts, track) => {
      counts[track.reason] = (counts[track.reason] || 0) + 1;
      return counts;
    }, {})
  };
}

function compare(filePath, outputDir, options = {}) {
  const data = readInput(filePath);
  // The old function adds clusters_id to input tracks, so give it its own copy.
  const oldResult = processWPCycloneCluster(JSON.parse(JSON.stringify(data)));
  const newResult = processWPCycloneClusterMemberExclusive(data, options);
  const summary = {
    input: path.resolve(filePath),
    inputTracks: newResult.tracks_list.reduce((sum, group) => sum + group.tracks.length, 0),
    memberExclusiveOptions: { ...DEFAULT_CLUSTER_OPTIONS, ...options },
    old: summarizeOld(oldResult),
    memberExclusive: summarizeNew(newResult)
  };
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(outputDir, 'old.json'), JSON.stringify(oldResult, null, 2));
    fs.writeFileSync(path.join(outputDir, 'member_exclusive.json'), JSON.stringify(newResult, null, 2));
  }
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = path.resolve(args[0] || path.join(__dirname, '../demo/fnv3_basic_result.json'));
  const outputDir = args[1] ? path.resolve(args[1]) : null;
  try {
    const options = args[2] ? JSON.parse(fs.readFileSync(path.resolve(args[2]), 'utf8')) : {};
    console.log(JSON.stringify(compare(filePath, outputDir, options), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { compare };
