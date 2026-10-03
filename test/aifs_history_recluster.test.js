const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BSON, ObjectID } = require('bson');
const { parseBoundary, reclusterCycle, reclusterHistory } = require('../src/aifs_history_recluster');
const { parseArgs } = require('../scripts/recluster-aifs-history');
const bson = new BSON();
const copy = value => bson.deserialize(bson.serialize(value));

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    const value = record[key];
    if (expected instanceof RegExp) return expected.test(value || '');
    if (expected instanceof Date) return +value === +expected;
    if (expected && typeof expected === 'object') {
      return Object.entries(expected).every(([op, operand]) => {
        if (op === '$lt') return value < operand;
        if (op === '$gte') return value >= operand;
        if (op === '$gt') return value > operand;
        if (op === '$nin') return !operand.includes(value);
        if (op === '$in') return operand.some(item => String(item) === String(value));
        throw new Error(`Unhandled query ${op}`);
      });
    }
    return value === expected;
  });
}

function collection(records) {
  return {
    records: records.map(copy), writes: 0, deletes: 0,
    find(query) {
      let found = this.records.filter(record => matches(record, query));
      return {
        sort(keys) { found = found.sort((a, b) => {
          for (const key of Object.keys(keys)) {
            if (a[key] < b[key]) return -1;
            if (a[key] > b[key]) return 1;
          }
          return 0;
        }); return this; },
        async toArray() { return found.map(copy); }
      };
    },
    async findOne(query, options) {
      const rows = await this.find(query).sort(options.sort).toArray();
      return rows[0] || null;
    },
    async replaceOne(query, replacement) {
      this.writes++;
      const index = this.records.findIndex(record => matches(record, query));
      if (index < 0) this.records.push(copy({ _id: new ObjectID(), ...replacement }));
      else this.records[index] = copy(replacement);
    },
    async deleteMany(query) {
      this.deletes++;
      this.records = this.records.filter(record => !matches(record, query));
    }
  };
}

function fixture(ins = 'aifs-cai', initTime = new Date('2026-10-03T00:00:00Z')) {
  const tracks = [0, 1, 2, 3, 4].map(member => ({
    _id: new ObjectID(), fcType: 'ensembleForecast', ensembleNumber: member,
    track: [0, 6, 12, 18].map(step => [step, [130 + member * 0.1 + step / 6, 15], 990, 25,
      20000, [[18, 100000, 100000, 100000, 100000]]])
  }));
  const noise = { fcType: 'ensembleForecast', ensembleNumber: 0,
    track: [[100, [175, 50], 1000, 20]] };
  const base = { ins, initTime, basinShort2: 'WP', createdAt: new Date('2025-01-01Z') };
  return [
    { ...base, _id: new ObjectID(), tcID: `old-${ins}`, cycloneNumber: 'C-17', tracks },
    { ...base, _id: new ObjectID(), tcID: `noise-${ins}`, cycloneNumber: 'C-9999', tracks: [noise] },
    { ...base, _id: new ObjectID(), tcID: `named-${ins}`, cycloneNumber: '12', tracks: [tracks[0]], annotation: 'retain' }
  ];
}

