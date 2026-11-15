import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseQualityHeight,
    selectBest1080pFormat,
    selectFallbackQualityLevel,
    apply1080pQuality
} from '../modules/quality.js';

test('parseQualityHeight parses numeric resolution height from qualityLabel', () => {
    assert.equal(parseQualityHeight('1080p60 HD'), 1080);
    assert.equal(parseQualityHeight('1080p Premium'), 1080);
    assert.equal(parseQualityHeight('2160p60 4K'), 2160);
    assert.equal(parseQualityHeight('720p'), 720);
    assert.equal(parseQualityHeight('auto'), 0);
});

test('selectBest1080pFormat prioritizes playable 1080p60 Premium > 1080p Premium > 1080p60 > 1080p and ignores paywalled/4K', () => {
    const freeAccountList = [
        { quality: 'hd2160', qualityLabel: '2160p60', formatId: '315', isPlayable: true },
        { quality: 'hd1080', qualityLabel: '1080p Premium', formatId: '616', isPlayable: false, paygatedQualityDetails: { paygatedIndicatorText: 'Premium' } },
        { quality: 'hd1080', qualityLabel: '1080p60', formatId: '299', isPlayable: true },
        { quality: 'hd1080', qualityLabel: '1080p', formatId: '137', isPlayable: true }
    ];
    assert.equal(selectBest1080pFormat(freeAccountList).formatId, '299');

    const premiumAccountList = [
        { quality: 'hd2160', qualityLabel: '2160p', formatId: '313', isPlayable: true },
        { quality: 'hd1080', qualityLabel: '1080p60 Premium', formatId: '620', isPlayable: true, paygatedQualityDetails: {} },
        { quality: 'hd1080', qualityLabel: '1080p Premium', formatId: '616', isPlayable: true, paygatedQualityDetails: {} },
        { quality: 'hd1080', qualityLabel: '1080p60', formatId: '299', isPlayable: true }
    ];
    assert.equal(selectBest1080pFormat(premiumAccountList).formatId, '620');

    const no1080pList = [
        { quality: 'hd720', qualityLabel: '720p60', formatId: '298', isPlayable: true },
        { quality: 'hd720', qualityLabel: '720p', formatId: '136', isPlayable: true },
        { quality: 'large', qualityLabel: '480p', formatId: '135', isPlayable: true }
    ];
    assert.equal(selectBest1080pFormat(no1080pList).formatId, '298');
});

test('selectFallbackQualityLevel selects hd1080 or highest below 1080p, never 4K', () => {
    assert.equal(selectFallbackQualityLevel(['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720']), 'hd1080');
    assert.equal(selectFallbackQualityLevel(['hd720', 'large', 'medium']), 'hd720');
    assert.equal(selectFallbackQualityLevel(['auto']), null);
});

test('apply1080pQuality calls setPlaybackQualityRange with formatId and skips if manualOverride is true', () => {
    const calls = [];
    const player = {
        getAvailableQualityData: () => [
            { quality: 'hd1080', qualityLabel: '1080p60', formatId: '299', isPlayable: true }
        ],
        setPlaybackQualityRange: (min, max, fmt) => calls.push([min, max, fmt]),
        setPlaybackQuality: q => calls.push(['set', q])
    };
    const state = { manualOverride: false, lastFormatId: null };

    assert.equal(apply1080pQuality(player, state, true), true);
    assert.deepEqual(calls, [['hd1080', 'hd1080', '299'], ['set', 'hd1080']]);

    assert.equal(apply1080pQuality(player, state, true), false);

    state.manualOverride = true;
    state.lastFormatId = null;
    assert.equal(apply1080pQuality(player, state, true), false);
});
