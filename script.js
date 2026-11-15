(() => {
'use strict';
if (window.__supratubeEjecutado) return;
window.__supratubeEjecutado = true;

// --- config.js ---
const CFG = Object.freeze({
    version: '1.0.3',
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
    'main.js'
]);

const DEFAULT_SETTINGS = Object.freeze({
    adSkip: true,
    sponsorBlock: true,
    greenBar: true,
    auto1080p: true,
    autoSubtitles: true,
    aiSummary: true
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
    if (!win || _layer0Installed) return;
    _layer0Installed = true;

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
    if (_adCssInjected || !doc) return;
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
    if (_sbBarCssInjected || !doc) return;
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

function encodeBase64Bytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(bytes).toString('base64');
}

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
            stopLoop: null,
            watchdogTimer: null,
            cache: new Map()
        };
    }
    return host.__supratubeFallbackCtrl;
}

function setBoundedCache(map, key, value, limit = 20) {
    if (map.has(key)) map.delete(key);
    while (map.size >= limit) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, value);
}

function decodeHtmlEntities(str) {
    return String(str || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, ent) => {
        const low = ent.toLowerCase();
        if (low[0] === '#') {
            const code = low[1] === 'x' ? parseInt(low.slice(2), 16) : parseInt(low.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[low] || m;
    });
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

function parseTimedtextResponseText(bodyText) {
    const trimmed = String(bodyText || '').trim();
    if (!trimmed) return [];
    if (trimmed[0] === '{') return parseJson3Cues(trimmed);
    if (trimmed[0] !== '<') return [];
    const cues = [];
    for (const m of trimmed.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
        const t = Number(/\bt="(\d+)"/.exec(m[1])?.[1] || 0) / 1000;
        const d = Number(/\bd="(\d+)"/.exec(m[1])?.[1] || 0) / 1000;
        const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (txt) cues.push({ start: t, end: d > 0 ? t + d : t + 4, text: txt });
    }
    if (!cues.length) {
        for (const m of trimmed.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
            const t = Number(/\bstart="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const d = Number(/\bdur="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
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

    if (tlang) {
        const cleanUrl = new URL(parsedUrl.toString());
        cleanUrl.searchParams.delete('tlang');
        cleanUrl.searchParams.set('fmt', 'json3');
        st.rawUrlsByVid.set(vid, cleanUrl.toString());
    }

    const cues = (status >= 200 && status < 300) ? parseTimedtextResponseText(bodyText) : [];
    if (status >= 400 || cues.length === 0) {
        if (!tlang) st.directBlockedByVid.add(vid);
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

async function obtainRawSegmentsForVideo(videoId, win) {
    const st = getTtState(win);
    const cachedOrigin = st.originCuesByVid.get(videoId);
    if (cachedOrigin?.cues?.length) {
        return { lang: cachedOrigin.lang, segments: cachedOrigin.cues };
    }

    const rawUrl = st.rawUrlsByVid.get(videoId);
    if (rawUrl && !st.directBlockedByVid.has(videoId) && typeof win?.fetch === 'function') {
        try {
            const resp = await win.fetch(rawUrl, { credentials: 'include' });
            if (resp?.ok) {
                const txt = await resp.text();
                const cues = parseTimedtextResponseText(txt);
                if (cues.length) {
                    const lang = normalizeBaseLang(new URL(rawUrl).searchParams.get('lang'));
                    st.originCuesByVid.set(videoId, { lang, cues, ts: Date.now() });
                    return { lang, segments: cues };
                }
            }
        } catch {}
    }

    const panelSegs = await fetchTranscriptViaGetPanel(videoId, win).catch(() => []);
    return { lang: '', segments: panelSegs };
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
    const fontPx = Math.round(Math.max(isShorts ? 14 : 16, Math.min(isShorts ? 22 : 30, cw * (isShorts ? 0.042 : 0.024))));
    Object.assign(box.style, {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: isShorts ? '23%' : '11%',
        width: 'auto',
        maxWidth: isShorts ? '86%' : '82%',
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
            fontWeight: '500',
            lineHeight: '1.35',
            padding: '4px 10px',
            borderRadius: '4px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
            whiteSpace: 'pre-wrap'
        });
    }
    return box;
}

/** Hide and remove the fallback caption overlay and tear down its sync loop. */
function clearFallbackCaptions(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    const ctrl = getFallbackCtrl(win);
    clearTimeout(ctrl.watchdogTimer);
    ctrl.watchdogTimer = null;
    ctrl.activeVid = null;
    ctrl.inflightVid = null;
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
        ctrl.stopLoop = null;
    }
    const existing = doc?.getElementById?.(FALLBACK_BOX_ID);
    if (existing) {
        try { existing.remove(); } catch {}
    }
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

    const renderTick = () => {
        if (ctrl.activeVid !== videoId) return;
        const curVid = getActiveVideoIdSafe(player, win);
        if (curVid && curVid !== videoId) {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false) {
            clearFallbackCaptions(doc, win);
            return;
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

async function runFallbackSubtitles({ player, videoId, sourceLang, userLang, doc, win, requestFn }) {
    const ctrl = getFallbackCtrl(win);
    if (ctrl.activeVid === videoId || ctrl.inflightVid === videoId) return;
    if (hasVisibleNativeCaptions(player)) return;
    const video = player?.querySelector?.('video') || doc?.querySelector?.('video');
    if (!video) return;

    ctrl.inflightVid = videoId;
    try {
        const targetBase = normalizeBaseLang(userLang) || 'es';
        const cacheKey = `${videoId}:${targetBase}`;
        const isShorts = Boolean(player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || ''));
        const maxChars = isShorts ? 54 : 84;

        let chunks = ctrl.cache.get(cacheKey) || null;
        if (chunks?.length) {
            startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });
            return;
        }

        const { lang: detectedSrcLang, segments } = await obtainRawSegmentsForVideo(videoId, win);
        if (!segments.length || getActiveVideoIdSafe(player, win) !== videoId) return;
        if (hasVisibleNativeCaptions(player)) return;

        const srcLang = normalizeBaseLang(detectedSrcLang || sourceLang) || 'auto';
        const translated = new Array(segments.length);
        const curTime = Number(video.currentTime) || 0;
        let firstIdx = segments.findIndex(s => s.end > curTime);
        if (firstIdx < 0) firstIdx = 0;

        const firstBatchEnd = Math.min(segments.length, firstIdx + 10);
        const firstTexts = segments.slice(firstIdx, firstBatchEnd).map(s => s.text);
        const firstOut = await translateCueBatch({ texts: firstTexts, sourceLang: srcLang, targetLang: targetBase, requestFn });
        if (getActiveVideoIdSafe(player, win) !== videoId || hasVisibleNativeCaptions(player)) return;

        for (let k = 0; k < firstOut.length; k++) {
            translated[firstIdx + k] = firstOut[k];
        }
        chunks = buildChunksForSegments(segments, translated, maxChars);
        startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });

        const ranges = [];
        for (let i = firstBatchEnd; i < segments.length; i += 15) {
            ranges.push([i, Math.min(segments.length, i + 15)]);
        }
        for (let i = 0; i < firstIdx; i += 15) {
            ranges.push([i, Math.min(firstIdx, i + 15)]);
        }

        for (let r = 0; r < ranges.length; r++) {
            if (ctrl.activeVid !== videoId || getActiveVideoIdSafe(player, win) !== videoId) return;
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
    } finally {
        if (ctrl.inflightVid === videoId) ctrl.inflightVid = null;
    }
}

function armFallbackWatchdog({ player, decision, videoId, userLang, doc, win, requestFn, delayMs = 1800 }) {
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
        runFallbackSubtitles({ player, videoId, sourceLang, userLang, doc, win, requestFn }).catch(() => {});
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

    doc.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        if (ev.target?.closest?.('.ytp-subtitles-button') || isShortsCaptionMenuClick(ev.target)) {
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

    try { player.loadModule?.('captions'); } catch {}

    const pr = player.getPlayerResponse?.() || {};
    const prCaps = pr.captions?.playerCaptionsTracklistRenderer || {};
    const tracklist = player.getOption?.('captions', 'tracklist', { includeAsr: true });
    const captionTracks = (Array.isArray(tracklist) && tracklist.length) ? tracklist : (prCaps.captionTracks || []);
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

    const decision = chooseSubtitleAction({
        videoLang,
        userLang: deps.userLang,
        captionTracks,
        translationLanguages,
        captionsCurrentlyOn,
        autoActivatedByScript
    });

    if (decision.action === 'noop') return false;

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
            doc,
            win,
            requestFn,
            delayMs: deps.fallbackWatchdogMs ?? 1800
        });
    }

    return true;
}

// --- ai-summary.js ---
const AI_STYLE_ID = 'supratube-ia-styles';
const AI_RESUME_WRAP_ID = 'supratube-ia-resume-wrap';
const AI_RESUME_BTN_ID = 'supratube-ia-resume-btn';
const AI_CARD_ACTIVE_CLASS = 'supratube-ia-tarjeta-activa';

const AI_SUMMARY_PROMPT = `Resume este video de YouTube.

Instrucciones IMPORTANTES:

1. LONGITUD: Tu respuesta debe ser con un maximo de 500 caracteres.
2. MARKDOWN: Usalo siempre en toda respuesta.
3. LA REGLA: Responde sin hipelalia, breve y directo. Siempre da respuestas que respondan como si fueran alguien que se vio el video completo. La respuesta debe ahorrarte verte el video, es un spoiler si o si que te evite verte el video. Añade los puntos donde se mencionan en el video lo que dices.
4. ESTRUCTURA DINÁMICA (Aplica la que corresponda al tipo de video):
   - Si el video es un "Top", ranking o lista: Enumera explícitamente cada puesto del top y redacta una breve descripción de lo que ocurre o se explica en cada uno. Has esto estructurado breve y sin hiperlalia.
   - Si el video es narrativo, un documental, un gameplay o explicativo: Divide tu resumen en tres bloques: "Inicio", "Desarrollo" y "Desenlace" pero no menciones el titulo de estos solo has un parrafo por cada uno y añade detalles que solo responderia si eres alguien que se vio el video completo.
   - Si el video es musica, identifica la obra original especifica autor, obra, año y nacionalidad quirurjicamente (aveces si es un autor indie puedes usar su pseudonimo y/o investigar en foros o en plataformas de archivos donde se publico su obra (soundcloud, newground, etc) y investigar minusiosamente aun más dando con el nombre del autor usando como termino de busqueda este pseudonimo y/o el nombre de la obra, (un ejemplo de busqueda minusiosa) por ejemplo: El caso de adobe universal patcher, buscando una obra puedes encontrar que la obra fue archivado en modarchive.org bajo el nombre de easter_egg.xm formato similar a un .midi que en su epoca era popular para componer temas para keygens y como autor påskchip, viendo los metadatos del archivo dice que el autor realmente es "Ghidorah" donde dice que la cancion fue hecha en "älandsbro" un lugar de europa), la obra siempre en negrita, el autor y la fecha tambien, menciona esto brevemente antes del inicio desarrollo y final.`;

const AI_SUMMARY_CSS = `
    body.${AI_CARD_ACTIVE_CLASS} you-chat-chips-data,
    body.${AI_CARD_ACTIVE_CLASS} #${AI_RESUME_WRAP_ID} { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} ytd-engagement-panel-title-header-renderer h2#title { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} .ytwYouChatItemViewModelIcon { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} yt-response-actions-view-model { display: none !important; }

    body.${AI_CARD_ACTIVE_CLASS} #footer yt-chat-input-view-model,
    body.${AI_CARD_ACTIVE_CLASS} #footer.ytd-engagement-panel-section-list-renderer {
        display: none !important; height: 0 !important; padding: 0 !important; margin: 0 !important; border: none !important;
    }

    body.${AI_CARD_ACTIVE_CLASS} .ytChatUserTurnViewModelTextContainer,
    body.${AI_CARD_ACTIVE_CLASS} yt-chat-user-turn-view-model {
        display: none !important; height: 0 !important; padding: 0 !important; margin: 0 !important;
    }

    body.${AI_CARD_ACTIVE_CLASS} ytw-you-chat-carousel-view-model,
    body.${AI_CARD_ACTIVE_CLASS} you-chat-carousel-view-model { display: none !important; }

    #${AI_RESUME_WRAP_ID} {
        display: flex !important;
        justify-content: flex-end !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        margin: 8px 0 4px 0 !important;
    }

    #${AI_RESUME_BTN_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        max-width: 90%;
        padding: 8px 16px;
        border-radius: 18px;
        border: 1.5px solid #22c55e !important;
        background: rgba(34, 197, 94, 0.12);
        color: var(--yt-spec-text-primary, #f1f1f1);
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    #${AI_RESUME_BTN_ID}:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.22);
        border-color: #4ade80 !important;
        box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.35);
    }

    #${AI_RESUME_BTN_ID}:disabled {
        opacity: 0.65;
        cursor: wait;
    }

    html:not([dark]) #${AI_RESUME_BTN_ID} {
        color: var(--yt-spec-text-primary, #0f0f0f);
        background: rgba(34, 197, 94, 0.10);
    }
`;

function isBoxVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetWidth > 0 && el.offsetHeight > 0);
}

function isInputVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetParent !== null && el.offsetWidth > 0);
}

function findFirstVisible(doc, selector, checkFn = isBoxVisible) {
    if (!doc?.querySelectorAll) return null;
    const list = doc.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
        if (checkFn(list[i])) return list[i];
    }
    return null;
}

/** Inject YouTube IA styles idempotently; chip hiding only applies when card mode is active. */
function injectAiSummaryStyles(doc) {
    if (!doc?.createElement) return null;
    const existing = doc.getElementById?.(AI_STYLE_ID);
    if (existing) return existing;

    const style = doc.createElement('style');
    style.id = AI_STYLE_ID;
    style.textContent = AI_SUMMARY_CSS;
    const target = doc.head || doc.documentElement;
    target?.appendChild?.(style);
    return style;
}

/** Mount the green-bordered "Resume de verdad" button immediately after <you-chat-chips-data>. */
function ensureResumeButton(doc, win = null, onClick = null) {
    if (!doc?.querySelectorAll) return null;
    const chipsEl = findFirstVisible(doc, 'you-chat-chips-data');
    if (!chipsEl || !chipsEl.parentElement) return null;

    const nextSib = chipsEl.nextElementSibling;
    if (nextSib?.id === AI_RESUME_WRAP_ID) {
        const existingBtn = nextSib.querySelector?.(`#${AI_RESUME_BTN_ID}`) || doc.getElementById?.(AI_RESUME_BTN_ID);
        if (existingBtn) {
            if (typeof onClick === 'function') existingBtn.__supratubeOnResumeClick = onClick;
            return existingBtn;
        }
    }

    const oldWrap = doc.getElementById?.(AI_RESUME_WRAP_ID);
    if (oldWrap && oldWrap !== nextSib) {
        oldWrap.remove?.();
    }

    const wrap = doc.createElement('div');
    wrap.id = AI_RESUME_WRAP_ID;
    wrap.className = 'supratube-ia-resume-wrap';

    try {
        const cs = win?.getComputedStyle?.(chipsEl);
        if (cs?.paddingRight && cs.paddingRight !== '0px') {
            wrap.style.paddingRight = cs.paddingRight;
        }
        if (cs?.paddingLeft && cs.paddingLeft !== '0px') {
            wrap.style.paddingLeft = cs.paddingLeft;
        }
    } catch {}

    const btn = doc.createElement('button');
    btn.id = AI_RESUME_BTN_ID;
    btn.type = 'button';
    btn.className = 'ytwYouChatChipsDataChip supratube-ia-resume-btn';
    btn.textContent = 'Resume de verdad';
    btn.__supratubeOnResumeClick = onClick;
    btn.addEventListener('click', ev => {
        ev?.stopPropagation?.();
        btn.__supratubeOnResumeClick?.();
    });

    wrap.appendChild(btn);
    if (typeof chipsEl.insertAdjacentElement === 'function') {
        chipsEl.insertAdjacentElement('afterend', wrap);
    } else {
        chipsEl.parentElement.appendChild(wrap);
    }
    return btn;
}

