(() => {
'use strict';
if (window.__supratubeEjecutado && !window.__supratubeForceReinit) return;
if (typeof window.__supratubeTeardown === 'function') {
    try { window.__supratubeTeardown(); } catch {}
}
window.__supratubeForceReinit = false;
window.__supratubeEjecutado = true;

// --- config.js ---
const CFG = Object.freeze({
    version: '1.0.10',
    sbApi: 'https://sponsor.ajay.app/api/skipSegments',
    sbCacheTTL: 5 * 60 * 1000,
    geoRefreshMs: 24 * 60 * 60 * 1000,
    geoCookieMaxAgeSec: 7 * 24 * 60 * 60,
    targetHeight: 1080
});

const ORDEN_MODULOS = Object.freeze([
    'config.js',
    'utils.js',
    'adblock.js',
    'sponsorblock.js',
    'quality.js',
    'geo-lang.js',
    'subtitles.js',
    'ai-summary.js',
    'transcript-download.js',
    'main.js'
]);

const DEFAULT_SETTINGS = Object.freeze({
    adSkip: true,
    sponsorBlock: true,
    greenBar: true,
    auto1080p: true,
    autoSubtitles: true,
    aiSummary: true,
    transcriptDownload: true
});

const GEO_COOKIE_NAME = 'supratube_geo_lang';
const CC_AUTO_STORAGE_KEY = 'supratube_cc_auto';

const SPONSOR_CATEGORIES = Object.freeze([
    'sponsor',
    'selfpromo',
    'interaction',
    'intro',
    'outro',
    'preview',
    'music_offtopic',
    'filler',
    'exclusive_access'
]);

const SPONSOR_ACTION_TYPES = Object.freeze(['skip', 'mute']);

const SPONSOR_COLORS = Object.freeze({
    sponsor: '#00d400',
    selfpromo: '#22c55e',
    exclusive_access: '#16a34a',
    interaction: '#15803d',
    intro: '#4ade80',
    outro: '#22c55e',
    preview: '#4ade80',
    music_offtopic: '#16a34a',
    filler: '#22c55e'
});

const SKIP_SELECTORS = Object.freeze([
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    'button[class*="skip-ad"]',
    '[id*="skip-button"] button'
]);

const ENFORCEMENT_SELS = Object.freeze([
    'ytd-enforcement-message-view-model',
    'yt-playability-error-supported-renderers',
    '[id="enforcement-message"]',
    'yt-player-error-message-renderer'
]);

const AD_PRUNE_KEYS = Object.freeze([
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakHeartbeatParams',
    'adServingData',
    'adParams',
    'adSafetyReason',
    'adsState',
    'playerAdParams',
    'adBreakRenderer',
    'adBreakServiceRenderer'
]);

const AD_RENDERER_KEYS = Object.freeze([
    'adSlotRenderer',
    'displayAdRenderer',
    'promotedSparklesWebRenderer',
    'promotedSparklesTextSearchRenderer',
    'compactPromotedItemRenderer',
    'promotedVideoRenderer',
    'searchPyvRenderer',
    'adsEngagementPanelRenderer',
    'inFeedAdLayoutRenderer',
    'bannerPromoRenderer',
    'statementBannerRenderer',
    'brandVideoShelfRenderer',
    'brandVideoSingletonRenderer'
]);

const COUNTRY_TO_LANG = Object.freeze({
    AR: 'es', BO: 'es', CL: 'es', CO: 'es', CR: 'es', CU: 'es', DO: 'es',
    EC: 'es', ES: 'es', GQ: 'es', GT: 'es', HN: 'es', MX: 'es', NI: 'es',
    PA: 'es', PE: 'es', PR: 'es', PY: 'es', SV: 'es', UY: 'es', VE: 'es',
    BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt',
    US: 'en', GB: 'en', CA: 'en', AU: 'en', NZ: 'en', IE: 'en', ZA: 'en', IN: 'en', SG: 'en', PH: 'en',
    FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr',
    DE: 'de', AT: 'de',
    IT: 'it', SM: 'it',
    NL: 'nl',
    PL: 'pl',
    RU: 'ru', BY: 'ru', KZ: 'ru',
    UA: 'uk',
    JP: 'ja',
    KR: 'ko',
    CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh',
    TR: 'tr',
    SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', IQ: 'ar', JO: 'ar',
    ID: 'id',
    TH: 'th',
    VN: 'vi',
    SE: 'sv', NO: 'no', DK: 'da', FI: 'fi', CZ: 'cs', GR: 'el', RO: 'ro', HU: 'hu', IL: 'he'
});

// --- utils.js ---
function getVideoId(url) {
    const raw = String(url || (typeof location !== 'undefined' ? location.href : ''));
    return (
        raw.match(/[?&]v=([^&#]{11})/)?.[1] ||
        raw.match(/\/(?:shorts|embed)\/([^?&#/]{11})/)?.[1] ||
        raw.match(/youtu\.be\/([^?&#/]{11})/)?.[1] ||
        null
    );
}

function isShortsUrl(hrefOrPath = '') {
    const raw = String(hrefOrPath || (typeof location !== 'undefined' ? location.pathname : ''));
    return /(?:^|\/)shorts(?:\/|$|\?)/.test(raw);
}

function selectActivePlayer(doc, hrefOrPath = '', expectedVideoId = '') {
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

function isUndeterminedLang(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!clean) return true;
    const base = clean.split('-')[0];
    return !base || UNDETERMINED_LANG_CODES.has(base);
}

function normalizeBaseLang(code) {
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

function isDubbedAutoAudioTrackId(trackId) {
    const decoded = parseProtoAudioPayload(trackId);
    return decoded.includes('dubbed-auto');
}

function extractLangFromAudioTrackId(trackId) {
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

function readCookie(cookieStr, name) {
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

function buildCookieString(name, value, maxAgeSec, domain) {
    const parts = [
        `${name}=${encodeURIComponent(String(value ?? ''))}`,
        'Path=/',
        `Max-Age=${Number(maxAgeSec) || 604800}`,
        'SameSite=Lax'
    ];
    if (domain) parts.push(`Domain=${domain}`);
    return parts.join('; ');
}

function gmRequest(url, opts = {}) {
    const method = opts.method || 'GET';
    const timeout = Number(opts.timeout) || 10000;
    const headers = opts.headers || { Accept: 'application/json' };
    const payloadBody = opts.body ?? opts.data;
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                data: payloadBody,
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
        body: (method === 'GET' || method === 'HEAD') ? undefined : payloadBody,
        credentials: opts.anonymous ? 'omit' : 'include',
        signal: ctrl?.signal
    })
        .then(async r => ({ status: r.status, text: await r.text() }))
        .finally(() => {
            if (timer) clearTimeout(timer);
        });
}

function readBridgeSettings(doc = typeof document !== 'undefined' ? document : null) {
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

function subscribeSettings(win, doc, onChange) {
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

// --- adblock.js ---
const API_PRUNE_RE = /\/youtubei\/v1\/(player|next|get_watch|reel\/reel_item_watch|browse|search|guide)/;

function isAdItem(it) {
    if (!it || typeof it !== 'object') return false;
    for (let i = 0; i < AD_RENDERER_KEYS.length; i++) {
        if (AD_RENDERER_KEYS[i] in it) return true;
    }
    const wrap = it.richItemRenderer && it.richItemRenderer.content;
    if (wrap && typeof wrap === 'object') {
        for (let i = 0; i < AD_RENDERER_KEYS.length; i++) {
            if (AD_RENDERER_KEYS[i] in wrap) return true;
        }
    }
    return false;
}

function pruneAdObject(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 14) return;
    for (let i = 0; i < AD_PRUNE_KEYS.length; i++) {
        if (AD_PRUNE_KEYS[i] in obj) {
            try { delete obj[AD_PRUNE_KEYS[i]]; } catch {}
        }
    }
    try {
        const mr = obj.auxiliaryUi?.messageRenderers;
        if (mr) {
            delete mr.enforcementMessageViewModel;
            delete mr.upsellDialogRenderer;
        }
    } catch {}

    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (Array.isArray(val) && val.length) {
            for (let n = val.length - 1; n >= 0; n--) {
                if (isAdItem(val[n])) {
                    try { val.splice(n, 1); } catch {}
                }
            }
        }
    }
    for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
            pruneAdObject(val, depth + 1);
        }
    }
}

function injectNoAdContextBody(body) {
    try {
        if (typeof body !== 'string') return null;
        if (body.indexOf('"contentPlaybackContext"') === -1) return null;
        if (body.indexOf('isInlinePlaybackNoAd') !== -1) return null;
        return body.replace(
            /"contentPlaybackContext"\s*:\s*\{/,
            '"contentPlaybackContext":{"isInlinePlaybackNoAd":true,'
        );
    } catch {
        return null;
    }
}

let _layer0Installed = false;

function installLayer0AdPrune(win = typeof window !== 'undefined' ? window : null) {
    if (!win || _layer0Installed || win.__supratubeLayer0Pruned) return;
    _layer0Installed = true;
    win.__supratubeLayer0Pruned = true;

    try {
        const desc = Object.getOwnPropertyDescriptor(win, 'ytInitialPlayerResponse');
        if (!desc || desc.configurable !== false) {
            let _yipr = win.ytInitialPlayerResponse;
            if (_yipr && typeof _yipr === 'object') {
                try { pruneAdObject(_yipr, 0); } catch {}
            }
            Object.defineProperty(win, 'ytInitialPlayerResponse', {
                configurable: true,
                get() { return _yipr; },
                set(v) {
                    try { pruneAdObject(v, 0); } catch {}
                    _yipr = v;
                }
            });
        } else if (win.ytInitialPlayerResponse && typeof win.ytInitialPlayerResponse === 'object') {
            try { pruneAdObject(win.ytInitialPlayerResponse, 0); } catch {}
        }
    } catch {}

    try {
        const _assign = Object.assign;
        const patchedAssign = function () {
            const res = _assign.apply(this, arguments);
            try {
                if (res && typeof res === 'object') {
                    const cpc = res.contentPlaybackContext;
                    if (cpc && typeof cpc === 'object' && cpc.isInlinePlaybackNoAd !== true) {
                        cpc.isInlinePlaybackNoAd = true;
                    }
                }
            } catch {}
            return res;
        };
        try { Object.defineProperty(Object, 'assign', { value: patchedAssign, configurable: true, writable: true }); }
        catch { Object.assign = patchedAssign; }
    } catch {}

    try {
        const origFetch = win.fetch;
        if (typeof origFetch === 'function') {
            win.fetch = function (input, init) {
                let url = '';
                try { url = typeof input === 'string' ? input : (input?.url || ''); } catch {}
                try {
                    if (API_PRUNE_RE.test(url) && init && typeof init.body === 'string') {
                        const nb = injectNoAdContextBody(init.body);
                        if (nb) init = { ...init, body: nb };
                    }
                } catch {}
                const p = origFetch.call(this, input, init);
                if (!API_PRUNE_RE.test(url)) return p;
                return p.then(resp => {
                    try {
                        if (!resp || !resp.ok) return resp;
                        const ct = resp.headers?.get('content-type') || '';
                        if (!ct.includes('json')) return resp;
                        return resp.clone().text().then(txt => {
                            try {
                                const parsed = JSON.parse(txt);
                                pruneAdObject(parsed, 0);
                                const headers = new Headers(resp.headers);
                                headers.delete('content-length');
                                return new Response(JSON.stringify(parsed), {
                                    status: resp.status,
                                    statusText: resp.statusText,
                                    headers
                                });
                            } catch {
                                return resp;
                            }
                        }).catch(() => resp);
                    } catch {
                        return resp;
                    }
                });
            };
        }
    } catch {}

    try {
        const XHR = win.XMLHttpRequest;
        const proto = XHR?.prototype;
        if (proto && !proto.__supratubePruned) {
            proto.__supratubePruned = true;
            const origOpen = proto.open;
            const origSend = proto.send;
            proto.open = function (method, url) {
                this.__stUrl = String(url || '');
                return origOpen.apply(this, arguments);
            };
            proto.send = function (body) {
                let finalBody = body;
                try {
                    if (API_PRUNE_RE.test(this.__stUrl || '') && typeof body === 'string') {
                        const nb = injectNoAdContextBody(body);
                        if (nb) finalBody = nb;
                    }
                } catch {}
                if (API_PRUNE_RE.test(this.__stUrl || '')) {
                    this.addEventListener('readystatechange', () => {
                        if (this.readyState !== 4 || this.__stParsedDone) return;
                        try {
                            if (this.responseType === '' || this.responseType === 'text') {
                                const raw = this.responseText;
                                if (raw && raw[0] === '{') {
                                    const data = JSON.parse(raw);
                                    pruneAdObject(data, 0);
                                    const clean = JSON.stringify(data);
                                    Object.defineProperty(this, 'responseText', { value: clean, configurable: true });
                                    Object.defineProperty(this, 'response', { value: clean, configurable: true });
                                }
                            } else if (this.responseType === 'json' && this.response && typeof this.response === 'object') {
                                pruneAdObject(this.response, 0);
                            }
                        } catch {}
                        this.__stParsedDone = true;
                    });
                }
                return origSend.call(this, finalBody);
            };
        }
    } catch {}
}

let _adCssInjected = false;

function injectAdStyles(doc = typeof document !== 'undefined' ? document : null) {
    if (_adCssInjected || !doc || doc.getElementById?.('supratube-ad-css') || doc.documentElement?.dataset?.supratubeAdCss === '1') return;
    const css = `
        ytd-action-companion-ad-renderer, ytd-display-ad-renderer,
        ytd-video-masthead-ad-v3-renderer, ytd-overlay-ad-renderer,
        ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,
        ytd-search-pyv-renderer, ytd-ad-slot-renderer, yt-about-this-ad-renderer,
        .ytd-banner-promo-renderer, #masthead-ad, ytd-mealbar-promo-renderer,
        tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer),
        ytd-in-feed-ad-layout-renderer, ytd-statement-banner-renderer,
        ytd-brand-video-singleton-renderer, #player-ads, .ytd-ad-slot-renderer,
        ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
        ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
        .ytp-ce-element, .ytp-cards-teaser, .ytp-ad-overlay-container,
        .ytp-ad-overlay-slot
        { display: none !important; }

        .ytp-ad-text-overlay, .ytp-ad-timed-pie-countdown-container,
        .ytp-ad-image-overlay
        { visibility: hidden !important; opacity: 0 !important; }
    `;
    try {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            _adCssInjected = true;
            if (doc.documentElement?.dataset) doc.documentElement.dataset.supratubeAdCss = '1';
            return;
        }
    } catch {}
    const target = doc.head || doc.documentElement;
    if (!target) return;
    const style = doc.createElement('style');
    style.id = 'supratube-ad-css';
    style.textContent = css;
    target.appendChild(style);
    _adCssInjected = true;
    if (doc.documentElement?.dataset) doc.documentElement.dataset.supratubeAdCss = '1';
}

function isAdPlaying(player) {
    if (!player) return false;
    if (player.classList?.contains('ad-showing') || player.classList?.contains('ad-interrupting')) {
        return true;
    }
    return Boolean(
        player.querySelector?.('.ytp-ad-countdown') ||
        player.querySelector?.('.ytp-ad-simple-ad-badge') ||
        player.querySelector?.('.ytp-ad-persistent-progress-bar-container')
    );
}

function getSkipBtn(player) {
    if (!player?.querySelector) return null;
    for (let i = 0; i < SKIP_SELECTORS.length; i++) {
        const btn = player.querySelector(SKIP_SELECTORS[i]);
        if (btn && btn.offsetParent !== null) return btn;
    }
    return null;
}

function dismissEnforcement(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    if (doc) {
        for (let i = 0; i < ENFORCEMENT_SELS.length; i++) {
            const modal = doc.querySelector(ENFORCEMENT_SELS[i]);
            if (!modal) continue;
            const btn = modal.querySelector('yt-button-shape button, button');
            if (btn) {
                try { btn.click(); } catch {}
            } else {
                const backdrop = doc.querySelector('tp-yt-iron-overlay-backdrop');
                if (backdrop) try { backdrop.remove(); } catch {}
                const wrap = modal.closest?.('tp-yt-paper-dialog, ytd-popup-container');
                try { (wrap || modal).remove(); } catch {}
                try { doc.documentElement.style.overflow = ''; } catch {}
                try { if (doc.body) doc.body.style.overflow = ''; } catch {}
            }
        }
    }
    try {
        const popup = win?.yt?.config_?.openPopupConfig?.supportedPopups;
        if (popup?.adBlockMessageViewModel !== undefined) popup.adBlockMessageViewModel = false;
    } catch {}
    try {
        const d = win?.ytcfg?.data_?.PLAYER_VARS;
        if (d) d.ad3_module = '0';
    } catch {}
}

function trySkipAd({ enabled, player, video, state, doc, win }) {
    if (!enabled) return false;
    const btn = getSkipBtn(player);
    if (btn) {
        if (video && isFinite(video.duration) && video.duration > 0) {
            try { video.currentTime = video.duration - 0.1; } catch {}
        }
        try {
            if (typeof MouseEvent === 'function' && win) {
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
            }
            btn.click();
        } catch {}
        if (video) {
            video.playbackRate = 1;
            video.muted = false;
            if (state.adSpeedActive) video.volume = state.prevVolume;
        }
        state.adSpeedActive = false;
        return true;
    }

    const adActive = isAdPlaying(player);
    if (video && adActive && !state.adSpeedActive) {
        state.adSpeedActive = true;
        state.prevVolume = typeof video.volume === 'number' ? video.volume : 1;
        video.playbackRate = 16;
        video.muted = true;
    } else if (video && !adActive && state.adSpeedActive) {
        video.playbackRate = 1;
        video.muted = false;
        video.volume = state.prevVolume;
        state.adSpeedActive = false;
    }

    if (player?.querySelectorAll) {
        player.querySelectorAll('.ytp-ad-overlay-close-button, .ytp-ad-overlay-slot-close-button').forEach(b => {
            try { b.click(); } catch {}
        });
    }
    dismissEnforcement(doc, win);
    return adActive;
}

// --- sponsorblock.js ---
function parseSponsorSegments(rawText, videoId) {
    try {
        const data = JSON.parse(rawText);
        let segs = [];
        if (Array.isArray(data) && data[0]?.segments) {
            const match = data.find(d => d.videoID === videoId);
            segs = match?.segments || [];
        } else if (Array.isArray(data) && data[0]?.segment) {
            segs = data;
        }
        return segs
            .filter(s => Array.isArray(s?.segment) && s.segment.length >= 2 && s.segment[1] > s.segment[0])
            .map(s => ({
                start: Number(s.segment[0]),
                end: Number(s.segment[1]),
                cat: s.category || 'sponsor',
                actionType: s.actionType || 'skip',
                uuid: s.UUID || `${s.segment[0]}-${s.segment[1]}`
            }))
            .sort((a, b) => a.start - b.start);
    } catch {
        return [];
    }
}

function computeSegmentLayout(seg, duration) {
    const dur = Number(duration) || 0;
    if (!dur || dur <= 0) return null;
    const start = Math.max(0, Math.min(dur, Number(seg.start) || 0));
    const end = Math.max(start, Math.min(dur, Number(seg.end) || 0));
    if (end <= start) return null;
    return {
        leftPct: (start / dur) * 100,
        widthPct: ((end - start) / dur) * 100,
        color: SPONSOR_COLORS[seg.cat] || '#00d400'
    };
}

function findSegmentToActOn(segments, currentTime, state) {
    if (!Array.isArray(segments) || !segments.length) return null;
    let activeSkipMatch = null;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.actionType === 'skip' && currentTime >= seg.start && currentTime < seg.end - 0.15) {
            activeSkipMatch = seg;
            break;
        }
    }
    if (!activeSkipMatch) {
        state.lastSkippedUuid = null;
        return null;
    }
    if (state.lastSkippedUuid === activeSkipMatch.uuid) {
        return null;
    }
    return activeSkipMatch;
}

async function sha256Prefix(str) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
    } catch {
        return null;
    }
}

async function fetchSponsorSegments(videoId, cacheMap = new Map()) {
    if (!videoId) return [];
    const cached = cacheMap.get(videoId);
    if (cached && Date.now() - cached.ts < CFG.sbCacheTTL) {
        return cached.segs;
    }

    const cats = `categories=${encodeURIComponent(JSON.stringify(SPONSOR_CATEGORIES))}`;
    const acts = `actionTypes=${encodeURIComponent(JSON.stringify(SPONSOR_ACTION_TYPES))}`;
    const prefix = await sha256Prefix(videoId);
    const urls = prefix
        ? [`${CFG.sbApi}/${prefix}?${cats}&${acts}`, `${CFG.sbApi}?videoID=${encodeURIComponent(videoId)}&${cats}&${acts}`]
        : [`${CFG.sbApi}?videoID=${encodeURIComponent(videoId)}&${cats}&${acts}`];

    for (let i = 0; i < urls.length; i++) {
        try {
            const res = await gmRequest(urls[i], { anonymous: true, timeout: 8000 });
            if (res.status === 200) {
                const segs = parseSponsorSegments(res.text, videoId);
                cacheMap.set(videoId, { ts: Date.now(), segs });
                return segs;
            }
            if (res.status === 404) {
                cacheMap.set(videoId, { ts: Date.now(), segs: [] });
                return [];
            }
        } catch {}
    }
    return [];
}

let _sbBarCssInjected = false;

function injectSponsorBarStyles(doc = typeof document !== 'undefined' ? document : null) {
    if (_sbBarCssInjected || !doc || doc.getElementById?.('supratube-sb-css') || doc.documentElement?.dataset?.supratubeSbCss === '1') return;
    const css = `
        #supratube-sb-track {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            list-style: none;
            overflow: visible;
            pointer-events: none;
            z-index: 42;
            transform: scaleY(0.6);
            transform-origin: center;
            transition: transform 0.1s cubic-bezier(0, 0, 0.2, 1);
        }
        .ytp-big-mode #supratube-sb-track {
            transform: scaleY(0.625);
        }
        .ytp-delhi-modern #supratube-sb-track {
            transform: scaleY(0.667);
        }
        .ytp-progress-bar:hover #supratube-sb-track,
        .ytp-progress-bar-container:hover #supratube-sb-track,
        .ytp-drag #supratube-sb-track {
            transform: scaleY(1);
        }
        .progress-bar-line #supratube-sb-track,
        .advancement-bar-line #supratube-sb-track {
            transform: none;
        }
        .supratube-sb-segment {
            position: absolute;
            top: 0;
            bottom: 0;
            height: 100%;
            min-width: 1px;
            opacity: 0.85;
            pointer-events: none;
        }
    `;
    try {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            _sbBarCssInjected = true;
            if (doc.documentElement?.dataset) doc.documentElement.dataset.supratubeSbCss = '1';
            return;
        }
    } catch {}
    const target = doc.head || doc.documentElement;
    if (!target) return;
    const style = doc.createElement('style');
    style.id = 'supratube-sb-css';
    style.textContent = css;
    target.appendChild(style);
    _sbBarCssInjected = true;
    if (doc.documentElement?.dataset) doc.documentElement.dataset.supratubeSbCss = '1';
}

function renderGreenProgressBar(segments, duration, doc = typeof document !== 'undefined' ? document : null, enabled = true) {
    if (!doc) return;
    const existing = doc.getElementById('supratube-sb-track');
    if (!enabled || !duration || duration <= 0 || !Array.isArray(segments) || !segments.length) {
        if (existing) existing.remove();
        return;
    }

    injectSponsorBarStyles(doc);
    const bar =
        doc.querySelector('#movie_player .ytp-progress-bar') ||
        doc.querySelector('.ytp-progress-bar') ||
        doc.querySelector('.progress-bar-line') ||
        doc.querySelector('.advancement-bar-line');
    if (!bar) return;

    const track = existing || doc.createElement('ul');
    track.id = 'supratube-sb-track';
    track.setAttribute('aria-hidden', 'true');
    if (track.parentElement !== bar) {
        try {
            const pos = typeof getComputedStyle === 'function' ? getComputedStyle(bar).position : '';
            if (pos === 'static') bar.style.position = 'relative';
        } catch {}
        bar.appendChild(track);
    }

    const frag = doc.createDocumentFragment();
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const layout = computeSegmentLayout(seg, duration);
        if (!layout) continue;
        const li = doc.createElement('li');
        li.className = 'supratube-sb-segment';
        li.style.left = `${layout.leftPct}%`;
        li.style.width = `${layout.widthPct}%`;
        li.style.backgroundColor = layout.color;
        li.title = `${seg.cat} (${Math.round(seg.start)}s-${Math.round(seg.end)}s)`;
        frag.appendChild(li);
    }
    track.replaceChildren(frag);
}

function tickSponsorBlock({ video, segments, state, enabled }) {
    if (!enabled || !video || video.paused || !Array.isArray(segments) || !segments.length) return;
    const t = video.currentTime;

    const muteSeg = segments.find(s => s.actionType === 'mute' && t >= s.start && t < s.end - 0.1);
    if (muteSeg) {
        if (state.mutedSegUuid !== muteSeg.uuid) {
            state.mutedSegUuid = muteSeg.uuid;
            state.prevVolume = typeof video.volume === 'number' ? video.volume : 1;
            video.muted = true;
        }
    } else if (state.mutedSegUuid) {
        video.muted = false;
        video.volume = state.prevVolume;
        state.mutedSegUuid = null;
    }

    const skipSeg = findSegmentToActOn(segments, t, state);
    if (skipSeg) {
        state.lastSkippedUuid = skipSeg.uuid;
        video.currentTime = skipSeg.end;
    }
}

// --- quality.js ---
const FALLBACK_ORDER = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

function parseQualityHeight(label) {
    const m = String(label || '').match(/(\d{3,4})\s*p/i);
    if (m) return parseInt(m[1], 10);
    const digits = String(label || '').replace(/^\D+/, '').slice(0, 4);
    const n = parseInt(digits, 10);
    return isFinite(n) ? n : 0;
}

function scoreFormatCandidate(item) {
    if (!item || item.isPlayable === false) return -1;
    const height = parseQualityHeight(item.qualityLabel) || (item.quality === 'hd1080' ? 1080 : 0);
    if (height > 1080) return -1;
    const label = String(item.qualityLabel || '').toLowerCase();
    const is1080 = height === 1080 || item.quality === 'hd1080';
    const is60 = /60|50/.test(label);
    const isPremium = Boolean(item.paygatedQualityDetails) || label.includes('premium');
    let score = height * 100;
    if (is1080) score += 100000;
    if (isPremium) score += 1000;
    if (is60) score += 200;
    return score;
}

function selectBest1080pFormat(qualityData) {
    if (!Array.isArray(qualityData) || !qualityData.length) return null;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < qualityData.length; i++) {
        const candidate = qualityData[i];
        const score = scoreFormatCandidate(candidate);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}

function selectFallbackQualityLevel(levels) {
    if (!Array.isArray(levels) || !levels.length) return null;
    for (let i = 0; i < FALLBACK_ORDER.length; i++) {
        if (levels.includes(FALLBACK_ORDER[i])) return FALLBACK_ORDER[i];
    }
    const valid = levels.find(l => l && l !== 'auto');
    return valid || null;
}

function apply1080pQuality(player, state, enabled = true) {
    if (!enabled || !player || state?.manualOverride) return false;
    try {
        if (typeof player.getAvailableQualityData === 'function') {
            const data = player.getAvailableQualityData();
            const best = selectBest1080pFormat(data);
            if (best) {
                const key = `${best.quality}:${best.formatId || ''}`;
                if (state.lastFormatId === key) return false;
                if (best.formatId && typeof player.setPlaybackQualityRange === 'function') {
                    player.setPlaybackQualityRange(best.quality, best.quality, best.formatId);
                } else if (typeof player.setPlaybackQualityRange === 'function') {
                    player.setPlaybackQualityRange(best.quality, best.quality);
                }
                if (typeof player.setPlaybackQuality === 'function') {
                    player.setPlaybackQuality(best.quality);
                }
                state.lastFormatId = key;
                return true;
            }
        }

        if (typeof player.getAvailableQualityLevels === 'function') {
            const level = selectFallbackQualityLevel(player.getAvailableQualityLevels());
            if (!level || state.lastFormatId === level) return false;
            if (typeof player.setPlaybackQualityRange === 'function') {
                player.setPlaybackQualityRange(level, level);
            }
            if (typeof player.setPlaybackQuality === 'function') {
                player.setPlaybackQuality(level);
            }
            state.lastFormatId = level;
            return true;
        }
    } catch {}
    return false;
}

// --- geo-lang.js ---
const GEO_PROVIDERS = [
    { name: 'ipapi', url: 'https://ipapi.co/json/' },
    { name: 'freeipapi', url: 'https://freeipapi.com/api/json' },
    { name: 'ipwho', url: 'https://ipwho.is/' },
    { name: 'countryis', url: 'https://api.country.is/' }
];

function countryToLang(cc) {
    const code = String(cc || '').trim().toUpperCase();
    return COUNTRY_TO_LANG[code] || '';
}

function serializeGeoCookie(record) {
    return JSON.stringify({
        lang: normalizeBaseLang(record?.lang || ''),
        cc: String(record?.cc || '').toUpperCase(),
        ip: String(record?.ip || ''),
        ts: Number(record?.ts) || Date.now()
    });
}

function parseGeoCookie(cookieStr) {
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

function extractLangFromGeoPayload(providerName, data) {
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

async function resolveUserNativeLang(deps = {}) {
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

// --- subtitles.js ---
function readTrackText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (field.simpleText) return field.simpleText;
    if (Array.isArray(field.runs)) return field.runs.map(r => r.text || '').join('');
    return '';
}

const TRACK_NAME_LANG_PATTERNS = Object.freeze([
    [/^(?:espa[ñn]ol|spanish)(?:\s*\(|\s|$)/i, 'es'],
    [/^(?:ingl[eé]s|english)(?:\s*\(|\s|$)/i, 'en'],
    [/^(?:portugu[eê]s|portuguese)(?:\s*\(|\s|$)/i, 'pt'],
    [/^(?:franc[eé]s|french)(?:\s*\(|\s|$)/i, 'fr'],
    [/^(?:alem[aá]n|german)(?:\s*\(|\s|$)/i, 'de'],
    [/^(?:italiano|italian)(?:\s*\(|\s|$)/i, 'it'],
    [/^(?:japon[eé]s|japanese)(?:\s*\(|\s|$)/i, 'ja'],
    [/^(?:coreano|korean)(?:\s*\(|\s|$)/i, 'ko']
]);

function detectLangFromTrackDisplayName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    for (let i = 0; i < TRACK_NAME_LANG_PATTERNS.length; i++) {
        if (TRACK_NAME_LANG_PATTERNS[i][0].test(raw)) {
            return TRACK_NAME_LANG_PATTERNS[i][1];
        }
    }
    return '';
}

function getTrackLanguageInfoSafe(track) {
    if (!track || typeof track !== 'object') return null;
    if (typeof track.getLanguageInfo === 'function') {
        try {
            return track.getLanguageInfo() || null;
        } catch {
            return track.Vb || null;
        }
    }
    return track.Vb || null;
}

function readTrackNameString(track, langInfo) {
    return (
        (typeof langInfo?.getName === 'function' ? langInfo.getName() : '') ||
        langInfo?.name ||
        (typeof track.getName === 'function' ? track.getName() : '') ||
        readTrackText(track.name || track.displayName)
    );
}

function isDefaultAudioTrack(track) {
    if (!track || typeof track !== 'object') return false;
    if (track.isDefault === true) return true;
    if (typeof track.getIsDefault === 'function' && track.getIsDefault() === true) return true;
    const langInfo = getTrackLanguageInfoSafe(track);
    if (langInfo?.isDefault === true) return true;
    if (typeof langInfo?.getIsDefault === 'function' && langInfo.getIsDefault() === true) return true;
    return track.Vb?.isDefault === true;
}

function extractSingleAudioTrackLang(track) {
    if (!track) return '';
    const langInfo = getTrackLanguageInfoSafe(track);
    const langInfoId = (typeof langInfo?.getId === 'function' ? langInfo.getId() : '') || langInfo?.id || '';
    const vbId = (typeof track.Vb?.getId === 'function' ? track.Vb.getId() : '') || track.Vb?.id || '';
    const directId = (typeof track.getId === 'function' ? track.getId() : '') || track.id || track.audioTrackId || '';
    const directCode = normalizeBaseLang(track.languageCode);
    return (
        extractLangFromAudioTrackId(langInfoId) ||
        extractLangFromAudioTrackId(vbId) ||
        extractLangFromAudioTrackId(directId) ||
        (!isUndeterminedLang(directCode) ? directCode : '') ||
        extractLangFromAudioTrackId(track.captions?.id) ||
        detectLangFromTrackDisplayName(readTrackNameString(track, langInfo))
    );
}

function isAutoDubbedTrack(track) {
    if (!track) return false;
    if (track.isAutoDubbed === true) return true;
    if (typeof track.isAutoDubbed === 'function' && track.isAutoDubbed() === true) return true;
    if (typeof track.getIsAutoDubbed === 'function' && track.getIsAutoDubbed() === true) return true;
    const langInfo = getTrackLanguageInfoSafe(track);
    if (langInfo?.isAutoDubbed === true) return true;
    if (typeof langInfo?.getIsAutoDubbed === 'function' && langInfo.getIsAutoDubbed() === true) return true;
    return isDubbedAutoAudioTrackId(track.id || track.audioTrackId);
}

function detectVideoAudioLang({ activeAudioTrack, availableAudioTracks, adaptiveFormats, captionTracks, playerResponse }) {
    // Active audio track represents what the viewer actually hears (including AI auto-dubbed tracks like Español US).
    const activeLang = extractSingleAudioTrackLang(activeAudioTrack);
    if (activeLang) {
        return activeLang;
    }

    if (Array.isArray(availableAudioTracks)) {
        const defaultTrack = availableAudioTracks.find(t => isDefaultAudioTrack(t) && extractSingleAudioTrackLang(t));
        if (defaultTrack) return extractSingleAudioTrackLang(defaultTrack);

        const originalTrack = availableAudioTracks.find(t => !isAutoDubbedTrack(t) && extractSingleAudioTrackLang(t));
        if (originalTrack) return extractSingleAudioTrackLang(originalTrack);

        const anyTrack = availableAudioTracks.find(t => extractSingleAudioTrackLang(t));
        if (anyTrack) return extractSingleAudioTrackLang(anyTrack);
    }

    if (Array.isArray(adaptiveFormats)) {
        const defFmt = adaptiveFormats.find(
            f => f?.audioTrack?.audioIsDefault && extractLangFromAudioTrackId(f?.audioTrack?.id)
        );
        const defLang = extractLangFromAudioTrackId(defFmt?.audioTrack?.id);
        if (defLang) return defLang;

        const origFmt = adaptiveFormats.find(
            f => f?.audioTrack?.id && !isDubbedAutoAudioTrackId(f.audioTrack.id) && extractLangFromAudioTrackId(f.audioTrack.id)
        );
        const origLang = extractLangFromAudioTrackId(origFmt?.audioTrack?.id);
        if (origLang) return origLang;
    }

    if (Array.isArray(captionTracks)) {
        const asrTrack = captionTracks.find(
            t => t && (t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.')) && !isUndeterminedLang(t.languageCode)
        );
        if (asrTrack?.languageCode) {
            return normalizeBaseLang(asrTrack.languageCode);
        }
    }

    const microLang =
        playerResponse?.videoDetails?.defaultAudioLanguage ||
        playerResponse?.microformat?.playerMicroformatRenderer?.defaultAudioLanguage;
    if (microLang && !isUndeterminedLang(microLang)) return normalizeBaseLang(microLang);

    if (Array.isArray(captionTracks) && captionTracks.length === 1 && !isUndeterminedLang(captionTracks[0]?.languageCode)) {
        return normalizeBaseLang(captionTracks[0].languageCode);
    }

    return activeLang || '';
}

function findBestNativeCaptionTrack(tracks, userLang) {
    const base = normalizeBaseLang(userLang);
    if (!base || !Array.isArray(tracks) || !tracks.length) return null;
    const matching = tracks.filter(t => t && normalizeBaseLang(t.languageCode) === base);
    if (!matching.length) return null;

    const scored = matching.map(t => {
        const isAsr = t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.');
        const code = String(t.languageCode || '').toLowerCase();
        let score = isAsr ? 10 : 50;
        if (code === base) score += 15;
        if (code === `${base}-419` || code === `${base}-mx` || code === `${base}-es`) score += 10;
        return { track: t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].track;
}

function findTranslationSourceTrack(tracks) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const translatable = tracks.filter(t => t && t.isTranslatable !== false && t.is_translateable !== false);
    const pool = translatable.length ? translatable : tracks.filter(Boolean);
    if (!pool.length) return null;

    const manualEn = pool.find(t => normalizeBaseLang(t.languageCode) === 'en' && t.kind !== 'asr');
    if (manualEn) return manualEn;
    const asrEn = pool.find(t => normalizeBaseLang(t.languageCode) === 'en');
    if (asrEn) return asrEn;
    const anyAsr = pool.find(t => t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.'));
    return anyAsr || pool[0];
}

function findTranslationTarget(translationLanguages, userLang) {
    const base = normalizeBaseLang(userLang);
    if (!base || !Array.isArray(translationLanguages)) return null;
    const exact = translationLanguages.find(l => normalizeBaseLang(l.languageCode) === base);
    if (!exact) return null;
    return {
        languageCode: exact.languageCode,
        languageName: readTrackText(exact.languageName) || exact.languageCode
    };
}

/** Match a track entry from player.getOption('captions', 'tracklist') to preserve full YouTube metadata. */
function findMatchingTracklistItem(tracklist, targetTrack) {
    if (!Array.isArray(tracklist) || !targetTrack) return null;
    const wantVss = targetTrack.vss_id || targetTrack.vssId || '';
    const wantBase = normalizeBaseLang(targetTrack.languageCode);
    const wantKind = targetTrack.kind || '';
    return (
        tracklist.find(t => wantVss && (t.vss_id || t.vssId) === wantVss) ||
        tracklist.find(t => normalizeBaseLang(t.languageCode) === wantBase && (t.kind || '') === wantKind) ||
        tracklist.find(t => normalizeBaseLang(t.languageCode) === wantBase) ||
        null
    );
}

/** Build the track object passed to player.setOption('captions', 'track', ...), keeping native fields. */
function buildPlayerTrackArg(track, translationTarget = null, nativeTrack = null) {
    const base = (nativeTrack && typeof nativeTrack === 'object') ? { ...nativeTrack } : {};
    const obj = {
        ...base,
        languageCode: track.languageCode || base.languageCode,
        languageName: readTrackText(track.name || track.languageName || base.languageName) || track.languageCode,
        kind: track.kind ?? base.kind ?? '',
        displayName: readTrackText(track.displayName || track.name || base.displayName) || track.languageCode,
        is_translateable: base.is_translateable ?? track.is_translateable ?? track.isTranslatable ?? true,
        vss_id: base.vss_id || track.vss_id || track.vssId || ''
    };
    if (translationTarget) {
        obj.translationLanguage = {
            languageCode: translationTarget.languageCode,
            languageName: translationTarget.languageName
        };
    } else {
        delete obj.translationLanguage;
    }
    return obj;
}

function chooseSubtitleAction({
    videoLang,
    userLang,
    captionTracks,
    translationLanguages,
    captionsCurrentlyOn,
    autoActivatedByScript
}) {
    const baseVideo = normalizeBaseLang(videoLang);
    const baseUser = normalizeBaseLang(userLang);
    if (!baseUser) return { action: 'noop' };

    if (baseVideo && baseVideo === baseUser) {
        if (autoActivatedByScript && captionsCurrentlyOn) {
            return { action: 'disable' };
        }
        return { action: 'noop' };
    }

    if (!baseVideo && !Array.isArray(captionTracks)) {
        return { action: 'noop' };
    }

    const nativeTrack = findBestNativeCaptionTrack(captionTracks, baseUser);
    if (nativeTrack) {
        return { action: 'select_native', track: nativeTrack };
    }

    const sourceTrack = findTranslationSourceTrack(captionTracks);
    const translationTarget = findTranslationTarget(translationLanguages, baseUser);
    if (sourceTrack && translationTarget) {
        return { action: 'translate', sourceTrack, translationTarget };
    }

    return { action: 'noop' };
}

function getStorageSafe(explicitStorage) {
    if (explicitStorage) return explicitStorage;
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    } catch {
        return null;
    }
}

function isMatchingActiveTrack(activeTrack, decision) {
    if (!activeTrack?.languageCode) return false;
    if (decision.action === 'select_native') {
        return (
            normalizeBaseLang(activeTrack.languageCode) === normalizeBaseLang(decision.track.languageCode) &&
            !activeTrack.translationLanguage?.languageCode
        );
    }
    if (decision.action === 'translate') {
        return (
            normalizeBaseLang(activeTrack.languageCode) === normalizeBaseLang(decision.sourceTrack.languageCode) &&
            normalizeBaseLang(activeTrack.translationLanguage?.languageCode) === normalizeBaseLang(decision.translationTarget.languageCode)
        );
    }
    return false;
}

const TIMEDTEXT_URL_RE = /\/api\/timedtext\b/;
const FALLBACK_BOX_ID = 'supratube-fallback-captions';
const MODULE_FALLBACK_HOLDER = {};
const MODULE_TT_HOLDER = {};

/** Encode byte array to standard base64 across browser and Node runtimes. */
function encodeBase64Bytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(bytes).toString('base64');
}

/** Return or initialize per-window timedtext capture and block state. */
function getTtState(win) {
    const host = win || MODULE_TT_HOLDER;
    if (!host.__supratubeTtState) {
        host.__supratubeTtState = {
            originCuesByVid: new Map(),
            healthyLangByVid: new Map(),
            failedByVid: new Map(),
            directBlockedByVid: new Set(),
            rawUrlsByVid: new Map(),
            onFailureCallbacks: new Map()
        };
    }
    return host.__supratubeTtState;
}

function getFallbackCtrl(win) {
    const host = win || MODULE_FALLBACK_HOLDER;
    if (!host.__supratubeFallbackCtrl) {
        host.__supratubeFallbackCtrl = {
            activeVid: null,
            inflightVid: null,
            forceOverlay: false,
            whisperVid: null,
            whisperManualForce: false,
            manualForcePendingVid: null,
            manualOverlayActive: false,
            hasReceivedWhisperCaption: false,
            lastWhisperPct: 0,
            lastIaDomClickTs: 0,
            showWhisperLine: null,
            stopWhisper: null,
            ccUi: null,
            sameLangVideos: new Set(),
            stopLoop: null,
            watchdogTimer: null,
            cache: new Map()
        };
    }
    return host.__supratubeFallbackCtrl;
}

/** Return true while fallback or live Whisper captions are actively driving subtitles for videoId. */
function isFallbackCaptionsActive(win = typeof window !== 'undefined' ? window : null, videoId = '') {
    const ctrl = getFallbackCtrl(win);
    if (!videoId) return Boolean(ctrl.activeVid || ctrl.whisperVid);
    return ctrl.activeVid === videoId || ctrl.whisperVid === videoId;
}

function setBoundedCache(map, key, value, limit = 20) {
    if (map.has(key)) map.delete(key);
    while (map.size >= limit) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, value);
}

/** Decode numeric and standard HTML entities across one or more escape passes. */
function decodeHtmlEntities(str, passes = 1) {
    let out = String(str ?? '');
    const limit = Math.max(1, Number(passes) || 1);
    for (let pass = 0; pass < limit; pass++) {
        if (!out.includes('&')) break;
        out = out.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (m, dec, hex, named) => {
            if (dec !== undefined) {
                const code = parseInt(dec, 10);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            if (hex !== undefined) {
                const code = parseInt(hex, 16);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[named.toLowerCase()] || m;
        });
    }
    return out;
}

/** Parse YouTube json3 timedtext payload into sorted second-based cue objects. */
function parseJson3Cues(dataOrText) {
    let data = dataOrText;
    if (typeof dataOrText === 'string') {
        const trimmed = dataOrText.trim();
        if (!trimmed || trimmed[0] !== '{') return [];
        try {
            data = JSON.parse(trimmed);
        } catch {
            return [];
        }
    }
    if (!data || !Array.isArray(data.events)) return [];
    const out = [];
    for (let i = 0; i < data.events.length; i++) {
        const ev = data.events[i];
        if (!Array.isArray(ev?.segs) || !ev.segs.length) continue;
        const text = ev.segs.map(s => s?.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const start = (Number(ev.tStartMs) || 0) / 1000;
        const dur = (Number(ev.dDurationMs) || 0) / 1000;
        out.push({ start, end: dur > 0 ? start + dur : start + 4, text });
    }
    return out;
}

function parseVttClockSeconds(rawClock) {
    const clean = String(rawClock || '').trim().replace(',', '.');
    const parts = clean.split(':').map(Number);
    if (!parts.length || parts.some(n => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

function parseVttCues(rawVtt) {
    const raw = String(rawVtt || '').replace(/\r\n?/g, '\n');
    const parsedCues = [];
    for (const block of raw.split(/\n\n+/)) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        if (/^(?:WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
        const timeIdx = lines.findIndex(l => l.includes('-->'));
        if (timeIdx < 0) continue;
        const arrowParts = lines[timeIdx].split('-->');
        if (arrowParts.length < 2) continue;
        const start = parseVttClockSeconds(arrowParts[0]);
        const end = parseVttClockSeconds(arrowParts[1].trim().split(/\s+/)[0]);
        const dur = Math.max(0, end - start);
        const textLines = lines
            .slice(timeIdx + 1)
            .map(l => decodeHtmlEntities(l.replace(/<[^>]*>/g, ''), 2).replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (textLines.length) {
            parsedCues.push({ start, end: end > start ? end : start + dur, dur, textLines });
        }
    }
    if (!parsedCues.length) return [];

    // YouTube ASR WebVTT uses two-line rolling overlap and <=50ms transition flushes.
    const isRollingYt = /<c(?:\.[^>]+)?>|<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(raw) ||
        /^Kind:\s*captions/im.test(raw) ||
        parsedCues.some(c => c.dur > 0 && c.dur <= 0.05);

    const out = [];
    if (!isRollingYt) {
        for (const c of parsedCues) {
            const text = c.textLines.join(' ').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            const prev = out[out.length - 1];
            if (prev && prev.text === text && Math.abs(c.start - prev.start) < 0.2) continue;
            out.push({ start: c.start, end: c.dur > 0 ? c.start + c.dur : c.start + 4, text });
        }
        return out;
    }

    let prevLine = '';
    let prevEnd = 0;
    for (const c of parsedCues) {
        const isTinyFlush = c.dur <= 0.05;
        const picked = [];
        for (const line of c.textLines) {
            const isCarry = line === prevLine && (c.textLines.length > 1 || isTinyFlush || Math.abs(c.start - prevEnd) < 0.25);
            if (isCarry) continue;
            const lastOut = out[out.length - 1];
            if (lastOut && lastOut.text === line && Math.abs(c.start - lastOut.start) < 1.5) continue;
            if (isTinyFlush && lastOut && lastOut.text.endsWith(line)) continue;
            picked.push(line);
        }
        prevLine = c.textLines[c.textLines.length - 1] || prevLine;
        prevEnd = c.end;
        const text = picked.join(' ').replace(/\s+/g, ' ').trim();
        if (text) out.push({ start: c.start, end: c.dur > 0.05 ? c.start + c.dur : c.start + 2.5, text });
    }
    return out;
}

/** Parse json3, XML timedtext (<p>/<text>), or WebVTT payloads into cue objects. */
function parseTimedtextResponseText(bodyText) {
    const trimmed = String(bodyText || '').trim();
    if (!trimmed) return [];
    if (trimmed[0] === '{') return parseJson3Cues(trimmed);
    if (trimmed.includes('WEBVTT') || trimmed.includes('-->')) {
        const vttCues = parseVttCues(trimmed);
        if (vttCues.length) return vttCues;
    }
    if (trimmed[0] !== '<') return [];
    const cues = [];
    for (const m of trimmed.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
        const tAttr = /\bt="([\d.]+)"/.exec(m[1])?.[1];
        const dAttr = /\bd="([\d.]+)"/.exec(m[1])?.[1];
        const sAttr = /\bstart="([\d.]+)"/.exec(m[1])?.[1];
        const durAttr = /\bdur="([\d.]+)"/.exec(m[1])?.[1];
        const t = tAttr !== undefined ? Number(tAttr) / 1000 : Number(sAttr || 0);
        const d = dAttr !== undefined ? Number(dAttr) / 1000 : Number(durAttr || 0);
        const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''), 2).replace(/\s+/g, ' ').trim();
        if (txt) cues.push({ start: t, end: d > 0 ? t + d : t + 4, text: txt });
    }
    if (!cues.length) {
        for (const m of trimmed.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
            const t = Number(/\bstart="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const d = Number(/\bdur="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''), 2).replace(/\s+/g, ' ').trim();
            if (txt) cues.push({ start: t, end: d > 0 ? t + d : t + 4, text: txt });
        }
    }
    return cues;
}

function recordTimedtextOutcome(win, rawUrl, status, bodyText) {
    let parsedUrl;
    try {
        parsedUrl = new URL(String(rawUrl), win?.location?.origin || 'https://www.youtube.com');
    } catch {
        return;
    }
    const vid = parsedUrl.searchParams.get('v');
    if (!vid) return;

    const lang = normalizeBaseLang(parsedUrl.searchParams.get('lang'));
    const tlang = normalizeBaseLang(parsedUrl.searchParams.get('tlang'));
    const st = getTtState(win);

    const cleanUrl = new URL(parsedUrl.toString());
    cleanUrl.searchParams.delete('tlang');
    cleanUrl.searchParams.set('fmt', 'json3');
    if (tlang || parsedUrl.searchParams.has('pot')) {
        st.rawUrlsByVid.set(vid, cleanUrl.toString());
    }

    const cues = (status >= 200 && status < 300) ? parseTimedtextResponseText(bodyText) : [];
    if (status >= 400 || cues.length === 0) {
        if (!tlang && (status >= 400 || !parsedUrl.searchParams.has('pot'))) {
            st.directBlockedByVid.add(vid);
        }
        st.failedByVid.set(vid, { status, hasTlang: Boolean(tlang), lang, ts: Date.now() });
        const cb = st.onFailureCallbacks.get(vid);
        if (typeof cb === 'function') {
            st.onFailureCallbacks.delete(vid);
            try { cb(vid); } catch {}
        }
        return;
    }

    if (!tlang) {
        st.originCuesByVid.set(vid, { lang, cues, ts: Date.now() });
    }
    st.healthyLangByVid.set(vid, tlang || lang);
}

/**
 * Intercept YouTube /api/timedtext fetch & XHR responses to detect HTTP 429 or empty bodies
 * immediately and preserve origin-language cues when only &tlang= fails.
 */
function installTimedtextMonitor(win = typeof window !== 'undefined' ? window : null) {
    if (!win || win.__supratubeTtMonitor) return;
    win.__supratubeTtMonitor = true;

    if (typeof win.fetch === 'function') {
        const origFetch = win.fetch;
        win.fetch = function (input, init) {
            let url = '';
            try { url = typeof input === 'string' ? input : (input?.url || ''); } catch {}
            const p = origFetch.apply(this, arguments);
            if (!TIMEDTEXT_URL_RE.test(url)) return p;
            return p.then(resp => {
                try {
                    const reader = resp?.clone ? resp.clone() : resp;
                    if (reader && typeof reader.text === 'function') {
                        Promise.resolve(reader.text())
                            .then(txt => recordTimedtextOutcome(win, url, resp.status || 0, txt))
                            .catch(() => recordTimedtextOutcome(win, url, resp?.status || 0, ''));
                    } else {
                        recordTimedtextOutcome(win, url, resp?.status || 0, '');
                    }
                } catch {}
                return resp;
            }).catch(err => {
                recordTimedtextOutcome(win, url, 0, '');
                throw err;
            });
        };
    }

    try {
        const proto = win.XMLHttpRequest?.prototype;
        if (proto && !proto.__supratubeTtHooked) {
            proto.__supratubeTtHooked = true;
            const origOpen = proto.open;
            const origSend = proto.send;
            proto.open = function (method, url) {
                this.__supratubeTtUrl = String(url || '');
                return origOpen.apply(this, arguments);
            };
            proto.send = function () {
                const reqUrl = this.__supratubeTtUrl || '';
                if (TIMEDTEXT_URL_RE.test(reqUrl) && typeof this.addEventListener === 'function') {
                    this.addEventListener('loadend', () => {
                        try {
                            let body = '';
                            if (this.responseType === '' || this.responseType === 'text') {
                                body = this.responseText || '';
                            } else if (this.response && typeof this.response === 'object') {
                                body = JSON.stringify(this.response);
                            } else if (typeof this.response === 'string') {
                                body = this.response;
                            }
                            recordTimedtextOutcome(win, reqUrl, this.status || 0, body);
                        } catch {}
                    }, { once: true });
                }
                return origSend.apply(this, arguments);
            };
        }
    } catch {}
}

/** Build the deterministic base64 protobuf params for YouTube PAmodern_transcript_view get_panel calls. */
function buildTranscriptPanelParams(videoId) {
    const vid = String(videoId || '').trim();
    if (!vid) return '';
    const enc = typeof TextEncoder === 'function'
        ? new TextEncoder().encode(vid)
        : Array.from(unescape(encodeURIComponent(vid)), c => c.charCodeAt(0));
    const inner = [0x0a, enc.length, ...enc, 0x18, 0x01];
    const outer = [0xaa, 0x09, inner.length, ...inner];
    return encodeBase64Bytes(outer);
}

/** Parse a player timestamp string ("0:03", "12:34", "1:02:03") into seconds. */
function parseTimestampSeconds(ts) {
    const clean = String(ts || '').trim();
    if (!/^\d+(?::\d{1,2}){1,2}$/.test(clean)) return null;
    const parts = clean.split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function findNestedStartSeconds(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.startTimeSeconds === 'number' && Number.isFinite(node.startTimeSeconds)) {
        return node.startTimeSeconds;
    }
    if (typeof node.startMs === 'string' || typeof node.startMs === 'number') {
        const ms = Number(node.startMs);
        if (Number.isFinite(ms)) return ms / 1000;
    }
    const vals = Array.isArray(node) ? node : Object.values(node);
    for (let i = 0; i < vals.length; i++) {
        if (vals[i] && typeof vals[i] === 'object') {
            const hit = findNestedStartSeconds(vals[i]);
            if (hit !== null) return hit;
        }
    }
    return null;
}

/** Extract timed subtitle segments from YouTube /youtubei/v1/get_panel (or legacy get_transcript) JSON. */
function parseTranscriptPanelResponse(data) {
    if (!data || typeof data !== 'object') return [];
    const raw = [];
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.timelineItemViewModel) {
            const item = node.timelineItemViewModel;
            const nestedSegs = [];
            const collectSegs = n => {
                if (!n || typeof n !== 'object') return;
                if (n.transcriptSegmentViewModel) {
                    nestedSegs.push(n.transcriptSegmentViewModel);
                    return;
                }
                const ch = Array.isArray(n) ? n : Object.values(n);
                for (let i = 0; i < ch.length; i++) collectSegs(ch[i]);
            };
            collectSegs(item.contentItems || item);
            const text = nestedSegs.map(s => s?.simpleText || '').join(' ').replace(/\s+/g, ' ').trim();
            const tsSec = findNestedStartSeconds(item) ?? parseTimestampSeconds(nestedSegs[0]?.timestamp ?? item.timestamp);
            if (text && tsSec !== null) {
                raw.push({ start: tsSec, end: null, text });
            }
            return;
        }
        if (node.transcriptSegmentViewModel) {
            const vm = node.transcriptSegmentViewModel;
            const text = String(vm.simpleText || '').replace(/\s+/g, ' ').trim();
            const tsSec = parseTimestampSeconds(vm.timestamp);
            if (text && tsSec !== null) {
                raw.push({ start: tsSec, end: null, text });
            }
            return;
        }
        if (node.transcriptSegmentRenderer) {
            const sr = node.transcriptSegmentRenderer;
            const text = (sr.snippet?.runs || []).map(r => r?.text || '').join('').replace(/\s+/g, ' ').trim();
            const startMs = Number(sr.startMs);
            const endMs = Number(sr.endMs);
            if (text && Number.isFinite(startMs)) {
                raw.push({
                    start: startMs / 1000,
                    end: Number.isFinite(endMs) && endMs > startMs ? endMs / 1000 : null,
                    text
                });
            }
            return;
        }
        const children = Array.isArray(node) ? node : Object.values(node);
        for (let i = 0; i < children.length; i++) walk(children[i]);
    };
    walk(data);

    raw.sort((a, b) => a.start - b.start);
    const deduped = [];
    const seen = new Set();
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const key = `${item.start}|${item.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ ...item });
    }
    for (let i = 0; i < deduped.length; i++) {
        const cur = deduped[i];
        if (!(cur.end > cur.start)) {
            const next = deduped[i + 1];
            cur.end = next && next.start > cur.start ? next.start : cur.start + 6;
        }
    }
    return deduped;
}

/** Break a long translated block into natural <= maxChars subtitle chunks proportional in time. */
function splitTranslatedTextIntoTimedChunks(start, end, text, maxChars = 84) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const safeEnd = end > start ? end : start + 4;
    if (clean.length <= maxChars) {
        return [{ start, end: safeEnd, text: clean }];
    }

    const words = clean.split(' ');
    const pieces = [];
    let current = '';
    const minBreakLen = Math.floor(maxChars * 0.45);
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const next = current ? `${current} ${w}` : w;
        if (current && next.length > maxChars) {
            pieces.push(current);
            current = w;
            continue;
        }
        current = next;
        if (current.length >= minBreakLen && /[.!?…]$/.test(w) && i < words.length - 1) {
            pieces.push(current);
            current = '';
        }
    }
    if (current) pieces.push(current);

    const totalWeight = pieces.reduce((acc, p) => acc + Math.max(1, p.length), 0);
    const totalDur = safeEnd - start;
    const chunks = [];
    let cursor = start;
    for (let i = 0; i < pieces.length; i++) {
        const isLast = i === pieces.length - 1;
        const share = isLast ? (safeEnd - cursor) : totalDur * (Math.max(1, pieces[i].length) / totalWeight);
        const chunkEnd = isLast ? safeEnd : cursor + Math.max(0.4, share);
        chunks.push({ start: cursor, end: chunkEnd, text: pieces[i] });
        cursor = chunkEnd;
    }
    return chunks;
}

function parseGtxResponse(rawText) {
    const data = JSON.parse(rawText);
    if (Array.isArray(data?.sentences)) {
        return data.sentences.map(s => s?.trans || '').join('');
    }
    if (Array.isArray(data?.[0])) {
        return data[0].map(pair => pair?.[0] || '').join('');
    }
    return '';
}

async function requestTranslateHttp(url, opts, requestFn) {
    try {
        const res = await requestFn(url, opts);
        if (res?.status === 200 && res.text) return res;
    } catch {}
    if (typeof fetch === 'function') {
        const resp = await fetch(url, {
            method: opts.method || 'GET',
            headers: opts.headers,
            body: opts.body,
            credentials: 'omit'
        });
        return { status: resp.status, text: await resp.text() };
    }
    return { status: 0, text: '' };
}

async function translateSingleViaClients5(text, sl, tl, requestFn) {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
    const res = await requestTranslateHttp(url, { method: 'GET', anonymous: true, timeout: 8000 }, requestFn);
    if (res?.status !== 200 || !res.text) return null;
    try {
        const parsed = JSON.parse(res.text);
        if (typeof parsed === 'string') return parsed.trim();
        if (Array.isArray(parsed)) {
            const first = parsed[0];
            if (typeof first === 'string') return first.trim();
            if (Array.isArray(first) && typeof first[0] === 'string') return first[0].trim();
        }
    } catch {}
    return null;
}

/** Translate an array of subtitle strings in batch via translate.googleapis.com (with clients5 fallback). */
async function translateCueBatch({ texts, sourceLang = 'auto', targetLang = 'es', requestFn = gmRequest }) {
    if (!Array.isArray(texts) || !texts.length) return [];
    const normalized = texts.map(t => String(t || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim());
    const sl = normalizeBaseLang(sourceLang) || 'auto';
    const tl = normalizeBaseLang(targetLang) || 'es';
    if (sl !== 'auto' && sl === tl) return normalized;

    const batchUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dj=1`;
    try {
        const res = await requestTranslateHttp(
            batchUrl,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: `q=${encodeURIComponent(normalized.join('\n'))}`,
                anonymous: true,
                timeout: 10000
            },
            requestFn
        );
        if (res?.status === 200 && res.text) {
            const joined = parseGtxResponse(res.text);
            const split = joined.split(/\r?\n/);
            if (split.length === normalized.length) {
                return split.map((line, i) => line.trim() || normalized[i]);
            }
        }
    } catch {}

    const out = [];
    for (let i = 0; i < normalized.length; i++) {
        const line = normalized[i];
        if (!line) {
            out.push('');
            continue;
        }
        const single = await translateSingleViaClients5(line, sl, tl, requestFn).catch(() => null);
        out.push(single || line);
    }
    return out;
}

/** Fetch and parse transcript segments via YouTube's modern PAmodern_transcript_view panel. */
async function fetchTranscriptViaGetPanel(videoId, win) {
    if (!win || typeof win.fetch !== 'function') return [];
    const params = buildTranscriptPanelParams(videoId);
    if (!params) return [];
    const ctx = win.ytcfg?.get?.('INNERTUBE_CONTEXT') || {
        client: {
            clientName: 'WEB',
            clientVersion: win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION') || '2.20261112.10.00'
        }
    };
    const headers = { 'Content-Type': 'application/json' };
    const clientName = win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_NAME');
    const clientVer = win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION');
    if (clientName) headers['X-YouTube-Client-Name'] = String(clientName);
    if (clientVer) headers['X-YouTube-Client-Version'] = String(clientVer);

    const resp = await win.fetch('/youtubei/v1/get_panel?prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ context: ctx, panelId: 'PAmodern_transcript_view', params })
    });
    if (!resp?.ok) return [];
    const data = typeof resp.json === 'function' ? await resp.json() : JSON.parse(await resp.text());
    return parseTranscriptPanelResponse(data);
}

function collectPerformanceTimedtextUrl(win, videoId) {
    try {
        const entries = win?.performance?.getEntriesByType?.('resource') || [];
        for (let i = entries.length - 1; i >= 0; i--) {
            const name = String(entries[i]?.name || '');
            if (!TIMEDTEXT_URL_RE.test(name)) continue;
            const parsed = new URL(name);
            if (parsed.searchParams.get('v') !== videoId) continue;
            if (!parsed.searchParams.has('pot')) continue;
            parsed.searchParams.delete('tlang');
            parsed.searchParams.set('fmt', 'json3');
            return parsed.toString();
        }
    } catch {}
    return '';
}

async function obtainRawSegmentsForVideo(videoId, win, opts = {}) {
    if (typeof __supratubeTdExports?.tdRecoverRawSubtitleCues === 'function') {
        try {
            return await __supratubeTdExports.tdRecoverRawSubtitleCues({
                videoId,
                userLang: opts.userLang || 'es',
                captionTracksHint: opts.captionTracks || [],
                doc: opts.doc || null,
                win,
                requestFn: opts.requestFn || gmRequest
            });
        } catch {}
    }

    const st = getTtState(win);
    const cachedOrigin = st.originCuesByVid.get(videoId);
    if (cachedOrigin?.cues?.length) {
        return { lang: cachedOrigin.lang, segments: cachedOrigin.cues, alreadyTranslated: false, audioLang: '', captionTracks: [] };
    }

    const rawUrl = st.rawUrlsByVid.get(videoId) || collectPerformanceTimedtextUrl(win, videoId);
    if (rawUrl && (!st.directBlockedByVid.has(videoId) || rawUrl.includes('pot=')) && typeof win?.fetch === 'function') {
        try {
            const resp = await win.fetch(rawUrl, { credentials: 'include' });
            if (resp?.ok) {
                const txt = await resp.text();
                const cues = parseTimedtextResponseText(txt);
                if (cues.length) {
                    const lang = normalizeBaseLang(new URL(rawUrl).searchParams.get('lang'));
                    st.originCuesByVid.set(videoId, { lang, cues, ts: Date.now() });
                    return { lang, segments: cues, alreadyTranslated: false, audioLang: '', captionTracks: [] };
                }
            }
        } catch {}
    }

    const panelSegs = await fetchTranscriptViaGetPanel(videoId, win).catch(() => []);
    return { lang: '', segments: panelSegs, alreadyTranslated: false, audioLang: '', captionTracks: [] };
}

function getActiveVideoIdSafe(player, win) {
    return player?.getVideoData?.()?.video_id || getVideoId(win?.location?.href || '');
}

function hasVisibleNativeCaptions(player) {
    if (!player?.querySelectorAll) return false;
    const nodes = player.querySelectorAll('.ytp-caption-segment');
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.getAttribute?.('data-supratube-seg') === '1') continue;
        if (String(el.textContent || '').trim()) return true;
    }
    return false;
}

function ensureFallbackBox(player, doc, win) {
    if (!player || !doc) return null;
    let box = player.querySelector?.(`#${FALLBACK_BOX_ID}`) || doc.getElementById?.(FALLBACK_BOX_ID);
    if (!box) {
        box = doc.createElement('div');
        box.id = FALLBACK_BOX_ID;
        box.setAttribute('data-supratube-captions', '1');
        const span = doc.createElement('span');
        span.className = 'supratube-caption-segment';
        span.setAttribute('data-supratube-seg', '1');
        box.appendChild(span);
        player.appendChild?.(box);
    }
    const isShorts = Boolean(player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || ''));
    const cw = Number(player.clientWidth) || (isShorts ? 380 : 900);
    const fontPx = Math.round(Math.max(isShorts ? 19 : 16, Math.min(isShorts ? 24 : 30, cw * (isShorts ? 0.058 : 0.024))));
    Object.assign(box.style, {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: isShorts ? '19%' : '11%',
        width: 'max-content',
        maxWidth: isShorts ? '90%' : '84%',
        zIndex: '60',
        pointerEvents: 'none',
        textAlign: 'center'
    });
    const segEl = box.children?.[0];
    if (segEl?.style) {
        Object.assign(segEl.style, {
            display: 'inline-block',
            background: 'rgba(8, 8, 8, 0.78)',
            color: '#ffffff',
            fontFamily: '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
            fontSize: `${fontPx}px`,
            fontWeight: isShorts ? '600' : '500',
            lineHeight: isShorts ? '1.28' : '1.35',
            padding: isShorts ? '5px 10px' : '4px 10px',
            borderRadius: '4px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
            whiteSpace: 'pre-wrap'
        });
    }
    return box;
}

const CC_ACTIVE_STYLE_ID = 'supratube-cc-active-style';
const SHORTS_CAPTION_STYLE_ID = 'supratube-shorts-caption-style';
const FILLED_CC_SVG_PATH =
    'M21 3H3C2.46 3 1.96 3.21 1.58 3.58C1.21 3.96 1 4.46 1 5V19C1 19.53 1.21 20.03 1.58 20.41C1.96 20.78 2.46 21 3 21H21C21.53 21 22.03 20.78 22.41 20.41C22.78 20.03 23 19.53 23 19V5C23 4.46 22.78 3.96 22.41 3.58C22.03 3.21 21.53 3 21 3ZM6 11H8C8.26 11 8.51 11.10 8.70 11.29C8.89 11.48 9 11.73 9 12C9 12.26 8.89 12.51 8.70 12.70C8.51 12.89 8.26 13 8 13H6C5.73 13 5.48 12.89 5.29 12.70C5.10 12.51 5 12.26 5 12C5 11.73 5.10 11.48 5.29 11.29C5.48 11.10 5.73 11 6 11ZM12 11H18C18.26 11 18.51 11.10 18.70 11.29C18.89 11.48 19 11.73 19 12C19 12.26 18.89 12.51 18.70 12.70C18.51 12.89 18.26 13 18 13H12C11.73 13 11.48 12.89 11.29 12.70C11.10 12.51 11 12.26 11 12C11 11.73 11.10 11.48 11.29 11.29C11.48 11.10 11.73 11 12 11ZM16 15H18C18.26 15 18.51 15.10 18.70 15.29C18.89 15.48 19 15.73 19 16C19 16.26 18.89 16.51 18.70 16.70C18.51 16.89 18.26 17 18 17H16C15.73 17 15.48 16.89 15.29 16.70C15.10 16.51 15 16.26 15 16C15 15.73 15.10 15.48 15.29 15.29C15.48 15.10 15.73 15 16 15ZM6 15H12C12.26 15 12.51 15.10 12.70 15.29C12.89 15.48 13 15.73 13 16C13 16.26 12.89 16.51 12.70 16.70C12.51 16.89 12.26 17 12 17H6C5.73 17 5.48 16.89 5.29 16.70C5.10 16.51 5 16.26 5 16C5 15.73 5.10 15.48 5.29 15.29C5.48 15.10 5.73 15 6 15Z';
const CC_TRACKED_ATTRS = ['aria-pressed', 'aria-disabled', 'aria-label', 'data-tooltip-title', 'data-title-no-tooltip'];

function ensureDocStyle(doc, id, css) {
    if (!doc?.createElement || !id) return;
    const existing = doc.getElementById?.(id);
    if (existing) {
        if (existing.textContent !== css) existing.textContent = css;
        return;
    }
    const target = doc.head || doc.documentElement;
    if (!target?.appendChild) return;
    const style = doc.createElement('style');
    style.id = id;
    style.textContent = css;
    target.appendChild(style);
}

function ensureCcActiveStyle(doc) {
    ensureDocStyle(doc, CC_ACTIVE_STYLE_ID, [
        '.ytp-subtitles-button[data-supratube-cc-active="1"] { opacity: 1 !important; pointer-events: auto !important; cursor: pointer !important; color: #fff !important; }',
        '.ytp-subtitles-button[data-supratube-cc-active="1"] .ytp-subtitles-button-icon, .ytp-subtitles-button[data-supratube-cc-active="1"] svg, .ytp-subtitles-button[data-supratube-cc-active="1"] path { opacity: 1 !important; fill-opacity: 1 !important; }'
    ].join('\n'));
}

function ensureShortsCaptionStyle(doc) {
    ensureDocStyle(doc, SHORTS_CAPTION_STYLE_ID, [
        '#shorts-player .caption-window, ytd-reel-video-renderer .caption-window, ytd-shorts .caption-window {',
        '    left: 50% !important;',
        '    right: auto !important;',
        '    margin-left: 0 !important;',
        '    margin-right: 0 !important;',
        '    transform: translateX(-50%) !important;',
        '    width: max-content !important;',
        '    max-width: 90% !important;',
        '    text-align: center !important;',
        '    box-sizing: border-box !important;',
        '}',
        '#shorts-player .caption-window .captions-text, ytd-reel-video-renderer .caption-window .captions-text, ytd-shorts .caption-window .captions-text,',
        '#shorts-player .caption-visual-line, ytd-reel-video-renderer .caption-visual-line, ytd-shorts .caption-visual-line {',
        '    display: block !important;',
        '    text-align: center !important;',
        '    white-space: normal !important;',
        '}',
        '#shorts-player .ytp-caption-segment, ytd-reel-video-renderer .ytp-caption-segment, ytd-shorts .ytp-caption-segment {',
        '    font-size: clamp(18px, 1.55vw, 21px) !important;',
        '    line-height: 1.28 !important;',
        '    padding: 2px 7px !important;',
        '    font-weight: 600 !important;',
        '    white-space: normal !important;',
        '}'
    ].join('\n'));
}

const IA_CC_BTN_ID = 'supratube-ia-cc-btn';
const IA_CC_STYLE_ID = 'supratube-ia-cc-style';
const SVG_NS = 'http://www.w3.org/2000/svg';
const IA_GLYPHS_PATH = 'M6.8 7.8H8.8V16.2H6.8ZM13 7.8H15L17.2 16.2H15.3L14.8 14.3H13.2L12.7 16.2H10.8ZM14 9.6L13.45 12.7H14.55Z';
const IA_OUTLINE_BOX_PATH = 'M4.5 4H19.5A2.5 2.5 0 0 1 22 6.5V17.5A2.5 2.5 0 0 1 19.5 20H4.5A2.5 2.5 0 0 1 2 17.5V6.5A2.5 2.5 0 0 1 4.5 4Z';
const IA_FILLED_CUTOUT_PATH = `M3.5 3H20.5A2.5 2.5 0 0 1 23 5.5V18.5A2.5 2.5 0 0 1 20.5 21H3.5A2.5 2.5 0 0 1 1 18.5V5.5A2.5 2.5 0 0 1 3.5 3Z ${IA_GLYPHS_PATH}`;

function ensureIaButtonStyle(doc) {
    ensureDocStyle(doc, IA_CC_STYLE_ID, [
        '.supratube-ia-cc-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; opacity: 0.92 !important; color: #fff !important; cursor: pointer !important; vertical-align: middle !important; }',
        '.supratube-ia-cc-btn:hover, .supratube-ia-cc-btn[data-active="1"] { opacity: 1 !important; }',
        '.supratube-ia-cc-btn .ytp-subtitles-button-icon { display: inline-flex; align-items: center; justify-content: center; }'
    ].join('\n'));
}

function createSvgNode(doc, tag, attrs = {}) {
    const el = typeof doc.createElementNS === 'function' ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute?.(k, String(v));
    }
    return el;
}

function renderIaButtonIcon(btn, doc, active) {
    if (!btn || !doc) return;
    let wrap = btn.querySelector?.('.ytp-subtitles-button-icon');
    if (!wrap) {
        wrap = doc.createElement('div');
        wrap.className = 'ytp-subtitles-button-icon';
        btn.appendChild?.(wrap);
    }
    wrap.setAttribute?.('fill-opacity', '1');
    let svg = wrap.querySelector?.('svg');
    if (!svg) {
        svg = createSvgNode(doc, 'svg', { fill: 'none', height: 24, viewBox: '0 0 24 24', width: 24 });
        wrap.appendChild?.(svg);
    }

    const modeKey = active ? '1' : '0';
    if (svg.getAttribute?.('data-ia-mode') === modeKey) return;
    svg.setAttribute?.('data-ia-mode', modeKey);
    svg.replaceChildren?.();

    if (active) {
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_FILLED_CUTOUT_PATH,
            fill: 'white',
            'fill-rule': 'evenodd',
            'clip-rule': 'evenodd'
        }));
    } else {
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_OUTLINE_BOX_PATH,
            fill: 'none',
            stroke: 'white',
            'stroke-width': '1.8'
        }));
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_GLYPHS_PATH,
            fill: 'white',
            'fill-rule': 'evenodd',
            'clip-rule': 'evenodd'
        }));
    }
}

