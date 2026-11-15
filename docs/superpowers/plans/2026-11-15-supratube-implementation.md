# Supratube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir en `C:\Users\Sofía\Downloads\Miximus\supratube` la extensión Chrome MV3 modular **Supratube** (fork arquitectónico de `Miximus`/`chan2txt` con auto-actualizador desde `https://github.com/tivp/supratube` e ícono de YouTube de cristal), evolucionando `yotube 1.txt` para cumplir las 5 metas sin iconos ni paneles dentro de YouTube.

**Architecture:** La extensión usa el patrón MV3 de `chan2txt`: `page-hook.js` (`MAIN`, `document_start`) provee polyfills `GM_*`, `content.js` (`ISOLATED`, `document_start`) puentea HTTP CORS hacia `background.js` y sincroniza toggles del popup hacia `MAIN`, mientras `background.js` compila `modules/*.js` descargados desde `tivp/supratube` en una IIFE registrada vía `chrome.userScripts` (`world: 'MAIN'`, `runAt: 'document_start'`) con respaldo local en `script.js`. Toda la lógica de negocio vive en `modules/*.js` en ESM puro sin dependencias externas y con funciones puras testeadas con `node --test`.

**Tech Stack:** Chrome Extension Manifest V3 (`userScripts`, `scripting`, `storage`, `tabs`), ES Modules, Node.js 24 (`node --test` + `node:assert/strict`), Python 3 + Pillow (procesamiento de íconos PNG 16/48/128).

## Global Constraints

1. **Cero elementos visuales en YouTube salvo la barra verde:** Sin botón flotante, sin panel, sin toasts ni botones de descarga sobre páginas de YouTube; únicamente marcadores verdes sobre `.ytp-progress-bar` (desktop) y `.progress-bar-line`/`.advancement-bar-line` (móvil).
2. **Paridad de compilación ESM → IIFE:** Todo archivo en `modules/*.js` puede usar únicamente `import ... from '...'` y `export function` / `export async function` / `export const` / `export let` (nunca `export default` ni `export { ... }`), sin colisiones de nombres globales entre módulos, para que `compilarBundleDesdeModulos` en `background.js` y `tools/build-bundle.mjs` generen un `script.js` válido 1:1.
3. **Resguardo del repo padre:** Trabajar únicamente dentro de `C:\Users\Sofía\Downloads\Miximus\supratube\` (con su propio `.git` apuntando a `tivp/supratube`); no modificar `Miximus` ni `chan2txt`. Conservar `yotube 1.txt` sin borrar como archivo de referencia.
4. **Ícono de YouTube de cristal:** Generar `icons/icon-16.png`, `icons/icon-48.png` y `icons/icon-128.png` con transparencia limpia para `manifest.json` y `popup.html`.
5. **Calidad 1080p sin upsell:** Preferir `1080p60 Premium` > `1080p Premium` > `1080p60` > `1080p` > mayor `<1080p`; filtrar estrictamente `isPlayable !== false` y nunca seleccionar `1440p`/`2160p`/`4320p`.
6. **Subtítulos preservando estado del usuario:** Variantes hispanas (`es`, `es-MX`, `es-ES`, `es-419`, `es-AR`, etc.) equivalen a `es`. Solo apagar subtítulos en videos en idioma natal si `supratube_cc_auto === '1'` (activados desde apagado por el propio script en un video extranjero previo); si los activó/dejó el usuario, conservarlos intactos.
7. **TDD estricto:** Ningún código de producción antes de ver fallar la prueba en `node --test`.

---

## File Structure

- `package.json` — Scripts `"test": "node --test tests/*.test.js"` y `"build": "node tools/build-bundle.mjs"`, `"type": "module"`.
- `.gitignore` — Excluye `.superpowers/` y archivos temporales locales.
- `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png` — Íconos cristalinos de YouTube en 3 tamaños.
- `manifest.json` — Configuración MV3 de Supratube.
- `page-hook.js` — Polyfill `GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `GM_addStyle` en `MAIN`.
- `content.js` — Puente DOM HTTP/abort, propagación de `supratube_settings`, disparo de `SUPRATUBE_INIT_TAB`.
- `background.js` — Proxy HTTP CORS, compilador y registrador `chrome.userScripts` desde `tivp/supratube`, fallback `script.js`.
- `popup.html` & `popup.js` — Popup estilo Maximus/chan2txt con ícono de cristal, switches por defecto activos y botón de actualización GitHub.
- `modules/config.js` — Constantes, tabla país→idioma, claves de cookies y selectores.
- `modules/utils.js` — Helpers puros de idioma/cookies/URL/settings/GM HTTP.
- `modules/adblock.js` — Limpieza Capa 0 (`ytInitialPlayerResponse`, `fetch`, `XHR`, CSS) + salto/aceleración Capa 1.
- `modules/sponsorblock.js` — Fetch SHA-256 `sponsor.ajay.app`, caché TTL 5m, salto anti-bucle y barra verde en progreso.
- `modules/quality.js` — Selector inteligente `1080p` (`1080p60 Premium` / `1080p60` / `1080p` / `<1080p`).
- `modules/geo-lang.js` — Cascada IP (`ipapi.co` → `freeipapi.com` → `ipwho.is` → `api.country.is`) + persistencia en cookie `.youtube.com`.
- `modules/subtitles.js` — Detección audio/ASR + máquina de subtítulos (preservación manual, nativo `es*`, fallback `en` → auto-translate `es`).
- `modules/main.js` — Orquestador SPA en YouTube (`document_start` + navegación + eventos `<video>`).
- `tools/build-bundle.mjs` — Generador determinista de `script.js` desde `modules/*.js`.
- `script.js` — Bundle compilado local listo para fallback en `chrome.scripting`.
- `tests/*.test.js` — Suite `node --test` cubriendo todos los módulos puros, compilador de bundle y validez estructural de la extensión.

---

### Task 1: Scaffolding Base, Package, Gitignore e Íconos de Cristal

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png` (desde imagen generada)
- Create: `modules/config.js`
- Create: `modules/utils.js`
- Test: `tests/config-utils.test.js`

**Interfaces:**
- Produces in `modules/config.js`: `CFG`, `DEFAULT_SETTINGS`, `ORDEN_MODULOS`, `GEO_COOKIE_NAME`, `SPONSOR_CATEGORIES`, `SPONSOR_COLORS`, `COUNTRY_TO_LANG`, `SKIP_SELECTORS`, `ENFORCEMENT_SELS`, `AD_PRUNE_KEYS`, `AD_RENDERER_KEYS`.
- Produces in `modules/utils.js`: `getVideoId(url)`, `normalizeBaseLang(code)`, `extractLangFromAudioTrackId(id)`, `readCookie(cookieStr, name)`, `buildCookieString(name, value, maxAgeSec, domain)`, `gmRequest(opts)`, `readBridgeSettings(doc)`, `subscribeSettings(win, doc, onChange)`.

- [ ] **Step 1: Write the failing test (`tests/config-utils.test.js`)**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config-utils.test.js`
Expected: FAIL (`Cannot find module '../modules/config.js'`)

- [ ] **Step 3: Write `package.json`, `.gitignore`, process crystal icons into `icons/`, and write `modules/config.js` + `modules/utils.js`**

Write `package.json`:
```json
{
  "name": "supratube",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "build": "node tools/build-bundle.mjs"
  }
}
```

Write `.gitignore`:
```gitignore
.superpowers/
node_modules/
*.tmp
```

Convert generated crystal YouTube image into transparent `icons/icon-128.png`, `icons/icon-48.png`, `icons/icon-16.png` using Pillow flood-fill background removal from outer white corners + Lanczos downsampling + verify sizes `128x128`, `48x48`, `16x16`.

