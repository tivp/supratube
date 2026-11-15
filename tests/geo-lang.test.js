import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countryToLang,
    parseGeoCookie,
    serializeGeoCookie,
    extractLangFromGeoPayload,
    resolveUserNativeLang
} from '../modules/geo-lang.js';

test('countryToLang maps Spanish-speaking and global country codes to base ISO lang', () => {
    assert.equal(countryToLang('CL'), 'es');
    assert.equal(countryToLang('mx'), 'es');
    assert.equal(countryToLang('ES'), 'es');
    assert.equal(countryToLang('BR'), 'pt');
    assert.equal(countryToLang('JP'), 'ja');
    assert.equal(countryToLang('ZZ'), '');
});

test('parseGeoCookie and serializeGeoCookie roundtrip record safely', () => {
    const now = 1794762000000;
    const raw = serializeGeoCookie({ lang: 'es', cc: 'CL', ip: '190.1.2.3', ts: now });
    const parsed = parseGeoCookie(`OTHER=1; supratube_geo_lang=${encodeURIComponent(raw)}`);
    assert.deepEqual(parsed, { lang: 'es', cc: 'CL', ip: '190.1.2.3', ts: now });
    assert.equal(parseGeoCookie('supratube_geo_lang=corrupt'), null);
});

test('extractLangFromGeoPayload handles all 4 IP provider schemas', () => {
    assert.deepEqual(
        extractLangFromGeoPayload('ipapi', { ip: '1.2.3.4', country_code: 'CL', languages: 'es-CL' }),
        { lang: 'es', cc: 'CL', ip: '1.2.3.4' }
    );
    assert.deepEqual(
        extractLangFromGeoPayload('freeipapi', { countryCode: 'MX', languages: ['es'], ipAddress: '1.2.3.5' }),
        { lang: 'es', cc: 'MX', ip: '1.2.3.5' }
    );
    assert.deepEqual(
        extractLangFromGeoPayload('ipwho', { success: true, ip: '1.2.3.6', country_code: 'AR' }),
        { lang: 'es', cc: 'AR', ip: '1.2.3.6' }
    );
    assert.deepEqual(
        extractLangFromGeoPayload('countryis', { ip: '1.2.3.7', country: 'FR' }),
        { lang: 'fr', cc: 'FR', ip: '1.2.3.7' }
    );
});

test('resolveUserNativeLang uses fresh cookie without network and falls back across IP providers when missing', async () => {
    let calls = 0;
    const now = Date.now();
    const cachedCookie = `supratube_geo_lang=${encodeURIComponent(JSON.stringify({ lang: 'es', cc: 'CL', ip: '1.1.1.1', ts: now }))}`;
    const fast = await resolveUserNativeLang({
        cookieStr: cachedCookie,
        requestFn: async () => { calls++; return { status: 500, text: '' }; },
        setCookieFn: () => {},
        navigatorLang: 'en-US'
    });
    assert.equal(fast, 'es');
    assert.equal(calls, 0);

    const written = [];
    const fetched = await resolveUserNativeLang({
        cookieStr: '',
        requestFn: async url => {
            calls++;
            if (url.includes('ipapi.co/')) return { status: 429, text: '' };
            if (url.includes('freeipapi.com')) {
                return { status: 200, text: JSON.stringify({ countryCode: 'CL', languages: ['es'], ipAddress: '9.9.9.9' }) };
            }
            return { status: 500, text: '' };
        },
        setCookieFn: c => written.push(c),
        navigatorLang: 'en-US'
    });
    assert.equal(fetched, 'es');
    assert.equal(calls, 2);
    assert.equal(written.length, 1);
    assert.match(written[0], /supratube_geo_lang=/);
});