function applyIaButtonState(btn, doc, active) {
    if (!btn) return;
    const label = active ? 'Desactivar subtítulos IA' : 'Subtítulos IA';
    btn.setAttribute?.('data-active', active ? '1' : '0');
    btn.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute?.('aria-label', label);
    btn.setAttribute?.('title', label);
    btn.setAttribute?.('data-tooltip-title', label);
    btn.setAttribute?.('data-title-no-tooltip', label);
    renderIaButtonIcon(btn, doc, active);
}

/** Sync active state of all injected SupraTube IA caption buttons with current Whisper session. */
function syncAiSubtitleButtonState(
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null
) {
    if (!doc) return;
    const ctrl = getFallbackCtrl(win);
    const active = Boolean(
        (ctrl.whisperVid && ctrl.activeVid === ctrl.whisperVid) ||
        (ctrl.manualOverlayActive && ctrl.activeVid)
    );
    const nodes = [];
    if (typeof doc.querySelectorAll === 'function') {
        try {
            const list = doc.querySelectorAll(`.${IA_CC_BTN_ID}, #${IA_CC_BTN_ID}`);
            if (list) nodes.push(...list);
        } catch {}
    }
    if (!nodes.length && typeof doc.getElementById === 'function') {
        const single = doc.getElementById(IA_CC_BTN_ID);
        if (single) nodes.push(single);
    }
    for (const btn of nodes) {
        applyIaButtonState(btn, doc, active);
    }
}

