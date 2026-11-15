import { DEFAULT_SETTINGS } from './config.js';

export function getVideoId(url) {
    const raw = String(url || (typeof location !== 'undefined' ? location.href : ''));
    return (
        raw.match(/[?&]v=([^&#]{11})/)?.[1] ||
        raw.match(/\/(?:shorts|embed)\/([^?&#/]{11})/)?.[1] ||
        raw.match(/youtu\.be\/([^?&#/]{11})/)?.[1] ||
        null
    );
}

export function isShortsUrl(hrefOrPath = '') {
    const raw = String(hrefOrPath || (typeof location !== 'undefined' ? location.pathname : ''));
    return /(?:^|\/)shorts(?:\/|$|\?)/.test(raw);
}

export function selectActivePlayer(doc, hrefOrPath = '', expectedVideoId = '') {
    if (!doc) return null;
    const onShorts = isShortsUrl(hrefOrPath);
    const candidates = onShorts
        ? [
              doc.querySelector?.('ytd-reel-video-renderer[is-active] #shorts-player'),
              doc.getElementById?.('shorts-player'),
              doc.querySelector?.('ytd-reel-video-renderer[is-active] .html5-video-player'),
              doc.getElementById?.('movie_player'),
              doc.querySelector?.('.html5-video-player')
          ]
        : [
              doc.getElementById?.('movie_player'),
              doc.getElementById?.('shorts-player'),
              doc.querySelector?.('.html5-video-player')
          ];

    const unique = candidates.filter((p, i) => p && p.isConnected !== false && candidates.indexOf(p) === i);
    if (expectedVideoId) {
        const matched = unique.find(p => p.getVideoData?.()?.video_id === expectedVideoId);
        if (matched) return matched;
    }
    if (onShorts) {
        const shortsPreferred = unique.find(p => p.id === 'shorts-player' || p.getVideoData?.()?.video_id);
        if (shortsPreferred) return shortsPreferred;
    }
    return unique[0] || null;
}

const UNDETERMINED_LANG_CODES = new Set(['und', 'zxx', 'mul', 'mis', 'default', 'root', 'unknown']);

export function isUndeterminedLang(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!clean) return true;
    const base = clean.split('-')[0];
    return !base || UNDETERMINED_LANG_CODES.has(base);
}

export function normalizeBaseLang(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!clean) return '';
    return clean.split('-')[0];
}

function decodeBase64Latin1(b64Url) {
    const norm = String(b64Url || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (norm.length % 4)) % 4;
    const padded = norm + '='.repeat(padLen);
    if (typeof atob === 'function') {
        try {
            return atob(padded);
        } catch {
            return '';
        }
    }
    if (typeof Buffer !== 'undefined') {
        try {
            return Buffer.from(padded, 'base64').toString('latin1');
        } catch {
            return '';
        }
    }
    return '';
}

function parseProtoAudioPayload(trackId) {
    const raw = String(trackId || '').trim();
    const semiIdx = raw.indexOf(';');
    if (semiIdx === -1) return '';
    return decodeBase64Latin1(raw.slice(semiIdx + 1));
}

export function isDubbedAutoAudioTrackId(trackId) {
    const decoded = parseProtoAudioPayload(trackId);
    return decoded.includes('dubbed-auto');
}

export function extractLangFromAudioTrackId(trackId) {
    const raw = String(trackId || '').trim();
    if (!raw) return '';
    if (raw.includes(';')) {
        const decoded = parseProtoAudioPayload(raw);
        if (!decoded) return '';
        const match = decoded.match(/lang[\x01-\x20]{1,2}([a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*)/);
        if (!match) return '';
        const base = normalizeBaseLang(match[1]);
        return isUndeterminedLang(base) ? '' : base;
    }
    const beforeDot = raw.split('.')[0].replace(/_/g, '-');
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(beforeDot)) return '';
    const base = normalizeBaseLang(beforeDot);
    return isUndeterminedLang(base) ? '' : base;
}

export function readCookie(cookieStr, name) {
    const src = String(cookieStr || '');
    const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = src.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
    if (!m) return '';
    try {
        return decodeURIComponent(m[1]);
    } catch {
        return m[1];
    }
}

export function buildCookieString(name, value, maxAgeSec, domain) {
    const parts = [
        `${name}=${encodeURIComponent(String(value ?? ''))}`,
        'Path=/',
        `Max-Age=${Number(maxAgeSec) || 604800}`,
        'SameSite=Lax'
    ];
    if (domain) parts.push(`Domain=${domain}`);
    return parts.join('; ');
}

export function gmRequest(url, opts = {}) {
    const method = opts.method || 'GET';
    const timeout = Number(opts.timeout) || 10000;
    const headers = opts.headers || { Accept: 'application/json' };
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                timeout,
                anonymous: Boolean(opts.anonymous),
                onload(res) {
                    resolve({ status: res.status, text: res.responseText || '' });
                },
                onerror(err) {
                    reject(new Error(err?.error || 'GM_xmlhttpRequest error'));
                },
                ontimeout() {
                    reject(new Error('GM_xmlhttpRequest timeout'));
                }
            });
        });
    }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    return fetch(url, {
        method,
        headers,
        credentials: opts.anonymous ? 'omit' : 'include',
        signal: ctrl?.signal
    })
        .then(async r => ({ status: r.status, text: await r.text() }))
        .finally(() => {
            if (timer) clearTimeout(timer);
        });
}

export function readBridgeSettings(doc = typeof document !== 'undefined' ? document : null) {
    try {
        const raw = doc?.documentElement?.dataset?.supratubeSettings;
        if (raw) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
    } catch {
        // Fallback to defaults if dataset JSON is malformed.
    }
    return { ...DEFAULT_SETTINGS };
}

export function subscribeSettings(win, doc, onChange) {
    if (!win || typeof win.addEventListener !== 'function') return () => {};
    const handler = ev => {
        const next = ev?.detail && typeof ev.detail === 'object'
            ? { ...DEFAULT_SETTINGS, ...ev.detail }
            : readBridgeSettings(doc);
        onChange(next);
    };
    win.addEventListener('supratube-settings-updated', handler);
    return () => win.removeEventListener('supratube-settings-updated', handler);
}