Write `modules/config.js`:
```js
export const CFG = Object.freeze({
    version: '1.0.0',
    sbApi: 'https://sponsor.ajay.app/api/skipSegments',
    sbCacheTTL: 5 * 60 * 1000,
    geoRefreshMs: 24 * 60 * 60 * 1000,
    geoCookieMaxAgeSec: 7 * 24 * 60 * 60,
    targetHeight: 1080
});

export const ORDEN_MODULOS = Object.freeze([
    'config.js',
    'utils.js',
    'adblock.js',
    'sponsorblock.js',
    'quality.js',
    'geo-lang.js',
    'subtitles.js',
    'main.js'
]);

export const DEFAULT_SETTINGS = Object.freeze({
    adSkip: true,
    sponsorBlock: true,
    greenBar: true,
    auto1080p: true,
    autoSubtitles: true
});

export const GEO_COOKIE_NAME = 'supratube_geo_lang';
export const CC_AUTO_STORAGE_KEY = 'supratube_cc_auto';

export const SPONSOR_CATEGORIES = Object.freeze([
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

export const SPONSOR_ACTION_TYPES = Object.freeze(['skip', 'mute']);

export const SPONSOR_COLORS = Object.freeze({
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

export const SKIP_SELECTORS = Object.freeze([
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    'button[class*="skip-ad"]',
    '[id*="skip-button"] button'
]);

export const ENFORCEMENT_SELS = Object.freeze([
    'ytd-enforcement-message-view-model',
    'yt-playability-error-supported-renderers',
    '[id="enforcement-message"]',
    'yt-player-error-message-renderer'
]);

export const AD_PRUNE_KEYS = Object.freeze([
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

export const AD_RENDERER_KEYS = Object.freeze([
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

export const COUNTRY_TO_LANG = Object.freeze({
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
```

Write `modules/utils.js`:
```js
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

export function normalizeBaseLang(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!clean) return '';
    return clean.split('-')[0];
}

export function extractLangFromAudioTrackId(trackId) {
    const raw = String(trackId || '').trim();
    if (!raw) return '';
    const beforeDot = raw.split('.')[0];
    return normalizeBaseLang(beforeDot);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config-utils.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore icons modules/config.js modules/utils.js tests/config-utils.test.js
git commit -m "feat: scaffolding base, iconos de cristal y utilidades"
```

---

### Task 2: Módulo Anti-Anuncios (`modules/adblock.js`)

**Files:**
- Create: `modules/adblock.js`
- Test: `tests/adblock.test.js`

**Interfaces:**
- Consumes: `AD_PRUNE_KEYS`, `AD_RENDERER_KEYS`, `SKIP_SELECTORS`, `ENFORCEMENT_SELS` from `./config.js`.
- Produces: `isAdItem(item)`, `pruneAdObject(obj, depth)`, `injectNoAdContextBody(bodyStr)`, `installLayer0AdPrune(win)`, `injectAdStyles()`, `isAdPlaying(player)`, `getSkipBtn(player)`, `trySkipAd(deps)`, `dismissEnforcement(doc, win)`.

- [ ] **Step 1: Write the failing test (`tests/adblock.test.js`)**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/adblock.test.js`
Expected: FAIL (`Cannot find module '../modules/adblock.js'`)

- [ ] **Step 3: Implement `modules/adblock.js`**

```js
import { AD_PRUNE_KEYS, AD_RENDERER_KEYS, SKIP_SELECTORS, ENFORCEMENT_SELS } from './config.js';

const API_PRUNE_RE = /\/youtubei\/v1\/(player|next|get_watch|reel\/reel_item_watch|browse|search|guide)/;