/** Remove all SupraTube IA caption buttons (on teardown or disabling feature). */
function removeAiSubtitleButtons(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc?.querySelectorAll) return;
    try {
        for (const el of Array.from(doc.querySelectorAll(`.${IA_CC_BTN_ID}, #${IA_CC_BTN_ID}`))) {
            el.remove?.();
        }
    } catch {}
}

/** Mount the IA subtitles button beside the native YouTube CC button on Watch controls. */
function ensureAiSubtitleButton({
    player,
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    enabled = true,
    onToggle = null
} = {}) {
    if (!doc || !win) return null;
    if (!enabled || !player || player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || '')) {
        removeAiSubtitleButtons(doc);
        return null;
    }

    const ctrl = getFallbackCtrl(win);
    if (typeof onToggle === 'function') ctrl.onIaToggle = onToggle;

    const ccBtn = findFallbackCcButton(player, doc);
    const parent = ccBtn?.parentElement;
    if (!ccBtn || !parent) return null;
    if (typeof ccBtn.closest === 'function' && !ccBtn.closest('.ytp-right-controls')) return null;

    ensureIaButtonStyle(doc);

    let btn = parent.querySelector?.(`#${IA_CC_BTN_ID}`) || doc.getElementById?.(IA_CC_BTN_ID) || null;
    if (!btn) {
        btn = doc.createElement('button');
        btn.id = IA_CC_BTN_ID;
        btn.type = 'button';
        btn.className = `ytp-button ${IA_CC_BTN_ID}`;
        btn.setAttribute?.('data-priority', '5');
        btn.addEventListener?.('click', ev => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            const curCtrl = getFallbackCtrl(win);
            if (ev?.isTrusted) {
                const nowTs = Date.now();
                if (curCtrl.lastIaDomClickTs && nowTs - curCtrl.lastIaDomClickTs < 400) return;
                curCtrl.lastIaDomClickTs = nowTs;
            }
            curCtrl.onIaToggle?.(win, doc);
        });
    }

    if (btn.parentElement !== parent || ccBtn.nextSibling !== btn) {
        parent.insertBefore?.(btn, ccBtn.nextSibling || null);
    }

    const active = Boolean(
        (ctrl.whisperVid && ctrl.activeVid === ctrl.whisperVid) ||
        (ctrl.manualOverlayActive && ctrl.activeVid)
    );
    applyIaButtonState(btn, doc, active);
    return btn;
}

/** Toggle live Whisper AI captions manually on the active video, even if the video has no tracks or matches user language. */
function startManualAiCaptions({
    player,
    videoId,
    userLang = 'es',
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    requestFn = gmRequest
} = {}) {
    if (!player || !videoId || !doc || !win) return false;
    const ctrl = getFallbackCtrl(win);
    if (
        (ctrl.whisperVid === videoId && ctrl.activeVid === videoId && ctrl.whisperManualForce) ||
        (ctrl.manualOverlayActive && ctrl.activeVid === videoId)
    ) {
        clearFallbackCaptions(doc, win);
        return false;
    }

    const video = player?.querySelector?.('video') || doc?.querySelector?.('video');
    if (!video) return false;

    const baseUser = normalizeBaseLang(userLang) || 'es';
    ctrl.sameLangVideos.delete(videoId);
    ctrl.manualForcePendingVid = videoId;
    try { player.setOption?.('captions', 'track', {}); } catch {}
    if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn()) {
        try { player.toggleSubtitles?.(); } catch {}
    }

    const initialMsg = video?.paused ? 'Subtítulos IA listos (reproduce el video)' : 'Iniciando subtítulos IA...';
    const ok = startWhisperLiveFallback({
        player,
        video,
        videoId,
        userLang: baseUser,
        doc,
        win,
        requestFn,
        manualForce: true,
        initialMessage: initialMsg
    });
    syncAiSubtitleButtonState(doc, win);

    if (ok && (typeof win?.fetch === 'function' || typeof player?.getPlayerResponse === 'function')) {
        void (async () => {
            try {
                const cachedChunks = ctrl.cache.get(`${videoId}:${baseUser}`);
                if (cachedChunks?.length && !ctrl.hasReceivedWhisperCaption) {
                    if (typeof ctrl.stopWhisper === 'function') {
                        try { ctrl.stopWhisper(); } catch {}
                        ctrl.stopWhisper = null;
                    }
                    ctrl.whisperVid = null;
                    ctrl.whisperManualForce = false;
                    ctrl.manualOverlayActive = true;
                    ctrl.forceOverlay = true;
                    startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => cachedChunks });
                    syncAiSubtitleButtonState(doc, win);
                    return;
                }
                const pr = player.getPlayerResponse?.() || {};
                const trackHint =
                    pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
                    player.getAudioTrack?.()?.captionTracks ||
                    [];
                const recovered = await obtainRawSegmentsForVideo(videoId, win, {
                    userLang: baseUser,
                    captionTracks: trackHint,
                    doc,
                    requestFn
                });
                if (
                    !(recovered?.segments?.length) ||
                    ctrl.activeVid !== videoId ||
                    ctrl.whisperVid !== videoId ||
                    !ctrl.whisperManualForce ||
                    ctrl.hasReceivedWhisperCaption ||
                    getActiveVideoIdSafe(player, win) !== videoId ||
                    hasVisibleNativeCaptions(player)
                ) {
                    return;
                }
                await renderRecoveredOverlaySegments({
                    player,
                    video,
                    videoId,
                    recovered,
                    targetBase: baseUser,
                    forceOverlay: true,
                    manualOverlay: true,
                    doc,
                    win,
                    requestFn
                });
            } catch {}
        })();
    }

    return ok;
}

