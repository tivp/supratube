import { CFG } from './config.js';
import { getVideoId, selectActivePlayer, readBridgeSettings, subscribeSettings, gmRequest } from './utils.js';
import { installLayer0AdPrune, injectAdStyles, trySkipAd, dismissEnforcement } from './adblock.js';
import { fetchSponsorSegments, renderGreenProgressBar, tickSponsorBlock } from './sponsorblock.js';
import { apply1080pQuality } from './quality.js';
import { resolveUserNativeLang } from './geo-lang.js';
import {
    bindManualCaptionListeners,
    applySmartSubtitles,
    installTimedtextMonitor,
    clearFallbackCaptions,
    isFallbackCaptionsActive,
    detectVideoAudioLang,
    ensureAiSubtitleButton,
    removeAiSubtitleButtons,
    startManualAiCaptions
} from './subtitles.js';
import { createAiSummaryController } from './ai-summary.js';
import { createTranscriptDownloadController } from './transcript-download.js';

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
