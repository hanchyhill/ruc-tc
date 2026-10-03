const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));

test('skips existing files and reclusters IC snapshots only when new data is downloaded', async () => {
  const date = dayjs.utc('2026-10-03T00:00:00Z');
  const base = { ins: 'aifs-cai', basinShort2: 'WP', initTime: date.toDate() };
  const named = { ...base, cycloneNumber: 'IA1' };
  const raw = { ...base, cycloneNumber: 'IC1' };
  const incoming = { ...base, cycloneNumber: 'IC2' };
  let calls = 0;
  let fileExists = false;
  const snapshots = [[named, raw], [named, raw, incoming], [named]];
  const recalculated = [];
  const saved = [];
  const cluster = { ...base, cycloneNumber: 'C-00' };
  const collection = { find: () => ({ toArray: async () => [cluster] }) };
  const module = { exports: {} };
  const context = vm.createContext({ module, process, console,
    saveStub: async item => saved.push(item),
    require(name) {
      if (name === 'fs') return { existsSync: () => fileExists, mkdirSync() {},
        writeFileSync() { fileExists = true; } };
      if (name === './lib/get_aifs.js') return {
        get_aifs: async () => snapshots[calls++], trans_aifs_to_mongo_format: data => data,
      };
      if (name === './aifs_history_recluster') return { reclusterCycle: async (coll, time, ins, options) => {
        assert.strictEqual(coll, collection);
        assert.equal(+time, +date);
        assert.equal(ins, 'aifs-cai');
        assert.equal(options.apply, true);
        recalculated.push(options.sourceRecords);
      } };
      if (name === 'mongoose') return { connection: { db: { collection: () => collection } } };
      if (name === './db/initDB.js') return {};
      return require(name);
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/aifsDownload_cai'), 'utf8') +
    '\nsave2DB = saveStub;', context);
  for (let index = 0; index < 2; index++) {
    fileExists = false;
    const result = await module.exports.downloadData(date);
    assert.equal(result.length, 2);
    assert.strictEqual(result[0], named);
    assert.strictEqual(result[1], cluster);
    assert.equal(await module.exports.downloadData(date), null);
    assert.equal(calls, index + 1);
    assert.equal(recalculated.length, index + 1);
  }
  assert.equal(calls, 2);
  assert.deepEqual(recalculated.map(items => items.length), [1, 2]);
  fileExists = false;
  const withoutIC = await module.exports.downloadData(date);
  assert.equal(withoutIC.length, 1);
  assert.strictEqual(withoutIC[0], named);
  assert.equal(recalculated.length, 2);
  assert.ok(saved.every(item => item === named));
});
