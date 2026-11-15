import { CFG, GEO_COOKIE_NAME, COUNTRY_TO_LANG } from './config.js';
import { normalizeBaseLang, readCookie, buildCookieString, gmRequest } from './utils.js';

const GEO_PROVIDERS = [
    { name: 'ipapi', url: 'https://ipapi.co/json/' },
    { name: 'freeipapi', url: 'https://freeipapi.com/api/json' },
    { name: 'ipwho', url: 'https://ipwho.is/' },
    { name: 'countryis', url: 'https://api.country.is/' }
];

export function countryToLang(cc) {
    const code = String(cc || '').trim().toUpperCase();
    return COUNTRY_TO_LANG[code] || '';
}

export function serializeGeoCookie(record) {
    return JSON.stringify({
        lang: normalizeBaseLang(record?.lang || ''),
        cc: String(record?.cc || '').toUpperCase(),
        ip: String(record?.ip || ''),
        ts: Number(record?.ts) || Date.now()
    });
}

export function parseGeoCookie(cookieStr) {
    const raw = readCookie(cookieStr, GEO_COOKIE_NAME);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.lang) return null;
        return {
            lang: normalizeBaseLang(parsed.lang),
            cc: String(parsed.cc || '').toUpperCase(),
            ip: String(parsed.ip || ''),
            ts: Number(parsed.ts) || 0
        };
    } catch {
        return null;
    }
}

export function extractLangFromGeoPayload(providerName, data) {
    if (!data || typeof data !== 'object') return null;
    if (providerName === 'ipwho' && data.success === false) return null;

    const cc = String(data.country_code || data.countryCode || data.country || '').trim().toUpperCase();
    const ip = String(data.ip || data.ipAddress || '').trim();
    let lang = '';

    if (typeof data.languages === 'string' && data.languages.trim()) {
        lang = normalizeBaseLang(data.languages.split(',')[0]);
    } else if (Array.isArray(data.languages) && data.languages.length) {
        lang = normalizeBaseLang(data.languages[0]);
    }
    if (!lang && cc) {
        lang = countryToLang(cc);
    }
    if (!lang) return null;
    return { lang, cc, ip };
}

let _inflightGeo = null;

export async function resolveUserNativeLang(deps = {}) {
    const cookieStr = deps.cookieStr !== undefined
        ? deps.cookieStr
        : (typeof document !== 'undefined' ? document.cookie : '');
    const requestFn = deps.requestFn || (u => gmRequest(u, { anonymous: true, timeout: 6000 }));
    const setCookieFn = deps.setCookieFn || (line => {
        if (typeof document !== 'undefined') document.cookie = line;
    });
    const navigatorLang = deps.navigatorLang !== undefined
        ? deps.navigatorLang
        : (typeof navigator !== 'undefined' ? navigator.language : 'es');

    const cached = parseGeoCookie(cookieStr);
    const now = Date.now();
    if (cached?.lang) {
        if (now - cached.ts > CFG.geoRefreshMs && !_inflightGeo && deps.allowBackgroundRefresh !== false) {
            _inflightGeo = resolveFromProviders(requestFn, setCookieFn, navigatorLang).finally(() => {
                _inflightGeo = null;
            });
        }
        return cached.lang;
    }

    if (_inflightGeo && !deps.requestFn) {
        return _inflightGeo;
    }

    const work = resolveFromProviders(requestFn, setCookieFn, navigatorLang);
    if (!deps.requestFn) {
        _inflightGeo = work.finally(() => { _inflightGeo = null; });
    }
    return work;
}

async function resolveFromProviders(requestFn, setCookieFn, navigatorLang) {
    for (let i = 0; i < GEO_PROVIDERS.length; i++) {
        const provider = GEO_PROVIDERS[i];
        try {
            const res = await requestFn(provider.url);
            if (res.status !== 200 || !res.text) continue;
            const parsed = JSON.parse(res.text);
            const info = extractLangFromGeoPayload(provider.name, parsed);
            if (info?.lang) {
                const payload = serializeGeoCookie({ ...info, ts: Date.now() });
                setCookieFn(buildCookieString(GEO_COOKIE_NAME, payload, CFG.geoCookieMaxAgeSec, '.youtube.com'));
                return info.lang;
            }
        } catch {}
    }

    const fallbackLang = normalizeBaseLang(navigatorLang) || 'es';
    const payload = serializeGeoCookie({ lang: fallbackLang, cc: '', ip: '', ts: Date.now() });
    setCookieFn(buildCookieString(GEO_COOKIE_NAME, payload, CFG.geoCookieMaxAgeSec, '.youtube.com'));
    return fallbackLang;
}
