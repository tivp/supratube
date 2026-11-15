import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ORDEN_MODULOS,
    DEFAULT_SETTINGS,
    COUNTRY_TO_LANG
} from '../modules/config.js';
import {
    getVideoId,
    isShortsUrl,
    selectActivePlayer,
    normalizeBaseLang,
    extractLangFromAudioTrackId,
    readCookie,
    buildCookieString,
    gmRequest
} from '../modules/utils.js';

test('ORDEN_MODULOS lists all 9 runtime modules ending with main.js', () => {
    assert.deepEqual(ORDEN_MODULOS, [
        'config.js',
        'utils.js',
        'adblock.js',
        'sponsorblock.js',
        'quality.js',
        'geo-lang.js',
        'subtitles.js',
        'ai-summary.js',
        'main.js'
    ]);
    assert.equal(DEFAULT_SETTINGS.adSkip, true);
    assert.equal(DEFAULT_SETTINGS.sponsorBlock, true);
    assert.equal(DEFAULT_SETTINGS.greenBar, true);
    assert.equal(DEFAULT_SETTINGS.auto1080p, true);
    assert.equal(DEFAULT_SETTINGS.autoSubtitles, true);
    assert.equal(DEFAULT_SETTINGS.aiSummary, true);
    assert.equal(COUNTRY_TO_LANG.CL, 'es');
    assert.equal(COUNTRY_TO_LANG.MX, 'es');
    assert.equal(COUNTRY_TO_LANG.US, 'en');
});

test('getVideoId extracts watch, shorts, and youtu.be IDs', () => {
    assert.equal(getVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s'), 'dQw4w9WgXcQ');
    assert.equal(getVideoId('https://www.youtube.com/shorts/abc123DEF45'), 'abc123DEF45');
    assert.equal(getVideoId('https://youtu.be/0e3GPea1Tyg?si=xyz'), '0e3GPea1Tyg');
    assert.equal(getVideoId('https://www.youtube.com/'), null);
});

test('normalizeBaseLang folds regional Spanish and other locales to base ISO code', () => {
    assert.equal(normalizeBaseLang('es-MX'), 'es');
    assert.equal(normalizeBaseLang('es-419'), 'es');
    assert.equal(normalizeBaseLang('es-ES'), 'es');
    assert.equal(normalizeBaseLang('ES_cl'), 'es');
    assert.equal(normalizeBaseLang('en-US'), 'en');
    assert.equal(normalizeBaseLang('zh-Hans'), 'zh');
    assert.equal(normalizeBaseLang(''), '');
});

test('extractLangFromAudioTrackId extracts base language from legacy and protobuf YouTube audioTrack ids and ignores und', () => {
    assert.equal(extractLangFromAudioTrackId('es-419.10'), 'es');
    assert.equal(extractLangFromAudioTrackId('en.4'), 'en');
    assert.equal(extractLangFromAudioTrackId('pt-BR.2'), 'pt');
    assert.equal(extractLangFromAudioTrackId('251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw'), 'es');
    assert.equal(extractLangFromAudioTrackId('251;ChEKBWFjb250EghvcmlnaW5hbAoICgNkcmMSATEKDQoEbGFuZxIFZW4tVVM'), 'en');
    assert.equal(extractLangFromAudioTrackId('und'), '');
    assert.equal(extractLangFromAudioTrackId('und.4'), '');
    assert.equal(extractLangFromAudioTrackId('zxx'), '');
    assert.equal(extractLangFromAudioTrackId('default'), '');
    assert.equal(extractLangFromAudioTrackId('251;not_valid_protobuf'), '');
    assert.equal(extractLangFromAudioTrackId(''), '');
});

test('selectActivePlayer prioritizes #shorts-player on /shorts URLs even when #movie_player is connected', () => {
    assert.equal(isShortsUrl('/shorts/KBIKtrmM80Y'), true);
    assert.equal(isShortsUrl('https://www.youtube.com/shorts/KBIKtrmM80Y?feature=share'), true);
    assert.equal(isShortsUrl('/watch?v=KBIKtrmM80Y'), false);

    const moviePlayer = { id: 'movie_player', isConnected: true, getVideoData: () => ({ video_id: null }) };
    const shortsPlayer = { id: 'shorts-player', isConnected: true, getVideoData: () => ({ video_id: 'KBIKtrmM80Y' }) };
    const fakeDoc = {
        getElementById: id => (id === 'movie_player' ? moviePlayer : id === 'shorts-player' ? shortsPlayer : null),
        querySelector: sel => {
            if (sel === 'ytd-reel-video-renderer[is-active] #shorts-player') return shortsPlayer;
            if (sel === '.html5-video-player') return moviePlayer;
            return null;
        }
    };

    assert.equal(selectActivePlayer(fakeDoc, '/shorts/KBIKtrmM80Y', 'KBIKtrmM80Y'), shortsPlayer);
    assert.equal(selectActivePlayer(fakeDoc, '/shorts/KBIKtrmM80Y'), shortsPlayer);
    assert.equal(selectActivePlayer(fakeDoc, '/watch?v=dQw4w9WgXcQ'), moviePlayer);
});

test('readCookie and buildCookieString roundtrip encoded cookie values', () => {
    const cookieLine = buildCookieString('supratube_geo_lang', '{"lang":"es","cc":"CL"}', 604800, '.youtube.com');
    assert.match(cookieLine, /^supratube_geo_lang=/);
    assert.match(cookieLine, /Domain=\.youtube\.com/);
    assert.match(cookieLine, /Max-Age=604800/);
    const pair = cookieLine.split(';')[0];
    assert.equal(readCookie(`PREF=tz=UTC; ${pair}`, 'supratube_geo_lang'), '{"lang":"es","cc":"CL"}');
});

test('gmRequest forwards POST body to both GM_xmlhttpRequest and fetch', async () => {
    let seenGm = null;
    const prevGm = globalThis.GM_xmlhttpRequest;
    const prevFetch = globalThis.fetch;
    try {
        globalThis.GM_xmlhttpRequest = opts => {
            seenGm = opts;
            opts.onload?.({ status: 200, responseText: 'ok-gm' });
            return { abort() {} };
        };
        const gmRes = await gmRequest('https://translate.googleapis.com/translate_a/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'q=hola',
            anonymous: true
        });
        assert.equal(gmRes.status, 200);
        assert.equal(seenGm.url, 'https://translate.googleapis.com/translate_a/single');
        assert.equal(seenGm.data, 'q=hola');

        delete globalThis.GM_xmlhttpRequest;
        let seenFetch = null;
        globalThis.fetch = async (url, init) => {
            seenFetch = { url, init };
            return { status: 200, text: async () => 'ok-fetch' };
        };
        const fetchRes = await gmRequest('https://translate.googleapis.com/translate_a/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'q=hola',
            anonymous: true
        });
        assert.equal(fetchRes.status, 200);
        assert.equal(seenFetch.url, 'https://translate.googleapis.com/translate_a/single');
        assert.equal(seenFetch.init.body, 'q=hola');
    } finally {
        if (prevGm === undefined) delete globalThis.GM_xmlhttpRequest;
        else globalThis.GM_xmlhttpRequest = prevGm;
        globalThis.fetch = prevFetch;
    }
});