export function isAdItem(it) {
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

export function pruneAdObject(obj, depth = 0) {
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

export function injectNoAdContextBody(body) {
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

export function installLayer0AdPrune(win = typeof window !== 'undefined' ? window : null) {
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

export function injectAdStyles(doc = typeof document !== 'undefined' ? document : null) {
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

export function isAdPlaying(player) {
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

export function getSkipBtn(player) {
    if (!player?.querySelector) return null;
    for (let i = 0; i < SKIP_SELECTORS.length; i++) {
        const btn = player.querySelector(SKIP_SELECTORS[i]);
        if (btn && btn.offsetParent !== null) return btn;
    }
    return null;
}

export function dismissEnforcement(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
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

export function trySkipAd({ enabled, player, video, state, doc, win }) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/adblock.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add modules/adblock.js tests/adblock.test.js
git commit -m "feat: agregar módulo anti-anuncios capa 0 y salto activo"
```

---

### Task 3: SponsorBlock y Barra de Navegación Verde (`modules/sponsorblock.js`)

**Files:**
- Create: `modules/sponsorblock.js`
- Test: `tests/sponsorblock.test.js`

**Interfaces:**
- Consumes: `CFG`, `SPONSOR_CATEGORIES`, `SPONSOR_ACTION_TYPES`, `SPONSOR_COLORS` from `./config.js`, `gmRequest` from `./utils.js`.
- Produces: `parseSponsorSegments(rawText, videoId)`, `computeSegmentLayout(seg, duration)`, `findSegmentToActOn(segments, currentTime, state)`, `sha256Prefix(str)`, `fetchSponsorSegments(videoId, cacheMap)`, `injectSponsorBarStyles(doc)`, `renderGreenProgressBar(segments, duration, doc, enabled)`, `tickSponsorBlock({ video, segments, state, enabled })`.

- [ ] **Step 1: Write the failing test (`tests/sponsorblock.test.js`)**

```js
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

    // Simulate seek landed inside edge or user stayed at end: same uuid is not immediately re-skipped
    state.lastSkippedUuid = 's1';
    assert.equal(findSegmentToActOn(segs, 15, state), null);

    // Once playback leaves segment, guard resets so a later re-entry skips again
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sponsorblock.test.js`
Expected: FAIL (`Cannot find module '../modules/sponsorblock.js'`)

- [ ] **Step 3: Implement `modules/sponsorblock.js`**

```js
import { CFG, SPONSOR_CATEGORIES, SPONSOR_ACTION_TYPES, SPONSOR_COLORS } from './config.js';
import { gmRequest } from './utils.js';

export function parseSponsorSegments(rawText, videoId) {
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

export function computeSegmentLayout(seg, duration) {
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

export function findSegmentToActOn(segments, currentTime, state) {
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

export async function sha256Prefix(str) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
    } catch {
        return null;
    }
}

export async function fetchSponsorSegments(videoId, cacheMap = new Map()) {
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

export function injectSponsorBarStyles(doc = typeof document !== 'undefined' ? document : null) {
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

export function renderGreenProgressBar(segments, duration, doc = typeof document !== 'undefined' ? document : null, enabled = true) {
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

export function tickSponsorBlock({ video, segments, state, enabled }) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sponsorblock.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add modules/sponsorblock.js tests/sponsorblock.test.js
git commit -m "feat: SponsorBlock con barra verde en el reproductor"
```

---

### Task 4: Selector Inteligente de Calidad 1080p / 1080p60 / Premium (`modules/quality.js`)

**Files:**
- Create: `modules/quality.js`
- Test: `tests/quality.test.js`

**Interfaces:**
- Produces: `parseQualityHeight(label)`, `selectBest1080pFormat(qualityData)`, `selectFallbackQualityLevel(levels)`, `apply1080pQuality(player, state)`.

- [ ] **Step 1: Write the failing test (`tests/quality.test.js`)**

```js
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

    // Second call with same formatId is skipped
    assert.equal(apply1080pQuality(player, state, true), false);

    // Manual override blocks changes
    state.manualOverride = true;
    state.lastFormatId = null;
    assert.equal(apply1080pQuality(player, state, true), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/quality.test.js`
Expected: FAIL (`Cannot find module '../modules/quality.js'`)

- [ ] **Step 3: Implement `modules/quality.js`**

```js
const FALLBACK_ORDER = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

export function parseQualityHeight(label) {
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

export function selectBest1080pFormat(qualityData) {
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

export function selectFallbackQualityLevel(levels) {
    if (!Array.isArray(levels) || !levels.length) return null;
    for (let i = 0; i < FALLBACK_ORDER.length; i++) {
        if (levels.includes(FALLBACK_ORDER[i])) return FALLBACK_ORDER[i];
    }
    const valid = levels.find(l => l && l !== 'auto');
    return valid || null;
}

export function apply1080pQuality(player, state, enabled = true) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/quality.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add modules/quality.js tests/quality.test.js
git commit -m "feat: selector de calidad 1080p, 1080p60 y 1080p Premium"
```

---

### Task 5: Seguimiento de IP y Cookie de Idioma Natal (`modules/geo-lang.js`)

**Files:**
- Create: `modules/geo-lang.js`
- Test: `tests/geo-lang.test.js`

**Interfaces:**
- Consumes: `CFG`, `GEO_COOKIE_NAME`, `COUNTRY_TO_LANG` from `./config.js`, `normalizeBaseLang`, `readCookie`, `buildCookieString`, `gmRequest` from `./utils.js`.
- Produces: `countryToLang(cc)`, `parseGeoCookie(cookieStr)`, `serializeGeoCookie(record)`, `extractLangFromGeoPayload(providerName, data)`, `resolveUserNativeLang(deps)`.

- [ ] **Step 1: Write the failing test (`tests/geo-lang.test.js`)**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/geo-lang.test.js`
Expected: FAIL (`Cannot find module '../modules/geo-lang.js'`)

- [ ] **Step 3: Implement `modules/geo-lang.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/geo-lang.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add modules/geo-lang.js tests/geo-lang.test.js
git commit -m "feat: seguimiento de idioma por IP con guardado en cookie"
```

---

### Task 6: Subtítulos Inteligentes, Variantes Regionales y Auto-Traducción (`modules/subtitles.js`)

**Files:**
- Create: `modules/subtitles.js`
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Consumes: `CC_AUTO_STORAGE_KEY` from `./config.js`, `normalizeBaseLang`, `extractLangFromAudioTrackId` from `./utils.js`.
- Produces: `detectVideoAudioLang(inputs)`, `findBestNativeCaptionTrack(tracks, userLang)`, `findTranslationSourceTrack(tracks)`, `findTranslationTarget(translationLanguages, userLang)`, `buildPlayerTrackArg(track, translationTarget)`, `chooseSubtitleAction(inputs)`, `bindManualCaptionListeners(doc, win, storage)`, `applySmartSubtitles(player, deps)`.

- [ ] **Step 1: Write the failing test (`tests/subtitles.test.js`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectVideoAudioLang,
    chooseSubtitleAction,
    buildPlayerTrackArg,
    applySmartSubtitles
} from '../modules/subtitles.js';

test('detectVideoAudioLang inspects active dubbed audio track first, then default audio, then asr caption', () => {
    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: { id: 'es-419.10' },
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'es'
    );
    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: null,
            adaptiveFormats: [{ audioTrack: { id: 'en.4', audioIsDefault: true } }],
            captionTracks: [{ languageCode: 'es-MX', vssId: '.es-MX' }]
        }),
        'en'
    );
    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: null,
            adaptiveFormats: [],
            captionTracks: [
                { languageCode: 'es-419', vssId: '.es-419' },
                { languageCode: 'en', kind: 'asr', vssId: 'a.en' }
            ]
        }),
        'en'
    );
});

test('chooseSubtitleAction preserves user-enabled subtitles on Spanish video and disables only script-enabled ones', () => {
    // Video is es-MX, user native is es, user had captions ON manually -> keep untouched
    const keepUser = chooseSubtitleAction({
        videoLang: 'es-MX',
        userLang: 'es',
        captionTracks: [{ languageCode: 'es-MX', kind: 'asr', vssId: 'a.es-MX' }],
        translationLanguages: [],
        captionsCurrentlyOn: true,
        autoActivatedByScript: false
    });
    assert.equal(keepUser.action, 'noop');

    // Video is es-ES, user native is es, script previously turned captions ON -> turn off
    const turnOffScript = chooseSubtitleAction({
        videoLang: 'es-ES',
        userLang: 'es',
        captionTracks: [{ languageCode: 'es-ES', kind: 'asr', vssId: 'a.es-ES' }],
        translationLanguages: [],
        captionsCurrentlyOn: true,
        autoActivatedByScript: true
    });
    assert.equal(turnOffScript.action, 'disable');
});

test('chooseSubtitleAction selects native es/es-419/es-MX/asr track before falling back to en -> auto-translate es', () => {
    const directEs = chooseSubtitleAction({
        videoLang: 'en',
        userLang: 'es',
        captionTracks: [
            { languageCode: 'en', kind: 'asr', vssId: 'a.en', isTranslatable: true },
            { languageCode: 'es-419', vssId: '.es-419', name: { simpleText: 'Español (Latinoamérica)' } }
        ],
        translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }],
        captionsCurrentlyOn: false,
        autoActivatedByScript: false
    });
    assert.equal(directEs.action, 'select_native');
    assert.equal(directEs.track.languageCode, 'es-419');

    const fallbackTranslate = chooseSubtitleAction({
        videoLang: 'en',
        userLang: 'es',
        captionTracks: [
            { languageCode: 'fr', vssId: '.fr', isTranslatable: true },
            { languageCode: 'en', kind: 'asr', vssId: 'a.en', isTranslatable: true, name: { simpleText: 'English (auto-generated)' } }
        ],
        translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }],
        captionsCurrentlyOn: false,
        autoActivatedByScript: false
    });
    assert.equal(fallbackTranslate.action, 'translate');
    assert.equal(fallbackTranslate.sourceTrack.languageCode, 'en');
    assert.equal(fallbackTranslate.translationTarget.languageCode, 'es');
});

test('applySmartSubtitles executes two-step translationLanguage setOption and marks auto-activated only when previously off', async () => {
    const setOptionCalls = [];
    let toggled = false;
    const player = {
        loadModule: () => {},
        toggleSubtitles: () => { toggled = true; },
        getOption: (mod, key) => {
            if (key === 'tracklist') {
                return [{ languageCode: 'en', kind: 'asr', vssId: 'a.en', isTranslatable: true, displayName: 'English (auto-generated)' }];
            }
            if (key === 'track') return {};
            return null;
        },
        setOption: (mod, key, val) => setOptionCalls.push([mod, key, structuredClone(val)]),
        getPlayerResponse: () => ({
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en', isTranslatable: true }],
                    translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }]
                }
            }
        })
    };
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

    await applySmartSubtitles(player, {
        enabled: true,
        userLang: 'es',
        storage,
        doc: { querySelector: () => ({ getAttribute: () => 'false' }) },
        scheduleFn: fn => fn()
    });

    assert.equal(toggled, true);
    assert.equal(store.get('supratube_cc_auto'), '1');
    assert.equal(setOptionCalls.length, 2);
    assert.equal(setOptionCalls[0][2].languageCode, 'en');
    assert.equal(setOptionCalls[1][2].translationLanguage.languageCode, 'es');
    assert.equal(buildPlayerTrackArg({ languageCode: 'es', vssId: '.es' }).vss_id, '.es');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/subtitles.test.js`
Expected: FAIL (`Cannot find module '../modules/subtitles.js'`)

- [ ] **Step 3: Implement `modules/subtitles.js`**

```js
import { CC_AUTO_STORAGE_KEY } from './config.js';
import { normalizeBaseLang, extractLangFromAudioTrackId } from './utils.js';

function readTrackText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (field.simpleText) return field.simpleText;
    if (Array.isArray(field.runs)) return field.runs.map(r => r.text || '').join('');
    return '';
}

