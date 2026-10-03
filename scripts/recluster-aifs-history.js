const path = require('path');
const { INSTITUTIONS, parseBoundary, reclusterHistory } = require('../src/aifs_history_recluster');

const USAGE = 'Usage: node scripts/recluster-aifs-history.js [--apply] [--production] ' +
  '[--start YYYY-MM-DD[T00/T06/T12/T18]] [--before YYYY-MM-DD[T00/T06/T12/T18]] ' +
  '[--ins aifs-cai] [--raw-only] [--delay-ms 1000] [--backup-dir directory]\n' +
  'Default: dry run, all stored aifs-cai WP IC/C-* disturbance cycles. ' +
  '--start is inclusive; --before is exclusive. ' +
  '--production uses the existing production DB configuration.';

function parseArgs(args) {
  const options = { apply: false, before: null, institutions: [...INSTITUTIONS], delayMs: 0 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--raw-only') options.rawOnly = true;
    else if (flag === '--production') options.production = true;
    else if (['--start', '--before', '--ins', '--delay-ms', '--backup-dir'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(USAGE);
      if (flag === '--start') options.start = parseBoundary(value);
      if (flag === '--before') options.before = parseBoundary(value);
      if (flag === '--backup-dir') options.backupDir = path.resolve(value);
      if (flag === '--ins') {
        options.institutions = [...new Set(value.split(','))];
        if (options.institutions.some(ins => !INSTITUTIONS.includes(ins))) throw new Error('Unsupported --ins');
      }
      if (flag === '--delay-ms') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid --delay-ms');
        options.delayMs = Number(value);
      }
    } else throw new Error(`Unknown option: ${flag}\n${USAGE}`);
  }
  if (options.start && options.before && options.start >= options.before) {
    throw new Error('Invalid range: start < before is required');
  }
  return options;
}

async function main() {
  if (process.argv.includes('--help')) return console.log(USAGE);
  const options = parseArgs(process.argv.slice(2));
  if (options.production) process.env.NODE_ENV = 'production';
  const mongoose = require('mongoose');
  const { connect } = require('../src/db/initDB');
  try {
    await connect();
    console.log(JSON.stringify({ ...options, dryRun: !options.apply }));
    const summary = await reclusterHistory(mongoose.connection.db.collection('cyclones'), {
      ...options, onCycle: result => console.log(JSON.stringify(result))
    });
    console.log(JSON.stringify(summary));
  } finally {
    mongoose.connection.removeAllListeners('disconnected');
    mongoose.connection.removeAllListeners('error');
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs };
