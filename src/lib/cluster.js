const sdbscan = require("sdbscan");
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(customParseFormat);

/**
 * 将聚类结果转换为增强格式
 * @param {Array} clusterResult - 聚类结果数组
 * @returns {Object} 增强格式的聚类结果
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

/**
 * 纯算法函数：处理FNV3数据的核心算法逻辑
 * @param {Array} cycloneDataList - 输入的气旋数据数组
 * @param {Object} options - 配置选项
 * @param {number} options.epsilon - DBSCAN的epsilon参数，默认10
 * @param {number} options.baseMinPoints - DBSCAN的minPoints基数，默认4
 * @returns {Object} 包含处理结果的对象
 */
function processWPCycloneCluster(cycloneDataList, options = {}) {
  const { epsilon = 10, baseMinPoints = 4 } = options;

  // Task 1: Filter cyclones with basinShort2 = "WP"
  const cyclones_WP_list = cycloneDataList.filter(
    cyclone => cyclone.basinShort2 === 'WP' && cyclone["cycloneNumber"][0] == 'I'
  );

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

  // Task 3: DBSCAN clustering analysis
  let clusterStats = { clusters: 0, noise: 0 };
  
  if (track0_info_list.length > 0) {
    const minPoints = Math.max(2, Math.min(baseMinPoints, track0_info_list.length));

    // Convert each track start point into a 3D vector [lon, lat, stepAxis]
    const pointList = track0_info_list.map(info => {
      const stepAxis = (info.step * 20) / 110;
      return [info.lon, info.lat, stepAxis];
    });

    const pointIndexMap = new Map(pointList.map((point, index) => [point, index]));

    const clusterResult = sdbscan(pointList, epsilon, minPoints);

    // Initialize all points as noise (clusters_id = 9999)
    track0_info_list.forEach(info => {
      info.clusters_id = 9999;
    });

    // Assign cluster IDs
    clusterResult.clusters.forEach(cluster => {
      cluster.data.forEach(point => {
        const index = pointIndexMap.get(point);
        if (index !== undefined) {
          track0_info_list[index].clusters_id = cluster.id;
        }
      });
    });

    // Assign noise points
    clusterResult.noise.forEach(point => {
      const index = pointIndexMap.get(point);
      if (index !== undefined) {
        track0_info_list[index].clusters_id = 9999;
      }
    });

    clusterStats = {
      clusters: clusterResult.clusters.length,
      noise: clusterResult.noise.length
    };
  }

  // Task 4: Aggregate tracks by cluster_id
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
  }

  // Task 5: Transform to enhanced format
  const tracks_list_enhanced = transCluster2EnhancedFormat(tracks_list);

  return {
    cyclones_WP_list,
    track0_info_list,
    tracks_list,
    tracks_list_enhanced,
    clusterStats
  };
}

module.exports = {
  transCluster2EnhancedFormat,
  processWPCycloneCluster
};