const UNAVAILABLE_CC_TT_RE = /subt[ií]tulos no disponibles|captions unavailable|subtitles.*unavailable/i;

function syncCcHoverTooltip(doc, label) {
    if (!doc) return;
    const nodes = [];
    if (typeof doc.querySelectorAll === 'function') {
        try {
            const list = doc.querySelectorAll('.ytp-tooltip-text');
            if (list) nodes.push(...list);
        } catch {}
    }
    if (!nodes.length && typeof doc.querySelector === 'function') {
        try {
            const single = doc.querySelector('.ytp-tooltip-text');
            if (single) nodes.push(single);
        } catch {}
    }
    for (const tt of nodes) {
        if (!tt || !UNAVAILABLE_CC_TT_RE.test(String(tt.textContent || ''))) continue;
        const childNodes = tt.childNodes ? Array.from(tt.childNodes) : [];
        const hasElementChild = childNodes.some((n) => n && n.nodeType === 1);
        if (hasElementChild) {
            let replaced = false;
            for (const child of childNodes) {
                if (child?.nodeType === 3 && UNAVAILABLE_CC_TT_RE.test(String(child.textContent || ''))) {
                    child.textContent = `${label} `;
                    replaced = true;
                    break;
                }
            }
            if (replaced) continue;
        }
        tt.textContent = label;
    }
}

function findFallbackCcButton(player, doc) {
    return player?.querySelector?.('.ytp-subtitles-button') || doc?.querySelector?.('.ytp-subtitles-button') || null;
}

function applyCcActiveAttrs(ui, doc) {
    if (!ui?.active || !ui.ccBtn || ui.suppressObs) return;
    const { ccBtn } = ui;
    ui.suppressObs = true;
    try {
        const label = ui.mode === 'whisper' ? 'Subtítulos IA' : 'Subtítulos';
        const tooltip = `${label} (c)`;
        const setIfDiff = (el, k, v) => {
            if (el?.getAttribute?.(k) !== v) el?.setAttribute?.(k, v);
        };
        setIfDiff(ccBtn, 'data-supratube-cc-active', '1');
        setIfDiff(ccBtn, 'aria-pressed', 'true');
        setIfDiff(ccBtn, 'aria-label', tooltip);
        setIfDiff(ccBtn, 'data-tooltip-title', tooltip);
        setIfDiff(ccBtn, 'data-title-no-tooltip', label);
        if (ccBtn.hasAttribute?.('aria-disabled') || ccBtn.getAttribute?.('aria-disabled') !== null) {
            ccBtn.removeAttribute?.('aria-disabled');
        }
        if (ccBtn.disabled) ccBtn.disabled = false;
        if (ccBtn.hasAttribute?.('disabled')) ccBtn.removeAttribute?.('disabled');
        if (ccBtn.style?.display === 'none') ccBtn.style.display = '';

        const iconWrap = ccBtn.querySelector?.('.ytp-subtitles-button-icon');
        if (iconWrap) {
            if (ui.origIconFillOpacity === undefined) {
                ui.origIconFillOpacity = iconWrap.getAttribute?.('fill-opacity') ?? null;
            }
            setIfDiff(iconWrap, 'fill-opacity', '1');
        }

        const svg = ccBtn.querySelector?.('svg');
        if (svg) {
            if (ui.origSvgFillOpacity === undefined) {
                ui.origSvgFillOpacity = svg.getAttribute?.('fill-opacity') ?? null;
            }
            if (svg.hasAttribute?.('fill-opacity') || svg.getAttribute?.('fill-opacity') !== null) {
                svg.removeAttribute?.('fill-opacity');
            }
        }

        const path = ccBtn.querySelector?.('svg path');
        if (path) {
            if (ui.origPathFillOpacity === undefined) {
                ui.origPathFillOpacity = path.getAttribute?.('fill-opacity') ?? null;
            }
            if (path.hasAttribute?.('fill-opacity') || path.getAttribute?.('fill-opacity') !== null) {
                path.removeAttribute?.('fill-opacity');
            }
            if (svg?.getAttribute?.('viewBox') === '0 0 24 24') {
                if (ui.origPathD === null) ui.origPathD = path.getAttribute?.('d') ?? null;
                if (path.getAttribute?.('d') !== FILLED_CC_SVG_PATH) {
                    path.setAttribute?.('d', FILLED_CC_SVG_PATH);
                }
            }
        }
        syncCcHoverTooltip(doc, label);
    } finally {
        ui.suppressObs = false;
    }
}

function restoreCcAttr(el, attr, prev) {
    if (!el) return;
    if (prev === null || prev === undefined) el.removeAttribute?.(attr);
    else el.setAttribute?.(attr, prev);
}

function clearUiTooltipTimers(ui) {
    if (!ui?.tooltipTimers?.length) return;
    for (const id of ui.tooltipTimers) clearTimeout(id);
    ui.tooltipTimers.length = 0;
}

function restoreFallbackCcButton(win) {
    const ctrl = getFallbackCtrl(win);
    const ui = ctrl.ccUi;
    if (!ui) return;
    ctrl.ccUi = null;
    ui.active = false;
    ui.suppressObs = true;
    try {
        try { ui.observer?.disconnect?.(); } catch {}
        clearUiTooltipTimers(ui);
        const { ccBtn } = ui;
        if (!ccBtn) return;
        if (ui.onHover) {
            for (const ev of ['pointerenter', 'mouseenter', 'focus']) {
                ccBtn.removeEventListener?.(ev, ui.onHover, true);
            }
        }
        ccBtn.removeAttribute?.('data-supratube-cc-active');
        for (const attr of CC_TRACKED_ATTRS) {
            restoreCcAttr(ccBtn, attr, ui.origAttrs[attr]);
        }
        ccBtn.disabled = Boolean(ui.origDisabled);
        if (ui.origDisabled) ccBtn.setAttribute?.('disabled', '');
        if (ccBtn.style) ccBtn.style.display = ui.origDisplay;
        if (ui.origIconFillOpacity !== undefined) {
            restoreCcAttr(ccBtn.querySelector?.('.ytp-subtitles-button-icon'), 'fill-opacity', ui.origIconFillOpacity);
        }
        if (ui.origSvgFillOpacity !== undefined) {
            restoreCcAttr(ccBtn.querySelector?.('svg'), 'fill-opacity', ui.origSvgFillOpacity);
        }
        const path = ccBtn.querySelector?.('svg path');
        if (path) {
            if (ui.origPathFillOpacity !== undefined) {
                restoreCcAttr(path, 'fill-opacity', ui.origPathFillOpacity);
            }
            if (ui.origPathD !== null) {
                path.setAttribute?.('d', ui.origPathD);
            }
        }
    } finally {
        ui.suppressObs = false;
    }
}

function setFallbackCcActive(player, doc, win, mode = 'layer1') {
    const ccBtn = findFallbackCcButton(player, doc);
    if (!ccBtn) return;
    const ctrl = getFallbackCtrl(win);
    if (ctrl.ccUi && ctrl.ccUi.ccBtn !== ccBtn) {
        restoreFallbackCcButton(win);
    }
    if (!ctrl.ccUi) {
        const nativelyActive =
            ccBtn.getAttribute?.('aria-pressed') === 'true' &&
            !ccBtn.disabled &&
            ccBtn.getAttribute?.('aria-disabled') !== 'true' &&
            ccBtn.style?.display !== 'none' &&
            !/no disponibles|unavailable/i.test(
                `${ccBtn.getAttribute?.('aria-label') || ''} ${ccBtn.getAttribute?.('data-tooltip-title') || ''}`
            );
        if (nativelyActive) return;

        ensureCcActiveStyle(doc);
        const origAttrs = {};
        for (const attr of CC_TRACKED_ATTRS) {
            origAttrs[attr] = ccBtn.getAttribute?.(attr) ?? null;
        }
        const svg = ccBtn.querySelector?.('svg');
        const path = ccBtn.querySelector?.('svg path');
        const ui = {
            ccBtn,
            origAttrs,
            origDisabled: Boolean(ccBtn.disabled),
            origDisplay: ccBtn.style?.display ?? '',
            origPathD: (svg?.getAttribute?.('viewBox') === '0 0 24 24' && path) ? (path.getAttribute?.('d') ?? null) : null,
            origIconFillOpacity: undefined,
            origSvgFillOpacity: undefined,
            origPathFillOpacity: undefined,
            tooltipTimers: [],
            onHover: null,
            observer: null,
            suppressObs: false,
            active: true,
            mode
        };
        ui.onHover = () => {
            if (!ui.active) return;
            applyCcActiveAttrs(ui, doc);
            clearUiTooltipTimers(ui);
            const label = ui.mode === 'whisper' ? 'Subtítulos IA' : 'Subtítulos';
            for (const delay of [0, 60, 160]) {
                ui.tooltipTimers.push(setTimeout(() => {
                    if (ui.active) syncCcHoverTooltip(doc, label);
                }, delay));
            }
        };
        for (const ev of ['pointerenter', 'mouseenter', 'focus']) {
            ccBtn.addEventListener?.(ev, ui.onHover, true);
        }
        if (typeof win?.MutationObserver === 'function') {
            try {
                ui.observer = new win.MutationObserver(() => {
                    if (ui.active && !ui.suppressObs) applyCcActiveAttrs(ui, doc);
                });
                ui.observer.observe(ccBtn, {
                    attributes: true,
                    attributeFilter: [...CC_TRACKED_ATTRS, 'disabled', 'style', 'fill-opacity', 'd'],
                    childList: true,
                    subtree: true
                });
            } catch {}
        }
        ctrl.ccUi = ui;
    } else {
        ctrl.ccUi.mode = mode;
        ctrl.ccUi.active = true;
    }
    applyCcActiveAttrs(ctrl.ccUi, doc);
}

/** Hide and remove the fallback caption overlay and tear down its sync loop or Whisper session. */
function clearFallbackCaptions(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    const ctrl = getFallbackCtrl(win);
    clearTimeout(ctrl.watchdogTimer);
    ctrl.watchdogTimer = null;
    ctrl.activeVid = null;
    ctrl.inflightVid = null;
    ctrl.manualForcePendingVid = null;
    ctrl.manualOverlayActive = false;
    ctrl.hasReceivedWhisperCaption = false;
    ctrl.lastWhisperPct = 0;
    ctrl.showWhisperLine = null;
    ctrl.forceOverlay = false;
    restoreFallbackCcButton(win);
    if (typeof ctrl.stopWhisper === 'function') {
        try { ctrl.stopWhisper(); } catch {}
        ctrl.stopWhisper = null;
    }
    ctrl.whisperVid = null;
    ctrl.whisperManualForce = false;
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
        ctrl.stopLoop = null;
    }
    const existing = doc?.getElementById?.(FALLBACK_BOX_ID);
    if (existing) {
        try { existing.remove(); } catch {}
    }
    syncAiSubtitleButtonState(doc, win);
}

function findActiveChunkText(chunks, timeSec) {
    if (!chunks.length) return '';
    let lo = 0;
    let hi = chunks.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const c = chunks[mid];
        if (timeSec < c.start) hi = mid - 1;
        else if (timeSec >= c.end) lo = mid + 1;
        else return c.text;
    }
    return '';
}

function startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks }) {
    const ctrl = getFallbackCtrl(win);
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
    }
    ctrl.activeVid = videoId;
    setFallbackCcActive(player, doc, win, 'layer1');

    const renderTick = () => {
        if (ctrl.activeVid !== videoId) return;
        const curVid = getActiveVideoIdSafe(player, win);
        if (curVid && curVid !== videoId) {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (!ctrl.forceOverlay && typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false) {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (!ctrl.ccUi || ctrl.ccUi.ccBtn?.isConnected === false) {
            setFallbackCcActive(player, doc, win, 'layer1');
        }
        const box = ensureFallbackBox(player, doc, win);
        if (!box) return;
        if (hasVisibleNativeCaptions(player)) {
            box.style.display = 'none';
            return;
        }
        const t = Number(video?.currentTime) || 0;
        const txt = findActiveChunkText(getChunks(), t);
        const segEl = box.children?.[0];
        if (segEl) segEl.textContent = txt;
        box.style.display = txt ? 'block' : 'none';
    };

    const onTime = () => renderTick();
    video.addEventListener?.('timeupdate', onTime, { passive: true });
    video.addEventListener?.('seeked', onTime, { passive: true });
    const timer = typeof setInterval === 'function' ? setInterval(() => {
        if (ctrl.activeVid === videoId && !video.paused) renderTick();
    }, 180) : null;
    if (timer && typeof timer.unref === 'function') timer.unref();

    ctrl.stopLoop = () => {
        video.removeEventListener?.('timeupdate', onTime);
        video.removeEventListener?.('seeked', onTime);
        if (timer !== null) clearInterval(timer);
    };
    renderTick();
}

function buildChunksForSegments(segments, translatedByIdx, maxChars) {
    const chunks = [];
    for (let i = 0; i < segments.length; i++) {
        const text = translatedByIdx[i] ?? segments[i].text;
        chunks.push(...splitTranslatedTextIntoTimedChunks(segments[i].start, segments[i].end, text, maxChars));
    }
    return chunks;
}

function dispatchWhisperCmd(win, detail) {
    if (!win || typeof win.dispatchEvent !== 'function') return false;
    const Ev = typeof win.CustomEvent === 'function' ? win.CustomEvent : (typeof CustomEvent === 'function' ? CustomEvent : null);
    if (!Ev) return false;
    win.dispatchEvent(new Ev('supratube-whisper-cmd', { detail }));
    return true;
}

function startWhisperLiveFallback({
    player,
    video,
    videoId,
    userLang,
    doc,
    win,
    requestFn = gmRequest,
    manualForce = false,
    initialMessage = ''
}) {
    const hasBridge = doc?.documentElement?.dataset?.supratubeWhisperBridge === '1';
    if (!hasBridge && !manualForce) return false;
    const ctrl = getFallbackCtrl(win);
    const wantBase = normalizeBaseLang(userLang) || 'es';
    const effectiveTargetLang = manualForce ? `-${wantBase}` : wantBase;

    if (ctrl.whisperVid === videoId) {
        if (manualForce) {
            const wasForced = Boolean(ctrl.whisperManualForce);
            ctrl.whisperManualForce = true;
            ctrl.forceOverlay = true;
            if (!wasForced) {
                const msg =
                    ctrl.lastWhisperPct > 0 && ctrl.lastWhisperPct < 100
                        ? `Subtítulos IA (${ctrl.lastWhisperPct}%)...`
                        : (initialMessage || 'Subtítulos IA escuchando...');
                ctrl.showWhisperLine?.(msg, 0);
                dispatchWhisperCmd(win, { action: 'start', videoId, targetLang: effectiveTargetLang, manualForce: true });
                syncAiSubtitleButtonState(doc, win);
            }
        }
        return true;
    }
    if (typeof ctrl.stopWhisper === 'function') {
        try { ctrl.stopWhisper(); } catch {}
        ctrl.stopWhisper = null;
    }
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
        ctrl.stopLoop = null;
    }

    ctrl.activeVid = videoId;
    ctrl.whisperVid = videoId;
    ctrl.whisperManualForce = Boolean(manualForce);
    ctrl.manualOverlayActive = false;
    ctrl.hasReceivedWhisperCaption = false;
    ctrl.lastWhisperPct = 0;
    ctrl.forceOverlay = true;
    video?.setAttribute?.('data-supratube-whisper-target', videoId);
    setFallbackCcActive(player, doc, win, 'whisper');
    syncAiSubtitleButtonState(doc, win);

    let fadeTimer = null;
    let bridgeWatchdog = null;
    let waitingPlayBanner = false;
    let transSeq = 0;

    const showLine = (text, autoFadeMs = 0) => {
        if (ctrl.whisperVid !== videoId || ctrl.activeVid !== videoId) return;
        const curVid = getActiveVideoIdSafe(player, win);
        if ((curVid && curVid !== videoId) || (!ctrl.whisperManualForce && hasVisibleNativeCaptions(player))) {
            clearFallbackCaptions(doc, win);
            return;
        }
        const box = ensureFallbackBox(player, doc, win);
        if (!box) return;
        const segEl = box.children?.[0];
        if (segEl) segEl.textContent = text;
        box.style.display = text ? 'block' : 'none';
        clearTimeout(fadeTimer);
        if (text && autoFadeMs > 0) {
            fadeTimer = setTimeout(() => {
                if (ctrl.whisperVid === videoId) {
                    const el = doc?.getElementById?.(FALLBACK_BOX_ID);
                    if (el) el.style.display = 'none';
                }
            }, autoFadeMs);
        }
    };
    ctrl.showWhisperLine = showLine;

    if (initialMessage) {
        waitingPlayBanner = Boolean(video?.paused);
        showLine(initialMessage, 0);
    }

    const onVideoPlay = () => {
        if (ctrl.whisperVid !== videoId || !ctrl.whisperManualForce) return;
        if (waitingPlayBanner && !ctrl.hasReceivedWhisperCaption) {
            waitingPlayBanner = false;
            showLine('Subtítulos IA escuchando...', 2500);
        }
    };
    video?.addEventListener?.('play', onVideoPlay, { passive: true });

    const onEvt = ev => {
        const d = ev?.detail;
        if (!d || typeof d !== 'object') return;
        if (d.videoId && d.videoId !== videoId) return;
        if (ctrl.whisperVid !== videoId) return;
        if (bridgeWatchdog) {
            clearTimeout(bridgeWatchdog);
            bridgeWatchdog = null;
        }

        if (!ctrl.ccUi || ctrl.ccUi.ccBtn?.isConnected === false) {
            setFallbackCcActive(player, doc, win, 'whisper');
        }
        if (d.kind === 'same_language' && !ctrl.whisperManualForce) {
            ctrl.sameLangVideos.add(videoId);
            clearFallbackCaptions(doc, win);
            return;
        }
        if (d.kind === 'progress') {
            ctrl.lastWhisperPct = Number(d.pct) || 0;
            if (d.pct > 0 && d.pct < 100) {
                waitingPlayBanner = false;
                showLine(`Subtítulos IA (${d.pct}%)...`, 0);
            }
            return;
        }
        if (d.kind === 'waiting_play') {
            if (ctrl.whisperManualForce) {
                waitingPlayBanner = true;
                showLine('Subtítulos IA listos (reproduce el video)', 0);
            } else {
                showLine('', 0);
            }
            return;
        }
        if (d.kind === 'ready') {
            ctrl.lastWhisperPct = 100;
            if (ctrl.whisperManualForce && !ctrl.hasReceivedWhisperCaption) {
                if (video?.paused) {
                    waitingPlayBanner = true;
                    showLine('Subtítulos IA listos (reproduce el video)', 0);
                } else {
                    waitingPlayBanner = false;
                    showLine('Subtítulos IA escuchando...', 2500);
                }
            }
            return;
        }
        if (d.kind === 'caption') {
            const rawTxt = String(d.raw || '').trim();
            const transTxt = String(d.translated || '').trim();
            const spokenBase = normalizeBaseLang(d.lang || d.locked);
            const showTxt = (spokenBase && spokenBase === wantBase && rawTxt) ? rawTxt : (transTxt || rawTxt);
            if (!showTxt) return;
            ctrl.hasReceivedWhisperCaption = true;
            waitingPlayBanner = false;
            syncAiSubtitleButtonState(doc, win);

            const needsOnFlyTranslate = Boolean(
                ctrl.whisperManualForce &&
                rawTxt &&
                spokenBase &&
                spokenBase !== wantBase &&
                (!transTxt || transTxt === rawTxt)
            );
            showLine(showTxt, 4500);
            if (needsOnFlyTranslate) {
                const mySeq = ++transSeq;
                translateCueBatch({
                    texts: [rawTxt],
                    sourceLang: spokenBase,
                    targetLang: wantBase,
                    requestFn
                }).then(out => {
                    const translatedLine = String(out?.[0] || '').trim();
                    if (
                        translatedLine &&
                        translatedLine !== rawTxt &&
                        mySeq === transSeq &&
                        ctrl.whisperVid === videoId &&
                        ctrl.activeVid === videoId
                    ) {
                        showLine(translatedLine, 4500);
                    }
                }).catch(() => {});
            }
            return;
        }
        if (d.kind === 'preempted') {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (d.kind === 'error') {
            const manualErr = ctrl.whisperManualForce ? String(d.error || '').trim() : '';
            clearFallbackCaptions(doc, win);
            if (manualErr && player && doc) {
                const box = ensureFallbackBox(player, doc, win);
                if (box) {
                    const segEl = box.children?.[0];
                    if (segEl) segEl.textContent = `Subtítulos IA: ${manualErr}`;
                    box.style.display = 'block';
                    setTimeout(() => {
                        if (!getFallbackCtrl(win).activeVid) {
                            doc.getElementById?.(FALLBACK_BOX_ID)?.remove?.();
                        }
                    }, 2500);
                }
            }
        }
    };

    win?.addEventListener?.('supratube-whisper-evt', onEvt);
    ctrl.stopWhisper = () => {
        clearTimeout(fadeTimer);
        if (bridgeWatchdog) {
            clearTimeout(bridgeWatchdog);
            bridgeWatchdog = null;
        }
        transSeq++;
        video?.removeEventListener?.('play', onVideoPlay);
        win?.removeEventListener?.('supratube-whisper-evt', onEvt);
        video?.removeAttribute?.('data-supratube-whisper-target');
        dispatchWhisperCmd(win, { action: 'stop', videoId });
    };

    if (!hasBridge && manualForce) {
        bridgeWatchdog = setTimeout(() => {
            bridgeWatchdog = null;
            if (ctrl.whisperVid === videoId && ctrl.activeVid === videoId && !ctrl.hasReceivedWhisperCaption) {
                showLine('Subtítulos IA: recarga la extensión en brave://extensions', 3500);
            }
        }, 2500);
        if (typeof bridgeWatchdog?.unref === 'function') bridgeWatchdog.unref();
    }

    dispatchWhisperCmd(win, { action: 'start', videoId, targetLang: effectiveTargetLang, manualForce: Boolean(manualForce) });
    return true;
}

async function renderRecoveredOverlaySegments({
    player,
    video,
    videoId,
    recovered,
    sourceLang = '',
    targetBase,
    forceOverlay = true,
    manualOverlay = false,
    doc,
    win,
    requestFn
}) {
    const ctrl = getFallbackCtrl(win);
    const segments = recovered?.segments || [];
    if (!segments.length) return false;

    const isShorts = Boolean(player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || ''));
    const maxChars = isShorts ? 54 : 84;
    const cacheKey = `${videoId}:${targetBase}`;
    const segLang = normalizeBaseLang(recovered?.lang || sourceLang);
    const alreadyInTarget = Boolean(recovered?.alreadyTranslated) || (segLang && segLang === targetBase);

    const prepareOverlay = () => {
        if (manualOverlay && ctrl.hasReceivedWhisperCaption) return false;
        if (manualOverlay || (ctrl.whisperVid === videoId && ctrl.whisperManualForce)) {
            const wasManual = Boolean(manualOverlay || ctrl.whisperManualForce);
            if (ctrl.hasReceivedWhisperCaption) return false;
            if (typeof ctrl.stopWhisper === 'function') {
                try { ctrl.stopWhisper(); } catch {}
                ctrl.stopWhisper = null;
            }
            ctrl.whisperVid = null;
            ctrl.whisperManualForce = false;
            ctrl.manualOverlayActive = wasManual;
        }
        ctrl.forceOverlay = Boolean(forceOverlay);
        return true;
    };

    let chunks = null;
    if (alreadyInTarget) {
        chunks = buildChunksForSegments(segments, segments.map(s => s.text), maxChars);
        if (!prepareOverlay()) return false;
        setBoundedCache(ctrl.cache, cacheKey, chunks);
        startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });
        syncAiSubtitleButtonState(doc, win);
        return true;
    }

    const srcLang = segLang || 'auto';
    const translated = new Array(segments.length);
    const curTime = Number(video.currentTime) || 0;
    let firstIdx = segments.findIndex(s => s.end > curTime);
    if (firstIdx < 0) firstIdx = 0;

    const firstBatchEnd = Math.min(segments.length, firstIdx + 10);
    const firstTexts = segments.slice(firstIdx, firstBatchEnd).map(s => s.text);
    const firstOut = await translateCueBatch({ texts: firstTexts, sourceLang: srcLang, targetLang: targetBase, requestFn });
    if (getActiveVideoIdSafe(player, win) !== videoId || hasVisibleNativeCaptions(player)) return false;

    for (let k = 0; k < firstOut.length; k++) {
        translated[firstIdx + k] = firstOut[k];
    }
    chunks = buildChunksForSegments(segments, translated, maxChars);
    if (!prepareOverlay()) return false;
    startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });
    syncAiSubtitleButtonState(doc, win);

    const ranges = [];
    for (let i = firstBatchEnd; i < segments.length; i += 15) {
        ranges.push([i, Math.min(segments.length, i + 15)]);
    }
    for (let i = 0; i < firstIdx; i += 15) {
        ranges.push([i, Math.min(firstIdx, i + 15)]);
    }

    for (let r = 0; r < ranges.length; r++) {
        if (ctrl.activeVid !== videoId || getActiveVideoIdSafe(player, win) !== videoId) return true;
        const [s, e] = ranges[r];
        const part = await translateCueBatch({
            texts: segments.slice(s, e).map(seg => seg.text),
            sourceLang: srcLang,
            targetLang: targetBase,
            requestFn
        });
        for (let k = 0; k < part.length; k++) translated[s + k] = part[k];
        chunks = buildChunksForSegments(segments, translated, maxChars);
    }
    if (ctrl.activeVid === videoId) {
        setBoundedCache(ctrl.cache, cacheKey, chunks);
    }
    return true;
}