function hideElementRemembered(state, el) {
    if (!el?.style) return;
    el.style.display = 'none';
    if (!state.hiddenElements.includes(el)) {
        state.hiddenElements.push(el);
    }
}

/** Create controller managing SPA transitions, auto-open, Resume click, and clean card state. */
function createAiSummaryController({
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = id => clearTimeout(id),
    transitionDelayMs = 2000
} = {}) {
    const state = {
        currentVideoId: '',
        autoOpenDoneForVideo: '',
        resumenSolicitado: false,
        pasoMensajeEnviado: false,
        inyectando: false,
        tarjetaCompletada: false,
        buscandoEnMenu: false,
        ultimoMensajeIAConocido: null,
        enTransicion: false,
        videoSinSoporteIA: false,
        hiddenElements: [],
        _transitionTimer: null,
        _menuTimer: null,
        _menuUnlockTimer: null,
        _injectTimer: null,
        _submitTimer: null,
        _panelObs: null,
        _observedPanelRoot: null
    };

    function clearPendingTimers() {
        clearTimer(state._transitionTimer);
        clearTimer(state._menuTimer);
        clearTimer(state._menuUnlockTimer);
        clearTimer(state._injectTimer);
        clearTimer(state._submitTimer);
        state._transitionTimer = null;
        state._menuTimer = null;
        state._menuUnlockTimer = null;
        state._injectTimer = null;
        state._submitTimer = null;
    }

    function restoreDomVisibility() {
        doc?.body?.classList?.remove?.(AI_CARD_ACTIVE_CLASS);

        for (let i = 0; i < state.hiddenElements.length; i++) {
            const el = state.hiddenElements[i];
            if (el?.style) el.style.display = '';
        }
        state.hiddenElements.length = 0;

        const msgs = doc?.querySelectorAll?.(
            '.ytChatUserTurnViewModelTextContainer, div[role="alert"].ytwYouChatItemViewModelHost'
        );
        if (msgs) {
            for (let i = 0; i < msgs.length; i++) {
                if (msgs[i]?.style) msgs[i].style.display = '';
            }
        }

        const btn = doc?.getElementById?.(AI_RESUME_BTN_ID);
        if (btn) btn.disabled = false;
    }

    function resetForVideo(videoId = '', withTransitionDelay = true) {
        clearPendingTimers();
        state.currentVideoId = videoId;
        state.autoOpenDoneForVideo = '';
        state.resumenSolicitado = false;
        state.pasoMensajeEnviado = false;
        state.inyectando = false;
        state.tarjetaCompletada = false;
        state.buscandoEnMenu = false;
        state.ultimoMensajeIAConocido = null;
        state.videoSinSoporteIA = false;
        restoreDomVisibility();

        if (withTransitionDelay && videoId && transitionDelayMs > 0) {
            state.enTransicion = true;
            state._transitionTimer = setTimer(() => {
                if (state.currentVideoId === videoId) {
                    state.enTransicion = false;
                }
            }, transitionDelayMs);
        } else {
            state.enTransicion = false;
        }
    }

    function teardownDisabled() {
        clearPendingTimers();
        state.resumenSolicitado = false;
        state.pasoMensajeEnviado = false;
        state.inyectando = false;
        state.tarjetaCompletada = false;
        state.buscandoEnMenu = false;
        restoreDomVisibility();
        doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    }

    function tryOpenAskPanel() {
        if (state.buscandoEnMenu || state.autoOpenDoneForVideo === state.currentVideoId) return;
        const barraActiva = findFirstVisible(doc, 'ytd-menu-renderer.ytd-watch-metadata');
        if (!barraActiva) return;

        // Plan A: direct Ask entrypoint button in watch action bar.
        const botonesPreguntar = barraActiva.querySelectorAll(
            '.you-chat-entrypoint-button button, button[aria-label="Preguntar"], button[aria-label="Ask"]'
        );
        for (let i = 0; i < botonesPreguntar.length; i++) {
            if (isBoxVisible(botonesPreguntar[i])) {
                state.autoOpenDoneForVideo = state.currentVideoId;
                botonesPreguntar[i].click();
                return;
            }
        }

        // Plan B: overflow 3-dots menu -> "Preguntar" / abort lock for music/unsupported videos.
        const btnTresPuntos = findFirstVisible(
            barraActiva,
            'yt-button-shape#button-shape button[aria-label="Más acciones"], yt-button-shape#button-shape button[aria-label="More actions"]'
        );
        if (!btnTresPuntos) return;

        state.buscandoEnMenu = true;
        const attemptVid = state.currentVideoId;
        btnTresPuntos.click();

        state._menuTimer = setTimer(() => {
            if (state.currentVideoId !== attemptVid) {
                state.buscandoEnMenu = false;
                return;
            }
            const opciones = doc.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer');
            let encontrado = false;
            for (let i = 0; i < opciones.length; i++) {
                const label = String(opciones[i].textContent || '').trim().toLowerCase();
                if (label === 'preguntar' || label === 'ask') {
                    opciones[i].click();
                    encontrado = true;
                    break;
                }
            }

            state.autoOpenDoneForVideo = attemptVid;
            if (!encontrado) {
                doc.body?.click?.();
                state.videoSinSoporteIA = true;
            }

            state._menuUnlockTimer = setTimer(() => {
                state.buscandoEnMenu = false;
            }, 500);
        }, 500);
    }

    function setTextareaPromptValue(cajaTexto, text) {
        cajaTexto.click?.();
        cajaTexto.focus?.();

        let inserted = false;
        try {
            if (typeof doc.execCommand === 'function') {
                inserted = doc.execCommand('insertText', false, text);
            }
        } catch {}

        if (!inserted || !String(cajaTexto.value || '').includes('Resume este video')) {
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

    function handleResumeClick() {
        if (state.pasoMensajeEnviado || state.inyectando || !state.currentVideoId) return;
        const cajaTexto = findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible);
        if (!cajaTexto) return;

        state.resumenSolicitado = true;
        state.inyectando = true;
        const clickVid = state.currentVideoId;

        const resumeBtn = doc.getElementById?.(AI_RESUME_BTN_ID);
        if (resumeBtn) resumeBtn.disabled = true;

        const mensajesAntes = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        state.ultimoMensajeIAConocido = mensajesAntes.length > 0 ? mensajesAntes[mensajesAntes.length - 1] : null;

        setTextareaPromptValue(cajaTexto, AI_SUMMARY_PROMPT);

        state._submitTimer = setTimer(() => {
            if (state.currentVideoId !== clickVid) {
                state.inyectando = false;
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

            state.pasoMensajeEnviado = true;
            state.inyectando = false;
        }, 400);
    }

    function transformIntoCleanCard() {
        doc?.body?.classList?.add?.(AI_CARD_ACTIVE_CLASS);

        const todosLosMensajesIA = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        if (todosLosMensajesIA.length > 0) {
            const ultimoMensaje = todosLosMensajesIA[todosLosMensajesIA.length - 1];
            const esMensajeDividido = Boolean(
                ultimoMensaje.classList?.contains('ytwYouChatItemViewModelChatResponseStyleMultiPartEnd') ||
                ultimoMensaje.querySelector?.('horizontal-shelf-view-model')
            );
            const limiteOcultamiento = (esMensajeDividido && todosLosMensajesIA.length > 1)
                ? todosLosMensajesIA.length - 2
                : todosLosMensajesIA.length - 1;

            for (let i = 0; i < limiteOcultamiento; i++) {
                hideElementRemembered(state, todosLosMensajesIA[i]);
            }
        }

        const elementosTexto = doc.querySelectorAll?.('span, yt-formatted-string') || [];
        for (let i = 0; i < elementosTexto.length; i++) {
            const el = elementosTexto[i];
            const texto = el.textContent || '';
            if (texto.includes('IA puede cometer errores') || texto.includes('AI can make mistakes')) {
                if (el.parentElement) hideElementRemembered(state, el.parentElement);
                hideElementRemembered(state, el);
            }
        }

        state.tarjetaCompletada = true;
    }

    function checkResponseComplete() {
        if (!state.resumenSolicitado || !state.pasoMensajeEnviado) return;
        const mensajesIA = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        if (mensajesIA.length === 0) return;

        const ultimoMensaje = mensajesIA[mensajesIA.length - 1];
        if (ultimoMensaje === state.ultimoMensajeIAConocido) return;

        if (ultimoMensaje.querySelector?.('yt-response-actions-view-model')) {
            transformIntoCleanCard();
        }
    }

    function findAskPanelRoot() {
        const youChatEl =
            findFirstVisible(doc, 'you-chat-chips-data') ||
            findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible);
        return (
            youChatEl?.closest?.('ytd-engagement-panel-section-list-renderer') ||
            youChatEl?.parentElement ||
            doc?.body ||
            null
        );
    }

    function ensurePanelObserver(enabled) {
        if (!enabled || typeof win?.MutationObserver !== 'function') return;
        const root = findAskPanelRoot();
        if (!root || state._observedPanelRoot === root) return;

        state._panelObs?.disconnect?.();
        state._observedPanelRoot = root;
        state._panelObs = new win.MutationObserver(() => {
            if (!state.currentVideoId || state.tarjetaCompletada || state.enTransicion) return;
            ensureResumeButton(doc, win, handleResumeClick);
            if (state.resumenSolicitado && state.pasoMensajeEnviado) {
                checkResponseComplete();
            }
        });
        state._panelObs.observe(root, { childList: true, subtree: true });
    }

    function tick({ enabled = true, url = '', videoId = '' } = {}) {
        if (!doc) return;
        if (!enabled) {
            if (state.currentVideoId || doc.body?.classList?.contains?.(AI_CARD_ACTIVE_CLASS) || doc.getElementById?.(AI_RESUME_WRAP_ID)) {
                teardownDisabled();
            }
            return;
        }

        if (!String(url).includes('/watch') || !videoId) {
            if (state.currentVideoId) resetForVideo('', false);
            return;
        }

        injectAiSummaryStyles(doc);

        if (videoId !== state.currentVideoId) {
            resetForVideo(videoId, true);
            if (state.enTransicion) return;
        }

        if (state.enTransicion || state.tarjetaCompletada) return;

        ensurePanelObserver(true);
        ensureResumeButton(doc, win, handleResumeClick);

        if (state.resumenSolicitado && state.pasoMensajeEnviado) {
            checkResponseComplete();
            return;
        }

        const panelAbierto = Boolean(
            findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible) ||
            findFirstVisible(doc, 'you-chat-chips-data')
        );
        if (panelAbierto) {
            state.autoOpenDoneForVideo = state.currentVideoId;
        } else if (!state.videoSinSoporteIA && state.autoOpenDoneForVideo !== state.currentVideoId) {
            tryOpenAskPanel();
        }
    }

    function destroy() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        restoreDomVisibility();
        doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    }

    return {
        state,
        resetForVideo,
        tick,
        destroy
    };
}

