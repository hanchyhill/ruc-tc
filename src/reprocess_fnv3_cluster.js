const fs = require('fs');
const path = require('path');
const { processFNV3CSVData } = require('./resolve.CSV_fnv3');
const { processWPCycloneCluster } = require('./lib/cluster');
const { connect, initSchemas } = require('./db/initDB');

async function main() {
  const [csvPath, ins] = process.argv.slice(2);
  if (!csvPath || !['fnv3-gen', 'WNV3'].includes(ins)) {
    throw new Error('Usage: node src/reprocess_fnv3_cluster.js <cyclogenesis.csv> <fnv3-gen|WNV3>');
  }
  const filePath = path.resolve(csvPath);
  if (!fs.existsSync(filePath)) throw new Error(`CSV does not exist: ${filePath}`);

  const basicResult = processFNV3CSVData(filePath, ins);
  const result = processWPCycloneCluster(basicResult.data, { ins });
  const storms = result.tracks_list_enhanced.data;

  process.env.NODE_ENV = 'production';
  await connect();
  initSchemas();
  const { save2DB } = require('./db/util.db');
  for (const storm of storms) await save2DB(storm);
  console.log(`已补录 ${storms.length} 个风暴对象（正式簇 ${result.clusterStats.clusters}，待定轨迹 ${result.clusterStats.noise}）。`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