async function runFallbackSubtitles({
    player,
    videoId,
    sourceLang,
    userLang,
    captionTracks = [],
    doc,
    win,
    requestFn,
    forceOverlay = false,
    allowWhisper = false,
    manualForce = false
}) {
    const ctrl = getFallbackCtrl(win);
    if (ctrl.sameLangVideos.has(videoId) && !manualForce && !ctrl.whisperManualForce) return;
    if (ctrl.activeVid === videoId && !manualForce) return;
    if (ctrl.inflightVid === videoId) {
        if (manualForce) ctrl.manualForcePendingVid = videoId;
        return;
    }
    if (hasVisibleNativeCaptions(player)) return;
    const video = player?.querySelector?.('video') || doc?.querySelector?.('video');
    if (!video) return;

    ctrl.inflightVid = videoId;
    try {
        const targetBase = normalizeBaseLang(userLang) || 'es';
        const cacheKey = `${videoId}:${targetBase}`;

        const cachedChunks = ctrl.cache.get(cacheKey) || null;
        if (cachedChunks?.length) {
            ctrl.forceOverlay = Boolean(forceOverlay);
            startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => cachedChunks });
            return;
        }

        const recovered = await obtainRawSegmentsForVideo(videoId, win, { userLang: targetBase, captionTracks, doc, requestFn });
        const forced = Boolean(manualForce || ctrl.manualForcePendingVid === videoId || ctrl.whisperManualForce);
        if (ctrl.manualForcePendingVid === videoId) ctrl.manualForcePendingVid = null;
        const segments = recovered?.segments || [];
        if (getActiveVideoIdSafe(player, win) !== videoId || hasVisibleNativeCaptions(player)) return;

        const recoveredAudioLang = normalizeBaseLang(
            recovered?.audioLang ||
            sourceLang ||
            detectVideoAudioLang({ captionTracks: recovered?.captionTracks || [] })
        );
        if (!forced && recoveredAudioLang && recoveredAudioLang === targetBase) {
            ctrl.sameLangVideos.add(videoId);
            clearFallbackCaptions(doc, win);
            return;
        }

        if (!segments.length) {
            if (ctrl.whisperVid === videoId && ctrl.whisperManualForce) return;
            if (allowWhisper && (forced || doc?.visibilityState !== 'hidden')) {
                startWhisperLiveFallback({ player, video, videoId, userLang: targetBase, doc, win, requestFn, manualForce: forced });
            }
            return;
        }

        await renderRecoveredOverlaySegments({
            player,
            video,
            videoId,
            recovered,
            sourceLang,
            targetBase,
            forceOverlay,
            manualOverlay: forced,
            doc,
            win,
            requestFn
        });
    } finally {
        if (ctrl.inflightVid === videoId) ctrl.inflightVid = null;
    }
}

function armFallbackWatchdog({ player, decision, videoId, userLang, captionTracks, doc, win, requestFn, delayMs = 1800, skipWhisperFallback = false }) {
    if (!videoId || (!player?.querySelector && !doc?.querySelector)) return;
    const st = getTtState(win);
    const ctrl = getFallbackCtrl(win);
    const targetBase = normalizeBaseLang(userLang);
    const sourceLang = decision.action === 'translate'
        ? decision.sourceTrack?.languageCode
        : decision.track?.languageCode;

    const triggerNow = () => {
        if (ctrl.activeVid === videoId || ctrl.inflightVid === videoId) return;
        if (getActiveVideoIdSafe(player, win) !== videoId) return;
        if (hasVisibleNativeCaptions(player)) return;
        if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false) return;
        runFallbackSubtitles({
            player,
            videoId,
            sourceLang,
            userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            forceOverlay: true,
            allowWhisper: !skipWhisperFallback
        }).catch(() => {});
    };

    if (st.failedByVid.has(videoId) && st.healthyLangByVid.get(videoId) !== targetBase) {
        triggerNow();
        return;
    }

    st.onFailureCallbacks.set(videoId, () => {
        clearTimeout(ctrl.watchdogTimer);
        triggerNow();
    });

    clearTimeout(ctrl.watchdogTimer);
    ctrl.watchdogTimer = setTimeout(() => {
        st.onFailureCallbacks.delete(videoId);
        if (st.healthyLangByVid.get(videoId) === targetBase && decision.action === 'translate') return;
        triggerNow();
    }, delayMs);
}

function isShortsCaptionMenuClick(target) {
    const popup = target?.closest?.('ytd-popup-container, tp-yt-iron-dropdown, .ytp-settings-menu');
    if (!popup) return false;
    const item = target.closest('yt-list-item-view-model, [role="menuitemradio"], [role="menuitem"], tp-yt-paper-item, .ytp-menuitem');
    if (!item) return false;
    const popupText = popup.textContent || '';
    return /subt[ií]tulos|captions|traducir autom[aá]ticamente|traducción autom[aá]tica|auto-translate/i.test(popupText);
}

function bindManualCaptionListeners(
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    explicitStorage = null,
    onManualAction = null
) {
    if (!doc || !win) return;
    if (typeof onManualAction === 'function') {
        doc.__supratubeOnManualCaption = onManualAction;
    }
    if (doc.__supratubeCapListenerBound) return;
    doc.__supratubeCapListenerBound = true;
    const storage = getStorageSafe(explicitStorage);
    const clearAutoFlag = () => {
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        try { doc.__supratubeOnManualCaption?.(); } catch {}
    };

    const isDisabledCcClick = ev => {
        const controls = ev.target?.closest?.('.ytp-right-controls, .ytp-chrome-controls');
        if (!controls || typeof ev.clientX !== 'number') return false;
        const cc = controls.querySelector?.('.ytp-subtitles-button');
        if (!cc?.disabled && cc?.getAttribute?.('aria-disabled') !== 'true') return false;
        const r = cc.getBoundingClientRect?.();
        return Boolean(r && r.width > 0 && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
    };

    doc.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        if (ev.target?.closest?.('.ytp-subtitles-button') || isShortsCaptionMenuClick(ev.target) || isDisabledCcClick(ev)) {
            clearAutoFlag();
        }
    }, true);

    win.addEventListener('keydown', ev => {
        if (!ev.isTrusted || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (String(ev.key || '').toLowerCase() !== 'c') return;
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target?.isContentEditable) return;
        clearAutoFlag();
    }, true);
}

function readPlayerSubsOn(player, ccBtn) {
    const playerSubsOn = typeof player.isSubtitlesOn === 'function' ? player.isSubtitlesOn() : null;
    if (playerSubsOn !== null) return Boolean(playerSubsOn);
    return ccBtn?.getAttribute?.('aria-pressed') === 'true' || Boolean(player.getOption?.('captions', 'track')?.languageCode);
}

async function applySmartSubtitles(player, deps = {}) {
    if (!deps.enabled || !player) return false;
    const doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    const win = deps.win || (typeof window !== 'undefined' ? window : null);
    const storage = getStorageSafe(deps.storage);
    const scheduleFn = deps.scheduleFn || (fn => setTimeout(fn, 120));
    const requestFn = deps.gmRequestFn || gmRequest;

    const playerVid = getActiveVideoIdSafe(player, win);
    if (deps.expectedVideoId && playerVid && playerVid !== deps.expectedVideoId) {
        return false;
    }
    const targetVideoId = deps.expectedVideoId || playerVid || '';
    if (player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || '')) {
        ensureShortsCaptionStyle(doc);
    }

    try { player.loadModule?.('captions'); } catch {}

    const pr = player.getPlayerResponse?.() || {};
    const prCaps = pr.captions?.playerCaptionsTracklistRenderer || {};
    const tracklist = player.getOption?.('captions', 'tracklist', { includeAsr: true });
    const audioTrackCaps = player.getAudioTrack?.()?.captionTracks;
    const captionTracks = (Array.isArray(tracklist) && tracklist.length)
        ? tracklist
        : (Array.isArray(prCaps.captionTracks) && prCaps.captionTracks.length
            ? prCaps.captionTracks
            : (Array.isArray(audioTrackCaps) ? audioTrackCaps : []));
    const translationLanguages =
        (Array.isArray(prCaps.translationLanguages) && prCaps.translationLanguages.length)
            ? prCaps.translationLanguages
            : (player.getOption?.('captions', 'translationLanguages') || []);

    const activeTrack = player.getOption?.('captions', 'track');
    const scopedBtn = player.querySelector?.('.ytp-subtitles-button');
    const ccBtn = scopedBtn || (typeof player.querySelector !== 'function' ? doc?.querySelector?.('.ytp-subtitles-button') : null);
    const captionsCurrentlyOn = readPlayerSubsOn(player, ccBtn);
    const autoActivatedByScript = storage?.getItem(CC_AUTO_STORAGE_KEY) === '1';

    const videoLang = detectVideoAudioLang({
        activeAudioTrack: player.getAudioTrack?.(),
        availableAudioTracks: player.getAvailableAudioTracks?.(),
        adaptiveFormats: pr.streamingData?.adaptiveFormats,
        captionTracks,
        playerResponse: pr
    });

    const ctrl = getFallbackCtrl(win);
    if (targetVideoId && ctrl.sameLangVideos.has(targetVideoId) && !deps.manualForce) {
        return false;
    }

    const decision = chooseSubtitleAction({
        videoLang,
        userLang: deps.userLang,
        captionTracks,
        translationLanguages,
        captionsCurrentlyOn,
        autoActivatedByScript
    });

    if (decision.action === 'noop') {
        const baseVideo = normalizeBaseLang(videoLang);
        const baseUser = normalizeBaseLang(deps.userLang);
        if (!baseUser || (baseVideo && baseVideo === baseUser) || deps.skipFallbackCheck || !targetVideoId) {
            return false;
        }
        if (captionsCurrentlyOn && !deps.manualForce) return false;
        runFallbackSubtitles({
            player,
            videoId: targetVideoId,
            sourceLang: videoLang || '',
            userLang: deps.userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            forceOverlay: true,
            allowWhisper: !deps.skipWhisperFallback,
            manualForce: Boolean(deps.manualForce)
        }).catch(() => {});
        return true;
    }

    if (decision.action === 'disable') {
        clearFallbackCaptions(doc, win);
        try { player.setOption?.('captions', 'track', {}); } catch {}
        if (readPlayerSubsOn(player, ccBtn)) {
            try { player.toggleSubtitles?.(); } catch {}
        }
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        return true;
    }

    const alreadyMatched = captionsCurrentlyOn && isMatchingActiveTrack(activeTrack, decision);
    if (!alreadyMatched) {
        if (!captionsCurrentlyOn) {
            try { storage?.setItem(CC_AUTO_STORAGE_KEY, '1'); } catch {}
        }
        if (decision.action === 'select_native') {
            const tlMatch = findMatchingTracklistItem(tracklist, decision.track);
            const arg = buildPlayerTrackArg(decision.track, null, tlMatch);
            try { player.setOption?.('captions', 'track', arg); } catch {}
            if (!readPlayerSubsOn(player, ccBtn)) {
                try { player.toggleSubtitles?.(); } catch {}
            }
        } else if (decision.action === 'translate') {
            const tlMatch = findMatchingTracklistItem(tracklist, decision.sourceTrack);
            const translatedArg = buildPlayerTrackArg(decision.sourceTrack, decision.translationTarget, tlMatch);
            try { player.setOption?.('captions', 'track', translatedArg); } catch {}
            scheduleFn(() => {
                const nowTrack = player.getOption?.('captions', 'track');
                const wantTarget = normalizeBaseLang(decision.translationTarget.languageCode);
                if (normalizeBaseLang(nowTrack?.translationLanguage?.languageCode) !== wantTarget) {
                    const baseArg = buildPlayerTrackArg(decision.sourceTrack, null, tlMatch);
                    try { player.setOption?.('captions', 'track', baseArg); } catch {}
                    try { player.setOption?.('captions', 'track', translatedArg); } catch {}
                }
                if (!readPlayerSubsOn(player, ccBtn) && !player.getOption?.('captions', 'track')?.languageCode) {
                    try { player.toggleSubtitles?.(); } catch {}
                }
            });
        }
    }

    if (!deps.skipFallbackCheck && targetVideoId) {
        armFallbackWatchdog({
            player,
            decision,
            videoId: targetVideoId,
            userLang: deps.userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            delayMs: deps.fallbackWatchdogMs ?? 1800,
            skipWhisperFallback: Boolean(deps.skipWhisperFallback)
        });
    }

    return true;
}

