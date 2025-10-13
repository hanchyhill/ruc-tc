const fs = require('fs');
const path = require('path');
const sdbscan = require("sdbscan");

/**
 * Process FNV3 basic result data:
 * 1. Filter cyclones with basinShort2 = "WP"
 * 2. Extract first track element with metadata
 */
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

  // Task 1: Filter cyclones with basinShort2 = "WP"
  const cyclones_WP_list = jsonData.data.filter(cyclone => cyclone.basinShort2 === 'WP');
  console.log(`Filtered WP cyclones: ${cyclones_WP_list.length}`);

  // Task 2: Extract first track element with metadata
  const track0_info_list = [];

  for (const cyclone of cyclones_WP_list) {
    const tcID = cyclone.tcID;
    const tracks = cyclone.tracks || [];

    for (const trackInfo of tracks) {
      const ensembleNumber = trackInfo.ensembleNumber;
      const track = trackInfo.track || [];

      if (track.length > 0) {
        const firstTrackPoint = track[0]; // [step, [lon, lat], pres, wind]

        track0_info_list.push({
          tcID,
          ensembleNumber,
          step: firstTrackPoint[0],
          lon: firstTrackPoint[1][0],
          lat: firstTrackPoint[1][1],
          pres: firstTrackPoint[2],
          wind: firstTrackPoint[3]
        });
      }
    }
  }

  console.log(`Extracted track0 info records: ${track0_info_list.length}`);

  // Save results
  const outputWPPath = path.resolve(__dirname, '../demo/cyclones_WP_list.json');
  const outputTrack0Path = path.resolve(__dirname, '../demo/track0_info_list.json');

  try {
    fs.writeFileSync(outputWPPath, JSON.stringify(cyclones_WP_list, null, 2), 'utf8');
    console.log(`✓ WP cyclones saved to: ${outputWPPath}`);

    fs.writeFileSync(outputTrack0Path, JSON.stringify(track0_info_list, null, 2), 'utf8');
    console.log(`✓ Track0 info saved to: ${outputTrack0Path}`);
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

  return {
    cyclones_WP_list,
    track0_info_list
  };
}

// Run the processing
if (require.main === module) {
  processFNV3WPData();
}

module.exports = {
  processFNV3WPData
};
