const test = require('node:test');
const assert = require('node:assert/strict');
const { reclusterAIFSData } = require('../src/lib/aifs_cluster');
const { trans_aifs_to_mongo_format } = require('../src/lib/get_aifs');

function fixture(number, lon, members = 5) {
    return {
        ins: 'aifs-cai', basinShort2: 'WP', cycloneNumber: number,
        cycloneName: `${number}WP`, initTime: new Date('2026-10-03T00:00:00Z'),
        tcID: `source-${number}`, fillStatus: 2,
        tracks: Array.from({ length: members }, (_, member) => ({
            fcType: 'ensembleForecast', ensembleNumber: member,
            track: [0, 6, 12, 18].map(step =>
                [step, [lon + member * 0.1 + step / 6, 15], 990, 25]),
        })),
    };
}

test('reclusters only IC tracks, numbers clusters from C-00, and retains noise', () => {
    const untouched = [fixture('I0', 130), fixture('12', 130)];
    const source = [...untouched, fixture('IC1', 130), fixture('IC2', 160), fixture('IC3', 100, 1)];
    const before = JSON.stringify(source);
    const result = reclusterAIFSData(source);
    assert.deepEqual(result.slice(0, 2), untouched);
    const clusters = result.slice(2);
    assert.deepEqual(clusters.map(item => item.cycloneNumber), ['C-00', 'C-01', 'C-9999']);
    assert.deepEqual(clusters.map(item => item.tracks.length), [5, 5, 1]);
    assert.equal(JSON.stringify(source), before);
    for (const item of clusters) {
        assert.equal(item.ins, 'aifs-cai');
        assert.equal(item.fillStatus, 2);
        assert.equal(item.cycloneName, `${item.cycloneNumber}WP`);
        assert.equal(item.tcID, `2026100300_${item.cycloneName}_${item.cycloneNumber}_aifs-cai`);
    }
    assert.deepEqual(clusters.flatMap(item => item.tracks), source.slice(2).flatMap(item => item.tracks));
});

test('no IC data returns the original records, including repository AIFS sample', () => {
    const source = trans_aifs_to_mongo_format(require('../demo/aifs.json'));
    assert.strictEqual(reclusterAIFSData(source), source);
    assert.deepEqual(reclusterAIFSData([]), []);
});

test('merges compatible tracks across original IC groups and handles an all-noise batch', () => {
    const first = fixture('IC1', 130);
    const second = fixture('IC2', 130);
    second.tracks = first.tracks.slice(2);
    first.tracks = first.tracks.slice(0, 2);
    const merged = reclusterAIFSData([first, second]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].cycloneNumber, 'C-00');
    assert.equal(merged[0].tracks.length, 5);
    const noise = reclusterAIFSData([fixture('IC3', 100, 1)]);
    assert.equal(noise.length, 1);
    assert.equal(noise[0].cycloneNumber, 'C-9999');
    assert.equal(noise[0].tracks.length, 1);
});

test('IC data converted from the API format is reclustered before database saving', () => {
    const tracks = fixture('IC1', 130).tracks;
    const raw = [
        { model: 'aifs', init_time: '2026100300' },
        { cluster_track: tracks.map(item => ({
            cluster_id: 'C1',
            track: item.track.map(([step, [longitude, latitude], pressure, wind]) =>
                ({ step, longitude, latitude, pressure, wind })),
        })) },
    ];
    const converted = trans_aifs_to_mongo_format(raw);
    assert.equal(converted[0].cycloneNumber, 'IC1');
    const result = reclusterAIFSData(converted);
    assert.equal(result.length, 1);
    assert.equal(result[0].cycloneNumber, 'C-00');
    assert.deepEqual(result[0].tracks.map(item => item.track), tracks.map(item => item.track));
});