// Descarga de transcripción (.txt) integrada aquí para compatibilidad automática incluso desde v1.0.3.
const __supratubeTdExports = (() => {
    'use strict';

    const TD_STYLE_ID = 'supratube-td-style';
    const TD_ITEM_ATTR = 'data-supratube-td-item';
    const TD_TOAST_ID = 'supratube-td-toast';
    const TD_BLOCK_SIZE = 200;
    const TD_HEROICON_SVG_URL = 'https://api.iconify.design/heroicons/arrow-down-tray.svg';
    const TD_HEROICON_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/heroicons@2.2.0/24/outline/arrow-down-tray.svg';

    const TD_INNERTUBE_CLIENTS = Object.freeze([
        {
            name: 'ANDROID',
            id: '3',
            context: {
                clientName: 'ANDROID',
                clientVersion: '20.10.38',
                androidSdkVersion: 34,
                osName: 'Android',
                osVersion: '14',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'IOS',
            id: '5',
            context: {
                clientName: 'IOS',
                clientVersion: '20.10.4',
                deviceMake: 'Apple',
                deviceModel: 'iPhone16,2',
                osName: 'iPhone',
                osVersion: '17.5.1.21F90',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'ANDROID_VR',
            id: '28',
            context: {
                clientName: 'ANDROID_VR',
                clientVersion: '1.62.27',
                androidSdkVersion: 32,
                osName: 'Android',
                osVersion: '12L',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'MWEB',
            id: '2',
            context: {
                clientName: 'MWEB',
                clientVersion: '2.20260401.01.00',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'WEB_EMBEDDED_PLAYER',
            id: '56',
            context: {
                clientName: 'WEB_EMBEDDED_PLAYER',
                clientVersion: '1.20260401.01.00',
                hl: 'es',
                gl: 'ES'
            }
        }
    ]);

    const TD_LATIN_LANG_RE = /^(?:es|en|pt|fr|it|de|ca|gl|nl|sv|no|da|ro|pl|cs|hu|fi|id|ms|tr)(?:-|$)/i;
    const TD_ROOT_SHORTS_MENU_RE = /(?:descripci[oó]n|description|guardar|playlist|modo ambiente|ambient mode|subt[ií]tulos|captions|subtitles|pantalla completa|full\s*screen|pista de audio|audio track|velocidad|playback speed|no me interesa|not interested|denunciar|report)/i;
    const TD_WATCH_MENU_RE = /(?:preguntar|ask|guardar|save|clip|descargar|download|mostrar transcripci|show transcript|denunciar|report|mirar sin anuncios|premium)/i;
    const TD_FORBIDDEN_CONTAINER_SEL = '#related, ytd-compact-video-renderer, ytd-lockup-view-model, yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-panel-video-renderer, ytd-comment-view-model, ytd-comment-thread-renderer, ytd-topbar-menu-button-renderer';

    /** Decode entities and normalize caption noise ([Música], >>, musical notes) in a cue string. */
    function cleanTranscriptCueText(rawText, cleanNoise = true) {
        let text = decodeHtmlEntities(String(rawText ?? ''), 2);
        if (cleanNoise) {
            text = text
                .replace(/\[.*?\]/g, '')
                .replace(/\s*>>\s*/g, ' ')
                .replace(/\s*[♪━]\s*/g, ' ');
        }
        return text.replace(/\s+/g, ' ').trim();
    }

    /** Format seconds into YouTube-a-TXT timestamp strings ("0:05", "12:34", "1:02:03"). */
    function formatTranscriptTimestamp(seconds) {
        const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        const secs = safe % 60;
        const p2 = n => String(n).padStart(2, '0');
        if (hours > 0) return `${hours}:${p2(minutes)}:${p2(secs)}`;
        return `${minutes}:${p2(secs)}`;
    }

    /** Group subtitle cues into readable <= blockSize character chunks preserving start/end timestamps. */
    function buildTranscriptBlocks(cues, blockSize = TD_BLOCK_SIZE) {
        if (!Array.isArray(cues) || !cues.length) return [];
        const blocks = [];
        let current = null;
        let curLen = 0;

        for (let i = 0; i < cues.length; i++) {
            const raw = cleanTranscriptCueText(cues[i]?.text, true);
            if (!raw) continue;
            const start = Number.isFinite(cues[i]?.start) ? cues[i].start : 0;
            const end = Number.isFinite(cues[i]?.end) && cues[i].end >= start ? cues[i].end : start + 4;

            if (current && curLen + raw.length + 1 <= blockSize) {
                current.end = end;
                current.parts.push(raw);
                curLen += raw.length + 1;
                continue;
            }
            if (current) {
                blocks.push({ start: current.start, end: current.end, text: current.parts.join(' ') });
            }
            current = { start, end, parts: [raw] };
            curLen = raw.length;
        }

        if (current) {
            blocks.push({ start: current.start, end: current.end, text: current.parts.join(' ') });
        }
        return blocks;
    }

    /** Format the full .txt export matching "Youtube a TXT" (title + youtu.be URL + timestamped 200-char blocks). */
    function buildTranscriptTxt(cues, { title = '', videoId = '', blockSize = TD_BLOCK_SIZE } = {}) {
        const blocks = buildTranscriptBlocks(cues, blockSize);
        const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
        const url = videoId ? `https://youtu.be/${videoId}` : '';
        const headParts = [cleanTitle, url].filter(Boolean);
        const head = headParts.length ? `${headParts.join('\n')}\n\n` : '';
        const body = blocks
            .map(b => `${formatTranscriptTimestamp(b.start)}\n${b.text}`)
            .join('\n\n');
        return head + body;
    }

    /** Sanitize video publish date and title into a safe Windows/macOS .txt filename. */
    function sanitizeTranscriptFilename(title, publishDate = '0000-00-00') {
        const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(publishDate || '').trim());
        const datePrefix = dateMatch ? dateMatch[1] : '0000-00-00';
        const cleanTitle = String(title ?? '')
            .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/g, '')
            .slice(0, 140) || 'Sin titulo';
        return `${datePrefix} ${cleanTitle}.txt`;
    }

    /** Pick the optimal caption track for transcript download relative to the user's IP language. */
    function chooseTranscriptDownloadTrack(captionTracks, userLang = 'es') {
        if (!Array.isArray(captionTracks) || !captionTracks.length) return null;
        const target = normalizeBaseLang(userLang) || 'es';

        const native = findBestNativeCaptionTrack(captionTracks, target);
        if (native) return { ...native, needsTranslate: false };

        const enManual = captionTracks.find(t => normalizeBaseLang(t.languageCode) === 'en' && t.kind !== 'asr');
        if (enManual) return { ...enManual, needsTranslate: target !== 'en' };

        const latinManual = captionTracks.find(t => TD_LATIN_LANG_RE.test(String(t.languageCode || '')) && t.kind !== 'asr');
        if (latinManual) return { ...latinManual, needsTranslate: normalizeBaseLang(latinManual.languageCode) !== target };

        const anyManual = captionTracks.find(t => t.kind !== 'asr');
        if (anyManual) return { ...anyManual, needsTranslate: normalizeBaseLang(anyManual.languageCode) !== target };

        const sourceAuto = findTranslationSourceTrack(captionTracks) || captionTracks[0];
        return {
            ...sourceAuto,
            needsTranslate: normalizeBaseLang(sourceAuto.languageCode) !== target
        };
    }

    function tdEncodeVarint(num) {
        const out = [];
        let n = num >>> 0;
        while (n > 127) {
            out.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        out.push(n);
        return out;
    }

    function tdEncodeProtoString(fieldNumber, str) {
        const strVal = String(str ?? '');
        const utf8 = typeof TextEncoder === 'function'
            ? Array.from(new TextEncoder().encode(strVal))
            : Array.from(unescape(encodeURIComponent(strVal)), c => c.charCodeAt(0));
        return [...tdEncodeVarint((fieldNumber << 3) | 2), ...tdEncodeVarint(utf8.length), ...utf8];
    }

    /** Build ordered protobuf parameter candidates for /youtubei/v1/get_transcript fallback queries. */
    function buildGetTranscriptParamsCandidates(videoId, langCode = 'es', kind = 'asr') {
        const vid = String(videoId || '').trim();
        if (!vid) return [];
        const langs = Array.from(new Set([langCode || 'es', 'es', 'es-419', 'en'].filter(Boolean)));
        const kinds = Array.from(new Set([kind ?? 'asr', 'asr', '']));
        const out = [];

        for (const lang of langs.slice(0, 3)) {
            for (const k of kinds.slice(0, 2)) {
                const inner = [
                    ...tdEncodeProtoString(1, k),
                    ...tdEncodeProtoString(2, lang),
                    ...tdEncodeProtoString(3, '')
                ];
                const innerB64 = encodeBase64Bytes(inner);
                out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), ...tdEncodeProtoString(2, encodeURIComponent(innerB64)), 0x18, 0x01]));
                out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), ...tdEncodeProtoString(2, innerB64), 0x18, 0x01]));
            }
        }
        out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), 0x18, 0x01]));
        return Array.from(new Set(out));
    }

    function tdBuildUrlWithParam(rawUrl, key, value) {
        if (!rawUrl) return '';
        const clean = String(rawUrl).replace(/\\u0026/g, '&');
        const re = new RegExp(`([?&])${key}=[^&]*`);
        if (re.test(clean)) return clean.replace(re, `$1${key}=${encodeURIComponent(value)}`);
        return `${clean}${clean.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
    }

    function tdExtractPublishDateFromPr(pr) {
        const mf = pr?.microformat?.playerMicroformatRenderer;
        const raw = mf?.publishDate || mf?.uploadDate || '';
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw));
        return m ? m[1] : '0000-00-00';
    }

    function tdCollectTranscriptParams(obj, depth = 0, out = new Set()) {
        if (!obj || typeof obj !== 'object' || depth > 14 || out.size >= 6) return out;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) tdCollectTranscriptParams(obj[i], depth + 1, out);
            return out;
        }
        if (typeof obj.getTranscriptEndpoint?.params === 'string' && obj.getTranscriptEndpoint.params) {
            out.add(obj.getTranscriptEndpoint.params);
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') tdCollectTranscriptParams(val, depth + 1, out);
        }
        return out;
    }

    function tdFindDomTitleAndDate(doc, win, videoId) {
        let title = '';
        let publishDate = '0000-00-00';
        if (!doc) return { title, publishDate };

        const isShorts = isShortsUrl(win?.location?.pathname || '');
        const titleSels = isShorts
            ? [
                'ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model',
                'ytd-reel-video-renderer[is-active] h2',
                'ytd-reel-video-renderer[is-active] #video-title'
            ]
            : [
                'ytd-watch-metadata h1 yt-formatted-string',
                'ytd-watch-metadata h1',
                '#title h1'
            ];
        for (const sel of titleSels) {
            const el = doc.querySelector?.(sel);
            const txt = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt) {
                title = txt;
                break;
            }
        }
        if (!title && doc.title) {
            const cleaned = String(doc.title).replace(/\s*-\s*YouTube$/i, '').trim();
            if (cleaned && !/^YouTube$/i.test(cleaned)) title = cleaned;
        }

        const metaDate = doc.querySelector?.('meta[itemprop="datePublished"], meta[itemprop="uploadDate"]')?.getAttribute?.('content');
        const dm = /^(\d{4}-\d{2}-\d{2})/.exec(String(metaDate || ''));
        if (dm) {
            publishDate = dm[1];
        } else {
            const ldNode = doc.querySelector?.('#microformat script[type="application/ld+json"]');
            const ldMatch = /"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(String(ldNode?.textContent || ''));
            if (ldMatch) publishDate = ldMatch[1];
        }

        if (videoId && title === videoId) title = '';
        return { title, publishDate };
    }

    function tdParsePlayerSummary(pr, sourceName) {
        if (!pr || typeof pr !== 'object') return null;
        const vd = pr.videoDetails || {};
        const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        return {
            source: sourceName,
            videoId: vd.videoId || '',
            title: String(vd.title || '').replace(/\s+/g, ' ').trim(),
            publishDate: tdExtractPublishDateFromPr(pr),
            captionTracks: Array.isArray(tracks) ? tracks : [],
            adaptiveFormats: Array.isArray(pr.streamingData?.adaptiveFormats) ? pr.streamingData.adaptiveFormats : []
        };
    }

    function tdGetYtCfg(win) {
        const ytcfg = win?.ytcfg;
        const fullCtx = ytcfg?.get?.('INNERTUBE_CONTEXT') || null;
        const apiKey = ytcfg?.get?.('INNERTUBE_API_KEY') || '';
        const clientVersion = ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION') || '2.20260401.01.00';
        const clientName = ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_NAME') || '1';
        const hl = ytcfg?.get?.('HL') || fullCtx?.client?.hl || 'es';
        const gl = ytcfg?.get?.('GL') || fullCtx?.client?.gl || 'ES';
        const visitorData = ytcfg?.get?.('VISITOR_DATA') || fullCtx?.client?.visitorData || '';
        return { fullCtx, apiKey, clientVersion, clientName, hl, gl, visitorData };
    }

    async function tdPostInnertubeJson({ endpoint, payload, headers = {}, anonymous = false, win, requestFn, timeout = 6500 }) {
        const origin = win?.location?.origin || 'https://www.youtube.com';
        const cfg = tdGetYtCfg(win);
        const keyPart = cfg.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '';
        const url = `${origin}/youtubei/v1/${endpoint}?prettyPrint=false${keyPart}`;
        const bodyStr = JSON.stringify(payload);
        const reqHeaders = { 'Content-Type': 'application/json', ...headers };

        if (typeof win?.fetch === 'function') {
            try {
                const resp = await win.fetch(url, {
                    method: 'POST',
                    credentials: anonymous ? 'omit' : 'include',
                    headers: reqHeaders,
                    body: bodyStr
                });
                if (resp?.ok) {
                    const txt = typeof resp.text === 'function' ? await resp.text() : JSON.stringify(await resp.json());
                    return { status: resp.status || 200, data: JSON.parse(txt) };
                }
                if (resp?.status === 400 || resp?.status === 403 || resp?.status === 429) {
                    return { status: resp.status, data: null };
                }
            } catch {}
        }

        if (typeof requestFn === 'function') {
            try {
                const res = await requestFn(url, {
                    method: 'POST',
                    headers: reqHeaders,
                    body: bodyStr,
                    anonymous,
                    timeout
                });
                if (res?.status === 200 && res.text) {
                    return { status: 200, data: JSON.parse(res.text) };
                }
                return { status: res?.status || 0, data: null };
            } catch {}
        }
        return { status: 0, data: null };
    }

    async function tdResolveVideoMetadata({ videoId, titleHint = '', dateHint = '0000-00-00', doc, win, requestFn }) {
        const domInfo = tdFindDomTitleAndDate(doc, win, videoId);
        const hasExplicitHint = Boolean(String(titleHint || '').trim());
        let title = String(titleHint || '').trim();
        let publishDate = /^(\d{4}-\d{2}-\d{2})/.test(String(dateHint || '')) && dateHint !== '0000-00-00'
            ? dateHint.slice(0, 10)
            : domInfo.publishDate;
        let captionTracks = [];
        let audioLang = '';

        const absorbPr = pr => {
            if (!pr || (pr.videoDetails?.videoId && pr.videoDetails.videoId !== videoId)) return;
            const summary = tdParsePlayerSummary(pr, 'DOM');
            if (!summary) return;
            if (!hasExplicitHint && summary.title) title = summary.title;
            if (publishDate === '0000-00-00' && summary.publishDate !== '0000-00-00') publishDate = summary.publishDate;
            if (!captionTracks.length && summary.captionTracks.length) captionTracks = summary.captionTracks;
            if (!audioLang) {
                audioLang = detectVideoAudioLang({
                    adaptiveFormats: summary.adaptiveFormats,
                    captionTracks: summary.captionTracks
                });
            }
        };

        const player = selectActivePlayer(doc, win?.location?.pathname || '', videoId);
        try { absorbPr(player?.getPlayerResponse?.()); } catch {}
        try {
            const pVid = player?.getVideoData?.()?.video_id;
            const audioCaps = (!pVid || pVid === videoId) ? player?.getAudioTrack?.()?.captionTracks : null;
            if (!captionTracks.length && Array.isArray(audioCaps) && audioCaps.length) {
                captionTracks = audioCaps;
            }
        } catch {}
        try { absorbPr(win?.ytInitialPlayerResponse); } catch {}

        const cfg = tdGetYtCfg(win);
        if (!captionTracks.length || publishDate === '0000-00-00' || !title) {
            const webRes = await tdPostInnertubeJson({
                endpoint: 'player',
                payload: {
                    context: {
                        client: {
                            clientName: 'WEB',
                            clientVersion: cfg.clientVersion,
                            hl: cfg.hl,
                            gl: cfg.gl,
                            ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
                        }
                    },
                    videoId,
                    contentCheckOk: true,
                    racyCheckOk: true
                },
                headers: {
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': String(cfg.clientVersion)
                },
                anonymous: false,
                win,
                requestFn
            });
            absorbPr(webRes.data);
        }

        if (!title) title = domInfo.title;

        const clientTrackSets = [];
        if (captionTracks.length) {
            clientTrackSets.push({ source: 'WEB', tracks: captionTracks });
        }

        // Query ANDROID first, then probe remaining Innertube clients in parallel if needed.
        let checkedMobileClients = false;
        const needsMobileClient = !captionTracks.length;
        if (needsMobileClient) {
            checkedMobileClients = true;
            const results = await tdProbeInnertubeClients(videoId, cfg, win, requestFn);
            for (const { cli, sum } of results) {
                if (!sum) continue;
                if (!title && sum.title) title = sum.title;
                if (publishDate === '0000-00-00' && sum.publishDate !== '0000-00-00') publishDate = sum.publishDate;
                if (!audioLang) {
                    audioLang = detectVideoAudioLang({
                        adaptiveFormats: sum.adaptiveFormats,
                        captionTracks: sum.captionTracks
                    });
                }
                if (sum.captionTracks.length) {
                    clientTrackSets.push({ source: cli.name, tracks: sum.captionTracks });
                    if (!captionTracks.length) captionTracks = sum.captionTracks;
                }
            }
        }

        return {
            title: title || videoId,
            publishDate,
            captionTracks,
            clientTrackSets,
            audioLang,
            checkedMobileClients
        };
    }

    async function tdFetchTrackCues(baseUrl, targetLang, needsTranslate, win, requestFn) {
        if (!baseUrl) return null;
        const formats = ['json3', 'srv3', 'vtt'];
        const urls = [];
        if (needsTranslate && targetLang) {
            for (const fmt of formats) {
                urls.push({ url: tdBuildUrlWithParam(tdBuildUrlWithParam(baseUrl, 'tlang', targetLang), 'fmt', fmt), lang: targetLang });
            }
        }
        for (const fmt of formats) {
            urls.push({ url: tdBuildUrlWithParam(baseUrl, 'fmt', fmt), lang: '' });
        }
        urls.push({ url: String(baseUrl).replace(/\\u0026/g, '&'), lang: '' });

        for (let i = 0; i < urls.length; i++) {
            const entry = urls[i];
            let status = 0;
            let text = '';
            if (typeof win?.fetch === 'function') {
                try {
                    const resp = await win.fetch(entry.url, { credentials: 'include' });
                    status = resp?.status || 0;
                    if (status === 200) text = await resp.text();
                } catch {}
            }
            if (status === 0 && typeof requestFn === 'function') {
                try {
                    const res = await requestFn(entry.url, { method: 'GET', timeout: 6000 });
                    status = res?.status || 0;
                    if (status === 200) text = res.text || '';
                } catch {}
            }
            if (status === 429) {
                return { rateLimited: true, cues: [] };
            }
            if (status === 200 && text) {
                const parsed = parseTimedtextResponseText(text);
                if (parsed.length) return { rateLimited: false, cues: parsed, lang: entry.lang };
            }
        }
        return { rateLimited: false, cues: [] };
    }

    async function tdFetchClientSummary(cli, videoId, cfg, win, requestFn) {
        const res = await tdPostInnertubeJson({
            endpoint: 'player',
            payload: {
                context: {
                    client: {
                        ...cli.context,
                        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
                    },
                    ...(cli.name === 'WEB_EMBEDDED_PLAYER' ? { thirdParty: { embedUrl: 'https://www.youtube.com/' } } : {})
                },
                videoId,
                contentCheckOk: true,
                racyCheckOk: true
            },
            headers: {
                'X-YouTube-Client-Name': cli.id,
                'X-YouTube-Client-Version': cli.context.clientVersion,
                ...(cfg.visitorData ? { 'X-Goog-Visitor-Id': cfg.visitorData } : {})
            },
            anonymous: true,
            win,
            requestFn
        });
        return { cli, sum: tdParsePlayerSummary(res.data, cli.name) };
    }

    async function tdProbeInnertubeClients(videoId, cfg, win, requestFn) {
        if (!TD_INNERTUBE_CLIENTS.length) return [];
        const first = await tdFetchClientSummary(TD_INNERTUBE_CLIENTS[0], videoId, cfg, win, requestFn)
            .catch(() => ({ cli: TD_INNERTUBE_CLIENTS[0], sum: null }));
        if (first?.sum?.captionTracks?.length) return [first];
        const rest = await Promise.all(
            TD_INNERTUBE_CLIENTS.slice(1).map(cli =>
                tdFetchClientSummary(cli, videoId, cfg, win, requestFn).catch(() => ({ cli, sum: null }))
            )
        );
        return [first, ...rest];
    }

    async function tdFetchMobileCaptionTracks(videoId, cfg, win, requestFn) {
        const results = await tdProbeInnertubeClients(videoId, cfg, win, requestFn);
        for (const { sum } of results) {
            if (sum?.captionTracks?.length) return sum.captionTracks;
        }
        return [];
    }

    async function tdFetchViaGetTranscript(videoId, chosenTrack, doc, win, requestFn) {
        const cfg = tdGetYtCfg(win);
        const paramSet = new Set();
        if (win?.ytInitialData) {
            const initialVid = win.ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId;
            if (!initialVid || initialVid === videoId) {
                tdCollectTranscriptParams(win.ytInitialData, 0, paramSet);
            }
        }
        if (!paramSet.size) {
            const nextRes = await tdPostInnertubeJson({
                endpoint: 'next',
                payload: {
                    context: cfg.fullCtx || { client: { clientName: 'WEB', clientVersion: cfg.clientVersion, hl: cfg.hl, gl: cfg.gl } },
                    videoId
                },
                headers: { 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': String(cfg.clientVersion) },
                anonymous: false,
                win,
                requestFn
            });
            if (nextRes.data) tdCollectTranscriptParams(nextRes.data, 0, paramSet);
        }
        const hadKnownParam = paramSet.size > 0;
        for (const p of buildGetTranscriptParamsCandidates(videoId, chosenTrack?.languageCode || 'es', chosenTrack?.kind ?? 'asr')) {
            paramSet.add(p);
        }

        const candidates = Array.from(paramSet).slice(0, 5);
        const context = cfg.fullCtx || {
            client: {
                clientName: 'WEB',
                clientVersion: cfg.clientVersion,
                hl: cfg.hl,
                gl: cfg.gl,
                ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
            }
        };
        const headers = {
            'X-YouTube-Client-Name': String(cfg.clientName || '1'),
            'X-YouTube-Client-Version': String(cfg.clientVersion)
        };

        const queryTranscript = params => tdPostInnertubeJson({
            endpoint: 'get_transcript',
            payload: { context, params },
            headers,
            anonymous: false,
            win,
            requestFn
        });

        let batch = candidates;
        if (hadKnownParam && candidates.length) {
            const firstRes = await queryTranscript(candidates[0]);
            if (firstRes.data) {
                const parsed = parseTranscriptPanelResponse(firstRes.data);
                if (parsed.length) return parsed;
            }
            if (firstRes.status === 400 || firstRes.status === 403 || firstRes.status === 429) return [];
            batch = candidates.slice(1);
        }
        if (batch.length) {
            const rest = await Promise.all(batch.map(p => queryTranscript(p).catch(() => ({ status: 0, data: null }))));
            for (const res of rest) {
                if (res.data) {
                    const parsed = parseTranscriptPanelResponse(res.data);
                    if (parsed.length) return parsed;
                }
            }
        }
        return [];
    }

    function tdReadDomTranscriptSegments(doc) {
        if (!doc?.querySelectorAll) return [];
        const nodes = doc.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        const cues = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const tsEl = node.querySelector?.('.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp');
            const txtEl = node.querySelector?.('.segment-text, yt-formatted-string, span[role="text"], .yt-core-attributed-string');
            const body = String(txtEl?.textContent || '').replace(/\s+/g, ' ').trim();
            if (!body) continue;
            const sec = parseTimestampSeconds(tsEl?.textContent || '0:00');
            cues.push({
                start: Number.isFinite(sec) ? sec : 0,
                end: (Number.isFinite(sec) ? sec : 0) + 3,
                text: body
            });
        }
        return cues;
    }

    function tdLooksLikeSpanish(cues) {
        const sample = cues.slice(0, 12).map(c => String(c.text || '').toLowerCase()).join(' ');
        if (/[áéíóúñü¿¡]/.test(sample)) return true;
        const esHits = (sample.match(/\b(?:que|de|la|el|en|y|un|una|los|las|para|por|con|como|pero|más|este|esta)\b/g) || []).length;
        const enHits = (sample.match(/\b(?:the|and|that|with|this|for|you|are|was|have|from|they|what)\b/g) || []).length;
        return esHits > enHits;
    }

    function tdInferCueLang({ explicitLang, cues, meta, baseUser }) {
        const normExplicit = normalizeBaseLang(explicitLang);
        if (normExplicit) return normExplicit;

        const trackLangs = Array.from(new Set((meta.captionTracks || []).map(t => normalizeBaseLang(t.languageCode)).filter(Boolean)));
        if (trackLangs.length === 1) return trackLangs[0];

        if (baseUser === 'es' && cues.length) {
            return tdLooksLikeSpanish(cues) ? 'es' : (meta.audioLang || 'auto');
        }
        if (meta.audioLang) return meta.audioLang;
        return trackLangs[0] || 'auto';
    }

    async function tdTranslateCuesInBatches(cues, sourceLang, targetLang, requestFn) {
        const translated = [];
        let idx = 0;
        while (idx < cues.length) {
            const batch = [];
            let encodedLen = 0;
            while (idx < cues.length && batch.length < 25) {
                const clean = cleanTranscriptCueText(cues[idx].text, false);
                const cost = encodeURIComponent(`${clean}\n`).length;
                if (batch.length > 0 && encodedLen + cost > 1300) break;
                batch.push({ ...cues[idx], clean });
                encodedLen += cost;
                idx++;
            }
            const texts = batch.map(b => b.clean);
            const outTexts = await translateCueBatch({
                texts,
                sourceLang: sourceLang || 'auto',
                targetLang,
                requestFn
            });
            for (let j = 0; j < batch.length; j++) {
                translated.push({
                    ...batch[j],
                    text: outTexts[j] || batch[j].clean
                });
            }
        }
        return translated;
    }

    function tdIsServerTranslatedResponse(cues, returnedLang, origLang, baseUser) {
        if (!returnedLang || origLang === baseUser) return false;
        if (baseUser !== 'es') return true;
        return tdLooksLikeSpanish(cues);
    }

    /** Shared 7-layer YouTube caption/transcript recovery used by both live subtitles and TXT export. */
    async function tdRecoverRawSubtitleCues({
        videoId,
        userLang = 'es',
        titleHint = '',
        dateHint = '0000-00-00',
        captionTracksHint = [],
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        requestFn = gmRequest
    } = {}) {
        const vid = String(videoId || getVideoId(win?.location?.href || '') || '').trim();
        const baseUser = normalizeBaseLang(userLang) || 'es';
        const meta = await tdResolveVideoMetadata({ videoId: vid, titleHint, dateHint, doc, win, requestFn });
        if (!meta.captionTracks.length && Array.isArray(captionTracksHint) && captionTracksHint.length) {
            meta.captionTracks = captionTracksHint;
            if (!meta.audioLang) {
                meta.audioLang = detectVideoAudioLang({ captionTracks: meta.captionTracks });
            }
        }
        const chosen = chooseTranscriptDownloadTrack(meta.captionTracks, baseUser);

        let cues = [];
        let sourceLang = '';
        let alreadyTranslated = false;
        const st = getTtState(win);

        // Layer 1a: Live timedtext cache captured during playback.
        const cachedOrigin = st.originCuesByVid.get(vid);
        if (cachedOrigin?.cues?.length) {
            const cachedBase = normalizeBaseLang(cachedOrigin.lang);
            if (!chosen || normalizeBaseLang(chosen.languageCode) === cachedBase || cachedBase === baseUser) {
                cues = cachedOrigin.cues;
                sourceLang = cachedBase;
            }
        }

        // Layer 1b: Captured / PerformanceObserver PO-token timedtext URL.
        const perfRawUrl = st.rawUrlsByVid.get(vid) || collectPerformanceTimedtextUrl(win, vid);
        if (!cues.length && perfRawUrl && (!st.directBlockedByVid.has(vid) || perfRawUrl.includes('pot=')) && typeof win?.fetch === 'function') {
            try {
                const resp = await win.fetch(perfRawUrl, { credentials: 'include' });
                if (resp?.ok) {
                    const parsed = parseTimedtextResponseText(await resp.text());
                    if (parsed.length) {
                        cues = parsed;
                        sourceLang = normalizeBaseLang(new URL(perfRawUrl).searchParams.get('lang'));
                        st.originCuesByVid.set(vid, { lang: sourceLang, cues: parsed, ts: Date.now() });
                    }
                }
            } catch {}
        }

        // Layer 1c: Direct track fetch on active tracks; retry via ANDROID/IOS/ANDROID_VR/MWEB on empty/429.
        const rateLimited = st.directBlockedByVid.has(vid);
        if (!cues.length && chosen?.baseUrl && !rateLimited) {
            const directRes = await tdFetchTrackCues(chosen.baseUrl, baseUser, chosen.needsTranslate, win, requestFn);
            if (!directRes?.rateLimited && directRes?.cues?.length) {
                cues = directRes.cues;
                const origLang = normalizeBaseLang(chosen.languageCode);
                const serverTranslated = tdIsServerTranslatedResponse(cues, directRes.lang, origLang, baseUser);
                alreadyTranslated = serverTranslated;
                sourceLang = serverTranslated ? normalizeBaseLang(directRes.lang) : origLang;
            }
        }

        if (!cues.length && !meta.checkedMobileClients) {
            const cfg = tdGetYtCfg(win);
            const mobileTracks = await tdFetchMobileCaptionTracks(vid, cfg, win, requestFn);
            if (mobileTracks.length) {
                if (!meta.captionTracks.length) meta.captionTracks = mobileTracks;
                if (!meta.audioLang) meta.audioLang = detectVideoAudioLang({ captionTracks: mobileTracks });
                const mobileChosen = chooseTranscriptDownloadTrack(mobileTracks, baseUser);
                const mobRes = await tdFetchTrackCues(mobileChosen.baseUrl, baseUser, mobileChosen.needsTranslate, win, requestFn);
                if (mobRes?.cues?.length) {
                    cues = mobRes.cues;
                    const origLang = normalizeBaseLang(mobileChosen.languageCode);
                    const serverTranslated = tdIsServerTranslatedResponse(cues, mobRes.lang, origLang, baseUser);
                    alreadyTranslated = serverTranslated;
                    sourceLang = serverTranslated ? normalizeBaseLang(mobRes.lang) : origLang;
                }
            }
        }

        // Layer 1d + 1e: Innertube get_panel and /next + get_transcript in parallel.
        if (!cues.length) {
            const [panelCues, trCues] = await Promise.all([
                fetchTranscriptViaGetPanel(vid, win).catch(() => []),
                tdFetchViaGetTranscript(vid, chosen, doc, win, requestFn).catch(() => [])
            ]);
            const bestCues = panelCues.length ? panelCues : trCues;
            if (bestCues.length) {
                cues = bestCues;
                sourceLang = tdInferCueLang({ explicitLang: '', cues: bestCues, meta, baseUser });
            }
        }

        // Layer 1f: Active /watch DOM transcript panel segments.
        if (!cues.length && !isShortsUrl(win?.location?.pathname || '') && getVideoId(win?.location?.href || '') === vid) {
            const domCues = tdReadDomTranscriptSegments(doc);
            if (domCues.length) {
                cues = domCues;
                sourceLang = tdInferCueLang({ explicitLang: '', cues: domCues, meta, baseUser });
            }
        }

        const effectiveSource = sourceLang || tdInferCueLang({ explicitLang: '', cues, meta, baseUser });
        return {
            videoId: vid,
            segments: cues,
            cues,
            lang: effectiveSource,
            alreadyTranslated,
            audioLang: meta.audioLang || detectVideoAudioLang({ captionTracks: meta.captionTracks }),
            captionTracks: meta.captionTracks,
            meta
        };
    }

    /** Multi-layer single video / Short transcript extractor, translator, and .txt formatter. */
    async function extractVideoTranscript({
        videoId,
        userLang = 'es',
        titleHint = '',
        dateHint = '0000-00-00',
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        requestFn = gmRequest
    } = {}) {
        const vid = String(videoId || getVideoId(win?.location?.href || '') || '').trim();
        if (!vid) {
            const err = new Error('No se detectó el ID del video');
            err.noCaptions = true;
            throw err;
        }

        const baseUser = normalizeBaseLang(userLang) || 'es';
        const recovered = await tdRecoverRawSubtitleCues({
            videoId: vid,
            userLang: baseUser,
            titleHint,
            dateHint,
            doc,
            win,
            requestFn
        });
        let cues = recovered.cues;
        const meta = recovered.meta;

        if (!cues.length) {
            const err = new Error('Este video no tiene transcripción ni subtítulos disponibles');
            err.noCaptions = true;
            throw err;
        }

        let translated = Boolean(recovered.alreadyTranslated);
        const effectiveSource = tdInferCueLang({ explicitLang: recovered.lang, cues, meta, baseUser });
        if (!translated && effectiveSource !== baseUser) {
            cues = await tdTranslateCuesInBatches(cues, effectiveSource, baseUser, requestFn);
            translated = true;
        }

        const text = buildTranscriptTxt(cues, {
            title: meta.title,
            videoId: vid,
            blockSize: TD_BLOCK_SIZE
        });
        if (!text.trim()) {
            const err = new Error('Transcripción vacía');
            err.noCaptions = true;
            throw err;
        }

        return {
            videoId: vid,
            title: meta.title,
            publishDate: meta.publishDate,
            lang: translated ? baseUser : effectiveSource,
            translated,
            cueCount: cues.length,
            filename: sanitizeTranscriptFilename(meta.title, meta.publishDate),
            text
        };
    }

    function tdTriggerBlobDownload(doc, content, filename) {
        if (!doc) return;
        const bytes = typeof TextEncoder === 'function'
            ? new TextEncoder().encode(content)
            : content;
        const blob = new Blob([bytes], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        a.addEventListener?.('click', e => e.stopPropagation?.());
        (doc.body || doc.documentElement).appendChild(a);
        a.click();
        setTimeout(() => {
            try { a.remove?.(); } catch {}
            try { URL.revokeObjectURL(url); } catch {}
        }, 10000);
    }

    async function tdCopyTextToClipboard(win, doc, text) {
        if (typeof GM_setClipboard === 'function') {
            try {
                GM_setClipboard(text, 'text');
                return true;
            } catch {}
        }
        try {
            if (win?.navigator?.clipboard?.writeText) {
                await win.navigator.clipboard.writeText(text);
                return true;
            }
        } catch {}
        try {
            if (doc?.createElement && typeof doc.execCommand === 'function') {
                const ta = doc.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                (doc.body || doc.documentElement).appendChild(ta);
                ta.select();
                const ok = doc.execCommand('copy');
                ta.remove();
                return Boolean(ok);
            }
        } catch {}
        return false;
    }

    function tdEnsureStyles(doc) {
        if (!doc?.createElement || doc.getElementById?.(TD_STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = TD_STYLE_ID;
        style.textContent = `
            [${TD_ITEM_ATTR}="1"] {
                display: flex;
                align-items: center;
                gap: 16px;
                box-sizing: border-box;
                width: 100%;
                min-height: 40px;
                padding: 0 16px;
                border: 0;
                margin: 0;
                background: transparent;
                color: var(--yt-spec-text-primary, #0f0f0f);
                font-family: "Roboto", "Arial", sans-serif;
                font-size: 14px;
                font-weight: 400;
                line-height: 20px;
                white-space: nowrap;
                text-align: left;
                cursor: pointer;
                user-select: none;
                transition: background-color 0.12s ease;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-shorts {
                gap: 12px;
                padding: 0 16px;
                min-height: 40px;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-watch {
                gap: 16px;
                padding: 0 12px 0 16px;
                min-height: 36px;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-dark {
                color: var(--yt-spec-text-primary, #f1f1f1);
            }
            [${TD_ITEM_ATTR}="1"]:hover,
            [${TD_ITEM_ATTR}="1"]:focus-visible {
                background-color: var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.14));
                outline: none;
            }
            [${TD_ITEM_ATTR}="1"][data-busy="1"] {
                opacity: 0.72;
                cursor: wait;
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                flex-shrink: 0;
                color: inherit;
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-icon-img {
                display: block;
                width: 22px;
                height: 22px;
                object-fit: contain;
                pointer-events: none;
                filter: brightness(0) invert(0.06);
            }
            html[dark] [${TD_ITEM_ATTR}="1"] .supratube-td-icon-img,
            [${TD_ITEM_ATTR}="1"].supratube-td-dark .supratube-td-icon-img {
                filter: brightness(0) invert(0.945);
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-label {
                flex: 1 1 auto;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #${TD_TOAST_ID} {
                position: fixed;
                left: 50%;
                bottom: 24px;
                transform: translateX(-50%);
                z-index: 999999;
                padding: 10px 16px;
                border-radius: 8px;
                background: rgba(15, 15, 18, 0.94);
                color: #f8fafc;
                border: 1px solid rgba(255, 255, 255, 0.14);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
                font: 500 13px/1.4 "Roboto", "Arial", sans-serif;
                pointer-events: none;
                white-space: nowrap;
            }
            #${TD_TOAST_ID}[data-kind="error"] {
                border-color: rgba(248, 113, 113, 0.45);
            }
        `;
        (doc.head || doc.documentElement)?.appendChild(style);
    }

    function tdShowToast(doc, message, kind = 'ok', durationMs = 3200) {
        if (!doc?.createElement) return;
        tdEnsureStyles(doc);
        let toast = doc.getElementById?.(TD_TOAST_ID);
        if (!toast) {
            toast = doc.createElement('div');
            toast.id = TD_TOAST_ID;
            (doc.body || doc.documentElement)?.appendChild(toast);
        }
        toast.setAttribute?.('data-kind', kind);
        toast.textContent = message;
        clearTimeout(toast.__supratubeHideTimer);
        toast.__supratubeHideTimer = setTimeout(() => {
            try { toast.remove?.(); } catch {}
        }, durationMs);
    }

    function tdBuildDownloadIcon(doc) {
        const wrap = doc.createElement('span');
        wrap.className = 'supratube-td-icon';
        wrap.setAttribute('aria-hidden', 'true');
        const img = doc.createElement('img');
        img.className = 'supratube-td-icon-img';
        img.src = TD_HEROICON_SVG_URL;
        img.setAttribute('src', TD_HEROICON_SVG_URL);
        img.setAttribute('width', '22');
        img.setAttribute('height', '22');
        img.setAttribute('alt', '');
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('decoding', 'async');
        img.setAttribute('referrerpolicy', 'no-referrer');
        let usedFallback = false;
        img.addEventListener?.('error', () => {
            if (usedFallback) return;
            usedFallback = true;
            img.src = TD_HEROICON_FALLBACK_URL;
            img.setAttribute('src', TD_HEROICON_FALLBACK_URL);
        });
        wrap.appendChild(img);
        return wrap;
    }

    function tdIsDarkTheme(doc, sibColor) {
        const m = String(sibColor || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
            return lum > 128;
        }
        return Boolean(
            doc?.documentElement?.hasAttribute?.('dark') ||
            doc?.documentElement?.hasAttribute?.('darker-dark-theme')
        );
    }

    function tdIsDropdownVisible(dropdown, win) {
        if (!dropdown) return false;
        if (dropdown.getAttribute?.('aria-hidden') === 'true') return false;
        if (dropdown.style?.display === 'none' || dropdown.style?.visibility === 'hidden') return false;
        if (typeof win?.getComputedStyle === 'function') {
            const cs = win.getComputedStyle(dropdown);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        return (dropdown.offsetWidth === undefined || dropdown.offsetWidth > 0) &&
            (dropdown.offsetHeight === undefined || dropdown.offsetHeight > 0);
    }

    function tdIsShortsSubmenu(sheet, listEl) {
        const header = sheet?.querySelector?.('.ytContextualSheetLayoutHeaderContainer');
        if (header) {
            const hdrText = String(header.textContent || '').trim();
            if (hdrText.length > 0 || Boolean(header.querySelector?.('h2, yt-panel-header-view-model'))) {
                return true;
            }
        }
        const items = listEl?.querySelectorAll?.('yt-list-item-view-model') || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].getAttribute?.(TD_ITEM_ATTR) === '1') continue;
            const role = items[i].getAttribute?.('role');
            if (role === 'menuitemradio' || items[i].getAttribute?.('aria-checked') === 'true') return true;
            const txt = String(items[i].textContent || '').trim();
            if (/^(?:0\.\d+|1\.\d+|2(?:\.0+)?|normal)$/i.test(txt)) return true;
        }
        return false;
    }

    function tdIdentifyMenuTarget(dropdown, win, lastTrigger) {
        const shortsMode = isShortsUrl(win?.location?.pathname || '');
        const sheet = dropdown.querySelector?.('yt-sheet-view-model');
        const sheetList = sheet?.querySelector?.('yt-list-view-model[role="menu"], yt-list-view-model');

        if (shortsMode && sheet && sheetList) {
            if (tdIsShortsSubmenu(sheet, sheetList)) {
                return { ok: false, staleItemContainer: sheetList };
            }
            const pos = dropdown.positionTarget;
            if (pos?.closest?.(TD_FORBIDDEN_CONTAINER_SEL)) return { ok: false };
            const items = sheetList.querySelectorAll?.('yt-list-item-view-model') || [];
            const hasRootAction = Array.from(items).some(el => TD_ROOT_SHORTS_MENU_RE.test(String(el.textContent || '')));
            const fromShortsTrigger = Boolean(pos?.closest?.('ytd-reel-video-renderer, ytd-shorts')) ||
                (lastTrigger?.kind === 'shorts' && Date.now() - lastTrigger.ts < 2500);
            if (!hasRootAction && !fromShortsTrigger) return { ok: false };
            return { ok: true, kind: 'shorts', popup: sheet, listEl: sheetList };
        }

        const menuPopup = dropdown.querySelector?.('ytd-menu-popup-renderer');
        const listbox = menuPopup?.querySelector?.('tp-yt-paper-listbox#items, tp-yt-paper-listbox');
        const watchList = listbox || (sheet && sheetList ? sheetList : null);
        const popupWrapper = menuPopup || sheet;
        if (!watchList || !popupWrapper) return { ok: false };

        const pos = dropdown.positionTarget;
        if (pos) {
            if (pos.closest?.(TD_FORBIDDEN_CONTAINER_SEL)) return { ok: false };
            if (pos.closest?.('ytd-watch-metadata, ytd-video-primary-info-renderer')) {
                return { ok: true, kind: 'watch', popup: popupWrapper, listEl: watchList };
            }
            return { ok: false };
        }

        const recentWatch = lastTrigger?.kind === 'watch' && Date.now() - lastTrigger.ts < 2500;
        const itemTexts = Array.from(watchList.children || []).map(el => String(el.textContent || ''));
        const hasWatchAction = itemTexts.some(t => TD_WATCH_MENU_RE.test(t));
        if (recentWatch || (!shortsMode && hasWatchAction && lastTrigger?.kind !== 'other')) {
            return { ok: true, kind: 'watch', popup: popupWrapper, listEl: watchList };
        }
        return { ok: false };
    }

    function tdExpandPopupBounds(popup, win) {
        if (!popup?.style) return;
        const rect = popup.getBoundingClientRect?.() || {};
        const maxAvailW = Math.max(250, (win?.innerWidth || 1280) - 24);
        const maxAvailH = Math.max(220, (win?.innerHeight || 900) - Math.max(0, Number(rect.top) || 0) - 16);

        const curMaxW = parseFloat(popup.style.maxWidth);
        if (Number.isFinite(curMaxW) && curMaxW > 0 && curMaxW < 250) {
            const nextW = `${Math.min(maxAvailW, 270)}px`;
            if (popup.dataset) {
                if (!Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxW')) {
                    popup.dataset.supratubeOrigMaxW = popup.style.maxWidth;
                }
                popup.dataset.supratubeSetMaxW = nextW;
            }
            popup.style.maxWidth = nextW;
        }
        const curMaxH = parseFloat(popup.style.maxHeight);
        if (Number.isFinite(curMaxH) && curMaxH > 0) {
            const nextH = `${Math.min(maxAvailH, curMaxH + 56)}px`;
            if (popup.dataset) {
                if (!Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxH')) {
                    popup.dataset.supratubeOrigMaxH = popup.style.maxHeight;
                }
                popup.dataset.supratubeSetMaxH = nextH;
            }
            popup.style.maxHeight = nextH;
        }
    }

    function tdRestorePopupBounds(popup) {
        if (!popup?.style || !popup.dataset) return;
        if (Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxW')) {
            if (popup.style.maxWidth === popup.dataset.supratubeSetMaxW) {
                popup.style.maxWidth = popup.dataset.supratubeOrigMaxW;
            }
            delete popup.dataset.supratubeOrigMaxW;
            delete popup.dataset.supratubeSetMaxW;
        }
        if (Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxH')) {
            if (popup.style.maxHeight === popup.dataset.supratubeSetMaxH) {
                popup.style.maxHeight = popup.dataset.supratubeOrigMaxH;
            }
            delete popup.dataset.supratubeOrigMaxH;
            delete popup.dataset.supratubeSetMaxH;
        }
    }

    function tdFindInsertionRef(listEl, kind) {
        const kids = Array.from(listEl?.children || []);
        if (kind === 'shorts') {
            for (let i = 0; i < kids.length; i++) {
                const txt = String(kids[i].textContent || '');
                if (/subt[ií]tulos|captions|subtitles/i.test(txt)) {
                    return kids[i + 1] || null;
                }
            }
            for (let i = 0; i < kids.length; i++) {
                const txt = String(kids[i].textContent || '');
                if (/descripci[oó]n|description/i.test(txt)) {
                    return kids[i + 1] || null;
                }
            }
        }
        for (let i = 0; i < kids.length; i++) {
            const txt = String(kids[i].textContent || '');
            if (/denunciar|report|no me interesa|not interested/i.test(txt)) {
                return kids[i];
            }
        }
        return null;
    }

    function tdCreateMenuItem(doc, kind, siblingHeight, siblingColor, isDark, onActivate) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = `supratube-td-menuitem supratube-td-${kind === 'watch' ? 'watch' : 'shorts'}${isDark ? ' supratube-td-dark' : ''}`;
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute(TD_ITEM_ATTR, '1');
        if (siblingHeight >= 34 && siblingHeight <= 56) {
            btn.style.minHeight = `${siblingHeight}px`;
        }
        if (siblingColor && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(siblingColor)) {
            btn.style.color = siblingColor;
        }

        const icon = tdBuildDownloadIcon(doc);
        const label = doc.createElement('span');
        label.className = 'supratube-td-label';
        label.textContent = 'Descargar transcripción';

        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener('click', ev => {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            onActivate(btn, label);
        });
        return btn;
    }

    /** Create lifecycle controller that injects Descargar transcripción into Shorts and /watch 3-dots menus. */
    function createTranscriptDownloadController({
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        getUserLang = () => 'es',
        requestFn = gmRequest,
        downloadFile = (content, filename) => tdTriggerBlobDownload(doc, content, filename),
        copyText = txt => tdCopyTextToClipboard(win, doc, txt),
        extractorFn = extractVideoTranscript
    } = {}) {
        let enabled = false;
        let lastTrigger = { kind: '', ts: 0 };
        let observer = null;
        let scanScheduled = false;

        const onDocClickCapture = ev => {
            const target = ev?.target;
            if (!target?.closest) return;
            const watchBtn = target.closest('ytd-menu-renderer.ytd-watch-metadata button, ytd-video-primary-info-renderer ytd-menu-renderer button');
            if (watchBtn) {
                lastTrigger = { kind: 'watch', ts: Date.now() };
                scheduleScan();
                return;
            }
            const forbidden = target.closest(TD_FORBIDDEN_CONTAINER_SEL);
            if (forbidden) {
                lastTrigger = { kind: 'other', ts: Date.now() };
                return;
            }
            const shortsBtn = target.closest('ytd-reel-video-renderer button, ytd-shorts button');
            if (shortsBtn) {
                const al = `${shortsBtn.getAttribute?.('aria-label') || ''} ${shortsBtn.title || ''}`;
                if (/m[aá]s|more|acciones|actions|menu/i.test(al)) {
                    lastTrigger = { kind: 'shorts', ts: Date.now() };
                    scheduleScan();
                }
            }
        };

        const handleActivate = async (btn, labelEl, dropdown) => {
            if (btn.getAttribute('data-busy') === '1') return;
            const vid = getVideoId(win?.location?.href || '');
            if (!vid) {
                tdShowToast(doc, 'No se detectó un video activo', 'error');
                return;
            }

            btn.setAttribute('data-busy', '1');
            labelEl.textContent = 'Extrayendo transcripción...';

            try {
                const result = await extractorFn({
                    videoId: vid,
                    userLang: typeof getUserLang === 'function' ? getUserLang() : 'es',
                    doc,
                    win,
                    requestFn
                });
                downloadFile(result.text, result.filename);
                const copied = await copyText(result.text).catch(() => false);
                labelEl.textContent = copied ? '✓ Descargado y copiado' : '✓ TXT descargado';
                tdShowToast(
                    doc,
                    copied ? '✓ Transcripción descargada y copiada al portapapeles' : '✓ Transcripción descargada en TXT',
                    'ok'
                );
                setTimeout(() => {
                    try { dropdown?.close?.(); } catch {}
                    labelEl.textContent = 'Descargar transcripción';
                    btn.removeAttribute?.('data-busy');
                }, 650);
            } catch (err) {
                const msg = err?.noCaptions
                    ? 'Este video no tiene subtítulos ni transcripción disponible'
                    : (err?.message || 'Error al extraer la transcripción');
                labelEl.textContent = err?.noCaptions ? 'Sin subtítulos disponibles' : 'Error al extraer';
                tdShowToast(doc, msg, 'error', 3800);
                setTimeout(() => {
                    labelEl.textContent = 'Descargar transcripción';
                    btn.removeAttribute?.('data-busy');
                }, 1800);
            }
        };

        const cleanupDropdown = dd => {
            const stale = dd?.querySelectorAll?.(`[${TD_ITEM_ATTR}="1"]`) || [];
            for (let j = 0; j < stale.length; j++) {
                try { stale[j].remove(); } catch {}
            }
            const popups = dd?.querySelectorAll?.('yt-sheet-view-model, ytd-menu-popup-renderer') || [];
            for (let j = 0; j < popups.length; j++) {
                tdRestorePopupBounds(popups[j]);
            }
        };

        const removeInjectedItems = () => {
            const dropdowns = doc?.querySelectorAll?.('tp-yt-iron-dropdown') || [];
            for (let i = 0; i < dropdowns.length; i++) {
                cleanupDropdown(dropdowns[i]);
            }
            const items = doc?.querySelectorAll?.(`[${TD_ITEM_ATTR}="1"]`) || [];
            for (let i = 0; i < items.length; i++) {
                try { items[i].remove(); } catch {}
            }
        };

        const scan = () => {
            if (!doc) return;
            if (!enabled) {
                removeInjectedItems();
                return;
            }

            const collectMenuHosts = () => {
                const seen = new Set();
                const out = [];
                const dropdowns = doc.querySelectorAll?.('tp-yt-iron-dropdown') || [];
                for (let i = 0; i < dropdowns.length; i++) {
                    if (!seen.has(dropdowns[i])) {
                        seen.add(dropdowns[i]);
                        out.push(dropdowns[i]);
                    }
                }
                const sheets = doc.querySelectorAll?.('yt-sheet-view-model') || [];
                for (let i = 0; i < sheets.length; i++) {
                    if (sheets[i].closest?.('tp-yt-iron-dropdown')) continue;
                    const host = sheets[i].parentElement || sheets[i];
                    if (!seen.has(host)) {
                        seen.add(host);
                        out.push(host);
                    }
                }
                return out;
            };

            const dropdowns = collectMenuHosts();
            for (let i = 0; i < dropdowns.length; i++) {
                const dd = dropdowns[i];
                if (!tdIsDropdownVisible(dd, win)) {
                    cleanupDropdown(dd);
                    continue;
                }
                const match = tdIdentifyMenuTarget(dd, win, lastTrigger);
                if (!match.ok) {
                    cleanupDropdown(dd);
                    continue;
                }
                if (match.listEl.querySelector?.(`[${TD_ITEM_ATTR}="1"]`)) continue;

                tdEnsureStyles(doc);
                tdExpandPopupBounds(match.popup, win);

                const sampleItem = match.listEl.querySelector?.('yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item');
                const sibH = sampleItem?.getBoundingClientRect?.().height || (match.kind === 'watch' ? 36 : 40);
                const sampleTextHost = sampleItem?.querySelector?.('.ytListItemViewModelTitle, .ytAttributedStringHost, .yt-core-attributed-string, yt-formatted-string') || sampleItem;
                const sibColor = sampleTextHost && typeof win?.getComputedStyle === 'function'
                    ? (win.getComputedStyle(sampleTextHost)?.color || '')
                    : '';
                const isDark = tdIsDarkTheme(doc, sibColor);
                const itemEl = tdCreateMenuItem(doc, match.kind, Math.round(sibH), sibColor, isDark, (btn, labelEl) => {
                    handleActivate(btn, labelEl, dd);
                });
                const refNode = tdFindInsertionRef(match.listEl, match.kind);
                if (refNode && typeof match.listEl.insertBefore === 'function') {
                    match.listEl.insertBefore(itemEl, refNode);
                } else {
                    match.listEl.appendChild(itemEl);
                }
            }
        };

        const scheduleScan = () => {
            if (scanScheduled || !enabled) return;
            scanScheduled = true;
            setTimeout(() => {
                scanScheduled = false;
                scan();
            }, 40);
        };

        const ensureListenersAndObserver = () => {
            if (!doc) return;
            if (!observer && typeof win?.MutationObserver === 'function') {
                doc.addEventListener?.('click', onDocClickCapture, true);
                observer = new win.MutationObserver(() => scheduleScan());
                const root = doc.body || doc.documentElement || doc.querySelector?.('ytd-popup-container');
                if (root) {
                    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'aria-hidden'] });
                }
            }
        };

        const setEnabled = val => {
            enabled = Boolean(val);
            if (enabled) {
                ensureListenersAndObserver();
                scan();
            } else {
                removeInjectedItems();
            }
        };

        const destroy = () => {
            enabled = false;
            removeInjectedItems();
            try { doc?.getElementById?.(TD_TOAST_ID)?.remove?.(); } catch {}
            try { doc?.removeEventListener?.('click', onDocClickCapture, true); } catch {}
            if (observer) {
                try { observer.disconnect(); } catch {}
                observer = null;
            }
        };

        return { setEnabled, scan, destroy };
    }

    return {
        TD_STYLE_ID,
        TD_ITEM_ATTR,
        TD_TOAST_ID,
        TD_BLOCK_SIZE,
        TD_HEROICON_SVG_URL,
        TD_HEROICON_FALLBACK_URL,
        TD_INNERTUBE_CLIENTS,
        cleanTranscriptCueText,
        formatTranscriptTimestamp,
        buildTranscriptBlocks,
        buildTranscriptTxt,
        sanitizeTranscriptFilename,
        chooseTranscriptDownloadTrack,
        buildGetTranscriptParamsCandidates,
        tdRecoverRawSubtitleCues,
        extractVideoTranscript,
        createTranscriptDownloadController
    };
})();

// --- ai-summary.js ---
const AI_STYLE_ID = 'supratube-ia-styles';
const AI_RESUME_WRAP_ID = 'supratube-ia-resume-wrap';
const AI_RESUME_BTN_ID = 'supratube-ia-resume-btn';
const AI_CORRECT_BTN_ID = 'supratube-ia-correct-btn';
const AI_CHIP_WRAP_CLASS = 'supratube-ia-chip-wrap';
const AI_CHIP_BTN_CLASS = 'supratube-ia-chip-btn';
const AI_LEGACY_CARD_CLASS = 'supratube-ia-tarjeta-activa';

const AI_SUMMARY_PROMPT = `Resume este video de YouTube.

Instrucciones IMPORTANTES:

1. LONGITUD: Tu respuesta debe ser con un maximo de 500 caracteres.
2. MARKDOWN: Usalo siempre en toda respuesta.
3. LA REGLA: Responde sin hipelalia, breve y directo. Siempre da respuestas que respondan como si fueran alguien que se vio el video completo. La respuesta debe ahorrarte verte el video, es un spoiler si o si que te evite verte el video. Añade los puntos donde se mencionan en el video lo que dices.
4. ESTRUCTURA DINÁMICA (Aplica la que corresponda al tipo de video):
   - Si el video es un "Top", ranking o lista: Enumera explícitamente cada puesto del top y redacta una breve descripción de lo que ocurre o se explica en cada uno. Has esto estructurado breve y sin hiperlalia.
   - Si el video es narrativo, un documental, un gameplay o explicativo: Divide tu resumen en tres bloques: "Inicio", "Desarrollo" y "Desenlace" pero no menciones el titulo de estos solo has un parrafo por cada uno y añade detalles que solo responderia si eres alguien que se vio el video completo.
   - Si el video es musica, identifica la obra original especifica autor, obra, año y nacionalidad quirurjicamente (aveces si es un autor indie puedes usar su pseudonimo y/o investigar en foros o en plataformas de archivos donde se publico su obra (soundcloud, newground, etc) y investigar minusiosamente aun más dando con el nombre del autor usando como termino de busqueda este pseudonimo y/o el nombre de la obra, (un ejemplo de busqueda minusiosa) por ejemplo: El caso de adobe universal patcher, buscando una obra puedes encontrar que la obra fue archivado en modarchive.org bajo el nombre de easter_egg.xm formato similar a un .midi que en su epoca era popular para componer temas para keygens y como autor påskchip, viendo los metadatos del archivo dice que el autor realmente es "Ghidorah" donde dice que la cancion fue hecha en "älandsbro" un lugar de europa), la obra siempre en negrita, el autor y la fecha tambien, menciona esto brevemente antes del inicio desarrollo y final.`;

const CORRECCION_ABSOLUTA_PROTOCOL = `Descomprime cronicas, relatos historicos, noticias polarizantes y argumentos mediante lectura por ejes, proceso de activacion, falsabilidad y la Prueba del Espejo. Usala cuando el usuario pida aplicar la correccion absoluta, analizar o desarmar una cronica o fuente sesgada, auditar la densidad artificial de un relato, o blindar y corregir un argumento sin puntos ciegos.

Instructions
Correccion Absoluta
Protocolo autocalibrado de lectura critica de fuentes, descompresion de cronicas y blindaje dialectico. Separa el ruido editorial o el impacto de un estallido de las proporciones reales mediante cuatro dimensiones independientes, criterios de falsabilidad previa y simetria probatoria.

Cuando Usar
El usuario pide aplicar la "correccion absoluta" o el protocolo de lectura de cronicas por ejes y proceso.
Se analiza una cronica historica, noticia, relato polarizante o fuente que presenta un conflicto o rechazo como si fuera un bloque monolitico y unanime.
Se busca auditar, corregir o blindar un argumento propio o ajeno eliminando dicotomias falsas, sesgos de confirmacion y puntos ciegos.
Se requiere un guion de debate riguroso basado en primeros principios, acero interpretativo (steelmanning) y control de simetria.
Pasos del Protocolo
1. Tesis Operativa y Descompresion Inicial
Toda cronica o relato registra lo que quiso destacar quien tenia la pluma, no cuantas personas pensaban igual. El tamano de un estallido violento o la dureza de una ley tampoco miden proporciones demograficas, porque una minoria organizada tiene apalancamiento asimetrico y puede causar un dano enorme o capturar una institucion ante una mayoria pasiva.

La ilusion de "densidad monolitica" ocurre cuando se proyecta sin evidencia lo que sucede en una dimension sobre las otras (mientras que confirmar con evidencia que todas eran altas es un hallazgo valido). Descomprimir un relato consiste en medir cada dimension por separado.

2. Evaluacion en las Cuatro Dimensiones
Evalua el caso separando cuatro ejes independientes antes de emitir un juicio:

Clima (Peso Medio) - ¿Estaba instalado el prejuicio o agravio?

Indicios hacia Amplio: Sermones, leyes previas, literatura o calumnias recurrentes durante decadas en varios estratos.
Indicios hacia Faccioso o Dividido: Convivencia previa documentada sin friccion; discurso hostil reciente o importado.
Participacion (Peso Alto) - ¿Quien actuo realmente y que hizo falta para moverlo?

Indicios hacia Amplio: Accion horizontal simultanea en varios lugares; composicion transversal documentada (grupos sin un mismo interes material actuando juntos, advirtiendo siempre que una faccion tambien puede reclutar a varios sectores con promesas distintas).
Indicios hacia Faccioso o Dividido: Grupos pequenos e identificables; incentivos selectivos registrados (quitas de deudas, botin) o amenazas y sanciones de segundo orden contra vecinos tibios.
Poder (Peso Alto) - ¿Como se comportaron y dividieron las capas de autoridad (central, local, gremial, judicial)?

Indicios hacia Amplio: Todas las capas empujan en la misma direccion, o intentan frenar el estallido y son desbordadas desde abajo.
Indicios hacia Faccioso o Dividido: Golpe institucional previo para deponer a autoridades locales protectoras; choque abierto entre capas de mando.
Dia Despues (Peso Bajo / Ambiguo) - ¿Que ocurrio cuando bajo la espuma?

Indicios hacia Amplio: Nuevo orden o exclusion sostenidos a bajo costo de vigilancia.
Indicios hacia Faccioso o Dividido: Evasion reiterada, quejas constantes por incumplimiento o readmision pragmatica (nunca decide por si solo, pues la readmision tambien puede deberse a costos fiscales insostenibles).
Asigna a cada dimension uno de cinco resultados validos:

Alto
Bajo
Dividido
Inclinado hacia [X] (con baja confianza): Usalo cuando los indicios sean debiles o indirectos pero apunten en una direccion antes de rendirte a la indeterminacion.
Indeterminado por falta de registro: Ultimo recurso cuando la fuente calla o las objeciones simetricas anulan ambas hipotesis. Nunca lo uses como refugio comodo para evitar analizar indicios, pero recuerda que basta para refutar afirmaciones de unanimidad absoluta.
3. Procedimiento de Auditoria en 7 Pasos
Delimitacion de jurisdiccion: Declara que prueba la fuente por si sola (existencia del discurso y capacidad de dano o registro) y que no prueba (proporcion demografica).
Auditoria de incentivos: Identifica quien escribe, para quien y en medio de que disputa para orientar la busqueda de omisiones, sin invalidar automaticamente sus datos.
Lectura forense interna (intramuros): Extrae las fricciones que el propio texto confiesa involuntariamente (autoridades desplazadas, reproches a vecinos tibios, promesas materiales, divisiones de mando).
Triangulacion externa (extramuros): Cruza con registros de incentivos opuestos (fiscales, judiciales, comerciales, cronicas rivales), considerando el sesgo de supervivencia de cada archivo.
Control de tasa base: Compara con comunidades equivalentes bajo el mismo estimulo. Si solo conoces casos aislados, declaralos como excepciones que prueban posibilidad, nunca frecuencia.
Clausula de falsabilidad previa: Declara antes de concluir que evidencia concreta te obligaria a cambiar de lectura y devolver la pieza eliminada (regla del 10% de primeros principios).
Control de simetria (La Prueba del Espejo): Toma la misma objecion metodologica con la que cuestionaste la fuente y aplicala palabra por palabra contra tu propia hipotesis alternativa. Si tu hipotesis cae ante la misma exigencia y no hay indicios menores que inclinen la balanza con baja confianza, declara la dimension como Indeterminada.
4. Guion de Bolsillo para Debate en Vivo
Cuando el usuario necesite responder en una conversacion o debate rapido, estructura la intervencion en tres movimientos:

Conceder y separar: Reconoce la gravedad del hecho y la existencia del clima cultural, pero separa de inmediato tres cosas: el clima de fondo, cuanta gente paso a la accion y que hicieron las autoridades.
Preguntar por el cuello de botella: Cuestiona si la accion fue horizontal y espontanea, o si requirio desplazar autoridades locales primero, ofrecer beneficios selectivos o presionar a los indecisos.
Abrir las tres salidas: Si fue horizontal y desbordo autoridades, concede que el rechazo activo era amplio; si hubo golpes previos o incentivos facciosos, senala que una faccion activo un prejuicio de fondo; si la fuente solo muestra el incendio final sin el proceso, concluye que prueba el dano pero deja indeterminado cuantos lo apoyaban.
Errores Comunes a Evitar
Confundir existencia o efecto con proporcion: Un disidente costoso prueba que no habia unanimidad, no que fuera mayoria. Un incendio enorme prueba capacidad destructiva, no mayoria ni minoria.
Restar motivos que se suman: Los incentivos materiales (deudas, botin) no prueban ausencia de prejuicio ideologico; demuestran oportunismo faccioso operando sobre un clima cultural.
Confundir excepcion personal con cambio de clima: Proteger o comerciar con un vecino conocido demuestra friccion practica, pero puede coexistir con hostilidad hacia el grupo en abstracto.
Usar el silencio de la fuente como prueba: Que el cronista no mencione incentivos o resistencias no prueba que no existieran; ausencia de registro no es ausencia del hecho.
Citar sin verificacion directa: Nunca cites signaturas, folios, cifras finas o repartos de multas que no esten verificados directamente. Tres casos solidos y verificados valen mas que diez referencias dudosas.
Exagerar fallos o contradicciones del interlocutor: Aplica caridad interpretativa (steelmanning), formula la tesis ajena en su version mas fuerte, concede rapido lo verdadero y verifica que una contradiccion sea real antes de senalarla.
Usar metaforas como pruebas: El bisturi de primeros principios (quitar peso muerto y devolver la pieza si el relato falla) ilustra la actitud de limpieza, pero solo la evidencia del proceso decide.`;

const AI_CORRECTED_PROMPT = `Analiza este video y dame la versión corregida y honesta de lo que realmente pasó según su contenido y evidencia, quitando exageraciones o encuadres sesgados.

Reglas obligatorias de tu respuesta:
1. LONGITUD: Máximo 500 caracteres en total.
2. IDIOMA Y ESTILO: En español simple y neutro, no erudito, directo y fácil de entender.
3. HONESTIDAD: Di qué pasó realmente según los hechos verificables del video y qué queda sin probarse.

Aplica este protocolo para elaborar tu respuesta:

${CORRECCION_ABSOLUTA_PROTOCOL}`;

const AI_ACTION_BUTTONS = [
    {
        id: AI_RESUME_BTN_ID,
        wrapId: 'supratube-ia-resume-chip-wrap',
        label: 'Resume de verdad',
        prompt: AI_SUMMARY_PROMPT
    },
    {
        id: AI_CORRECT_BTN_ID,
        wrapId: 'supratube-ia-correct-chip-wrap',
        label: 'Dame la version corregida',
        prompt: AI_CORRECTED_PROMPT
    }
];

const AI_SUMMARY_CSS = `
    .${AI_CHIP_WRAP_CLASS} {
        opacity: 1 !important;
        animation: none !important;
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS} {
        border: 1.5px solid #22c55e !important;
        background: rgba(34, 197, 94, 0.12) !important;
        color: var(--yt-spec-text-primary, #f1f1f1) !important;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS}:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.22) !important;
        border-color: #4ade80 !important;
        box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.35);
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS}:disabled {
        opacity: 0.65;
        cursor: wait;
    }

    html:not([dark]) .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS} {
        color: var(--yt-spec-text-primary, #0f0f0f) !important;
        background: rgba(34, 197, 94, 0.10) !important;
    }
`;

function aiIsBoxVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetWidth > 0 && el.offsetHeight > 0);
}

function aiIsInputVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetParent !== null && el.offsetWidth > 0);
}

function aiFindFirstVisible(root, selector, visibilityFn = aiIsBoxVisible) {
    const list = root?.querySelectorAll?.(selector);
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
        if (visibilityFn(list[i])) return list[i];
    }
    return null;
}

function removeInjectedAiUi(doc) {
    doc?.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);
    doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    for (const action of AI_ACTION_BUTTONS) {
        doc?.querySelectorAll?.(`#${action.wrapId}, #${action.id}`)?.forEach?.(el => el.remove?.());
    }
}

/** Inject YouTube IA green chip styles idempotently without hiding any chat elements. */
function injectAiSummaryStyles(doc) {
    if (!doc?.createElement) return null;
    const existing = doc.getElementById?.(AI_STYLE_ID);
    if (existing) {
        if (existing.textContent !== AI_SUMMARY_CSS) {
            existing.textContent = AI_SUMMARY_CSS;
        }
        return existing;
    }

    const style = doc.createElement('style');
    style.id = AI_STYLE_ID;
    style.textContent = AI_SUMMARY_CSS;
    const target = doc.head || doc.documentElement;
    target?.appendChild?.(style);
    return style;
}

/** Mount green AI suggestion chips directly inside the first visible <you-chat-chips-data> list. */
function ensureAiButtons(doc, onActionClick = null) {
    if (!doc?.querySelectorAll) return [];

    // Remove legacy outer wrapper so flex-row <you-chat-item-view-model> is never squeezed.
    doc.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    doc.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);

    const chipsEl = aiFindFirstVisible(doc, 'you-chat-chips-data');
    if (!chipsEl) return [];

    const mounted = [];
    for (const action of AI_ACTION_BUTTONS) {
        // Deduplicate any stale or duplicate copies across the panel.
        let keptWrap = null;
        const allWraps = doc.querySelectorAll(`#${action.wrapId}`);
        for (let i = 0; i < allWraps.length; i++) {
            if (!keptWrap && allWraps[i].parentElement === chipsEl) {
                keptWrap = allWraps[i];
            } else {
                allWraps[i].remove?.();
            }
        }
        const allBtns = doc.querySelectorAll(`#${action.id}`);
        for (let i = 0; i < allBtns.length; i++) {
            if (keptWrap && allBtns[i].parentElement === keptWrap) continue;
            if (allBtns[i].parentElement?.id === action.wrapId) {
                allBtns[i].parentElement.remove?.();
            } else {
                allBtns[i].remove?.();
            }
        }

        const existingBtn = keptWrap?.querySelector?.(`#${action.id}`);
        if (keptWrap && existingBtn) {
            existingBtn.__supratubeOnClick = () => onActionClick?.(action);
            mounted.push(existingBtn);
            continue;
        }
        keptWrap?.remove?.();

        const wrap = doc.createElement('div');
        wrap.id = action.wrapId;
        wrap.className = `ytwYouChatChipsDataChipWrapper ${AI_CHIP_WRAP_CLASS}`;

        wrap.addEventListener('click', ev => {
            ev?.stopPropagation?.();
        });

        const btn = doc.createElement('button');
        btn.id = action.id;
        btn.type = 'button';
        btn.className = `ytwYouChatChipsDataChip ${AI_CHIP_BTN_CLASS}`;
        btn.textContent = action.label;
        btn.__supratubeOnClick = () => onActionClick?.(action);
        btn.addEventListener('click', ev => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            btn.__supratubeOnClick?.();
        });

        wrap.appendChild(btn);
        chipsEl.appendChild(wrap);
        mounted.push(btn);
    }

    return mounted;
}

/** Create passive AI chip controller: injects the green chips only, never alters or hides chat UI. */
function createAiSummaryController({
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = id => clearTimeout(id)
} = {}) {
    const state = {
        currentVideoId: '',
        inyectando: false,
        _submitTimer: null,
        _panelObs: null,
        _observedPanelRoot: null
    };

    function clearPendingTimers() {
        clearTimer(state._submitTimer);
        state._submitTimer = null;
    }

    function setButtonsDisabled(disabled) {
        for (const action of AI_ACTION_BUTTONS) {
            const btn = doc?.getElementById?.(action.id);
            if (btn) btn.disabled = Boolean(disabled);
        }
    }

    function resetForVideo(videoId = '') {
        clearPendingTimers();
        state.currentVideoId = videoId;
        state.inyectando = false;
        setButtonsDisabled(false);
        doc?.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);
    }

    function teardownDisabled() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        state.inyectando = false;
        removeInjectedAiUi(doc);
        doc?.getElementById?.(AI_STYLE_ID)?.remove?.();
    }

    function setTextareaPromptValue(cajaTexto, text) {
        cajaTexto.click?.();
        cajaTexto.focus?.();
        cajaTexto.select?.();

        let inserted = false;
        try {
            if (typeof doc.execCommand === 'function') {
                inserted = doc.execCommand('insertText', false, text);
            }
        } catch {}

        if (!inserted || String(cajaTexto.value || '') !== text) {
            const proto = win?.HTMLTextAreaElement?.prototype;
            const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
            if (desc?.set) {
                desc.set.call(cajaTexto, text);
            } else {
                cajaTexto.value = text;
            }
        }

        const EventCtor = win?.Event || Event;
        cajaTexto.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true, composed: true }));
        cajaTexto.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true, composed: true }));
    }

    function handleActionClick(action) {
        if (state.inyectando || !state.currentVideoId || !action?.prompt) return;
        const cajaTexto = aiFindFirstVisible(doc, 'textarea.chatInputViewModelChatInput', aiIsInputVisible);
        if (!cajaTexto) return;

        state.inyectando = true;
        const clickVid = state.currentVideoId;
        setButtonsDisabled(true);

        setTextareaPromptValue(cajaTexto, action.prompt);

        state._submitTimer = setTimer(() => {
            if (state.currentVideoId !== clickVid) {
                state.inyectando = false;
                setButtonsDisabled(false);
                return;
            }

            const KeyEventCtor = win?.KeyboardEvent || KeyboardEvent;
            const enterConfig = { bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
            cajaTexto.dispatchEvent(new KeyEventCtor('keydown', enterConfig));
            cajaTexto.dispatchEvent(new KeyEventCtor('keypress', enterConfig));
            cajaTexto.dispatchEvent(new KeyEventCtor('keyup', enterConfig));

            const formulario = cajaTexto.closest?.('form.chatInputViewModelChatInputForm') || doc;
            const botonEnviar = formulario.querySelector?.(
                'button[aria-label="Enviar"], button[aria-label="Send"], button[type="submit"]'
            );
            if (botonEnviar && !botonEnviar.disabled) {
                botonEnviar.click();
            }

            state.inyectando = false;
            setButtonsDisabled(false);
        }, 400);
    }

    function findAskPanelRoot() {
        const youChatEl =
            aiFindFirstVisible(doc, 'you-chat-chips-data') ||
            aiFindFirstVisible(doc, 'textarea.chatInputViewModelChatInput', aiIsInputVisible);
        return (
            youChatEl?.closest?.('ytd-engagement-panel-section-list-renderer') ||
            youChatEl?.parentElement ||
            doc?.body ||
            null
        );
    }

    function ensurePanelObserver() {
        if (typeof win?.MutationObserver !== 'function') return;
        const root = findAskPanelRoot();
        if (!root || state._observedPanelRoot === root) return;

        state._panelObs?.disconnect?.();
        state._observedPanelRoot = root;
        state._panelObs = new win.MutationObserver(() => {
            if (!state.currentVideoId) return;
            ensureAiButtons(doc, handleActionClick);
        });
        state._panelObs.observe(root, { childList: true, subtree: true });
    }

    function tick({ enabled = true, url = '', videoId = '' } = {}) {
        if (!doc) return;
        if (!enabled) {
            teardownDisabled();
            return;
        }

        if (!String(url).includes('/watch') || !videoId) {
            if (state.currentVideoId) resetForVideo('');
            return;
        }

        injectAiSummaryStyles(doc);

        if (videoId !== state.currentVideoId) {
            resetForVideo(videoId);
        }

        ensurePanelObserver();
        ensureAiButtons(doc, handleActionClick);
    }

    function destroy() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        removeInjectedAiUi(doc);
        doc?.getElementById?.(AI_STYLE_ID)?.remove?.();
    }

    return {
        state,
        resetForVideo,
        tick,
        destroy
    };
}