test('arguments default to all AIFS history and validate UTC ranges before connecting', () => {
  assert.deepEqual(parseArgs([]).institutions, ['aifs-cai']);
  assert.equal(parseArgs([]).before, null);
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseBoundary('2026-10-03T18').toISOString(), '2026-10-03T18:00:00.000Z');
  assert.ok(parseArgs(['--before', '2026-10-04']).before);
  for (const args of [['--ins', 'fnv3'], ['--delay-ms', '-1'], ['--start', '2026-10-04',
    '--before', '2026-10-03'], ['--bad'], ['--start'], ['--before', '2026-02-30']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('dry run reconstructs stored clusters including C-9999 without writes', async () => {
  const records = fixture();
  const db = collection(records);
  const result = await reclusterCycle(db, records[0].initTime, 'aifs-cai');
  assert.equal(result.status, 'previewed');
  assert.equal(result.source, 'clusters');
  assert.equal(result.sourceTracks, 6);
  assert.equal(result.clustering.clusters, 1);
  assert.equal(result.clustering.noise, 1);
  assert.equal(db.writes, 0);
  assert.equal(db.deletes, 0);
});

test('apply backs up BSON, preserves unrelated records, replaces stale clusters, and is repeatable', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-history-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture();
  const other = [...fixture('fnv3-gen'), { ...records[0], _id: new ObjectID(),
    tcID: 'other-basin', basinShort2: 'AL' }, { ...records[0], _id: new ObjectID(),
    tcID: 'non-IC', cycloneNumber: 'I0' }];
  const db = collection([...records, ...other]);
  const result = await reclusterCycle(db, records[0].initTime, 'aifs-cai', { apply: true, backupDir });
  assert.equal(result.status, 'repaired');
  const bytes = fs.readFileSync(result.backup);
  const restored = [];
  for (let offset = 0; offset < bytes.length;) {
    const size = bytes.readInt32LE(offset);
    restored.push(bson.deserialize(bytes.subarray(offset, offset + size)));
    offset += size;
  }
  assert.deepEqual(restored, [...records, other[other.length - 1]].map(copy).sort((a, b) =>
    a.tcID.localeCompare(b.tcID)));
  for (const record of [records[2], ...other]) {
    assert.deepEqual(db.records.find(item => item.tcID === record.tcID), copy(record));
  }
  const clusters = db.records.filter(item => item.ins === 'aifs-cai' && item.basinShort2 === 'WP' && /^C-/.test(item.cycloneNumber));
  assert.deepEqual(clusters.map(item => item.cycloneNumber).sort(), ['C-00', 'C-9999']);
  assert.ok(clusters.every(item => item.fillStatus === 2));
  assert.ok(!db.records.some(item => item.tcID === records[0].tcID));
  await new Promise(resolve => setTimeout(resolve, 2));
  await reclusterCycle(db, records[0].initTime, 'aifs-cai', { apply: true, backupDir });
  for (const item of clusters) {
    const current = db.records.find(record => record.tcID === item.tcID);
    assert.deepEqual(current.tracks, item.tracks);
    assert.deepEqual(current._id, item._id);
  }
});

test('original IC tracks take precedence and are backed up and removed after verified clustering', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-raw-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture();
  const raw = { ...records[0], _id: new ObjectID(), tcID: 'raw', cycloneNumber: 'IC1' };
  const db = collection([...records, raw]);
  const result = await reclusterCycle(db, raw.initTime, 'aifs-cai', { apply: true, backupDir });
  assert.equal(result.source, 'raw');
  assert.equal(result.sourceTracks, 5);
  assert.ok(!db.records.some(item => item.tcID === 'raw'));
  assert.equal(result.removedRaw, 1);
  assert.ok(fs.readFileSync(result.backup).includes(bson.serialize(copy(raw))));
  assert.ok(!db.records.some(item => item.cycloneNumber === 'C-9999'));
});

test('IC cleanup retains other basins and I0 records, and raw-only reruns skip repaired batches', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-cleanup-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const raw = { ...fixture()[0], tcID: 'IC-source', cycloneNumber: 'IC1' };
  const untouched = [
    { ...raw, _id: new ObjectID(), tcID: 'I0-source', cycloneNumber: 'I0' },
    { ...raw, _id: new ObjectID(), tcID: 'other-basin', basinShort2: 'AL' },
  ];
  const db = collection([raw, ...untouched]);
  const preview = await reclusterHistory(db, { rawOnly: true });
  assert.equal(preview.cycles, 1);
  assert.equal(db.deletes, 0);
  const result = await reclusterHistory(db, { rawOnly: true, apply: true, backupDir });
  assert.equal(result.removedRaw, 1);
  for (const record of untouched) assert.deepEqual(db.records.find(item => item.tcID === record.tcID), copy(record));
  assert.equal((await reclusterHistory(db, { rawOnly: true })).cycles, 0);
});

test('failed cluster verification preserves IC source records', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-verify-IC-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const raw = { ...fixture()[0], tcID: 'IC-source', cycloneNumber: 'IC1' };
  const db = collection([raw]);
  db.replaceOne = async () => {};
  await assert.rejects(reclusterCycle(db, raw.initTime, 'aifs-cai', { apply: true, backupDir }), /Post-write verification failed/);
  assert.equal(db.deletes, 0);
  assert.deepEqual(db.records, [copy(raw)]);
});

