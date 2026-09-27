const legacy = require('./cluster_legacy');
const { processWPCycloneClusterMemberExclusive } = require('./cluster_member_exclusive');

/**
 * Public FNV3 clustering entry point. Keep the original import path for callers.
 * Set FNV3_CLUSTER_ALGORITHM=legacy to roll back without changing application code.
 */
function processWPCycloneCluster(cycloneDataList, options = {}) {
  if (String(process.env.FNV3_CLUSTER_ALGORITHM || '').toLowerCase() === 'legacy') {
    return legacy.processWPCycloneCluster(cycloneDataList, options);
  }
  return processWPCycloneClusterMemberExclusive(cycloneDataList, options);
}

module.exports = {
  transCluster2EnhancedFormat: legacy.transCluster2EnhancedFormat,
  processWPCycloneCluster
};