export function detectVideoAudioLang({ activeAudioTrack, adaptiveFormats, captionTracks, playerResponse }) {
    if (activeAudioTrack) {
        const direct =
            extractLangFromAudioTrackId(activeAudioTrack.id || activeAudioTrack.audioTrackId) ||
            normalizeBaseLang(activeAudioTrack.languageCode);
        if (direct) return direct;
        const capInfo = activeAudioTrack.captions;
        if (capInfo?.id) {
            const capLang = extractLangFromAudioTrackId(capInfo.id);
            if (capLang) return capLang;
        }
    }

    if (Array.isArray(adaptiveFormats)) {
        const defFmt = adaptiveFormats.find(f => f?.audioTrack?.audioIsDefault);
        const defLang = extractLangFromAudioTrackId(defFmt?.audioTrack?.id);
        if (defLang) return defLang;
    }

    if (Array.isArray(captionTracks)) {
        const asrTrack = captionTracks.find(t => t && (t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.')));
        if (asrTrack?.languageCode) {
            return normalizeBaseLang(asrTrack.languageCode);
        }
    }

    const microLang =
        playerResponse?.videoDetails?.defaultAudioLanguage ||
        playerResponse?.microformat?.playerMicroformatRenderer?.defaultAudioLanguage;
    if (microLang) return normalizeBaseLang(microLang);

    if (Array.isArray(captionTracks) && captionTracks.length === 1 && captionTracks[0]?.languageCode) {
        return normalizeBaseLang(captionTracks[0].languageCode);
    }

    return '';
}

export function findBestNativeCaptionTrack(tracks, userLang) {
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

export function findTranslationSourceTrack(tracks) {
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

export function findTranslationTarget(translationLanguages, userLang) {
    const base = normalizeBaseLang(userLang);
    if (!base || !Array.isArray(translationLanguages)) return null;
    const exact = translationLanguages.find(l => normalizeBaseLang(l.languageCode) === base);
    if (!exact) return null;
    return {
        languageCode: exact.languageCode,
        languageName: readTrackText(exact.languageName) || exact.languageCode
    };
}

export function buildPlayerTrackArg(track, translationTarget = null) {
    const obj = {
        languageCode: track.languageCode,
        languageName: readTrackText(track.name || track.languageName) || track.languageCode,
        kind: track.kind || '',
        displayName: readTrackText(track.displayName || track.name) || track.languageCode,
        is_translateable: track.is_translateable ?? track.isTranslatable ?? true,
        vss_id: track.vss_id || track.vssId || ''
    };
    if (translationTarget) {
        obj.translationLanguage = {
            languageCode: translationTarget.languageCode,
            languageName: translationTarget.languageName
        };
    }
    return obj;
}

export function chooseSubtitleAction({
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

export function bindManualCaptionListeners(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, explicitStorage = null) {
    if (!doc || !win || doc.__supratubeCapListenerBound) return;
    doc.__supratubeCapListenerBound = true;
    const storage = getStorageSafe(explicitStorage);
    const clearAutoFlag = () => {
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
    };

    doc.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        if (ev.target?.closest?.('.ytp-subtitles-button')) {
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

export async function applySmartSubtitles(player, deps = {}) {
    if (!deps.enabled || !player) return false;
    const doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    const storage = getStorageSafe(deps.storage);
    const scheduleFn = deps.scheduleFn || (fn => setTimeout(fn, 0));

    try { player.loadModule?.('captions'); } catch {}

    const pr = player.getPlayerResponse?.() || {};
    const prCaps = pr.captions?.playerCaptionsTracklistRenderer || {};
    const tracklist = player.getOption?.('captions', 'tracklist', { includeAsr: true });
    const captionTracks = (Array.isArray(tracklist) && tracklist.length) ? tracklist : (prCaps.captionTracks || []);
    const translationLanguages = prCaps.translationLanguages || [];

    const activeTrack = player.getOption?.('captions', 'track');
    const ccBtn = doc?.querySelector?.('.ytp-subtitles-button');
    const captionsCurrentlyOn = ccBtn?.getAttribute?.('aria-pressed') === 'true' || Boolean(activeTrack?.languageCode);
    const autoActivatedByScript = storage?.getItem(CC_AUTO_STORAGE_KEY) === '1';

    const videoLang = detectVideoAudioLang({
        activeAudioTrack: player.getAudioTrack?.(),
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
        try { player.setOption?.('captions', 'track', {}); } catch {}
        if (ccBtn?.getAttribute?.('aria-pressed') === 'true') {
            try { player.toggleSubtitles?.(); } catch {}
        }
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        return true;
    }

    if (!captionsCurrentlyOn) {
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '1'); } catch {}
        try { player.toggleSubtitles?.(); } catch {}
    }

    if (decision.action === 'select_native') {
        const arg = buildPlayerTrackArg(decision.track);
        try { player.setOption?.('captions', 'track', arg); } catch {}
        return true;
    }

    if (decision.action === 'translate') {
        const baseArg = buildPlayerTrackArg(decision.sourceTrack);
        const translatedArg = buildPlayerTrackArg(decision.sourceTrack, decision.translationTarget);
        try { player.setOption?.('captions', 'track', baseArg); } catch {}
        scheduleFn(() => {
            try { player.setOption?.('captions', 'track', translatedArg); } catch {}
        });
        return true;
    }

    return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/subtitles.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add modules/subtitles.js tests/subtitles.test.js
git commit -m "feat: detección de idioma del video y subtítulos con auto-traducción"
```

---

### Task 7: Orquestador (`modules/main.js`), Compilador de Bundle (`tools/build-bundle.mjs`) y `script.js`

**Files:**
- Create: `modules/main.js`
- Create: `tools/build-bundle.mjs`
- Create: `script.js` (generado por `build-bundle.mjs`)
- Test: `tests/bundle.test.js`

**Interfaces:**
- Consumes all `modules/*.js`.
- Produces: `compileBundle(modulesMap)` in `tools/build-bundle.mjs`, runtime boot in `modules/main.js`, compiled `script.js`.

- [ ] **Step 1: Write the failing test (`tests/bundle.test.js`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { compileBundle } from '../tools/build-bundle.mjs';
import { ORDEN_MODULOS } from '../modules/config.js';

test('compileBundle builds a syntactically valid IIFE from all 8 modules', () => {
    const map = {};
    for (const name of ORDEN_MODULOS) {
        map[name] = fs.readFileSync(path.resolve('modules', name), 'utf8');
    }
    const bundled = compileBundle(map);
    assert.match(bundled, /window\.__supratubeEjecutado/);
    assert.doesNotMatch(bundled, /^import\s+/m);
    assert.doesNotMatch(bundled, /^export\s+/m);
    // Parse syntax via vm.Script without executing in browser
    assert.doesNotThrow(() => new vm.Script(bundled, { filename: 'script.js' }));
});

test('generated script.js exists on disk and parses cleanly', () => {
    const code = fs.readFileSync(path.resolve('script.js'), 'utf8');
    assert.ok(code.length > 5000);
    assert.doesNotThrow(() => new vm.Script(code, { filename: 'script.js' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bundle.test.js`
Expected: FAIL (`Cannot find module '../tools/build-bundle.mjs'`)

- [ ] **Step 3: Implement `modules/main.js`, `tools/build-bundle.mjs`, and run `node tools/build-bundle.mjs` to generate `script.js`**

Write `modules/main.js`:
```js
import { getVideoId, readBridgeSettings, subscribeSettings } from './utils.js';
import { installLayer0AdPrune, injectAdStyles, trySkipAd, dismissEnforcement } from './adblock.js';
import { fetchSponsorSegments, renderGreenProgressBar, tickSponsorBlock } from './sponsorblock.js';
import { apply1080pQuality } from './quality.js';
import { resolveUserNativeLang } from './geo-lang.js';
import { bindManualCaptionListeners, applySmartSubtitles } from './subtitles.js';

installLayer0AdPrune(window);
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
    if (S._player && S._player.isConnected) return S._player;
    S._player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    return S._player;
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
    S.qualityState.manualOverride = false;
    S.qualityState.lastFormatId = null;
    S.subsAppliedForVideo = null;
}

function runAdPass() {
    if (!S.settings.adSkip) return;
    trySkipAd({
        enabled: true,
        player: getPlayer(),
        video: getVideo(),
        state: S.adState,
        doc: document,
        win: window
    });
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
    if (S.subsAppliedForVideo === vid) return;
    const player = getPlayer();
    if (!player) return;
    if (!S.userNativeLang) {
        S.userNativeLang = await resolveUserNativeLang();
    }
    if (getVideoId() !== vid) return;
    const applied = await applySmartSubtitles(player, {
        enabled: S.settings.autoSubtitles,
        userLang: S.userNativeLang,
        doc: document
    });
    if (applied || player.getPlayerResponse?.()?.videoDetails?.videoId === vid) {
        S.subsAppliedForVideo = vid;
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
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (
                            node.tagName?.includes('ENFORCEMENT') ||
                            node.id?.includes('enforcement') ||
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
    }, 350);
}

function boot() {
    injectAdStyles(document);
    bindManualCaptionListeners(document, window);
    resolveUserNativeLang().then(lang => { S.userNativeLang = lang; }).catch(() => {});

    subscribeSettings(window, document, nextSettings => {
        S.settings = nextSettings;
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
    });

    document.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        const item = ev.target?.closest?.('.ytp-quality-menu .ytp-menuitem');
        if (item) S.qualityState.manualOverride = true;
    }, true);

    setInterval(() => {
        if (S.settings.adSkip) runAdPass();
        else dismissEnforcement(document, window);
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
```

Write `tools/build-bundle.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDEN_MODULOS } from '../modules/config.js';

export function compileBundle(mapaModulos) {
    const bloques = ORDEN_MODULOS.map(nombre => {
        let codigo = String(mapaModulos[nombre] || '');
        codigo = codigo.replace(/^import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^import\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^export\s+(async\s+function|function|const|let)/gm, '$1');
        return `// --- ${nombre} ---\n${codigo.trim()}`;
    });

    return `(() => {\n'use strict';\nif (window.__supratubeEjecutado) return;\nwindow.__supratubeEjecutado = true;\n\n${bloques.join('\n\n')}\n})();\n`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const modulos = {};
    for (const nombre of ORDEN_MODULOS) {
        modulos[nombre] = fs.readFileSync(path.join(root, 'modules', nombre), 'utf8');
    }
    const output = compileBundle(modulos);
    fs.writeFileSync(path.join(root, 'script.js'), output, 'utf8');
    console.log(`[build-bundle] script.js generado (${output.length} bytes, ${ORDEN_MODULOS.length} módulos).`);
}
```

- [ ] **Step 4: Run `node tools/build-bundle.mjs` and `node --test tests/bundle.test.js`**

Run: `node tools/build-bundle.mjs && node --test tests/bundle.test.js`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add modules/main.js tools/build-bundle.mjs script.js tests/bundle.test.js
git commit -m "feat: orquestador SPA en YouTube y compilador de bundle"
```

---

### Task 8: Cascarón Chrome MV3, Auto-Actualizador (`tivp/supratube`) y Popup Cristalino

**Files:**
- Create: `manifest.json`
- Create: `page-hook.js`
- Create: `content.js`
- Create: `background.js`
- Create: `popup.html`
- Create: `popup.js`
- Test: `tests/extension-manifest.test.js`

**Interfaces:**
- `manifest.json` -> references `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`, `background.js`, `page-hook.js`, `content.js`, `popup.html`.
- `background.js` -> uses exact `ORDEN_MODULOS`, `REPO_API_COMMIT` (`https://api.github.com/repos/tivp/supratube/commits/main`), `REPO_RAW_BASE` (`https://raw.githubusercontent.com/tivp/supratube/main`), `SUPRATUBE_*` messaging actions.

- [ ] **Step 1: Write the failing test (`tests/extension-manifest.test.js`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ORDEN_MODULOS } from '../modules/config.js';

test('manifest.json is valid MV3 with crystal icons, userScripts, and required host permissions', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.icons['128'], 'icons/icon-128.png');
    assert.equal(manifest.action.default_icon, 'icons/icon-128.png');
    assert.ok(manifest.permissions.includes('userScripts'));
    assert.ok(manifest.permissions.includes('storage'));
    assert.ok(manifest.permissions.includes('scripting'));
    assert.ok(manifest.host_permissions.includes('https://sponsor.ajay.app/*'));
    assert.ok(manifest.host_permissions.includes('https://raw.githubusercontent.com/*'));
    assert.ok(manifest.host_permissions.includes('https://ipapi.co/*'));
    for (const rel of ['icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png', 'background.js', 'content.js', 'page-hook.js', 'popup.html', 'popup.js']) {
        assert.equal(fs.existsSync(path.resolve(rel)), true, `${rel} must exist`);
    }
});

test('background.js targets tivp/supratube and keeps ORDEN_MODULOS parity with config.js', () => {
    const bg = fs.readFileSync(path.resolve('background.js'), 'utf8');
    assert.match(bg, /repos\/tivp\/supratube\/commits\/main/);
    assert.match(bg, /raw\.githubusercontent\.com\/tivp\/supratube\/main/);
    for (const mod of ORDEN_MODULOS) {
        assert.ok(bg.includes(`'${mod}'`), `background.js must include ${mod}`);
    }
    assert.doesNotThrow(() => new vm.Script(bg, { filename: 'background.js' }));
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.resolve('page-hook.js'), 'utf8'), { filename: 'page-hook.js' }));
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.resolve('content.js'), 'utf8'), { filename: 'content.js' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/extension-manifest.test.js`
Expected: FAIL (`ENOENT: no such file or directory, open '.../manifest.json'`)

- [ ] **Step 3: Implement `manifest.json`, `page-hook.js`, `content.js`, `background.js`, `popup.html`, and `popup.js`**

Write `manifest.json`:
```json
{
    "manifest_version": 3,
    "name": "Supratube | Maximus",
    "version": "1.0.0",
    "description": "YouTube sin anuncios, 1080p/Premium automático, barra verde SponsorBlock y subtítulos inteligentes según tu idioma por IP.",
    "author": "tivp",
    "icons": {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "128": "icons/icon-128.png"
    },
    "action": {
        "default_popup": "popup.html",
        "default_icon": "icons/icon-128.png",
        "default_title": "Supratube | Maximus"
    },
    "permissions": [
        "storage",
        "scripting",
        "tabs",
        "userScripts"
    ],
    "host_permissions": [
        "https://www.youtube.com/*",
        "https://m.youtube.com/*",
        "https://youtube.com/*",
        "https://sponsor.ajay.app/*",
        "https://ipapi.co/*",
        "https://freeipapi.com/*",
        "https://ipwho.is/*",
        "https://api.country.is/*",
        "https://raw.githubusercontent.com/*",
        "https://api.github.com/*"
    ],
    "background": {
        "service_worker": "background.js"
    },
    "content_scripts": [
        {
            "matches": [
                "https://www.youtube.com/*",
                "https://m.youtube.com/*"
            ],
            "js": [
                "page-hook.js"
            ],
            "run_at": "document_start",
            "world": "MAIN",
            "all_frames": false
        },
        {
            "matches": [
                "https://www.youtube.com/*",
                "https://m.youtube.com/*"
            ],
            "js": [
                "content.js"
            ],
            "run_at": "document_start",
            "all_frames": false
        }
    ],
    "web_accessible_resources": [
        {
            "resources": [
                "modules/*.js",
                "icons/*.png"
            ],
            "matches": [
                "https://www.youtube.com/*",
                "https://m.youtube.com/*"
            ]
        }
    ]
}
```

Write `page-hook.js`:
```js
// Provee GM_xmlhttpRequest, GM_addStyle, GM_getValue y GM_setValue en el mundo MAIN.

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    if (window.__supratubeGmPolyfillReady) {
        return;
    }
    window.__supratubeGmPolyfillReady = true;

    let reqSeq = 0;
    const memStore = new Map();

    if (typeof window.GM_xmlhttpRequest !== 'function') {
        window.GM_xmlhttpRequest = function (detalles) {
            const opts = detalles || {};
            const requestId = `st_${++reqSeq}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const eventName = `supratube-bridge-res-${requestId}`;
            let terminado = false;
            let timer = null;

            const limpiar = () => {
                clearTimeout(timer);
                window.removeEventListener(eventName, onResp);
            };

            const onResp = ev => {
                if (terminado) return;
                terminado = true;
                limpiar();

                const payload = ev.detail || {};
                if (payload.error) {
                    if (/tiempo agotado/i.test(payload.error) && typeof opts.ontimeout === 'function') {
                        opts.ontimeout();
                    } else if (typeof opts.onerror === 'function') {
                        opts.onerror(payload);
                    }
                    return;
                }

                if (typeof opts.onload === 'function') {
                    opts.onload({
                        status: payload.status ?? 0,
                        responseText: payload.text ?? '',
                        finalUrl: payload.finalUrl || opts.url
                    });
                }
            };

            window.addEventListener(eventName, onResp);

            const timeoutMs = Number(opts.timeout) || 12000;
            timer = setTimeout(() => {
                if (terminado) return;
                terminado = true;
                limpiar();
                window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                if (typeof opts.ontimeout === 'function') {
                    opts.ontimeout();
                }
            }, timeoutMs + 500);

            window.dispatchEvent(
                new CustomEvent('supratube-bridge-http', {
                    detail: {
                        requestId,
                        url: opts.url,
                        method: opts.method || 'GET',
                        headers: opts.headers ? { ...opts.headers } : {},
                        body: opts.data,
                        anonymous: Boolean(opts.anonymous),
                        timeout: timeoutMs
                    }
                })
            );

            return {
                abort() {
                    if (terminado) return;
                    terminado = true;
                    limpiar();
                    window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                    if (typeof opts.onabort === 'function') {
                        opts.onabort();
                    }
                }
            };
        };
    }

    if (typeof window.GM_addStyle !== 'function') {
        window.GM_addStyle = function (cssText) {
            const style = document.createElement('style');
            style.textContent = String(cssText ?? '');
            const parent = document.head || document.documentElement;
            if (parent) parent.appendChild(style);
            return style;
        };
    }

    if (typeof window.GM_getValue !== 'function') {
        window.GM_getValue = function (clave, defecto) {
            try {
                const raw = localStorage.getItem(`supratube_gm_${clave}`);
                if (raw !== null) return JSON.parse(raw);
            } catch {
                // Respaldo en memoria si localStorage no está disponible.
            }
            return memStore.has(clave) ? memStore.get(clave) : defecto;
        };
    }

    if (typeof window.GM_setValue !== 'function') {
        window.GM_setValue = function (clave, valor) {
            memStore.set(clave, valor);
            try {
                localStorage.setItem(`supratube_gm_${clave}`, JSON.stringify(valor));
            } catch {
                // Ignorar error de cuota o almacenamiento privado.
            }
        };
    }
})();
```

Write `content.js`:
```js
// Puente DOM entre el mundo MAIN y background.js (HTTP CORS, ajustes del popup e inicio de pestaña).

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    const SETTINGS_KEY = 'supratube_settings';
    const DEFAULT_SETTINGS = {
        adSkip: true,
        sponsorBlock: true,
        greenBar: true,
        auto1080p: true,
        autoSubtitles: true
    };

    const syncSettingsToPage = (raw, dispatchEvent) => {
        const merged = {
            ...DEFAULT_SETTINGS,
            ...(raw && typeof raw === 'object' ? raw : {})
        };
        if (document.documentElement) {
            document.documentElement.dataset.supratubeBridge = '1';
            document.documentElement.dataset.supratubeSettings = JSON.stringify(merged);
        }
        if (dispatchEvent) {
            window.dispatchEvent(new CustomEvent('supratube-settings-updated', { detail: merged }));
        }
    };

    syncSettingsToPage(DEFAULT_SETTINGS, false);

    try {
        chrome.storage.local.get(SETTINGS_KEY, datos => {
            if (chrome.runtime.lastError) return;
            syncSettingsToPage(datos?.[SETTINGS_KEY], true);
        });
    } catch {
        // Usar valores por defecto si storage aún no está listo.
    }

    try {
        chrome.storage.onChanged.addListener((cambios, area) => {
            if (area === 'local' && cambios?.[SETTINGS_KEY]) {
                syncSettingsToPage(cambios[SETTINGS_KEY].newValue, true);
            }
        });
    } catch {
        // Ignorar si la extensión acaba de recargarse.
    }

    window.addEventListener('supratube-bridge-http', e => {
        const detalle = e.detail;
        if (!detalle?.requestId || !detalle?.url) return;

        const eventoRespuesta = `supratube-bridge-res-${detalle.requestId}`;

        try {
            chrome.runtime.sendMessage(
                {
                    action: 'SUPRATUBE_HTTP_REQUEST',
                    requestId: detalle.requestId,
                    url: detalle.url,
                    method: detalle.method,
                    headers: detalle.headers,
                    body: detalle.body,
                    anonymous: detalle.anonymous,
                    timeout: detalle.timeout
                },
                respuesta => {
                    const payload = chrome.runtime.lastError
                        ? { error: chrome.runtime.lastError.message }
                        : (respuesta || { error: 'Sin respuesta del background' });
                    window.dispatchEvent(new CustomEvent(eventoRespuesta, { detail: payload }));
                }
            );
        } catch (err) {
            window.dispatchEvent(
                new CustomEvent(eventoRespuesta, {
                    detail: { error: err?.message || 'Error al enviar petición' }
                })
            );
        }
    });

    window.addEventListener('supratube-bridge-abort', e => {
        const requestId = e.detail?.requestId;
        if (!requestId) return;
        try {
            chrome.runtime.sendMessage({ action: 'SUPRATUBE_ABORT', requestId });
        } catch {
            // La pestaña pudo cerrarse antes de abortar.
        }
    });

    try {
        chrome.runtime.sendMessage({ action: 'SUPRATUBE_INIT_TAB' }, () => {
            void chrome.runtime.lastError;
        });
    } catch {
        // Ignorar si el contexto de la extensión acaba de recargarse.
    }
})();
```

Write `background.js`:
```js
// Service Worker: proxy HTTP sin CORS (SponsorBlock e IP geo) y compilador/actualizador desde GitHub.

const REPO_API_COMMIT = 'https://api.github.com/repos/tivp/supratube/commits/main';
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/tivp/supratube/main';
const CACHE_KEY = 'supratube_github_cache';
const USER_SCRIPT_ID = 'supratube-github-bundle';
const MATCHES_YOUTUBE = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];

const ORDEN_MODULOS = [
    'config.js',
    'utils.js',
    'adblock.js',
    'sponsorblock.js',
    'quality.js',
    'geo-lang.js',
    'subtitles.js',
    'main.js'
];

const controladoresActivos = new Map();

function tieneSoporteUserScripts() {
    return typeof chrome.userScripts !== 'undefined' && typeof chrome.userScripts.register === 'function';
}

// Empaqueta los 8 módulos ESM en una sola IIFE para ejecutarla en el mundo MAIN.
function compilarBundleDesdeModulos(mapaModulos) {
    const bloques = ORDEN_MODULOS.map(nombre => {
        let codigo = String(mapaModulos[nombre] || '');
        codigo = codigo.replace(/^import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^import\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^export\s+(async\s+function|function|const|let)/gm, '$1');
        return `// --- ${nombre} ---\n${codigo.trim()}`;
    });

    return `(() => {\n'use strict';\nif (window.__supratubeEjecutado) return;\nwindow.__supratubeEjecutado = true;\n\n${bloques.join('\n\n')}\n})();\n`;
}

async function sincronizarUserScriptRegistrado(codigoCompilado) {
    if (!tieneSoporteUserScripts() || !codigoCompilado) {
        return false;
    }

    try {
        try {
            await chrome.userScripts.unregister({ ids: [USER_SCRIPT_ID] });
        } catch {
            // No había versión previa registrada.
        }

        try {
            await chrome.userScripts.register([
                {
                    id: USER_SCRIPT_ID,
                    matches: MATCHES_YOUTUBE,
                    allFrames: false,
                    js: [{ code: codigoCompilado }],
                    runAt: 'document_start',
                    world: 'MAIN'
                }
            ]);
            return true;
        } catch {
            if (typeof chrome.userScripts.configureWorld === 'function') {
                try {
                    await chrome.userScripts.configureWorld({ messaging: true });
                } catch {
                    // El puente DOM de content.js sigue disponible como respaldo.
                }
            }
            await chrome.userScripts.register([
                {
                    id: USER_SCRIPT_ID,
                    matches: MATCHES_YOUTUBE,
                    allFrames: false,
                    js: [{ code: codigoCompilado }],
                    runAt: 'document_start',
                    world: 'USER_SCRIPT'
                }
            ]);
            return true;
        }
    } catch {
        return false;
    }
}

async function asegurarUserScriptDesdeCache() {
    if (!tieneSoporteUserScripts()) return { activo: false, registradoAhora: false, cache: null };

    const datos = await chrome.storage.local.get(CACHE_KEY);
    const cache = datos[CACHE_KEY] || null;
    if (!cache?.codigoCompilado) {
        return { activo: false, registradoAhora: false, cache: null };
    }

    try {
        const existentes = await chrome.userScripts.getScripts({ ids: [USER_SCRIPT_ID] });
        if (existentes && existentes.length > 0) {
            return { activo: true, registradoAhora: false, cache };
        }
    } catch {
        // Reintentar registro abajo.
    }

    const ok = await sincronizarUserScriptRegistrado(cache.codigoCompilado);
    return { activo: ok, registradoAhora: ok, cache };
}

async function inyectarScriptLocalEnMain(tabId, frameId) {
    if (!tabId) return false;
    const frameIds = typeof frameId === 'number' ? [frameId] : undefined;
    const target = frameIds ? { tabId, frameIds } : { tabId };

    try {
        const [chk] = await chrome.scripting.executeScript({
            target,
            world: 'MAIN',
            func: () => Boolean(window.__supratubeEjecutado)
        });
        if (chk?.result) {
            return true;
        }
        await chrome.scripting.executeScript({
            target,
            world: 'MAIN',
            files: ['script.js'],
            injectImmediately: true
        });
        return true;
    } catch {
        return false;
    }
}

async function ejecutarCodigoEnPestana(tabId, codigoCompilado) {
    if (!tabId || !codigoCompilado) return false;

    if (tieneSoporteUserScripts() && typeof chrome.userScripts.execute === 'function') {
        for (const world of ['MAIN', 'USER_SCRIPT']) {
            try {
                await chrome.userScripts.execute({
                    target: { tabId },
                    js: [{ code: codigoCompilado }],
                    world
                });
                return true;
            } catch {
                // Probar siguiente mundo o respaldo local.
            }
        }
    }

    return inyectarScriptLocalEnMain(tabId);
}

async function actualizarScriptsDesdeGithub() {
    const resCommit = await fetch(`${REPO_API_COMMIT}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
    });

    if (!resCommit.ok) {
        throw new Error(`No se pudo consultar GitHub (HTTP ${resCommit.status})`);
    }

    const commitData = await resCommit.json();
    const sha = String(commitData.sha || '');
    const shaCorto = sha ? sha.slice(0, 7) : 'main';
    const mensajeCommit = String(commitData.commit?.message || 'Actualización').split('\n')[0].trim();
    const fechaCommit = commitData.commit?.author?.date || '';

    const entradas = await Promise.all(
        ORDEN_MODULOS.map(async nombre => {
            const url = `${REPO_RAW_BASE}/modules/${nombre}?t=${Date.now()}`;
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) {
                throw new Error(`Error al bajar modules/${nombre} (HTTP ${resp.status})`);
            }
            const texto = await resp.text();
            return [nombre, texto];
        })
    );

    const modulos = Object.fromEntries(entradas);
    const codigoCompilado = compilarBundleDesdeModulos(modulos);

    const cache = {
        sha,
        shaCorto,
        mensajeCommit,
        fechaCommit,
        actualizadoEn: new Date().toLocaleString('es-CL'),
        modulos,
        codigoCompilado
    };

    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    const userScriptsActivo = await sincronizarUserScriptRegistrado(codigoCompilado);

    let pestanasActualizadas = 0;
    try {
        const pestanas = await chrome.tabs.query({ url: MATCHES_YOUTUBE });
        for (const tab of pestanas) {
            if (tab.id) {
                const ejecutado = await ejecutarCodigoEnPestana(tab.id, codigoCompilado);
                if (ejecutado) pestanasActualizadas++;
            }
        }
    } catch {
        // Ignorar si no hay pestañas de YouTube abiertas.
    }

    return {
        ok: true,
        cache: {
            sha: cache.sha,
            shaCorto: cache.shaCorto,
            mensajeCommit: cache.mensajeCommit,
            fechaCommit: cache.fechaCommit,
            actualizadoEn: cache.actualizadoEn,
            totalModulos: ORDEN_MODULOS.length
        },
        userScriptsActivo,
        pestanasActualizadas
    };
}

asegurarUserScriptDesdeCache().catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
    asegurarUserScriptDesdeCache().catch(() => {});
});

chrome.runtime.onMessage.addListener((mensaje, sender, enviarRespuesta) => {
    if (!mensaje || typeof mensaje !== 'object') return false;

    if (mensaje.action === 'SUPRATUBE_ABORT') {
        const ctrl = controladoresActivos.get(mensaje.requestId);
        if (ctrl) {
            controladoresActivos.delete(mensaje.requestId);
            try {
                ctrl.abort();
            } catch {
                // La petición ya estaba cerrada.
            }
        }
        enviarRespuesta({ ok: true });
        return false;
    }

    if (mensaje.action === 'SUPRATUBE_HTTP_REQUEST') {
        const {
            requestId,
            url,
            method = 'GET',
            headers = {},
            body,
            anonymous = false,
            timeout = 12000
        } = mensaje;
        const ctrl = new AbortController();
        if (requestId) controladoresActivos.set(requestId, ctrl);

        const reloj = setTimeout(() => ctrl.abort(), timeout);
        const finalBody = method === 'GET' || method === 'HEAD' ? undefined : body;

        fetch(url, {
            method,
            headers,
            body: finalBody,
            credentials: anonymous ? 'omit' : 'include',
            cache: 'no-store',
            redirect: 'follow',
            signal: ctrl.signal
        })
            .then(async r => {
                const text = await r.text();
                enviarRespuesta({
                    status: r.status,
                    text,
                    finalUrl: r.url || url
                });
            })
            .catch(err => {
                enviarRespuesta({
                    error: err?.name === 'AbortError' ? 'Tiempo agotado o cancelado' : (err?.message || 'Error de red')
                });
            })
            .finally(() => {
                clearTimeout(reloj);
                if (requestId) controladoresActivos.delete(requestId);
            });

        return true;
    }

    if (mensaje.action === 'SUPRATUBE_GET_STATUS') {
        chrome.storage.local
            .get(CACHE_KEY)
            .then(datos => {
                const c = datos[CACHE_KEY];
                enviarRespuesta({
                    ok: true,
                    cache: c
                        ? {
                              sha: c.sha,
                              shaCorto: c.shaCorto,
                              mensajeCommit: c.mensajeCommit,
                              fechaCommit: c.fechaCommit,
                              actualizadoEn: c.actualizadoEn,
                              totalModulos: Object.keys(c.modulos || {}).length
                          }
                        : null,
                    userScriptsActivo: tieneSoporteUserScripts(),
                    extensionId: chrome.runtime.id
                });
            })
            .catch(err => {
                enviarRespuesta({ ok: false, error: err?.message || 'Error al leer estado' });
            });
        return true;
    }

    if (mensaje.action === 'SUPRATUBE_UPDATE_SCRIPTS') {
        actualizarScriptsDesdeGithub()
            .then(res => enviarRespuesta(res))
            .catch(err =>
                enviarRespuesta({ ok: false, error: err?.message || 'Error al actualizar desde GitHub' })
            );
        return true;
    }

    if (mensaje.action === 'SUPRATUBE_INIT_TAB') {
        asegurarUserScriptDesdeCache()
            .then(async info => {
                if (info.activo) {
                    if (info.registradoAhora && sender.tab?.id && info.cache?.codigoCompilado) {
                        await ejecutarCodigoEnPestana(sender.tab.id, info.cache.codigoCompilado);
                    }
                    enviarRespuesta({ inyectadoRemoto: true });
                    return;
                }

                let inyectadoLocalMain = false;
                if (sender.tab?.id) {
                    inyectadoLocalMain = await inyectarScriptLocalEnMain(sender.tab.id, sender.frameId);
                }
                enviarRespuesta({ inyectadoRemoto: false, inyectadoLocalMain });
            })
            .catch(() => {
                enviarRespuesta({ inyectadoRemoto: false, inyectadoLocalMain: false });
            });
        return true;
    }

    return false;
});
```

Write `popup.html`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Supratube | Maximus</title>
    <style>
        body {
            margin: 0;
            padding: 14px 16px;
            width: 315px;
            background: #f8fafc;
            color: #1e293b;
            font: 13px/1.45 Arial, sans-serif;
        }
        .cabecera {
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #cbd5e1;
            margin-bottom: 10px;
        }
        .cabecera img {
            width: 34px;
            height: 34px;
            object-fit: contain;
        }
        .titulo {
            font-weight: 700;
            font-size: 15px;
            color: #0f172a;
        }
        .version {
            font-size: 11px;
            color: #64748b;
        }
        .controles {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin: 8px 0;
        }
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 8px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            font-size: 12px;
            color: #334155;
            cursor: pointer;
            user-select: none;
        }
        .toggle-row:hover {
            border-color: #cbd5e1;
        }
        .toggle-row input {
            accent-color: #dc2626;
            width: 15px;
            height: 15px;
            cursor: pointer;
        }
        .nota {
            margin-top: 8px;
            padding: 7px 9px;
            background: #e2e8f0;
            border-radius: 4px;
            font-size: 11px;
            color: #334155;
        }
        .actualizacion-box {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .btn-actualizar {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #1e3a5f;
            border-radius: 5px;
            background: #26394b;
            color: #ffffff;
            font: 700 12px Arial, sans-serif;
            cursor: pointer;
            transition: background-color 0.15s, opacity 0.15s;
        }
        .btn-actualizar:hover:not(:disabled) {
            background: #1a2937;
        }
        .btn-actualizar:disabled {
            opacity: 0.65;
            cursor: wait;
        }
        .btn-permiso {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid #d97706;
            border-radius: 4px;
            background: #fef3c7;
            color: #92400e;
            font: 600 11px Arial, sans-serif;
            cursor: pointer;
        }
        .btn-permiso:hover {
            background: #fde68a;
        }
        .estado-sync {
            padding: 6px 8px;
            border-radius: 4px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            font-size: 11px;
            color: #475569;
            word-break: break-word;
        }
        .estado-sync.ok {
            background: #ecfdf5;
            border-color: #34d399;
            color: #065f46;
        }
        .estado-sync.error {
            background: #fef2f2;
            border-color: #f87171;
            color: #991b1b;
        }
        .repo-link {
            font-size: 11px;
            color: #2563eb;
            text-decoration: none;
            align-self: flex-start;
        }
        .repo-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="cabecera">
        <img src="icons/icon-48.png" alt="Supratube">
        <div>
            <div class="titulo">Supratube</div>
            <div class="version">Maximus Motor · v1.0.0</div>
        </div>
    </div>
    <div class="controles">
        <label class="toggle-row">
            <span>Saltar y bloquear anuncios</span>
            <input type="checkbox" data-setting="adSkip" checked>
        </label>
        <label class="toggle-row">
            <span>Saltar patrocinadores (SponsorBlock)</span>
            <input type="checkbox" data-setting="sponsorBlock" checked>
        </label>
        <label class="toggle-row">
            <span>Barra de navegación verde</span>
            <input type="checkbox" data-setting="greenBar" checked>
        </label>
        <label class="toggle-row">
            <span>Calidad 1080p / Premium automática</span>
            <input type="checkbox" data-setting="auto1080p" checked>
        </label>
        <label class="toggle-row">
            <span>Subtítulos automáticos por IP</span>
            <input type="checkbox" data-setting="autoSubtitles" checked>
        </label>
    </div>
    <div class="nota">
        100% silencioso en YouTube: cero iconos o paneles flotantes sobre el reproductor.
    </div>
    <div class="actualizacion-box">
        <button id="btn-actualizar-scripts" class="btn-actualizar" type="button">
            Actualizar los scripts de la extensión
        </button>
        <div id="estado-actualizacion" class="estado-sync">
            Comprobando estado...
        </div>
        <button id="btn-permiso-userscripts" class="btn-permiso" type="button" hidden>
            Activar permiso UserScripts en Chrome
        </button>
        <a class="repo-link" href="https://github.com/tivp/supratube" target="_blank" rel="noopener">
            github.com/tivp/supratube
        </a>
    </div>
    <script type="module" src="popup.js"></script>
</body>
</html>
```

Write `popup.js`:
```js
// Popup de Supratube: toggles persistentes y sincronización de módulos desde GitHub.

import { DEFAULT_SETTINGS } from './modules/config.js';

const SETTINGS_KEY = 'supratube_settings';
const checkboxes = Array.from(document.querySelectorAll('input[data-setting]'));
const btnActualizar = document.getElementById('btn-actualizar-scripts');
const estadoEl = document.getElementById('estado-actualizacion');
const btnPermiso = document.getElementById('btn-permiso-userscripts');

let extensionIdActual = '';

function leerTogglesDOM() {
    const out = { ...DEFAULT_SETTINGS };
    for (const cb of checkboxes) {
        const key = cb.dataset.setting;
        if (key) out[key] = Boolean(cb.checked);
    }
    return out;
}

function aplicarTogglesDOM(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    for (const cb of checkboxes) {
        const key = cb.dataset.setting;
        if (key && key in merged) {
            cb.checked = Boolean(merged[key]);
        }
    }
}

chrome.storage.local.get(SETTINGS_KEY, datos => {
    if (!chrome.runtime.lastError) {
        aplicarTogglesDOM(datos?.[SETTINGS_KEY]);
    }
});

for (const cb of checkboxes) {
    cb.addEventListener('change', () => {
        chrome.storage.local.set({ [SETTINGS_KEY]: leerTogglesDOM() });
    });
}

function mostrarEstado(texto, tipo = '') {
    estadoEl.textContent = texto;
    estadoEl.className = tipo ? `estado-sync ${tipo}` : 'estado-sync';
}

function pintarEstadoGuardado(respuesta) {
    if (!respuesta || !respuesta.ok) {
        mostrarEstado(respuesta?.error || 'Usando versión local v1.0.0');
        return;
    }

    extensionIdActual = respuesta.extensionId || chrome.runtime.id;
    btnPermiso.hidden = Boolean(respuesta.userScriptsActivo);

    if (respuesta.cache) {
        const c = respuesta.cache;
        const avisoPermiso = respuesta.userScriptsActivo
            ? ''
            : ' · Activa "Permitir scripts de usuario" para aplicar los cambios en vivo';
        mostrarEstado(
            `Sincronizado #${c.shaCorto} (${c.mensajeCommit}) · ${c.actualizadoEn}${avisoPermiso}`,
            respuesta.userScriptsActivo ? 'ok' : ''
        );
    } else {
        mostrarEstado('Usando módulos locales v1.0.0. Pulsa el botón para traer la última versión de GitHub.');
    }
}

chrome.runtime.sendMessage({ action: 'SUPRATUBE_GET_STATUS' }, respuesta => {
    if (chrome.runtime.lastError) {
        mostrarEstado('Usando versión local v1.0.0');
        return;
    }
    pintarEstadoGuardado(respuesta);
});

btnActualizar.addEventListener('click', () => {
    btnActualizar.disabled = true;
    const textoOriginal = btnActualizar.textContent;
    btnActualizar.textContent = 'Actualizando desde GitHub...';
    mostrarEstado('Descargando módulos desde GitHub...');

    chrome.runtime.sendMessage({ action: 'SUPRATUBE_UPDATE_SCRIPTS' }, respuesta => {
        btnActualizar.disabled = false;
        btnActualizar.textContent = textoOriginal;

        if (chrome.runtime.lastError) {
            mostrarEstado(`Error: ${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (!respuesta || !respuesta.ok) {
            mostrarEstado(`Error: ${respuesta?.error || 'No se pudo actualizar'}`, 'error');
            return;
        }

        btnPermiso.hidden = Boolean(respuesta.userScriptsActivo);

        const c = respuesta.cache;
        const extraTabs = respuesta.pestanasActualizadas
            ? ` · ${respuesta.pestanasActualizadas} pestaña(s) actualizada(s)`
            : '';

        if (respuesta.userScriptsActivo) {
            mostrarEstado(
                `¡Actualizado! Commit #${c.shaCorto} (${c.mensajeCommit}) · ${c.actualizadoEn}${extraTabs}`,
                'ok'
            );
        } else {
            mostrarEstado(
                `Descargado #${c.shaCorto}, pero falta activar "Permitir scripts de usuario" en los detalles de la extensión.`,
                'error'
            );
        }
    });
});

btnPermiso.addEventListener('click', () => {
    const id = extensionIdActual || chrome.runtime.id;
    chrome.tabs.create({ url: `chrome://extensions/?id=${id}` });
});
```

- [ ] **Step 4: Run full test suite (`npm test`)**

Run: `npm test`
Expected: PASS (all tests across `tests/*.test.js` green)

- [ ] **Step 5: Commit and push to `https://github.com/tivp/supratube` (only after verifying tests + git status)**

```bash
git add manifest.json page-hook.js content.js background.js popup.html popup.js tests/extension-manifest.test.js
git commit -m "feat: extensión Chrome MV3 Supratube con auto-actualizador y popup cristalino"
git push -u origin main
```
