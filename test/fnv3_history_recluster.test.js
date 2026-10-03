const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BSON, ObjectID } = require('bson');
const { CUTOFF, parseBoundary, reclusterCycle, reclusterHistory } = require('../src/fnv3_history_recluster');
const { parseArgs } = require('../scripts/recluster-fnv3-history');
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

function fixture(ins = 'fnv3-gen', initTime = new Date('2026-09-27T18:00:00Z')) {
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

test('UTC boundaries, default institutions, and exclusive cutoff validate before connecting', () => {
  assert.equal(parseBoundary('2026-09-27T18').toISOString(), '2026-09-27T18:00:00.000Z');
  assert.deepEqual(parseArgs([]).institutions, ['fnv3-gen', 'WNV3', 'fnv3']);
  assert.equal(+parseArgs([]).before, +CUTOFF);
  assert.equal(parseArgs([]).apply, false);
  for (const value of ['2026-02-30', '2026-09-27T03', 'bad']) assert.throws(() => parseBoundary(value));
  for (const args of [['--before', '2026-09-29'], ['--ins', 'ecmwf'], ['--delay-ms', '-1'],
    ['--start', '2026-09-28'], ['--apply', '--bad']]) assert.throws(() => parseArgs(args));
});

test('dry run reconstructs old clusters and noise without writes', async () => {
  const records = fixture();
  const db = collection(records);
  const result = await reclusterCycle(db, records[0].initTime, 'fnv3-gen');
  assert.equal(result.status, 'previewed');
  assert.equal(result.source, 'clusters');
  assert.equal(result.sourceTracks, 6);
  assert.equal(result.clustering.clusters, 1);
  assert.equal(result.clustering.noise, 1);
  assert.equal(db.writes, 0);
  assert.equal(db.deletes, 0);
});

test('apply backs up BSON, retains unrelated records, removes stale clusters, and is repeatable', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-history-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture();
  const unrelated = [...fixture('WNV3'), ...fixture('fnv3', CUTOFF),
    { ...records[0], _id: new ObjectID(), tcID: 'other-basin', basinShort2: 'AL' }];
  const db = collection([...records, ...unrelated]);
  const result = await reclusterCycle(db, records[0].initTime, 'fnv3-gen', { apply: true, backupDir });
  assert.equal(result.status, 'repaired');
  const bytes = fs.readFileSync(result.backup);
  const restored = [];
  for (let offset = 0; offset < bytes.length;) {
    const length = bytes.readInt32LE(offset);
    restored.push(bson.deserialize(bytes.subarray(offset, offset + length)));
    offset += length;
  }
  assert.deepEqual(restored.map(r => r.tcID).sort(), records.map(r => r.tcID).sort());
  assert.ok(restored[0]._id instanceof ObjectID);
  assert.ok(restored[0].initTime instanceof Date);
  for (const record of [records[2], ...unrelated]) {
    assert.deepEqual(db.records.find(item => item.tcID === record.tcID), copy(record));
  }
  assert.ok(!db.records.some(record => record.tcID === records[0].tcID));
  assert.ok(db.records.some(record => record.cycloneNumber === 'C-9999' && record.ins === 'fnv3-gen'));
  const first = db.records.filter(r => r.ins === 'fnv3-gen' && r.basinShort2 === 'WP' && /^C-/.test(r.cycloneNumber));
  await new Promise(resolve => setTimeout(resolve, 2));
  await reclusterCycle(db, records[0].initTime, 'fnv3-gen', { apply: true, backupDir });
  const second = db.records.filter(r => first.some(old => old.tcID === r.tcID));
  assert.deepEqual(second.map(r => [r.tcID, r.tracks]), first.map(r => [r.tcID, r.tracks]));
});

test('raw disturbances take precedence over stale generated tracks and remain unchanged', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-raw-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture('fnv3');
  const raw = { ...records[0], tcID: 'raw', _id: new ObjectID(), cycloneNumber: 'I-01' };
  const db = collection([...records, raw]);
  const result = await reclusterCycle(db, raw.initTime, 'fnv3', { apply: true, backupDir });
  assert.equal(result.source, 'raw');
  assert.equal(result.sourceTracks, 5);
  assert.deepEqual(db.records.find(r => r.tcID === 'raw'), copy(raw));
  assert.ok(!db.records.some(r => r.cycloneNumber === 'C-9999'));
});