// --- transcript-download.js ---
// Adaptador ESM/bundle hacia __supratubeTdExports (en subtitles.js).

const {
    TD_STYLE_ID,
    TD_ITEM_ATTR,
    TD_TOAST_ID,
    TD_BLOCK_SIZE,
    TD_HEROICON_SVG_URL,
    TD_HEROICON_FALLBACK_URL,
    TD_INNERTUBE_CLIENTS,
    cleanTranscriptCueText,
    formatTranscriptTimestamp,
    buildTranscriptBlocks,
    buildTranscriptTxt,
    sanitizeTranscriptFilename,
    chooseTranscriptDownloadTrack,
    buildGetTranscriptParamsCandidates,
    extractVideoTranscript,
    createTranscriptDownloadController
} = __supratubeTdExports;

// --- main.js ---
installLayer0AdPrune(window);
installTimedtextMonitor(window);
injectAdStyles(document);

const resolveTdFactory = () =>
    typeof createTranscriptDownloadController === 'function'
        ? createTranscriptDownloadController
        : (typeof __supratubeTdExports !== 'undefined' ? __supratubeTdExports?.createTranscriptDownloadController : null);

const S = {
    settings: readBridgeSettings(document),
    videoId: null,
    lastUrl: typeof location !== 'undefined' ? location.href : '',
    adState: { adSpeedActive: false, wasAdShowing: false, prevVolume: 1 },
    sbState: { lastSkippedUuid: null, mutedSegUuid: null, prevVolume: 1 },
    sbSegments: [],
    sbVideoId: null,
    sbCache: new Map(),
    qualityState: { manualOverride: false, lastFormatId: null },
    userNativeLang: null,
    subsAppliedForVideo: null,
    subsUserTouchedVideo: null,
    _subInFlight: null,
    _lastAudioLang: null,
    _aiCtrl: createAiSummaryController({ doc: document, win: window }),
    _tdCtrl: (() => {
        const tdFactory = resolveTdFactory();
        return typeof tdFactory === 'function'
            ? tdFactory({
                doc: document,
                win: window,
                getUserLang: () => S.userNativeLang || 'es',
                requestFn: gmRequest
            })
            : { setEnabled() {}, scan() {}, destroy() {} };
    })(),
    _player: null,
    _video: null,
    _videoListened: false,
    _adObserver: null,
    _bodyObserver: null,
    _navObs: null,
    _obsWaitInterval: null,
    _mainInterval: null,
    _subTimers: [],
    _unsubSettings: null,
    _abortCtrl: typeof AbortController === 'function' ? new AbortController() : null,
    _tornDown: false,
    _sbRafId: null,
    _skipRaf: false,
    _navTimer: null,
    _lastSbTick: 0
};

