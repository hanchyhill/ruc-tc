const fs = require('fs');
const path = require('path');
const { processWPCycloneCluster } = require('./lib/cluster');
// Local CSV clustering example. The shared entry point uses member-exclusive
// clustering by default; FNV3_CLUSTER_ALGORITHM=legacy selects the old version.

function processFNV3WPData() {
  // Read the basic result JSON file
  const inputPath = path.resolve(__dirname, '../demo/fnv3_basic_result.json');
  console.log(`Reading FNV3 data from: ${inputPath}`);

  const rawData = fs.readFileSync(inputPath, 'utf8');
  const jsonData = JSON.parse(rawData);

  if (!jsonData || !jsonData.data || !Array.isArray(jsonData.data)) {
    console.error('Invalid data format: missing data array');
    return null;
  }

  console.log(`Total cyclones in file: ${jsonData.data.length}`);

  // 调用纯算法函数进行数据处理
  const result = processWPCycloneCluster(jsonData.data);

  const { 
    cyclones_WP_list, 
    track0_info_list, 
    tracks_list, 
    tracks_list_enhanced,
    unassignedTracks,
    clusterStats 
  } = result;

  console.log(`Filtered WP cyclones: ${cyclones_WP_list.length}`);
  console.log(`Extracted track0 info records: ${track0_info_list.length}`);
  
  if (track0_info_list.length > 0) {
    console.log(`DBSCAN clustering complete -> clusters: ${clusterStats.clusters}, unassigned tracks: ${clusterStats.noise}`);
  }
  
  if (tracks_list.length > 0) {
    console.log(`Aggregated tracks into ${tracks_list.length} cluster groups`);
  }
  
  // Save results
  const outputWPPath = path.resolve(__dirname, '../demo/cyclones_WP_list.json');
  const outputTrack0Path = path.resolve(__dirname, '../demo/track0_info_list.json');
  const outputTracksListPath = path.resolve(__dirname, '../demo/tracks_list.json');
  const outputTracksListEnhancedPath = path.resolve(__dirname, '../demo/tracks_list_cluster_enhanced.json');
  const outputUnassignedPath = path.resolve(__dirname, '../demo/unassigned_tracks.json');

  try {
    fs.writeFileSync(outputWPPath, JSON.stringify(cyclones_WP_list, null, 2), 'utf8');
    console.log(`WP cyclones saved to: ${outputWPPath}`);

    fs.writeFileSync(outputTrack0Path, JSON.stringify(track0_info_list, null, 2), 'utf8');
    console.log(`Track0 info saved to: ${outputTrack0Path}`);

    if (tracks_list.length > 0) {
      fs.writeFileSync(outputTracksListPath, JSON.stringify(tracks_list, null, 2), 'utf8');
      console.log(`Tracks list saved to: ${outputTracksListPath}`);
    }
    if (tracks_list_enhanced.data.length > 0) {
      fs.writeFileSync(outputTracksListEnhancedPath, JSON.stringify(tracks_list_enhanced, null, 2), 'utf8');
      console.log(`Tracks list enhanced saved to: ${outputTracksListEnhancedPath}`);
    }
    if (Array.isArray(unassignedTracks)) {
      fs.writeFileSync(outputUnassignedPath, JSON.stringify(unassignedTracks, null, 2), 'utf8');
      console.log(`Unassigned tracks saved to: ${outputUnassignedPath}`);
    }
  } catch (error) {
    console.error('Error saving output files:', error.message);
    return null;
  }

  // Display summary
  console.log('\n' + '='.repeat(60));
  console.log('Processing Summary:');
  console.log(`  - Total cyclones: ${jsonData.data.length}`);
  console.log(`  - WP basin cyclones: ${cyclones_WP_list.length}`);
  console.log(`  - Track0 info records: ${track0_info_list.length}`);

  if (cyclones_WP_list.length > 0) {
    console.log('\nSample WP Cyclone:');
    console.log(JSON.stringify(cyclones_WP_list[0], null, 2).substring(0, 500) + '...');
  }

  if (track0_info_list.length > 0) {
    console.log('\nSample Track0 Info (first 3 records):');
    console.log(JSON.stringify(track0_info_list.slice(0, 3), null, 2));
  }
  if (tracks_list.length > 0) {
    console.log('\nSample Tracks List (first group):');
    console.log(JSON.stringify(tracks_list[0], null, 2));
  }

  return {
    cyclones_WP_list,
    track0_info_list,
    tracks_list,
    unassignedTracks
  };
}

// Run the processing
if (require.main === module) {
  processFNV3WPData();
}

module.exports = {
  processFNV3WPData
};