test('requested cleanup consumes all I-prefix records, backs them up, and removes them after verification', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-cleanup-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture();
  const raw = { ...records[0], _id: new ObjectID(), tcID: 'raw', cycloneNumber: 'I01' };
  const noise = { ...records[1], _id: new ObjectID(), tcID: 'raw-noise', cycloneNumber: 'IC2' };
  const other = { ...raw, _id: new ObjectID(), tcID: 'other-basin', basinShort2: 'AL' };
  const db = collection([...records, raw, noise, other]);
  const preview = await reclusterHistory(db, { institutions: ['fnv3-gen'], rawOnly: true, removeRaw: true });
  assert.equal(preview.cycles, 1);
  assert.equal(preview.sourceTracks, 6);
  assert.equal(db.deletes, 0);
  const result = await reclusterHistory(db, { institutions: ['fnv3-gen'], rawOnly: true,
    removeRaw: true, apply: true, backupDir });
  assert.equal(result.removedRaw, 2);
  assert.equal(result.sourceTracks, 6);
  assert.ok(!db.records.some(item => item.basinShort2 === 'WP' && /^I/.test(item.cycloneNumber)));
  assert.deepEqual(db.records.find(item => item.tcID === other.tcID), copy(other));
  assert.deepEqual(db.records.find(item => item.tcID === records[2].tcID), copy(records[2]));
  assert.ok(db.records.some(item => item.cycloneNumber === 'C-9999'));
  assert.equal((await reclusterHistory(db, { institutions: ['fnv3-gen'], rawOnly: true })).cycles, 0);
  const bytes = fs.readFileSync(path.join(backupDir, fs.readdirSync(backupDir)[0]));
  const restored = [];
  for (let offset = 0; offset < bytes.length;) {
    const size = bytes.readInt32LE(offset);
    restored.push(bson.deserialize(bytes.subarray(offset, offset + size)));
    offset += size;
  }
  assert.ok(restored.some(item => item.tcID === raw.tcID));
  assert.ok(restored.some(item => item.tcID === noise.tcID));
});

test('requested cleanup never deletes I records when cluster verification fails', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-cleanup-failure-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const raw = { ...fixture()[0], cycloneNumber: 'I01' };
  const db = collection([raw]);
  db.replaceOne = async () => {};
  await assert.rejects(reclusterCycle(db, raw.initTime, 'fnv3-gen',
    { apply: true, removeRaw: true, backupDir }), /Post-write verification failed/);
  assert.equal(db.deletes, 0);
  assert.deepEqual(db.records, [copy(raw)]);
});

test('history handles each institution separately, sparse cycles, and excludes cutoff', async () => {
  const dates = ['2026-09-25T00:00Z', '2026-09-27T18:00Z', '2026-09-28T00:00Z'];
  const records = ['fnv3-gen', 'WNV3', 'fnv3'].flatMap(ins => dates.flatMap(date => fixture(ins, new Date(date))));
  const results = [];
  const summary = await reclusterHistory(collection(records), { onCycle: result => results.push(result) });
  assert.equal(summary.cycles, 6);
  assert.equal(summary.previewed, 6);
  assert.equal(summary.sourceTracks, 36);
  assert.ok(results.every(result => new Date(result.initTime) < CUTOFF));
  const limited = await reclusterHistory(collection(records), { institutions: ['WNV3'],
    start: parseBoundary('2026-09-27') });
  assert.equal(limited.cycles, 1);
});

test('write failure stops history and identifies backup and resume position', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-failure-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const db = collection([...fixture(), ...fixture('fnv3-gen', new Date('2026-09-27T12:00Z'))]);
  db.replaceOne = async () => { throw new Error('write unavailable'); };
  await assert.rejects(reclusterHistory(db, { apply: true, backupDir }),
    /fnv3-gen 2026-09-27T12:00:00.000Z failed; stopped.*--ins fnv3-gen.*--start 2026-09-27T12.*backup:/);
  assert.equal(fs.readdirSync(backupDir).length, 1);
  assert.equal(db.deletes, 0);
});

test('verification failure preserves stale clusters for recovery', async t => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-verify-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  const records = fixture();
  const db = collection(records);
  db.replaceOne = async () => {}; // Simulate a write silently failing to persist.
  await assert.rejects(reclusterCycle(db, records[0].initTime, 'fnv3-gen', { apply: true, backupDir }),
    /Post-write verification failed.*backup:/);
  assert.equal(db.deletes, 0);
  assert.deepEqual(db.records, records.map(copy));
});

test('missing tracks and backup failure never mutate the database', async t => {
  const records = fixture();
  const malformed = collection([{ ...records[0], tracks: [] }]);
  await assert.rejects(reclusterCycle(malformed, records[0].initTime, 'fnv3-gen', { apply: true }),
    /without ensemble tracks/);
  assert.equal(malformed.writes, 0);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv3-backup-error-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const file = path.join(tempDir, 'file');
  fs.writeFileSync(file, 'not a directory');
  const db = collection(records);
  await assert.rejects(reclusterCycle(db, records[0].initTime, 'fnv3-gen', { apply: true, backupDir: file }));
  assert.equal(db.writes, 0);
  assert.equal(db.deletes, 0);
  await assert.rejects(reclusterCycle(db, CUTOFF, 'fnv3-gen'), /before 2026-09-28/);
});

test('repository sample preserves every track when reconstructing stored clusters', async () => {
  const { processWPCycloneClusterMemberExclusive } = require('../src/lib/cluster_member_exclusive');
  const sample = require('../demo/fnv3_basic_result.json').data;
  const original = processWPCycloneClusterMemberExclusive(sample).tracks_list_enhanced.data;
  assert.ok(original.length > 0);
  const db = collection(original.map(record => ({ ...record, _id: new ObjectID(),
    initTime: new Date(record.initTime) })));
  const first = db.records[0];
  const sameBatch = db.records.filter(record => record.ins === first.ins && +record.initTime === +first.initTime);
  const result = await reclusterCycle(db, first.initTime, first.ins);
  assert.equal(result.sourceTracks, sameBatch.reduce((sum, record) => sum + record.tracks.length, 0));
  assert.equal(result.status, 'previewed');
});