test('fresh download snapshots replace equal and shrinking clusters and include newly arrived IC tracks', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-snapshot-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const snapshot = { ...fixture()[0], tcID: 'snapshot', cycloneNumber: 'IC1' };
  const db = collection([]);
  const run = sources => reclusterCycle(db, snapshot.initTime, 'aifs-cai',
    { apply: true, sourceRecords: sources, backupDir });
  await run([snapshot]);
  const moved = { ...snapshot, tracks: snapshot.tracks.map(item => ({ ...item,
    track: item.track.map(point => [point[0], [point[1][0] + 1, point[1][1]], ...point.slice(2)]) })) };
  await new Promise(resolve => setTimeout(resolve, 2));
  await run([moved]);
  assert.deepEqual(db.records[0].tracks.map(item => item.track), moved.tracks.map(item => item.track));
  const incoming = { ...snapshot, cycloneNumber: 'IC2', tcID: 'incoming', tracks: [
    { ...snapshot.tracks[0], track: [[100, [175, 50], 1000, 20]] },
  ] };
  await new Promise(resolve => setTimeout(resolve, 2));
  await run([moved, incoming]);
  assert.equal(db.records.reduce((count, item) => count + item.tracks.length, 0), 6);
  assert.ok(db.records.some(item => item.cycloneNumber === 'C-9999'));
  await new Promise(resolve => setTimeout(resolve, 2));
  await run([incoming]);
  assert.deepEqual(db.records.map(item => item.cycloneNumber), ['C-9999']);
  assert.equal(db.records[0].tracks.length, 1);
  await assert.rejects(run([{ ...snapshot, ins: 'fnv3-gen' }]), /complete IC snapshot/);
});

test('history discovers only IC/C-* batches, with inclusive start and exclusive before', async () => {
  const dates = ['2026-09-25T00:00Z', '2026-10-03T06:00Z', '2026-10-04T00:00Z'];
  const db = collection(dates.flatMap(date => fixture('aifs-cai', new Date(date))).concat(
    fixture('fnv3-gen'), { ...fixture()[0], tcID: 'only-I0', cycloneNumber: 'I0',
      initTime: new Date('2026-10-01T00:00Z') }));
  assert.equal((await reclusterHistory(db)).cycles, 3);
  const summary = await reclusterHistory(db, { start: parseBoundary('2026-10-03T06'),
    before: parseBoundary('2026-10-04') });
  assert.equal(summary.cycles, 1);
  assert.equal(summary.sourceTracks, 6);
  await assert.rejects(reclusterHistory(db, { institutions: ['fnv3-gen'] }), /Invalid/);
});

test('unbounded discovery omits initTime instead of matching an empty BSON object', async () => {
  let query;
  const summary = await reclusterHistory({ async findOne(value) { query = value; return null; } });
  assert.equal(summary.cycles, 0);
  assert.equal(Object.hasOwn(query, 'initTime'), false);
});

test('write and verification failures stop history with a backup and preserve stale clusters', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-failure-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  for (const fail of [async () => { throw new Error('write unavailable'); }, async () => {}]) {
    const db = collection(fixture());
    db.replaceOne = fail;
    await assert.rejects(reclusterHistory(db, { apply: true, backupDir }),
      /aifs-cai 2026-10-03T00:00:00.000Z failed; stopped.*--ins aifs-cai.*--start 2026-10-03T00.*backup:/);
    assert.equal(db.deletes, 0);
    await new Promise(resolve => setTimeout(resolve, 2));
  }
});

test('malformed sources and backup failures do not mutate the database', async t => {
  const records = fixture();
  const db = collection([{ ...records[0], tracks: [] }]);
  await assert.rejects(reclusterCycle(db, records[0].initTime, 'aifs-cai', { apply: true }), /without ensemble tracks/);
  assert.equal(db.writes, 0);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aifs-backup-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const backupDir = path.join(temp, 'file');
  fs.writeFileSync(backupDir, 'not a directory');
  const valid = collection(records);
  await assert.rejects(reclusterCycle(valid, records[0].initTime, 'aifs-cai', { apply: true, backupDir }));
  assert.equal(valid.writes, 0);
  assert.equal(valid.deletes, 0);
});

