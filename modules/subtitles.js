import { CC_AUTO_STORAGE_KEY } from './config.js';
import {
    normalizeBaseLang,
    extractLangFromAudioTrackId,
    isDubbedAutoAudioTrackId,
    isUndeterminedLang
} from './utils.js';

function readTrackText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (field.simpleText) return field.simpleText;
    if (Array.isArray(field.runs)) return field.runs.map(r => r.text || '').join('');
    return '';
}

function extractSingleAudioTrackLang(track) {
    if (!track) return '';
    const langInfoId = typeof track.getLanguageInfo === 'function' ? track.getLanguageInfo()?.id : '';
    const directCode = normalizeBaseLang(track.languageCode);
    return (
        extractLangFromAudioTrackId(langInfoId) ||
        extractLangFromAudioTrackId(track.id || track.audioTrackId) ||
        (!isUndeterminedLang(directCode) ? directCode : '') ||
        extractLangFromAudioTrackId(track.captions?.id)
    );
}

function isAutoDubbedTrack(track) {
    if (!track) return false;
    if (track.isAutoDubbed === true) return true;
    if (typeof track.isAutoDubbed === 'function' && track.isAutoDubbed() === true) return true;
    if (typeof track.getLanguageInfo === 'function' && track.getLanguageInfo()?.isAutoDubbed === true) return true;
    return isDubbedAutoAudioTrackId(track.id || track.audioTrackId);
}

export function detectVideoAudioLang({ activeAudioTrack, availableAudioTracks, adaptiveFormats, captionTracks, playerResponse }) {
    const activeIsAutoDub = isAutoDubbedTrack(activeAudioTrack);
    const activeLang = extractSingleAudioTrackLang(activeAudioTrack);
    if (activeLang && !activeIsAutoDub) {
        return activeLang;
    }

    if (Array.isArray(availableAudioTracks)) {
        const originalTrack = availableAudioTracks.find(t => !isAutoDubbedTrack(t) && extractSingleAudioTrackLang(t));
        if (originalTrack) return extractSingleAudioTrackLang(originalTrack);
    }

    if (Array.isArray(adaptiveFormats)) {
        const defFmt = adaptiveFormats.find(
            f => f?.audioTrack?.audioIsDefault && (!activeIsAutoDub || !isDubbedAutoAudioTrackId(f?.audioTrack?.id))
        );
        const defLang = extractLangFromAudioTrackId(defFmt?.audioTrack?.id);
        if (defLang) return defLang;

        if (activeIsAutoDub) {
            const origFmt = adaptiveFormats.find(
                f => f?.audioTrack?.id && !isDubbedAutoAudioTrackId(f.audioTrack.id) && extractLangFromAudioTrackId(f.audioTrack.id)
            );
            const origLang = extractLangFromAudioTrackId(origFmt?.audioTrack?.id);
            if (origLang) return origLang;
        }
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

function isShortsCaptionMenuClick(target) {
    const popup = target?.closest?.('ytd-popup-container, tp-yt-iron-dropdown');
    if (!popup) return false;
    const item = target.closest('yt-list-item-view-model, [role="menuitemradio"], [role="menuitem"], tp-yt-paper-item');
    if (!item) return false;
    const popupText = popup.textContent || '';
    return /subt[ií]tulos|captions|traducir autom[aá]ticamente|auto-translate/i.test(popupText);
}

export function bindManualCaptionListeners(
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

export async function applySmartSubtitles(player, deps = {}) {
    if (!deps.enabled || !player) return false;
    const doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    const storage = getStorageSafe(deps.storage);
    const scheduleFn = deps.scheduleFn || (fn => setTimeout(fn, 0));

    const playerVid = player.getVideoData?.()?.video_id;
    if (deps.expectedVideoId && playerVid && playerVid !== deps.expectedVideoId) {
        return false;
    }

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
    const playerSubsOn = typeof player.isSubtitlesOn === 'function' ? player.isSubtitlesOn() : null;
    const scopedBtn = player.querySelector?.('.ytp-subtitles-button');
    const ccBtn = scopedBtn || (typeof player.querySelector !== 'function' ? doc?.querySelector?.('.ytp-subtitles-button') : null);
    const captionsCurrentlyOn = playerSubsOn !== null
        ? Boolean(playerSubsOn)
        : (ccBtn?.getAttribute?.('aria-pressed') === 'true' || Boolean(activeTrack?.languageCode));
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
        try { player.setOption?.('captions', 'track', {}); } catch {}
        const stillOn = (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === true) ||
            ccBtn?.getAttribute?.('aria-pressed') === 'true';
        if (stillOn) {
            try { player.toggleSubtitles?.(); } catch {}
        }
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        return true;
    }

    if (captionsCurrentlyOn && isMatchingActiveTrack(activeTrack, decision)) {
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