function getPlayer() {
    const selected = selectActivePlayer(document, location.pathname, S.videoId);
    if (selected) {
        if (S._player !== selected) {
            S._player = selected;
            S._video = null;
            S._videoListened = false;
        }
        return S._player;
    }
    if (S._player && S._player.isConnected) return S._player;
    return null;
}

function getVideo() {
    if (S._video && S._video.isConnected) return S._video;
    const p = getPlayer();
    S._video = p ? p.querySelector('video') : document.querySelector('video');
    if (S._video && !S._videoListened) {
        bindVideoEvents(S._video);
        S._videoListened = true;
    }
    return S._video;
}

function clearVideoCache() {
    S._player = null;
    S._video = null;
    S._videoListened = false;
    S.adState.adSpeedActive = false;
    S.adState.wasAdShowing = false;
    S.qualityState.manualOverride = false;
    S.qualityState.lastFormatId = null;
    S.subsAppliedForVideo = null;
    S.subsUserTouchedVideo = null;
    S._subInFlight = null;
    S._lastAudioLang = null;
}

function runAdPass() {
    if (!S.settings.adSkip) return;
    const wasAdActive = Boolean(S.adState.adSpeedActive || S.adState.wasAdShowing);
    const p = getPlayer();
    const isAdShowingNow = Boolean(p?.classList?.contains?.('ad-showing') || p?.classList?.contains?.('ad-interrupting'));
    S.adState.wasAdShowing = isAdShowingNow;
    trySkipAd({
        enabled: true,
        player: p,
        video: getVideo(),
        state: S.adState,
        doc: document,
        win: window
    });
    if (wasAdActive && !S.adState.adSpeedActive && !p?.classList?.contains?.('ad-showing') && !p?.classList?.contains?.('ad-interrupting')) {
        apply1080pQuality(p, S.qualityState, S.settings.auto1080p);
        runSubtitlesForCurrentVideo();
    }
}

function scheduleAdSkip() {
    if (!S.settings.adSkip || S._skipRaf) return;
    S._skipRaf = true;
    requestAnimationFrame(() => {
        S._skipRaf = false;
        runAdPass();
    });
}

function refreshProgressBar() {
    const v = getVideo();
    renderGreenProgressBar(
        S.sbSegments,
        v?.duration || 0,
        document,
        Boolean(S.settings.sponsorBlock && S.settings.greenBar)
    );
}

function syncIaButton() {
    if (!S.videoId || !S.settings.autoSubtitles) {
        removeAiSubtitleButtons(document);
        return;
    }
    ensureAiSubtitleButton({
        player: getPlayer(),
        doc: document,
        win: window,
        enabled: true,
        onToggle: () => {
            const vid = getVideoId() || S.videoId;
            const p = getPlayer();
            if (!vid || !p) return;
            const lang = S.userNativeLang || (typeof navigator !== 'undefined' ? String(navigator.language || '').split('-')[0].toLowerCase() : '') || 'es';
            const started = startManualAiCaptions({
                player: p,
                videoId: vid,
                userLang: lang,
                doc: document,
                win: window
            });
            if (started) {
                S.subsAppliedForVideo = vid;
                S.subsUserTouchedVideo = null;
            } else {
                S.subsUserTouchedVideo = vid;
            }
            if (!S.userNativeLang) {
                resolveUserNativeLang().then(l => { S.userNativeLang = l; }).catch(() => {});
            }
        }
    });
}

async function runSubtitlesForCurrentVideo() {
    const vid = S.videoId;
    if (!vid || !S.settings.autoSubtitles) return;
    if (S.subsUserTouchedVideo === vid || S._subInFlight === vid || isFallbackCaptionsActive(window, vid)) return;
    const player = getPlayer();
    if (!player) return;
    S._subInFlight = vid;
    try {
        if (!S.userNativeLang) {
            S.userNativeLang = await resolveUserNativeLang();
        }
        if (getVideoId() !== vid || S.subsUserTouchedVideo === vid) return;
        const activePlayer = getPlayer();
        if (!activePlayer || activePlayer.classList?.contains?.('ad-showing') || activePlayer.classList?.contains?.('ad-interrupting')) return;
        const activeAudioLang = detectVideoAudioLang({ activeAudioTrack: activePlayer.getAudioTrack?.() });
        if (activeAudioLang) {
            S._lastAudioLang = activeAudioLang;
        }
        const applied = await applySmartSubtitles(activePlayer, {
            enabled: S.settings.autoSubtitles,
            userLang: S.userNativeLang,
            expectedVideoId: vid,
            doc: document,
            win: window,
            gmRequestFn: gmRequest
        });
        if (applied) {
            S.subsAppliedForVideo = vid;
        }
    } finally {
        if (S._subInFlight === vid) S._subInFlight = null;
    }
}

function bindVideoEvents(video) {
    const evtOpts = S._abortCtrl?.signal ? { passive: true, signal: S._abortCtrl.signal } : { passive: true };
    video.addEventListener('ended', () => {
        if (S.adState.adSpeedActive) {
            video.playbackRate = 1;
            video.muted = false;
            video.volume = S.adState.prevVolume;
            S.adState.adSpeedActive = false;
        }
    }, evtOpts);

    video.addEventListener('ratechange', () => {
        const p = getPlayer();
        if (S.settings.adSkip && S.adState.adSpeedActive && p?.classList?.contains('ad-showing')) {
            if (video.playbackRate < 16) video.playbackRate = 16;
        }
    }, evtOpts);

    video.addEventListener('canplay', () => {
        const p = getPlayer();
        apply1080pQuality(p, S.qualityState, S.settings.auto1080p);
        refreshProgressBar();
        runSubtitlesForCurrentVideo();
    }, evtOpts);

    video.addEventListener('play', () => {
        if (
            S.videoId &&
            S.settings.autoSubtitles &&
            S.subsUserTouchedVideo !== S.videoId &&
            !S._subInFlight &&
            !isFallbackCaptionsActive(window, S.videoId)
        ) {
            runSubtitlesForCurrentVideo();
        }
    }, evtOpts);

    video.addEventListener('durationchange', refreshProgressBar, evtOpts);
    video.addEventListener('loadedmetadata', refreshProgressBar, evtOpts);
}

function sbRafLoop(ts) {
    if (ts - S._lastSbTick >= 300) {
        S._lastSbTick = ts;
        tickSponsorBlock({
            video: getVideo(),
            segments: S.sbSegments,
            state: S.sbState,
            enabled: S.settings.sponsorBlock
        });
    }
    if (location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts')) {
        S._sbRafId = requestAnimationFrame(sbRafLoop);
    } else {
        S._sbRafId = null;
    }
}

function ensureSBLoop() {
    if (!S._sbRafId && (location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts'))) {
        S._sbRafId = requestAnimationFrame(sbRafLoop);
    }
}

function setupObservers() {
    clearInterval(S._obsWaitInterval);
    S._obsWaitInterval = null;
    if (S._adObserver) { S._adObserver.disconnect(); S._adObserver = null; }
    if (S._bodyObserver) { S._bodyObserver.disconnect(); S._bodyObserver = null; }

    let tries = 0;
    S._obsWaitInterval = setInterval(() => {
        if (S._tornDown) {
            clearInterval(S._obsWaitInterval);
            S._obsWaitInterval = null;
            return;
        }
        const player = getPlayer();
        if (!player && ++tries < 40) return;
        clearInterval(S._obsWaitInterval);
        S._obsWaitInterval = null;
        if (!player) return;

        S._adObserver = new MutationObserver(mutations => {
            if (!S.settings.adSkip) return;
            for (const m of mutations) {
                if (m.type === 'attributes' || m.addedNodes.length) {
                    scheduleAdSkip();
                    return;
                }
            }
        });
        S._adObserver.observe(player, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        if (document.body) {
            S._bodyObserver = new MutationObserver(mutations => {
                if (!S.settings.adSkip) return;
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (
                            node.tagName === 'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL' ||
                            node.tagName === 'TP-YT-PAPER-DIALOG' ||
                            node.querySelector?.('ytd-enforcement-message-view-model')
                        ) {
                            setTimeout(() => dismissEnforcement(document, window), 80);
                            return;
                        }
                    }
                }
            });
            S._bodyObserver.observe(document.body, { childList: true, subtree: false });
        }
    }, 250);
}

async function loadSponsorForVideo(vid) {
    if (!vid || !S.settings.sponsorBlock) {
        S.sbSegments = [];
        refreshProgressBar();
        return;
    }
    if (vid === S.sbVideoId && S.sbSegments.length) {
        refreshProgressBar();
        return;
    }
    S.sbVideoId = vid;
    S.sbSegments = [];
    const segs = await fetchSponsorSegments(vid, S.sbCache);
    if (S.videoId === vid) {
        S.sbSegments = segs;
        refreshProgressBar();
    }
}

function clearSubTimers() {
    for (const id of S._subTimers) clearTimeout(id);
    S._subTimers.length = 0;
}

function onNavigate() {
    S.lastUrl = location.href;
    clearTimeout(S._navTimer);
    clearSubTimers();
    S._navTimer = setTimeout(() => {
        if (S._tornDown) return;
        const vid = getVideoId();
        const sameVideo = Boolean(vid && vid === S.videoId);
        if (!sameVideo) {
            clearVideoCache();
            clearFallbackCaptions(document, window);
        }
        S.videoId = vid;

        if (vid) {
            loadSponsorForVideo(vid);
            ensureSBLoop();
            syncIaButton();
            [500, 1500, 3000].forEach(delay => {
                const tid = setTimeout(() => {
                    if (S._tornDown || S.videoId !== vid) return;
                    apply1080pQuality(getPlayer(), S.qualityState, S.settings.auto1080p);
                    syncIaButton();
                    runSubtitlesForCurrentVideo();
                }, delay);
                S._subTimers.push(tid);
            });
        } else {
            S.sbSegments = [];
            removeAiSubtitleButtons(document);
            refreshProgressBar();
        }
        setupObservers();
        runAdPass();
        S._aiCtrl.tick({ enabled: Boolean(S.settings.aiSummary), url: location.href, videoId: vid });
    }, 350);
}

/** Cleanly disconnect all active timers, observers, and DOM listeners before hot-reinjection. */
function teardown() {
    if (S._tornDown) return;
    S._tornDown = true;
    clearTimeout(S._navTimer);
    S._navTimer = null;
    clearSubTimers();
    clearInterval(S._mainInterval);
    S._mainInterval = null;
    clearInterval(S._obsWaitInterval);
    S._obsWaitInterval = null;
    if (S._sbRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(S._sbRafId);
    }
    S._sbRafId = null;
    try { S._adObserver?.disconnect?.(); } catch {}
    S._adObserver = null;
    try { S._bodyObserver?.disconnect?.(); } catch {}
    S._bodyObserver = null;
    try { S._navObs?.disconnect?.(); } catch {}
    S._navObs = null;
    try { S._unsubSettings?.(); } catch {}
    S._unsubSettings = null;
    try { S._abortCtrl?.abort?.(); } catch {}
    try { S._aiCtrl?.destroy?.(); } catch {}
    try { S._tdCtrl?.destroy?.(); } catch {}
    clearFallbackCaptions(document, window);
    removeAiSubtitleButtons(document);
    try { window.__supratubeEjecutado = false; } catch {}
}

function boot() {
    if (document?.documentElement?.dataset && CFG?.version) {
        document.documentElement.dataset.supratubeVersion = CFG.version;
    }
    injectAdStyles(document);
    bindManualCaptionListeners(document, window, null, () => {
        const vid = S.videoId;
        const wasFallback = isFallbackCaptionsActive(window, vid);
        if (wasFallback) {
            S.subsUserTouchedVideo = vid;
            clearFallbackCaptions(document, window);
            return;
        }
        const p = getPlayer();
        const wasNativeOn = Boolean(p?.isSubtitlesOn?.());
        S.subsUserTouchedVideo = vid;
        setTimeout(() => {
            if (getVideoId() !== vid) return;
            const curPlayer = getPlayer();
            if (!curPlayer) return;
            const nowOn = Boolean(curPlayer.isSubtitlesOn?.());
            if (!wasNativeOn && !nowOn && vid && S.settings.autoSubtitles) {
                Promise.resolve(S.userNativeLang || resolveUserNativeLang())
                    .then(lang => {
                        S.userNativeLang = lang;
                        if (getVideoId() !== vid) return;
                        return applySmartSubtitles(curPlayer, {
                            enabled: S.settings.autoSubtitles,
                            userLang: lang,
                            expectedVideoId: vid,
                            doc: document,
                            win: window,
                            gmRequestFn: gmRequest,
                            manualForce: true
                        });
                    })
                    .catch(() => {});
                return;
            }
            if (typeof curPlayer.isSubtitlesOn === 'function' && !nowOn) {
                clearFallbackCaptions(document, window);
            }
        }, 60);
    });
    resolveUserNativeLang().then(lang => { S.userNativeLang = lang; }).catch(() => {});
    S._tdCtrl.setEnabled(S.settings.transcriptDownload !== false);

    S._unsubSettings = subscribeSettings(window, document, nextSettings => {
        S.settings = nextSettings;
        S._tdCtrl.setEnabled(S.settings.transcriptDownload !== false);
        if (!S.settings.autoSubtitles) {
            clearFallbackCaptions(document, window);
        }
        if (!S.settings.adSkip) {
            const v = getVideo();
            if (v && S.adState.adSpeedActive) {
                v.playbackRate = 1;
                v.muted = false;
                v.volume = S.adState.prevVolume;
                S.adState.adSpeedActive = false;
                S.adState.wasAdShowing = false;
            }
        }
        refreshProgressBar();
        if (S.videoId) {
            apply1080pQuality(getPlayer(), S.qualityState, S.settings.auto1080p);
            if (S.settings.autoSubtitles) {
                S.subsAppliedForVideo = null;
                runSubtitlesForCurrentVideo();
            }
            if (S.settings.sponsorBlock) {
                loadSponsorForVideo(S.videoId);
                ensureSBLoop();
            }
        }
        S._aiCtrl.tick({ enabled: Boolean(S.settings.aiSummary), url: location.href, videoId: S.videoId });
        syncIaButton();
    });

    const sig = S._abortCtrl?.signal;
    const capOpts = sig ? { capture: true, signal: sig } : true;
    const passiveOpts = sig ? { passive: true, signal: sig } : { passive: true };

    document.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        const item = ev.target?.closest?.('.ytp-quality-menu .ytp-menuitem');
        if (item) S.qualityState.manualOverride = true;
    }, capOpts);

    S._mainInterval = setInterval(() => {
        if (S._tornDown) return;
        if (location.href !== S.lastUrl || getVideoId() !== S.videoId) {
            S.lastUrl = location.href;
            onNavigate();
        }
        if (S.settings.adSkip) runAdPass();
        else dismissEnforcement(document, window);
        if (S.settings.sponsorBlock && S.settings.greenBar && S.sbSegments.length && !document.getElementById('supratube-sb-track')) {
            refreshProgressBar();
        }
        if (S.videoId && S.settings.autoSubtitles && S.subsUserTouchedVideo !== S.videoId) {
            const p = getPlayer();
            if (p && !p.classList?.contains?.('ad-showing')) {
                const liveAudioLang = detectVideoAudioLang({ activeAudioTrack: p.getAudioTrack?.() });
                if (liveAudioLang && liveAudioLang !== S._lastAudioLang) {
                    const hadPrev = S._lastAudioLang !== null;
                    S._lastAudioLang = liveAudioLang;
                    if (hadPrev) {
                        S.subsAppliedForVideo = null;
                        runSubtitlesForCurrentVideo();
                    }
                }
            }
        }
        S._aiCtrl.tick({ enabled: Boolean(S.settings.aiSummary), url: location.href, videoId: S.videoId });
        if (S.settings.transcriptDownload !== false) S._tdCtrl.scan();
        syncIaButton();
    }, 800);

    S._navObs = new MutationObserver(() => {
        if (location.href !== S.lastUrl) {
            S.lastUrl = location.href;
            onNavigate();
        }
    });
    if (document.body) {
        S._navObs.observe(document.body, { childList: true, subtree: false });
    }

    window.addEventListener('yt-navigate-start', () => {
        S.sbVideoId = null;
        S.sbSegments = [];
        clearFallbackCaptions(document, window);
        clearVideoCache();
        S._aiCtrl.resetForVideo('', false);
    }, passiveOpts);
    window.addEventListener('yt-navigate-finish', () => onNavigate(), passiveOpts);
    window.addEventListener('yt-page-data-updated', () => onNavigate(), passiveOpts);
    document.addEventListener('visibilitychange', () => {
        if (!S._tornDown && !document.hidden) {
            syncIaButton();
            runSubtitlesForCurrentVideo();
        }
    }, passiveOpts);

    onNavigate();
}

try { window.__supratubeTeardown = teardown; } catch {}
if (document.readyState === 'loading') {
    const domOpts = S._abortCtrl?.signal ? { once: true, signal: S._abortCtrl.signal } : { once: true };
    document.addEventListener('DOMContentLoaded', boot, domOpts);
} else {
    boot();
}
})();
