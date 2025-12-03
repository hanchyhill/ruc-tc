const fs = require('fs');
const path = require('path');
const sdbscan = require("sdbscan");
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(utc);
dayjs.extend(customParseFormat);
/**
1. filter "basinShort2"为"WP"的数据，记为cyclones_WP_list
2. 从"tracks"中，提取每个"track"的第一个元素的元素，并附带上"ensembleNumber"，"tcID"，重组为一个新的数组，track0_info_list

接下来，需要给track0_info_list中的各个点位进行聚类分析，使用DSCAN方法进行聚类，使用到的第三方库是sdbscan, 仓库地址是https://www.npmjs.com/package/sdbscan。

数据处理规则如下

把"step", "lon", "lat" 转为三维点数组，其中"step"转换为等效经纬度，计算方法如下
step_axis = step*20/110
这样就构成三维点坐标
point = [lon ,lat, step_axis]
把这些点构成点集合 point_list
进行聚类分析let res = sdbscan(point_list,10,20);

根据分组信息，在track0_info_list中添加分组属性，记为clusters_id, 如果此点属于noise，则clusters_id记为9999

继续完成任务，在得到track0_info_list的clusters_id之后，匹配回原来的cyclones_WP_list的每个tracks当中，并且按照clusters_id重新聚合拥有相同clusters_id的track，构成新的tracks_list数组，并输出tracks_list。

==============
继续完成任务，
 */

function transCluster2EnhancedFormat(clusterResult) {
  // clusterResult.filter(v => v.clusters_id !== 9999);
  let enhancedData = [];
  clusterResult.forEach(v => {
    let basic_info_0 = v.tracks[0]
    const basinShort2 = basic_info_0['basinShort2'];
    const clusterIdStr = String(v['clusters_id']).padStart(2, '0');
    const cycloneName = `C-${clusterIdStr}${basinShort2}`;
    const cycloneNumber = `C-${clusterIdStr}`;
    const ins = "fnv3-gen"
    const initTime = basic_info_0['initTime'];
    const tcID = `${dayjs.utc(initTime).format('YYYYMMDDHH')}_${cycloneName}_${cycloneNumber}_${ins}`;
    let tracks = v.tracks.map(item=>{
      return {
        fcType: item['fcType'],
        ensembleNumber: item['ensembleNumber'],
        track: item['track']
      }
    })
    enhancedData.push({
      tcID,
      basinShort2,
      cycloneName,
      cycloneNumber,
      memberCount: v.tracks.length,
      ins,
      initTime,
      tracks
    })
  });
  let clusterResult_enhanced = {
    method: "enhanced",
    stormGroups: enhancedData.length,
    originalCount: clusterResult.length,
    processedCount: enhancedData.length,
    data: enhancedData
  }
  return clusterResult_enhanced;
}

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
  const cyclones_WP_list = jsonData.data.filter(cyclone => cyclone.basinShort2 === 'WP' && cyclone["cycloneNumber"][0] == 'I');
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

  if (track0_info_list.length > 0) {
    const epsilon = 10;
    const baseMinPoints = 4;
    const minPoints = Math.max(2, Math.min(baseMinPoints, track0_info_list.length));

    // Convert each track start point into a 3D vector [lon, lat, stepAxis]
    const pointList = track0_info_list.map(info => {
      const stepAxis = (info.step * 20) / 110;
      return [info.lon, info.lat, stepAxis];
    });

    const pointIndexMap = new Map(pointList.map((point, index) => [point, index]));

    const clusterResult = sdbscan(pointList, epsilon, minPoints);

    track0_info_list.forEach(info => {
      info.clusters_id = 9999;
    });

    clusterResult.clusters.forEach(cluster => {
      cluster.data.forEach(point => {
        const index = pointIndexMap.get(point);
        if (index !== undefined) {
          track0_info_list[index].clusters_id = cluster.id;
        }
      });
    });

    clusterResult.noise.forEach(point => {
      const index = pointIndexMap.get(point);
      if (index !== undefined) {
        track0_info_list[index].clusters_id = 9999;
      }
    });

    console.log(`DBSCAN clustering complete -> clusters: ${clusterResult.clusters.length}, noise points: ${clusterResult.noise.length}`);
  }
  let tracks_list = [];

  if (track0_info_list.length > 0 && cyclones_WP_list.length > 0) {
    const clusterLookup = new Map(
      track0_info_list.map(info => {
        const key = `${info.tcID}__${info.ensembleNumber}`;
        return [key, info.clusters_id];
      })
    );

    const tracksByCluster = new Map();

    cyclones_WP_list.forEach(cyclone => {
      const tcID = cyclone.tcID;
      const tracks = cyclone.tracks || [];

      tracks.forEach(trackInfo => {
        const key = `${tcID}__${trackInfo.ensembleNumber}`;
        const clusterId = clusterLookup.has(key) ? clusterLookup.get(key) : 9999;

        trackInfo.clusters_id = clusterId;

        if (!tracksByCluster.has(clusterId)) {
          tracksByCluster.set(clusterId, []);
        }

        tracksByCluster.get(clusterId).push({
          tcID,
          basinShort2: cyclone.basinShort2,
          initTime: cyclone.initTime,
          cycloneName: cyclone.cycloneName,
          ensembleNumber: trackInfo.ensembleNumber,
          fcType: trackInfo.fcType,
          track: trackInfo.track
        });
      });
    });

    tracks_list = Array.from(tracksByCluster.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([clusterId, tracks]) => ({
        clusters_id: Number(clusterId),
        tracks
      }));

    console.log(`Aggregated tracks into ${tracks_list.length} cluster groups`);
  }
  tracks_list_enhanced = transCluster2EnhancedFormat(tracks_list);
  
  // Save results
  const outputWPPath = path.resolve(__dirname, '../demo/cyclones_WP_list.json');
  const outputTrack0Path = path.resolve(__dirname, '../demo/track0_info_list.json');
  const outputTracksListPath = path.resolve(__dirname, '../demo/tracks_list.json');
  const outputTracksListEnhancedPath = path.resolve(__dirname, '../demo/tracks_list_cluster_enhanced.json');

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
    tracks_list
  };
}

// Run the processing
if (require.main === module) {
  processFNV3WPData();
}

module.exports = {
  processFNV3WPData
};