// --- main.js ---
installLayer0AdPrune(window);
installTimedtextMonitor(window);
injectAdStyles(document);

const S = {
    settings: readBridgeSettings(document),
    videoId: null,
    lastUrl: typeof location !== 'undefined' ? location.href : '',
    adState: { adSpeedActive: false, prevVolume: 1 },
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
    _player: null,
    _video: null,
    _videoListened: false,
    _adObserver: null,
    _bodyObserver: null,
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
        if (!S._video.__supratubeBound) {
            S._video.__supratubeBound = true;
            bindVideoEvents(S._video);
        }
        S._videoListened = true;
    }
    return S._video;
}

function clearVideoCache() {
    S._player = null;
    S._video = null;
    S._videoListened = false;
    S.adState.adSpeedActive = false;
    S.qualityState.manualOverride = false;
    S.qualityState.lastFormatId = null;
    S.subsAppliedForVideo = null;
    S.subsUserTouchedVideo = null;
    S._subInFlight = null;
    S._lastAudioLang = null;
}

function runAdPass() {
    if (!S.settings.adSkip) return;
    const wasAdActive = Boolean(S.adState.adSpeedActive);
    const p = getPlayer();
    trySkipAd({
        enabled: true,
        player: p,
        video: getVideo(),
        state: S.adState,
        doc: document,
        win: window
    });
    if (wasAdActive && !S.adState.adSpeedActive && !p?.classList?.contains?.('ad-showing')) {
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

async function runSubtitlesForCurrentVideo() {
    const vid = S.videoId;
    if (!vid || !S.settings.autoSubtitles) return;
    if (S.subsUserTouchedVideo === vid || S._subInFlight === vid) return;
    const player = getPlayer();
    if (!player) return;
    S._subInFlight = vid;
    try {
        if (!S.userNativeLang) {
            S.userNativeLang = await resolveUserNativeLang();
        }
        if (getVideoId() !== vid || S.subsUserTouchedVideo === vid) return;
        const activePlayer = getPlayer();
        if (!activePlayer || activePlayer.classList?.contains?.('ad-showing')) return;
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
    video.addEventListener('ended', () => {
        if (S.adState.adSpeedActive) {
            video.playbackRate = 1;
            video.muted = false;
            video.volume = S.adState.prevVolume;
            S.adState.adSpeedActive = false;
        }
    }, { passive: true });

    video.addEventListener('ratechange', () => {
        const p = getPlayer();
        if (S.settings.adSkip && S.adState.adSpeedActive && p?.classList?.contains('ad-showing')) {
            if (video.playbackRate < 16) video.playbackRate = 16;
        }
    }, { passive: true });

    video.addEventListener('canplay', () => {
        const p = getPlayer();
        apply1080pQuality(p, S.qualityState, S.settings.auto1080p);
        refreshProgressBar();
        runSubtitlesForCurrentVideo();
    }, { passive: true });

    video.addEventListener('durationchange', refreshProgressBar, { passive: true });
    video.addEventListener('loadedmetadata', refreshProgressBar, { passive: true });
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
    if (S._adObserver) { S._adObserver.disconnect(); S._adObserver = null; }
    if (S._bodyObserver) { S._bodyObserver.disconnect(); S._bodyObserver = null; }

    let tries = 0;
    const wait = setInterval(() => {
        const player = getPlayer();
        if (!player && ++tries < 40) return;
        clearInterval(wait);
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

function onNavigate() {
    clearTimeout(S._navTimer);
    S._navTimer = setTimeout(() => {
        clearVideoCache();
        clearFallbackCaptions(document, window);
        const vid = getVideoId();
        S.videoId = vid;

        if (vid) {
            loadSponsorForVideo(vid);
            ensureSBLoop();
            [500, 1500, 3000].forEach(delay => {
                setTimeout(() => {
                    if (S.videoId !== vid) return;
                    apply1080pQuality(getPlayer(), S.qualityState, S.settings.auto1080p);
                    runSubtitlesForCurrentVideo();
                }, delay);
            });
        } else {
            S.sbSegments = [];
            refreshProgressBar();
        }
        setupObservers();
        runAdPass();
        S._aiCtrl.tick({ enabled: Boolean(S.settings.aiSummary), url: location.href, videoId: vid });
    }, 350);
}

function boot() {
    injectAdStyles(document);
    bindManualCaptionListeners(document, window, null, () => {
        S.subsUserTouchedVideo = S.videoId;
        setTimeout(() => {
            const p = getPlayer();
            if (p && typeof p.isSubtitlesOn === 'function' && !p.isSubtitlesOn()) {
                clearFallbackCaptions(document, window);
            }
        }, 60);
    });
    resolveUserNativeLang().then(lang => { S.userNativeLang = lang; }).catch(() => {});

    subscribeSettings(window, document, nextSettings => {
        S.settings = nextSettings;
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
    });

    document.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        const item = ev.target?.closest?.('.ytp-quality-menu .ytp-menuitem');
        if (item) S.qualityState.manualOverride = true;
    }, true);

    setInterval(() => {
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
    }, 800);

    const navObs = new MutationObserver(() => {
        if (location.href !== S.lastUrl) {
            S.lastUrl = location.href;
            onNavigate();
        }
    });
    if (document.body) {
        navObs.observe(document.body, { childList: true, subtree: false });
    }

    window.addEventListener('yt-navigate-start', () => {
        S.sbVideoId = null;
        S.sbSegments = [];
        clearVideoCache();
        S._aiCtrl.resetForVideo('', false);
    }, { passive: true });
    window.addEventListener('yt-navigate-finish', () => onNavigate(), { passive: true });
    window.addEventListener('yt-page-data-updated', () => onNavigate(), { passive: true });

    onNavigate();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
})();
