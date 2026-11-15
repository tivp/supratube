import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ORDEN_MODULOS,
    DEFAULT_SETTINGS,
    COUNTRY_TO_LANG
} from '../modules/config.js';
import {
    getVideoId,
    normalizeBaseLang,
    extractLangFromAudioTrackId,
    readCookie,
    buildCookieString
} from '../modules/utils.js';

test('ORDEN_MODULOS lists all 8 runtime modules ending with main.js', () => {
    assert.deepEqual(ORDEN_MODULOS, [
        'config.js',
        'utils.js',
        'adblock.js',
        'sponsorblock.js',
        'quality.js',
        'geo-lang.js',
        'subtitles.js',
        'main.js'
    ]);
    assert.equal(DEFAULT_SETTINGS.adSkip, true);
    assert.equal(DEFAULT_SETTINGS.sponsorBlock, true);
    assert.equal(DEFAULT_SETTINGS.greenBar, true);
    assert.equal(DEFAULT_SETTINGS.auto1080p, true);
    assert.equal(DEFAULT_SETTINGS.autoSubtitles, true);
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

test('extractLangFromAudioTrackId extracts base language from YouTube audioTrack ids', () => {
    assert.equal(extractLangFromAudioTrackId('es-419.10'), 'es');
    assert.equal(extractLangFromAudioTrackId('en.4'), 'en');
    assert.equal(extractLangFromAudioTrackId('pt-BR.2'), 'pt');
    assert.equal(extractLangFromAudioTrackId(''), '');
});

test('readCookie and buildCookieString roundtrip encoded cookie values', () => {
    const cookieLine = buildCookieString('supratube_geo_lang', '{"lang":"es","cc":"CL"}', 604800, '.youtube.com');
    assert.match(cookieLine, /^supratube_geo_lang=/);
    assert.match(cookieLine, /Domain=\.youtube\.com/);
    assert.match(cookieLine, /Max-Age=604800/);
    const pair = cookieLine.split(';')[0];
    assert.equal(readCookie(`PREF=tz=UTC; ${pair}`, 'supratube_geo_lang'), '{"lang":"es","cc":"CL"}');
});
