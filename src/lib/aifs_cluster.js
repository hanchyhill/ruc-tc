const { processWPCycloneCluster } = require('./cluster');

/** Recluster IC disturbances using the FNV3 algorithm before saving AIFS data. */
function reclusterAIFSData(cycloneDataList) {
    const disturbances = cycloneDataList.filter(item =>
        String(item.cycloneNumber || '').startsWith('IC'));
    if (!disturbances.length) return cycloneDataList;

    const result = processWPCycloneCluster(disturbances, { ins: disturbances[0].ins });
    const clusters = result.tracks_list_enhanced.data.map(item => ({ ...item, fillStatus: 2 }));
    const clusterNumber = clusters.filter(item => item.cycloneNumber !== 'C-9999').length;

    console.log(`AIFS 聚类完成: ${clusterNumber} 个簇，${clusters
        .filter(item => item.cycloneNumber === 'C-9999')
        .reduce((count, item) => count + item.tracks.length, 0)} 条轨迹无法聚类`);

    return [
        ...cycloneDataList.filter(item =>
            item.basinShort2 !== 'WP' || !String(item.cycloneNumber || '').startsWith('IC')),
        ...clusters,
    ];
}

module.exports = { reclusterAIFSData };
