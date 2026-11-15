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
    const keepUser = chooseSubtitleAction({
        videoLang: 'es-MX',
        userLang: 'es',
        captionTracks: [{ languageCode: 'es-MX', kind: 'asr', vssId: 'a.es-MX' }],
        translationLanguages: [],
        captionsCurrentlyOn: true,
        autoActivatedByScript: false
    });
    assert.equal(keepUser.action, 'noop');

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

test('detectVideoAudioLang handles Shorts und tracks, protobuf IDs, getLanguageInfo, and AI auto-dubbed original source', () => {
    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: { id: 'und', getLanguageInfo: () => ({ id: 'und', isAutoDubbed: false }) },
            captionTracks: [{ languageCode: 'es', kind: 'asr', vssId: 'a.es' }]
        }),
        'es'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: {
                id: '251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw',
                isAutoDubbed: () => true,
                getLanguageInfo: () => ({ id: 'es-US.10', isAutoDubbed: true })
            },
            availableAudioTracks: [
                {
                    id: '251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw',
                    isAutoDubbed: () => true,
                    getLanguageInfo: () => ({ id: 'es-US.10', isAutoDubbed: true })
                },
                {
                    id: '251;ChEKBWFjb250EghvcmlnaW5hbAoICgNkcmMSATEKDQoEbGFuZxIFZW4tVVM',
                    isAutoDubbed: () => false,
                    getLanguageInfo: () => ({ id: 'en-US.4', isAutoDubbed: false })
                }
            ],
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'en'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: { id: '251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw' },
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'en'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: {
                id: '251;ChEKBWFjb250EghvcmlnaW5hbAoNCgRsYW5nEgVlcy1VUw',
                isAutoDubbed: () => false,
                getLanguageInfo: () => ({ id: 'es-US.4', isAutoDubbed: false })
            },
            captionTracks: [{ languageCode: 'es', kind: 'asr', vssId: 'a.es' }]
        }),
        'es'
    );
});

test('applySmartSubtitles activates and cleans up captions properly on #shorts-player across swipes', async () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

    const setOptionCalls = [];
    let toggled = false;
    let currentTrack = {};
    let subsOn = false;

    const fakeShortsPlayer = {
        id: 'shorts-player',
        querySelector: () => null,
        getVideoData: () => ({ video_id: 'KBIKtrmM80Y' }),
        loadModule: () => {},
        isSubtitlesOn: () => subsOn,
        toggleSubtitles: () => {
            toggled = true;
            subsOn = !subsOn;
        },
        getAudioTrack: () => ({
            id: '251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw',
            isAutoDubbed: () => true,
            getLanguageInfo: () => ({ id: 'es-US.10', isAutoDubbed: true })
        }),
        getAvailableAudioTracks: () => [
            {
                id: '251;ChEKBWFjb250EghvcmlnaW5hbAoICgNkcmMSATEKDQoEbGFuZxIFZW4tVVM',
                isAutoDubbed: () => false,
                getLanguageInfo: () => ({ id: 'en-US.4', isAutoDubbed: false })
            }
        ],
        getOption: (mod, key) => {
            if (key === 'tracklist') {
                return [{ languageCode: 'en', kind: 'asr', vss_id: 'a.en', is_translateable: true, languageName: 'Inglés (generado automáticamente)' }];
            }
            if (key === 'track') return currentTrack;
            return null;
        },
        setOption: (mod, key, val) => {
            setOptionCalls.push([mod, key, structuredClone(val)]);
            if (key === 'track') {
                currentTrack = structuredClone(val);
                subsOn = Boolean(val?.languageCode);
            }
        },
        getPlayerResponse: () => ({
            videoDetails: { videoId: 'KBIKtrmM80Y' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }]
                }
            }
        })
    };

    const staleMovieDoc = { querySelector: () => ({ getAttribute: () => 'true' }) };

    // 1. Stale video id mid-swipe should bail out without touching options
    const mismatched = await applySmartSubtitles(fakeShortsPlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'DIFFERENT01',
        storage,
        doc: staleMovieDoc,
        scheduleFn: fn => fn()
    });
    assert.equal(mismatched, false);
    assert.equal(setOptionCalls.length, 0);

    // 2. Foreign Short starting with subtitles OFF ignores movie_player's aria-pressed=true button
    const applied = await applySmartSubtitles(fakeShortsPlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'KBIKtrmM80Y',
        storage,
        doc: staleMovieDoc,
        scheduleFn: fn => fn()
    });
    assert.equal(applied, true);
    assert.equal(toggled, true);
    assert.equal(store.get('supratube_cc_auto'), '1');
    assert.equal(currentTrack.translationLanguage?.languageCode, 'es');

    // 3. Re-running on same Short when en >> es is already active is idempotent (0 new calls, no toggle OFF)
    const callsBeforeRepeat = setOptionCalls.length;
    toggled = false;
    await applySmartSubtitles(fakeShortsPlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'KBIKtrmM80Y',
        storage,
        doc: staleMovieDoc,
        scheduleFn: fn => fn()
    });
    assert.equal(toggled, false);
    assert.equal(setOptionCalls.length, callsBeforeRepeat);

    // 4. Swipe onto a native Spanish Short disables auto-activated captions even without .ytp-subtitles-button
    fakeShortsPlayer.getVideoData = () => ({ video_id: 'oI1_rZesMIU' });
    fakeShortsPlayer.getAudioTrack = () => ({ id: 'und', getLanguageInfo: () => ({ id: 'und', isAutoDubbed: false }) });
    fakeShortsPlayer.getAvailableAudioTracks = () => [];
    fakeShortsPlayer.getOption = (mod, key) => {
        if (key === 'tracklist') return [{ languageCode: 'es', kind: 'asr', vss_id: 'a.es', languageName: 'Español (generado automáticamente)' }];
        if (key === 'track') return currentTrack;
        return null;
    };
    fakeShortsPlayer.getPlayerResponse = () => ({
        videoDetails: { videoId: 'oI1_rZesMIU' },
        captions: { playerCaptionsTracklistRenderer: { translationLanguages: [] } }
    });

    const disabled = await applySmartSubtitles(fakeShortsPlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'oI1_rZesMIU',
        storage,
        doc: staleMovieDoc,
        scheduleFn: fn => fn()
    });
    assert.equal(disabled, true);
    assert.equal(subsOn, false);
    assert.equal(store.get('supratube_cc_auto'), '0');
});
