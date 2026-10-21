const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLatestList, downloadbyIns } = require('../src/emcDownload');
const { tcfa2mongo } = require('../src/lib/emc_TCFA');
// Actual EMC 2026102100 bulletin, reduced to 29W control and member 1.
const raw = fs.readFileSync(path.join(__dirname, 'fixtures/emc-29w-2026102100.txt'), 'utf8');

test('generates recent UTC synoptic cycles without relying on the stale date menu', () => {
  assert.deepEqual(getLatestList(4, '2026-10-21T17:30:00+08:00'),
    ['2026102106', '2026102100', '2026102018', '2026102012']);
  assert.deepEqual(getLatestList(3, '2026-01-01T00:00:00Z'),
    ['2026010100', '2025123118', '2025123112']);
  assert.deepEqual(getLatestList(2, '2024-03-01T00:00:00Z'), ['2024030100', '2024022918']);
  assert.throws(() => getLatestList(0));
});

test('parses actual 29W ensemble tracks and accepts an empty no-storm bulletin', () => {
  const records = tcfa2mongo(raw, 'ncep_e');
  assert.equal(records.length, 1);
  assert.equal(records[0].tcID, '2026102100_29W_29W_ncep_e');
  assert.equal(records[0].basinShort2, 'WP');
  assert.deepEqual(records[0].tracks.map(t => t.ensembleNumber), [0, 1]);
  assert.deepEqual(records[0].tracks[0].track[0].slice(0, 3), [0, [130.2, 18.1], 919]);
  assert.deepEqual(tcfa2mongo(' \n', 'ncep_e'), []);
});

test('awaits database success before caching and retries failed ingestion', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emc-test-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const date = '2026102100';
  const file = path.join(dataRoot, 'ncep', '2026', `storms.aeperts.atcf_gen.wptg.${date}.txt`);
  let requests = 0;
  let saves = 0;
  const options = { dataRoot, request: async () => { requests++; return raw; },
    save: async record => {
      assert.equal(record.cycloneNumber, '29W');
      assert.equal(fs.existsSync(file), false);
      await new Promise(resolve => setImmediate(resolve));
      if (++saves === 1) throw new Error('database unavailable');
    } };
  assert.equal(await downloadbyIns('NCEPEns', [date], options), 1);
  assert.equal(fs.existsSync(file), false);
  assert.equal(await downloadbyIns('NCEPEns', [date], options), 0);
  assert.equal(fs.readFileSync(file, 'utf8'), raw);
  assert.equal(await downloadbyIns('NCEPEns', [date], options), 0);
  assert.equal(requests, 2);
  assert.equal(saves, 2);
});

test('404 and invalid responses do not prevent later cycles from being ingested', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emc-test-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const saved = [];
  const failures = await downloadbyIns('NCEPEns', ['2026102112', '2026102106', '2026102100'], {
    dataRoot, request: async () => {
      if (++calls === 1) throw Object.assign(new Error('not published'), { statusCode: 404 });
      return calls === 2 ? '<html>maintenance</html>' : raw;
    }, save: async record => saved.push(record),
  });
  assert.equal(failures, 1);
  assert.equal(saved.length, 1);
  assert.equal(fs.readdirSync(path.join(dataRoot, 'ncep', '2026')).length, 1);
});
