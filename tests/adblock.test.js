import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAdItem,
    pruneAdObject,
    injectNoAdContextBody,
    trySkipAd
} from '../modules/adblock.js';

test('isAdItem detects direct and wrapped ad renderers', () => {
    assert.equal(isAdItem({ adSlotRenderer: {} }), true);
    assert.equal(isAdItem({ richItemRenderer: { content: { displayAdRenderer: {} } } }), true);
    assert.equal(isAdItem({ videoRenderer: { videoId: '123' } }), false);
    assert.equal(isAdItem(null), false);
});

test('pruneAdObject removes adPlacements, playerAds, enforcement modals, and feed ad arrays', () => {
    const payload = {
        adPlacements: [{ id: 1 }],
        playerAds: [{ id: 2 }],
        auxiliaryUi: {
            messageRenderers: {
                enforcementMessageViewModel: { title: 'blocked' },
                keepMe: true
            }
        },
        contents: [
            { videoRenderer: { videoId: 'ok1' } },
            { richItemRenderer: { content: { adSlotRenderer: { id: 'ad1' } } } },
            { videoRenderer: { videoId: 'ok2' } }
        ]
    };

    pruneAdObject(payload);
    assert.equal('adPlacements' in payload, false);
    assert.equal('playerAds' in payload, false);
    assert.equal('enforcementMessageViewModel' in payload.auxiliaryUi.messageRenderers, false);
    assert.equal(payload.auxiliaryUi.messageRenderers.keepMe, true);
    assert.equal(payload.contents.length, 2);
    assert.deepEqual(payload.contents.map(c => c.videoRenderer.videoId), ['ok1', 'ok2']);
});

test('injectNoAdContextBody adds isInlinePlaybackNoAd when contentPlaybackContext is present', () => {
    const raw = JSON.stringify({ context: {}, playbackContext: { contentPlaybackContext: { autoCaptionsDefaultOn: false } } });
    const patched = injectNoAdContextBody(raw);
    assert.ok(patched);
    const parsed = JSON.parse(patched);
    assert.equal(parsed.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
    assert.equal(injectNoAdContextBody(patched), null);
});

test('trySkipAd speeds up unskippable ad at 16x muted and restores volume/rate after ad ends', () => {
    const video = { playbackRate: 1, muted: false, volume: 0.75, duration: 15, currentTime: 2 };
    let adActive = true;
    const player = {
        classList: { contains: cls => adActive && cls === 'ad-showing' },
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const state = { adSpeedActive: false, prevVolume: 1 };

    trySkipAd({ enabled: true, player, video, state, doc: null, win: {} });
    assert.equal(state.adSpeedActive, true);
    assert.equal(state.prevVolume, 0.75);
    assert.equal(video.playbackRate, 16);
    assert.equal(video.muted, true);

    adActive = false;
    trySkipAd({ enabled: true, player, video, state, doc: null, win: {} });
    assert.equal(state.adSpeedActive, false);
    assert.equal(video.playbackRate, 1);
    assert.equal(video.muted, false);
    assert.equal(video.volume, 0.75);
});
