export const CFG = Object.freeze({
    version: '1.0.11',
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
    'ai-summary.js',
    'transcript-download.js',
    'main.js'
]);

export const DEFAULT_SETTINGS = Object.freeze({
    adSkip: true,
    sponsorBlock: true,
    greenBar: true,
    auto1080p: true,
    autoSubtitles: true,
    aiSummary: true,
    transcriptDownload: true
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
