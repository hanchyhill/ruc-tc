const path = require('path');
const { INSTITUTIONS, CUTOFF, parseBoundary, reclusterHistory } = require('../src/fnv3_history_recluster');

const USAGE = 'Usage: node scripts/recluster-fnv3-history.js [--apply] [--production] ' +
  '[--start YYYY-MM-DD[T00/T06/T12/T18]] [--before 2026-09-28] ' +
  '[--ins fnv3-gen,WNV3,fnv3] [--raw-only] [--remove-raw] [--delay-ms 1000] [--backup-dir directory]\n' +
  'Default: dry run, all stored WP disturbance cycles before 2026-09-28T00 UTC. ' +
  '--start is inclusive; --before is exclusive and cannot exceed the cutoff. ' +
  '--production uses the existing production DB configuration.';

function parseArgs(args) {
  const options = { apply: false, before: new Date(CUTOFF), institutions: [...INSTITUTIONS], delayMs: 0 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--raw-only') options.rawOnly = true;
    else if (flag === '--remove-raw') options.removeRaw = true;
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
  if (options.before > CUTOFF || options.start && options.start >= options.before) {
    throw new Error('Invalid range: start < before <= 2026-09-28 UTC is required');
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
