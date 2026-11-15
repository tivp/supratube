import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseSponsorSegments,
    computeSegmentLayout,
    findSegmentToActOn,
    tickSponsorBlock
} from '../modules/sponsorblock.js';

test('parseSponsorSegments filters by videoId and sorts segments by start time', () => {
    const raw = JSON.stringify([
        { videoID: 'other', segments: [{ segment: [1, 5], category: 'sponsor', UUID: 'u0' }] },
        {
            videoID: 'vid1',
            segments: [
                { segment: [40, 55], category: 'selfpromo', actionType: 'skip', UUID: 'u2' },
                { segment: [10, 22], category: 'sponsor', actionType: 'skip', UUID: 'u1' }
            ]
        }
    ]);
    const parsed = parseSponsorSegments(raw, 'vid1');
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].uuid, 'u1');
    assert.equal(parsed[0].start, 10);
    assert.equal(parsed[0].end, 22);
    assert.equal(parsed[1].uuid, 'u2');
});

test('computeSegmentLayout computes clamped percentage left, width, and green color', () => {
    const layout = computeSegmentLayout({ start: 25, end: 50, cat: 'sponsor' }, 100);
    assert.equal(layout.leftPct, 25);
    assert.equal(layout.widthPct, 25);
    assert.equal(layout.color, '#00d400');

    const clamped = computeSegmentLayout({ start: 90, end: 130, cat: 'selfpromo' }, 100);
    assert.equal(clamped.leftPct, 90);
    assert.equal(clamped.widthPct, 10);
    assert.equal(clamped.color, '#22c55e');
});

test('findSegmentToActOn skips once per entry and resets lastSkippedUuid once outside segment', () => {
    const segs = [{ start: 10, end: 20, cat: 'sponsor', actionType: 'skip', uuid: 's1' }];
    const state = { lastSkippedUuid: null, mutedSegUuid: null, prevVolume: 1 };

    const hit1 = findSegmentToActOn(segs, 10.2, state);
    assert.equal(hit1.uuid, 's1');

    state.lastSkippedUuid = 's1';
    assert.equal(findSegmentToActOn(segs, 15, state), null);

    assert.equal(findSegmentToActOn(segs, 5, state), null);
    assert.equal(state.lastSkippedUuid, null);
    assert.equal(findSegmentToActOn(segs, 10.5, state).uuid, 's1');
});

test('tickSponsorBlock seeks video past skip segment and mutes/unmutes mute segment', () => {
    const segs = [
        { start: 10, end: 25, cat: 'sponsor', actionType: 'skip', uuid: 's1' },
        { start: 30, end: 35, cat: 'music_offtopic', actionType: 'mute', uuid: 'm1' }
    ];
    const state = { lastSkippedUuid: null, mutedSegUuid: null, prevVolume: 0.8 };
    const video = { paused: false, currentTime: 11, muted: false, volume: 0.8 };

    tickSponsorBlock({ video, segments: segs, state, enabled: true });
    assert.equal(video.currentTime, 25);
    assert.equal(state.lastSkippedUuid, 's1');

    video.currentTime = 31;
    tickSponsorBlock({ video, segments: segs, state, enabled: true });
    assert.equal(video.muted, true);
    assert.equal(state.mutedSegUuid, 'm1');

    video.currentTime = 36;
    tickSponsorBlock({ video, segments: segs, state, enabled: true });
    assert.equal(video.muted, false);
    assert.equal(state.mutedSegUuid, null);
});
