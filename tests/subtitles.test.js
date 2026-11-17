import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectVideoAudioLang,
    chooseSubtitleAction,
    buildPlayerTrackArg,
    buildTranscriptPanelParams,
    parseTimestampSeconds,
    parseTranscriptPanelResponse,
    parseJson3Cues,
    splitTranslatedTextIntoTimedChunks,
    translateCueBatch,
    installTimedtextMonitor,
    clearFallbackCaptions,
    applySmartSubtitles,
    decodeHtmlEntities,
    parseTimedtextResponseText,
    getTtState,
    fetchTranscriptViaGetPanel,
    encodeBase64Bytes,
    ensureAiSubtitleButton,
    removeAiSubtitleButtons,
    startManualAiCaptions,
    detectTextLanguageHint
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

test('applySmartSubtitles preserves native tracklist metadata in one single setOption without burst toggleSubtitles spam', async () => {
    const setOptionCalls = [];
    let toggled = false;
    let currentTrack = {};
    let subsOn = false;
    const player = {
        loadModule: () => {},
        isSubtitlesOn: () => subsOn,
        toggleSubtitles: () => {
            toggled = true;
            subsOn = !subsOn;
        },
        getOption: (mod, key) => {
            if (key === 'tracklist') {
                return [{
                    languageCode: 'en',
                    kind: 'asr',
                    vss_id: 'a.en',
                    id: 'cap-id-1',
                    is_servable: true,
                    is_translateable: true,
                    displayName: 'English (auto-generated)'
                }];
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
        scheduleFn: fn => fn(),
        skipFallbackCheck: true
    });

    assert.equal(toggled, false);
    assert.equal(store.get('supratube_cc_auto'), '1');
    assert.equal(setOptionCalls.length, 1);
    assert.equal(setOptionCalls[0][2].languageCode, 'en');
    assert.equal(setOptionCalls[0][2].id, 'cap-id-1');
    assert.equal(setOptionCalls[0][2].is_servable, true);
    assert.equal(setOptionCalls[0][2].translationLanguage.languageCode, 'es');
    assert.equal(buildPlayerTrackArg({ languageCode: 'es', vssId: '.es' }).vss_id, '.es');
});

test('detectVideoAudioLang handles Shorts und tracks, protobuf IDs, getLanguageInfo, Vb, and respects active AI auto-dubbed audio', () => {
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
        'es'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: { id: '251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw' },
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'es'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: {
                Vb: { id: 'es-US.3', name: 'Español (US)', isAutoDubbed: true }
            },
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'es'
    );

    assert.equal(
        detectVideoAudioLang({
            activeAudioTrack: null,
            availableAudioTracks: [
                { getIsDefault: () => false, getLanguageInfo: () => ({ getId: () => 'en.4' }) },
                { getIsDefault: () => true, getLanguageInfo: () => ({ getId: () => 'es-419.3', isAutoDubbed: true }) }
            ],
            captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en' }]
        }),
        'es'
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
            id: '251;ChEKBWFjb250EghvcmlnaW5hbAoICgNkcmMSATEKDQoEbGFuZxIFZW4tVVM',
            isAutoDubbed: () => false,
            getLanguageInfo: () => ({ id: 'en-US.4', isAutoDubbed: false })
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
        scheduleFn: fn => fn(),
        skipFallbackCheck: true
    });
    assert.equal(applied, true);
    assert.equal(subsOn, true);
    assert.equal(toggled, false);
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
        scheduleFn: fn => fn(),
        skipFallbackCheck: true
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
        scheduleFn: fn => fn(),
        skipFallbackCheck: true
    });
    assert.equal(disabled, true);
    assert.equal(subsOn, false);
    assert.equal(store.get('supratube_cc_auto'), '0');
});

test('buildTranscriptPanelParams and parseTranscriptPanelResponse handle modern YouTube get_panel segments', () => {
    assert.equal(buildTranscriptPanelParams('gSGe94zTyF4'), 'qgkPCgtnU0dlOTR6VHlGNBgB');
    assert.equal(buildTranscriptPanelParams('KBIKtrmM80Y'), 'qgkPCgtLQklLdHJtTTgwWRgB');
    assert.equal(parseTimestampSeconds('0:03'), 3);
    assert.equal(parseTimestampSeconds('1:02:03'), 3723);

    const samplePayload = {
        content: {
            items: [
                {
                    timelineItemViewModel: {
                        timestamp: '0:03',
                        contentItems: [{
                            transcriptSegmentViewModel: {
                                simpleText: 'Hello Amy.',
                                timestamp: '0:03'
                            }
                        }]
                    }
                },
                {
                    timelineItemViewModel: {
                        timestamp: '0:10',
                        onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: 10 } } },
                        contentItems: [{
                            transcriptSegmentViewModel: {
                                simpleText: 'And then there was Jim the Fish.',
                                timestamp: '0:10'
                            }
                        }]
                    }
                }
            ]
        }
    };
    const parsed = parseTranscriptPanelResponse(samplePayload);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], { start: 3, end: 10, text: 'Hello Amy.' });
    assert.deepEqual(parsed[1], { start: 10, end: 16, text: 'And then there was Jim the Fish.' });

    const json3 = parseJson3Cues({
        events: [
            { tStartMs: 3000, dDurationMs: 2500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
            { tStartMs: 5500, dDurationMs: 1000, segs: [{ utf8: '\n' }] }
        ]
    });
    assert.deepEqual(json3, [{ start: 3, end: 5.5, text: 'Hello world' }]);
});

test('splitTranslatedTextIntoTimedChunks splits long translated blocks cleanly within cue duration', () => {
    const longText = 'Me encanta Doctor Who desde que era niño y solía escribir cartas de fan y así convertirme en Doctor Who fue algo increíble.';
    const chunks = splitTranslatedTextIntoTimedChunks(0, 10, longText, 60);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) {
        assert.ok(c.text.length <= 65, `chunk too long: ${c.text}`);
        assert.ok(c.end > c.start);
    }
    assert.equal(chunks[0].start, 0);
    assert.ok(Math.abs(chunks[chunks.length - 1].end - 10) < 0.001);
});

test('translateCueBatch translates newline-joined cues via gtx (url, opts) and falls back cleanly', async () => {
    const out = await translateCueBatch({
        texts: ['Hello Amy.', 'Nice bow tie.'],
        sourceLang: 'en',
        targetLang: 'es',
        requestFn: async (url, opts) => {
            assert.match(String(url), /translate\.googleapis\.com\/translate_a\/single/);
            assert.equal(opts.method, 'POST');
            assert.match(String(opts.body), /q=Hello/);
            return {
                status: 200,
                text: JSON.stringify({
                    sentences: [{ trans: 'Hola Amy.\n' }, { trans: 'Linda pajarita.' }]
                })
            };
        }
    });
    assert.deepEqual(out, ['Hola Amy.', 'Linda pajarita.']);
});

test('applySmartSubtitles activates get_panel + translated overlay when timedtext returns 429 and clears on disable', async () => {
    const elements = new Map();
    const createEl = tag => {
        const el = {
            tagName: tag.toUpperCase(),
            id: '',
            className: '',
            textContent: '',
            style: {},
            dataset: {},
            children: [],
            setAttribute(k, v) { this[k] = v; },
            getAttribute(k) { return this[k] ?? null; },
            appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
            remove() {
                if (this.parentNode) {
                    this.parentNode.children = this.parentNode.children.filter(c => c !== this);
                }
                if (this.id) elements.delete(this.id);
            },
            querySelectorAll: () => []
        };
        return el;
    };

    let currentTrack = {};
    let subsOn = false;
    const videoEl = {
        currentTime: 4.5,
        paused: false,
        listeners: {},
        addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter(f => f !== fn); }
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 1000,
        children: [],
        loadModule: () => {},
        isSubtitlesOn: () => subsOn,
        getVideoData: () => ({ video_id: 'gSGe94zTyF4' }),
        querySelector: sel => {
            if (sel === 'video') return videoEl;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            if (sel === '.ytp-subtitles-button') return { getAttribute: () => String(subsOn) };
            return null;
        },
        querySelectorAll: sel => {
            if (sel.includes('.ytp-caption-segment')) return [];
            return [];
        },
        appendChild(el) {
            this.children.push(el);
            el.parentNode = this;
            if (el.id) elements.set(el.id, el);
            return el;
        },
        getOption: (mod, key) => {
            if (key === 'tracklist') {
                return [{ languageCode: 'en', kind: 'asr', vss_id: 'a.en', is_translateable: true, displayName: 'English' }];
            }
            if (key === 'track') return currentTrack;
            return null;
        },
        setOption: (mod, key, val) => {
            if (key === 'track') {
                currentTrack = structuredClone(val);
                subsOn = Boolean(val?.languageCode);
            }
        },
        getPlayerResponse: () => ({
            videoDetails: { videoId: 'gSGe94zTyF4' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [{ languageCode: 'en', kind: 'asr', vssId: 'a.en', isTranslatable: true }],
                    translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }]
                }
            }
        })
    };

    const fakeDoc = {
        createElement: createEl,
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=gSGe94zTyF4', search: '?v=gSGe94zTyF4', pathname: '/watch' },
        ytcfg: {
            get: k => ({
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.20261112.10.00' } },
                INNERTUBE_CONTEXT_CLIENT_NAME: 1,
                INNERTUBE_CONTEXT_CLIENT_VERSION: '2.20261112.10.00'
            })[k]
        },
        fetch: async url => {
            const u = String(url);
            if (u.includes('/api/timedtext')) {
                return { ok: false, status: 429, text: async () => 'Too Many Requests' };
            }
            if (u.includes('/youtubei/v1/get_panel')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        items: [{
                            timelineItemViewModel: {
                                timestamp: '0:03',
                                contentItems: [{ transcriptSegmentViewModel: { simpleText: 'Hello Amy.', timestamp: '0:03' } }]
                            }
                        }]
                    })
                };
            }
            return { ok: false, status: 404, text: async () => '' };
        }
    };
    installTimedtextMonitor(fakeWin);
    // Simulate YouTube firing /api/timedtext -> 429
    await fakeWin.fetch('https://www.youtube.com/api/timedtext?v=gSGe94zTyF4&lang=en&tlang=es&fmt=json3');

    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

    const applied = await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'gSGe94zTyF4',
        storage,
        doc: fakeDoc,
        win: fakeWin,
        scheduleFn: fn => fn(),
        fallbackWatchdogMs: 0,
        gmRequestFn: async () => ({
            status: 200,
            text: JSON.stringify({ sentences: [{ trans: 'Hola Amy.' }] })
        })
    });

    assert.equal(applied, true);
    await new Promise(r => setTimeout(r, 20));
    const box = elements.get('supratube-fallback-captions');
    assert.ok(box, 'fallback caption container must be mounted inside player');
    assert.equal(box.children[0]?.textContent, 'Hola Amy.');

    clearFallbackCaptions(fakeDoc, fakeWin);
    assert.equal(elements.get('supratube-fallback-captions'), undefined);
});

test('applySmartSubtitles skips subtitles on auto-dubbed Spanish audio and preserves user-enabled subtitles', async () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    let subsOn = false;
    const setOptionCalls = [];

    const player = {
        getVideoData: () => ({ video_id: '4Pg9rUF1Raa' }),
        loadModule: () => {},
        isSubtitlesOn: () => subsOn,
        toggleSubtitles: () => { subsOn = !subsOn; },
        getAudioTrack: () => ({
            id: 'es-US.10',
            isAutoDubbed: () => true,
            getLanguageInfo: () => ({ id: 'es-US.10', isAutoDubbed: true })
        }),
        getAvailableAudioTracks: () => [
            { id: 'es-US.10', isAutoDubbed: () => true, getLanguageInfo: () => ({ id: 'es-US.10', isAutoDubbed: true }) },
            { id: 'en.4', isAutoDubbed: () => false, getLanguageInfo: () => ({ id: 'en.4', isAutoDubbed: false }) }
        ],
        getOption: () => undefined,
        setOption: (...args) => setOptionCalls.push(args),
        getPlayerResponse: () => ({
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [{ languageCode: 'es', kind: 'asr', vssId: 'a.es' }],
                    translationLanguages: [{ languageCode: 'es', languageName: { simpleText: 'Español' } }]
                }
            }
        })
    };

    const resOff = await applySmartSubtitles(player, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: '4Pg9rUF1Raa',
        storage,
        skipFallbackCheck: true
    });
    assert.equal(resOff, false);
    assert.equal(subsOn, false);
    assert.equal(setOptionCalls.length, 0);

    // User manually enabled subtitles on the Spanish-dubbed video: preserve them!
    subsOn = true;
    store.set('supratube_cc_auto', '0');
    const resManual = await applySmartSubtitles(player, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: '4Pg9rUF1Raa',
        storage,
        skipFallbackCheck: true
    });
    assert.equal(resManual, false);
    assert.equal(subsOn, true);

    // Script had previously auto-enabled subtitles: clean them up when Spanish dub takes effect!
    store.set('supratube_cc_auto', '1');
    const resAutoDisable = await applySmartSubtitles(player, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: '4Pg9rUF1Raa',
        storage,
        skipFallbackCheck: true
    });
    assert.equal(resAutoDisable, true);
    assert.equal(subsOn, false);
});

test('decodeHtmlEntities and parseTimedtextResponseText decode XML/JSON3/WebVTT rolling cues cleanly', () => {
    assert.equal(decodeHtmlEntities('Tom &amp;#39;Jerry&#39; &quot;OK&quot;'), 'Tom &#39;Jerry\' "OK"');
    assert.equal(decodeHtmlEntities('Tom &amp;#39;Jerry&#39;', 2), 'Tom \'Jerry\'');
    assert.equal(typeof encodeBase64Bytes, 'function');
    assert.equal(typeof getTtState, 'function');
    assert.equal(typeof fetchTranscriptViaGetPanel, 'function');

    const pXml = '<timedtext><body><p t="1500" d="2200">Hola &amp; mundo</p><p t="4000" d="1000">Adiós</p></body></timedtext>';
    const fromP = parseTimedtextResponseText(pXml);
    assert.equal(fromP.length, 2);
    assert.equal(fromP[0].start, 1.5);
    assert.equal(fromP[0].end, 3.7);
    assert.equal(fromP[0].text, 'Hola & mundo');

    const vtt = [
        'WEBVTT',
        'Kind: captions',
        '',
        '00:00:01.000 --> 00:00:03.000',
        'First line',
        '',
        '00:00:03.000 --> 00:00:03.020',
        'First line',
        'Second line',
        '',
        '00:00:03.020 --> 00:00:05.500',
        'Second line'
    ].join('\n');
    const fromVtt = parseTimedtextResponseText(vtt);
    assert.deepEqual(
        fromVtt.map(c => ({ start: c.start, text: c.text })),
        [
            { start: 1, text: 'First line' },
            { start: 3, text: 'Second line' }
        ]
    );
});

test('applySmartSubtitles recovers hidden ANDROID captions when tracklist is empty and displays translated overlay with isSubtitlesOn=false', async () => {
    const elements = new Map();
    const createEl = tag => ({
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        style: {},
        dataset: {},
        children: [],
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k] ?? null; },
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        remove() {
            if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
            if (this.id) elements.delete(this.id);
        },
        querySelectorAll: () => []
    });

    const videoEl = {
        currentTime: 2.0,
        paused: false,
        listeners: {},
        addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter(f => f !== fn); }
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 1000,
        children: [],
        loadModule: () => {},
        // Simulate YouTube "Subtítulos no disponibles": player permanently reports subs OFF and empty tracks
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'tgbNymZ7vqY' }),
        querySelector: sel => {
            if (sel === 'video') return videoEl;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            if (sel === '.ytp-subtitles-button') return { disabled: true, getAttribute: () => 'Subtítulos no disponibles' };
            return null;
        },
        querySelectorAll: () => [],
        appendChild(el) {
            this.children.push(el);
            el.parentNode = this;
            if (el.id) elements.set(el.id, el);
            return el;
        },
        getOption: () => [],
        setOption: () => {},
        getPlayerResponse: () => ({
            videoDetails: { videoId: 'tgbNymZ7vqY', title: 'Hidden Subs Video' }
        })
    };

    const fakeDoc = {
        documentElement: { dataset: {} },
        createElement: createEl,
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=tgbNymZ7vqY', search: '?v=tgbNymZ7vqY', pathname: '/watch', origin: 'https://www.youtube.com' },
        ytcfg: {
            get: k => ({
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.20261112.10.00' } },
                INNERTUBE_CONTEXT_CLIENT_NAME: 1,
                INNERTUBE_CONTEXT_CLIENT_VERSION: '2.20261112.10.00',
                INNERTUBE_API_KEY: 'AIzaTestKey'
            })[k]
        },
        fetch: async (url, init) => {
            const u = String(url);
            if (u.includes('/youtubei/v1/player')) {
                const body = JSON.parse(String(init?.body || '{}'));
                if (body?.context?.client?.clientName === 'ANDROID') {
                    return {
                        ok: true,
                        status: 200,
                        text: async () => JSON.stringify({
                            videoDetails: { videoId: 'tgbNymZ7vqY', title: 'Hidden Subs Video' },
                            captions: {
                                playerCaptionsTracklistRenderer: {
                                    captionTracks: [{ languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=tgbNymZ7vqY&lang=en&x=android' }]
                                }
                            }
                        })
                    };
                }
                return { ok: true, status: 200, text: async () => '{}' };
            }
            if (u.includes('x=android')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        events: [{ tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: 'Why dont you come see me' }] }]
                    })
                };
            }
            return { ok: false, status: 404, text: async () => '' };
        }
    };

    try {
        const applied = await applySmartSubtitles(fakePlayer, {
            enabled: true,
            userLang: 'es',
            expectedVideoId: 'tgbNymZ7vqY',
            doc: fakeDoc,
            win: fakeWin,
            skipWhisperFallback: true,
            gmRequestFn: async url => {
                if (String(url).includes('translate.googleapis.com')) {
                    return { status: 200, text: JSON.stringify({ sentences: [{ trans: 'Por qué no vienes a verme' }] }) };
                }
                return { status: 404, text: '' };
            }
        });

        assert.equal(applied, true);
        for (let w = 0; w < 20 && !elements.get('supratube-fallback-captions'); w++) {
            await new Promise(r => setTimeout(r, 15));
        }
        const box = elements.get('supratube-fallback-captions');
        assert.ok(box, 'fallback box must mount even when player.isSubtitlesOn() === false');
        assert.equal(box.children[0]?.textContent, 'Por qué no vienes a verme');
    } finally {
        clearFallbackCaptions(fakeDoc, fakeWin);
    }
    assert.equal(elements.get('supratube-fallback-captions'), undefined);
});

test('applySmartSubtitles skips Layer 1 captions when recovered ANDROID metadata shows audio matches user IP language (es)', async () => {
    const elements = new Map();
    const createEl = tag => ({
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        dataset: {},
        children: [],
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k] ?? null; },
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        remove() { if (this.id) elements.delete(this.id); },
        querySelectorAll: () => []
    });
    const fakePlayer = {
        id: 'movie_player',
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'esVid000001' }),
        querySelector: sel => (sel === 'video' ? { currentTime: 1, paused: false, addEventListener() {}, removeEventListener() {} } : null),
        querySelectorAll: () => [],
        appendChild(el) { if (el.id) elements.set(el.id, el); return el; },
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'esVid000001' } })
    };
    const fakeDoc = {
        documentElement: { dataset: {} },
        createElement: createEl,
        getElementById: id => elements.get(id) || null
    };
    let fetchedPlayer = false;
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=esVid000001', pathname: '/watch', origin: 'https://www.youtube.com' },
        ytcfg: { get: () => '' },
        fetch: async url => {
            if (String(url).includes('/youtubei/v1/player')) {
                fetchedPlayer = true;
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        videoDetails: { videoId: 'esVid000001' },
                        captions: {
                            playerCaptionsTracklistRenderer: {
                                captionTracks: [{ languageCode: 'es-419', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=esVid000001&lang=es-419' }]
                            }
                        }
                    })
                };
            }
            return { ok: false, status: 404, text: async () => '' };
        }
    };

    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'esVid000001',
        doc: fakeDoc,
        win: fakeWin,
        skipWhisperFallback: true
    });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(fetchedPlayer, true);
    assert.equal(elements.get('supratube-fallback-captions'), undefined);
});

test('applySmartSubtitles launches Layer 2 Whisper bridge on truly uncaptioned videos, renders live captions, aborts on same_language, and stops cleanly', async () => {
    const elements = new Map();
    const createEl = tag => ({
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        dataset: {},
        children: [],
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k] ?? null; },
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        remove() {
            if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
            if (this.id) elements.delete(this.id);
        },
        querySelectorAll: () => []
    });

    const videoEl = {
        currentTime: 2.0,
        paused: false,
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        addEventListener() {},
        removeEventListener() {}
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 1000,
        children: [],
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'noSubsVid01' }),
        querySelector: sel => (sel === 'video' ? videoEl : (sel === '#supratube-fallback-captions' ? (elements.get('supratube-fallback-captions') || null) : null)),
        querySelectorAll: () => [],
        appendChild(el) { this.children.push(el); el.parentNode = this; if (el.id) elements.set(el.id, el); return el; },
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'noSubsVid01' } })
    };

    const cmds = [];
    const listeners = {};
    const fakeDoc = {
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: createEl,
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    class FakeCustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=noSubsVid01', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        ytcfg: { get: () => '' },
        fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
        addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            if (ev.type === 'supratube-whisper-cmd') cmds.push(ev.detail);
            for (const fn of (listeners[ev.type] || [])) fn(ev);
        }
    };

    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'noSubsVid01',
        doc: fakeDoc,
        win: fakeWin
    });

    await new Promise(r => setTimeout(r, 30));
    assert.ok(cmds.some(c => c.action === 'start' && c.videoId === 'noSubsVid01' && c.targetLang === 'es'));
    assert.equal(videoEl.attrs['data-supratube-whisper-target'], 'noSubsVid01');

    // Emit live Whisper caption event:
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'caption', videoId: 'noSubsVid01', mode: 'final', raw: 'Hello world.', translated: 'Hola mundo.' }
    }));
    const box = elements.get('supratube-fallback-captions');
    assert.ok(box);
    assert.equal(box.children[0]?.textContent, 'Hola mundo.');
    assert.equal(box.style.display, 'block');

    // Emit same_language event in auto mode -> aborts Whisper cleanly and hides overlay:
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'same_language', videoId: 'noSubsVid01', lang: 'es' }
    }));
    assert.ok(cmds.some(c => c.action === 'stop' && c.videoId === 'noSubsVid01'));
    assert.equal(elements.get('supratube-fallback-captions'), undefined);
});

test('fallback captions sync .ytp-subtitles-button active state, tooltip, and filled icon while active and restore on clear', async () => {
    const elements = new Map();
    const origHollowPath = 'M21.20 3.01L21 3H3Z';
    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            attributesMap: map,
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const pathEl = { tagName: 'path', ...makeAttrs({ d: origHollowPath, fill: 'white' }) };
    const svgEl = {
        tagName: 'svg',
        ...makeAttrs({ viewBox: '0 0 24 24', width: '24', height: '24', 'fill-opacity': '0.3' }),
        querySelector: sel => (sel.includes('path') ? pathEl : null)
    };
    const iconWrap = {
        tagName: 'DIV',
        ...makeAttrs({ class: 'ytp-subtitles-button-icon' })
    };
    const ccListeners = {};
    const ccBtn = {
        tagName: 'BUTTON',
        disabled: true,
        style: { display: 'none' },
        dataset: {},
        ...makeAttrs({
            class: 'ytp-subtitles-button ytp-button',
            'aria-pressed': 'false',
            'aria-disabled': 'true',
            'aria-label': 'Subtítulos no disponibles',
            'data-tooltip-title': 'Subtítulos no disponibles',
            'data-title-no-tooltip': 'Subtítulos no disponibles'
        }),
        querySelector(sel) {
            if (sel === '.ytp-subtitles-button-icon') return iconWrap;
            if (sel.includes('path')) return pathEl;
            if (sel.includes('svg')) return svgEl;
            return null;
        },
        addEventListener(ev, fn) { (ccListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { ccListeners[ev] = (ccListeners[ev] || []).filter(f => f !== fn); },
        matches: () => false
    };
    const tooltipEl = { textContent: 'Subtítulos no disponibles', childNodes: [] };
    let obsCallback = null;
    let obsDisconnected = false;
    class FakeMutationObserver {
        constructor(cb) { obsCallback = cb; }
        observe() {}
        disconnect() { obsDisconnected = true; }
    }
    const createEl = tag => ({
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        dataset: {},
        children: [],
        ...makeAttrs(),
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        remove() {
            if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
            if (this.id) elements.delete(this.id);
        },
        querySelectorAll: () => []
    });
    const headChildren = [];
    const fakeDoc = {
        head: { appendChild: el => { headChildren.push(el); if (el.id) elements.set(el.id, el); } },
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: createEl,
        getElementById: id => elements.get(id) || null,
        querySelector: sel => {
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === '.ytp-tooltip-text') return tooltipEl;
            return null;
        },
        querySelectorAll: sel => (sel === '.ytp-tooltip-text' ? [tooltipEl] : [])
    };
    const listeners = {};
    const innertubeClients = [];
    class FakeCustomEvent {
        constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=ccActiveVid1', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        MutationObserver: FakeMutationObserver,
        ytcfg: { get: () => '' },
        fetch: async (_url, opts) => {
            try {
                const body = opts?.body ? JSON.parse(opts.body) : null;
                if (body?.context?.client?.clientName) innertubeClients.push(body.context.client.clientName);
            } catch {}
            return { ok: true, status: 200, text: async () => '{}' };
        },
        addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) { for (const fn of (listeners[ev.type] || [])) fn(ev); }
    };
    const videoEl = {
        currentTime: 1.0,
        paused: false,
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {}
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 1000,
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'ccActiveVid1' }),
        querySelector: sel => {
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === 'video') return videoEl;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; },
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'ccActiveVid1' } })
    };

    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'ccActiveVid1',
        doc: fakeDoc,
        win: fakeWin
    });
    await new Promise(r => setTimeout(r, 35));

    assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(ccBtn.getAttribute('data-supratube-cc-active'), '1');
    assert.equal(ccBtn.disabled, false);
    assert.equal(ccBtn.getAttribute('aria-disabled'), null);
    assert.equal(ccBtn.style.display, '');
    assert.equal(iconWrap.getAttribute('fill-opacity'), '1');
    assert.equal(svgEl.getAttribute('fill-opacity'), null);
    assert.equal(tooltipEl.textContent, 'Subtítulos IA');
    assert.match(ccBtn.getAttribute('data-tooltip-title') || '', /^Subtítulos IA \(c\)$/);
    assert.equal(ccBtn.getAttribute('data-title-no-tooltip'), 'Subtítulos IA');
    assert.notEqual(pathEl.getAttribute('d'), origHollowPath);
    assert.equal(innertubeClients.filter(c => c === 'ANDROID').length, 1);

    // Simulate YouTube fighting back to overwrite attributes + fill-opacity + hover tooltip:
    ccBtn.setAttribute('aria-pressed', 'false');
    ccBtn.setAttribute('data-tooltip-title', 'Subtítulos no disponibles');
    ccBtn.setAttribute('aria-disabled', 'true');
    iconWrap.removeAttribute('fill-opacity');
    svgEl.setAttribute('fill-opacity', '0.3');
    pathEl.setAttribute('d', origHollowPath);
    obsCallback?.([]);
    tooltipEl.textContent = 'Subtítulos no disponibles';
    for (const fn of (ccListeners.mouseenter || [])) fn();
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(ccBtn.getAttribute('data-tooltip-title'), 'Subtítulos IA (c)');
    assert.equal(ccBtn.getAttribute('aria-disabled'), null);
    assert.equal(iconWrap.getAttribute('fill-opacity'), '1');
    assert.equal(svgEl.getAttribute('fill-opacity'), null);
    assert.equal(tooltipEl.textContent, 'Subtítulos IA');
    assert.notEqual(pathEl.getAttribute('d'), origHollowPath);

    clearFallbackCaptions(fakeDoc, fakeWin);
    assert.equal(obsDisconnected, true);
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(ccBtn.getAttribute('data-supratube-cc-active'), null);
    assert.equal(ccBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(ccBtn.disabled, true);
    assert.equal(ccBtn.style.display, 'none');
    assert.equal(ccBtn.getAttribute('data-tooltip-title'), 'Subtítulos no disponibles');
    assert.equal(iconWrap.getAttribute('fill-opacity'), null);
    assert.equal(svgEl.getAttribute('fill-opacity'), '0.3');
    assert.equal(pathEl.getAttribute('d'), origHollowPath);
});

test('whisper waiting_play keeps CC button active on paused video and content.js does not fail while paused', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const vm = await import('node:vm');

    const ccBtn = {
        disabled: true,
        style: { display: 'none' },
        _attrs: {
            'aria-pressed': 'false',
            'aria-disabled': 'true',
            'data-tooltip-title': 'Subtítulos no disponibles'
        },
        getAttribute(k) { return this._attrs[k] ?? null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return k in this._attrs; },
        removeAttribute(k) { delete this._attrs[k]; },
        matches: () => false,
        querySelector: () => null
    };
    const listeners = {};
    const elements = new Map();
    const createEl = () => ({ style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, remove() {} });
    const fakeDoc = {
        head: { appendChild(el) { if (el.id) elements.set(el.id, el); } },
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: createEl,
        getElementById: id => elements.get(id) || null,
        querySelector: sel => (sel === '.ytp-subtitles-button' ? ccBtn : null),
        querySelectorAll: () => []
    };
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=pausedVid01', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        ytcfg: { get: () => '' },
        fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
        addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) { for (const fn of (listeners[ev.type] || [])) fn(ev); }
    };
    const videoEl = {
        currentTime: 0,
        paused: true,
        readyState: 0,
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {}
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 960,
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'pausedVid01' }),
        querySelector: sel => {
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === 'video') return videoEl;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; },
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'pausedVid01' } })
    };

    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'pausedVid01',
        doc: fakeDoc,
        win: fakeWin
    });
    await new Promise(r => setTimeout(r, 35));

    // Dispatch waiting_play -> CC MUST stay active!
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', { detail: { kind: 'waiting_play', videoId: 'pausedVid01' } }));
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(ccBtn.getAttribute('data-supratube-cc-active'), '1');

    // Verify content.js responds to SUPRATUBE_PING and emits waiting_play (not error) while video is paused with 0 audio tracks
    const csCode = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
    const cListeners = {};
    const cEvents = [];
    const vidListeners = {};
    let tracksNow = [];
    const pausedDomVideo = {
        isConnected: true,
        paused: true,
        ended: false,
        readyState: 0,
        captureStream: () => ({ getAudioTracks: () => tracksNow }),
        addEventListener(ev, fn) { (vidListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { vidListeners[ev] = (vidListeners[ev] || []).filter(f => f !== fn); }
    };
    let onMsgHandler = null;
    const runtimeSent = [];
    const cWin = {
        document: {
            documentElement: { dataset: {} },
            querySelector: () => pausedDomVideo
        },
        addEventListener(ev, fn) { (cListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { cListeners[ev] = (cListeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            cEvents.push(ev.detail);
            for (const fn of (cListeners[ev.type] || [])) fn(ev);
        }
    };
    cWin.top = cWin.self = cWin;
    vm.runInNewContext(csCode, {
        window: cWin,
        document: cWin.document,
        CustomEvent: FakeCustomEvent,
        WeakMap,
        chrome: {
            runtime: {
                id: 'ext1',
                lastError: null,
                onMessage: { addListener: fn => { onMsgHandler = fn; } },
                sendMessage: (msg, cb) => { runtimeSent.push(msg); cb?.({ ok: true }); }
            },
            storage: {
                local: { get: (_k, cb) => cb?.({}) },
                onChanged: { addListener() {} }
            }
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    });

    let pingReply = null;
    onMsgHandler?.({ action: 'SUPRATUBE_PING' }, {}, res => { pingReply = res; });
    assert.equal(pingReply?.ok, true);

    cWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-cmd', { detail: { action: 'start', videoId: 'pausedVid01', targetLang: 'es' } }));
    await new Promise(r => setTimeout(r, 30));
    assert.equal(cEvents.some(e => e?.kind === 'waiting_play' && e.videoId === 'pausedVid01'), true);
    assert.equal(cEvents.some(e => e?.kind === 'error'), false);

    // Stop cleanly so timers inside paused waiter clean up
    cWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-cmd', { detail: { action: 'stop', videoId: 'pausedVid01' } }));
});

test('main bundle preserves active CC fallback across same-video yt-page-data-updated and clears on video change', async () => {
    const fs = await import('node:fs');
    const vm = await import('node:vm');
    const { compileBundle } = await import('../tools/build-bundle.mjs');
    const { ORDEN_MODULOS } = await import('../modules/config.js');

    const mods = {};
    for (const m of ORDEN_MODULOS) {
        mods[m] = fs.readFileSync(new URL(`../modules/${m}`, import.meta.url), 'utf8');
    }
    const bundleCode = compileBundle(mods);

    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const ccBtn = {
        tagName: 'BUTTON',
        disabled: true,
        style: {},
        ...makeAttrs({ 'aria-pressed': 'false', 'aria-disabled': 'true', 'data-tooltip-title': 'Subtítulos no disponibles' }),
        querySelector: () => null,
        addEventListener() {},
        removeEventListener() {},
        matches: () => false
    };
    const videoEl = {
        isConnected: true,
        paused: false,
        currentTime: 0,
        duration: 60,
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {}
    };
    let currentVid = 'sameVid0001';
    const playerEl = {
        id: 'movie_player',
        isConnected: true,
        clientWidth: 900,
        classList: { contains: () => false },
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: currentVid }),
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: currentVid } }),
        querySelector(sel) {
            if (sel === 'video') return videoEl;
            if (sel === '.ytp-subtitles-button') return ccBtn;
            return null;
        },
        querySelectorAll: () => [],
        appendChild() {}
    };
    const elements = new Map();
    const fakeDoc = {
        readyState: 'complete',
        cookie: 'supratube_geo_lang=es',
        head: { appendChild: el => { if (el.id) elements.set(el.id, el); } },
        body: { appendChild() {}, querySelectorAll: () => [] },
        documentElement: { dataset: { supratubeWhisperBridge: '1', supratubeSettings: JSON.stringify({ autoSubtitles: true }) } },
        createElement: tag => ({ tagName: tag.toUpperCase(), style: {}, children: [], ...makeAttrs(), appendChild(c) { this.children.push(c); return c; }, remove() {} }),
        getElementById: id => elements.get(id) || (id === 'movie_player' ? playerEl : null),
        querySelector(sel) {
            if (sel === '#movie_player') return playerEl;
            if (sel === 'video') return videoEl;
            if (sel === '.ytp-subtitles-button') return ccBtn;
            return null;
        },
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {}
    };
    const winListeners = {};
    const whisperCmds = [];
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=sameVid0001', pathname: '/watch', search: '?v=sameVid0001', origin: 'https://www.youtube.com' },
        navigator: { language: 'es-ES' },
        CustomEvent: FakeCustomEvent,
        ytcfg: { get: () => '' },
        fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
        addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
        removeEventListener() {},
        dispatchEvent(ev) {
            if (ev.type === 'supratube-whisper-cmd') whisperCmds.push(ev.detail);
            for (const fn of (winListeners[ev.type] || [])) fn(ev);
        },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {}
    };
    fakeWin.window = fakeWin;
    fakeWin.document = fakeDoc;

    vm.runInNewContext(bundleCode, {
        window: fakeWin,
        document: fakeDoc,
        location: fakeWin.location,
        navigator: fakeWin.navigator,
        CustomEvent: FakeCustomEvent,
        requestAnimationFrame: fakeWin.requestAnimationFrame,
        cancelAnimationFrame: fakeWin.cancelAnimationFrame,
        fetch: fakeWin.fetch,
        URL,
        URLSearchParams,
        TextEncoder,
        Blob: class {},
        MutationObserver: class { observe() {} disconnect() {} },
        AbortController: class { constructor() { this.signal = {}; } abort() {} },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    });

    try {
        await new Promise(r => setTimeout(r, 1000));
        assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
        assert.equal(whisperCmds.filter(c => c.action === 'start' && c.videoId === 'sameVid0001').length, 1);

        // Same-video yt-page-data-updated must NOT stop Whisper or reset CC button
        for (const fn of (winListeners['yt-page-data-updated'] || [])) fn({});
        await new Promise(r => setTimeout(r, 450));
        assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
        assert.equal(whisperCmds.filter(c => c.action === 'stop').length, 0);

        // Navigating to a different video clears previous Whisper/CC cleanly
        currentVid = 'otherVid002';
        fakeWin.location.href = 'https://www.youtube.com/watch?v=otherVid002';
        fakeWin.location.search = '?v=otherVid002';
        for (const fn of (winListeners['yt-navigate-finish'] || [])) fn({});
        const waitStart = Date.now();
        while (!whisperCmds.some(c => c.action === 'stop' && c.videoId === 'sameVid0001') && Date.now() - waitStart < 1500) {
            await new Promise(r => setTimeout(r, 30));
        }
        assert.ok(whisperCmds.some(c => c.action === 'stop' && c.videoId === 'sameVid0001'));
    } finally {
        fakeWin.__supratubeTeardown?.();
    }
});

test('Shorts subtitles use larger readable font size for both native CSS and fallback overlay', async () => {
    const elements = new Map();
    const spanEl = { style: {}, setAttribute() {} };
    const boxEl = {
        id: '',
        style: {},
        children: [spanEl],
        setAttribute() {},
        appendChild(c) { this.children[0] = c; return c; },
        remove() { elements.delete(this.id); }
    };
    const headChildren = [];
    const fakeDoc = {
        head: { appendChild: el => { headChildren.push(el); if (el.id) elements.set(el.id, el); } },
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: () => ({ id: '', style: {}, children: [], textContent: '', setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, remove() {} }),
        getElementById: id => elements.get(id) || (id === 'supratube-fallback-captions' ? null : null),
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const listeners = {};
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/shorts/shortBigTxt', pathname: '/shorts/shortBigTxt', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        ytcfg: { get: () => '' },
        fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
        addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
        removeEventListener() {},
        dispatchEvent(ev) { for (const fn of (listeners[ev.type] || [])) fn(ev); }
    };
    const fakePlayer = {
        id: 'shorts-player',
        clientWidth: 342,
        isSubtitlesOn: () => false,
        getVideoData: () => ({ video_id: 'shortBigTxt' }),
        querySelector: sel => {
            if (sel === 'video') return { currentTime: 0, paused: false, setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {} };
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); boxEl.style = el.style; boxEl.children = el.children; return el; },
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'shortBigTxt' } })
    };

    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'shortBigTxt',
        doc: fakeDoc,
        win: fakeWin
    });
    await new Promise(r => setTimeout(r, 35));

    const shortsStyle = elements.get('supratube-shorts-caption-style');
    assert.ok(shortsStyle, 'injects supratube-shorts-caption-style');
    assert.match(shortsStyle.textContent, /#shorts-player \.ytp-caption-segment/);
    assert.match(shortsStyle.textContent, /font-size:\s*clamp\(18px/);
    assert.match(shortsStyle.textContent, /left:\s*50%\s*!important/);
    assert.match(shortsStyle.textContent, /transform:\s*translateX\(-50%\)\s*!important/);

    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'caption', videoId: 'shortBigTxt', mode: 'final', translated: 'Subtítulo grande en Shorts' }
    }));
    const fb = elements.get('supratube-fallback-captions');
    assert.ok(fb);
    assert.equal(fb.style.width, 'max-content');
    const px = parseInt(fb.children[0].style.fontSize, 10);
    assert.ok(px >= 19, `expected Shorts fallback font >= 19px, got ${px}`);
    clearFallbackCaptions(fakeDoc, fakeWin);
});

test('IA caption button mounts beside native CC button, toggles manual forced Whisper (ignoring same_language), and syncs icon state', async () => {
    const fs = await import('node:fs');
    const vm = await import('node:vm');
    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            _attrs: map,
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const elements = new Map();
    const createMockNode = (tag) => {
        const listeners = {};
        const node = {
            tagName: String(tag).toUpperCase(),
            id: '',
            className: '',
            type: '',
            style: {},
            children: [],
            parentElement: null,
            ...makeAttrs(),
            get nextSibling() {
                if (!this.parentElement) return null;
                const i = this.parentElement.children.indexOf(this);
                return i >= 0 ? (this.parentElement.children[i + 1] || null) : null;
            },
            appendChild(child) {
                child.parentElement = this;
                this.children.push(child);
                if (child.id) elements.set(child.id, child);
                return child;
            },
            insertBefore(child, ref) {
                child.parentElement = this;
                this.children = this.children.filter(c => c !== child);
                if (ref) {
                    const idx = this.children.indexOf(ref);
                    if (idx >= 0) this.children.splice(idx, 0, child);
                    else this.children.push(child);
                } else {
                    this.children.push(child);
                }
                if (child.id) elements.set(child.id, child);
                return child;
            },
            replaceChildren() { this.children = []; },
            remove() {
                if (this.parentElement) {
                    this.parentElement.children = this.parentElement.children.filter(c => c !== this);
                }
                if (this.id) elements.delete(this.id);
            },
            querySelector(sel) {
                const match = el => {
                    if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
                    if (sel.startsWith('.') && String(el.className || '').split(/\s+/).includes(sel.slice(1))) return true;
                    if (el.tagName?.toLowerCase() === sel.toLowerCase()) return true;
                    return false;
                };
                for (const c of this.children) {
                    if (match(c)) return c;
                    const found = c.querySelector?.(sel);
                    if (found) return found;
                }
                return null;
            },
            querySelectorAll(sel) {
                const out = [];
                const walk = root => {
                    for (const c of (root.children || [])) {
                        if (
                            (sel.includes('#') && c.id === sel.match(/#([^\s,]+)/)?.[1]) ||
                            (sel.includes('.') && String(c.className || '').split(/\s+/).some(cls => sel.includes(`.${cls}`)))
                        ) {
                            out.push(c);
                        }
                        walk(c);
                    }
                };
                walk(this);
                return out;
            },
            addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
            removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
            click() {
                for (const fn of (listeners.click || [])) fn({ preventDefault() {}, stopPropagation() {} });
            }
        };
        return node;
    };

    const controlsRoot = createMockNode('div');
    controlsRoot.className = 'ytp-right-controls';
    const leftGroup = createMockNode('div');
    leftGroup.className = 'ytp-right-controls-left';
    const ccBtn = createMockNode('button');
    ccBtn.className = 'ytp-subtitles-button ytp-button';
    ccBtn.disabled = true;
    ccBtn.setAttribute('aria-pressed', 'false');
    ccBtn.closest = sel => (sel === '.ytp-right-controls' ? controlsRoot : null);
    const settingsBtn = createMockNode('button');
    settingsBtn.className = 'ytp-settings-button ytp-button';
    leftGroup.appendChild(ccBtn);
    controlsRoot.appendChild(leftGroup);
    controlsRoot.appendChild(settingsBtn);

    const fakeDoc = {
        head: createMockNode('head'),
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: tag => createMockNode(tag),
        createElementNS: (_ns, tag) => createMockNode(tag),
        getElementById: id => elements.get(id) || null,
        querySelector: sel => controlsRoot.querySelector(sel) || elements.get(sel.replace(/^#/, '')) || null,
        querySelectorAll: sel => controlsRoot.querySelectorAll(sel)
    };
    const listeners = {};
    const cmds = [];
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=fEt2anArPb4', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            if (ev.type === 'supratube-whisper-cmd') cmds.push(ev.detail);
            for (const fn of (listeners[ev.type] || [])) fn(ev);
        }
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 960,
        getVideoData: () => ({ video_id: 'fEt2anArPb4' }),
        querySelector: sel => {
            if (sel === 'video') return { currentTime: 2, paused: false, setAttribute() {}, removeAttribute() {} };
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; }
    };

    const iaBtn = ensureAiSubtitleButton({
        player: fakePlayer,
        doc: fakeDoc,
        win: fakeWin,
        enabled: true,
        onToggle: () => startManualAiCaptions({ player: fakePlayer, videoId: 'fEt2anArPb4', userLang: 'es', doc: fakeDoc, win: fakeWin })
    });
    assert.ok(iaBtn);
    assert.equal(ccBtn.nextSibling, iaBtn);
    assert.equal(iaBtn.getAttribute('data-active'), '0');
    assert.equal(iaBtn.querySelector('svg')?.getAttribute('data-ia-mode'), '0');

    // Calling ensureAiSubtitleButton again must not duplicate the button
    const iaBtn2 = ensureAiSubtitleButton({ player: fakePlayer, doc: fakeDoc, win: fakeWin, enabled: true });
    assert.equal(iaBtn2, iaBtn);
    assert.equal(leftGroup.children.length, 2);

    // Click IA button -> immediately starts forced Whisper session with backward-compatible '-es' & lights up icon
    iaBtn.click();
    assert.equal(iaBtn.getAttribute('data-active'), '1');
    assert.equal(iaBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(iaBtn.querySelector('svg')?.getAttribute('data-ia-mode'), '1');
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
    assert.ok(cmds.some(c => c.action === 'start' && c.videoId === 'fEt2anArPb4' && c.targetLang === '-es' && c.manualForce === true));
    assert.equal(elements.get('supratube-fallback-captions')?.children[0]?.textContent, 'Iniciando subtítulos IA...');

    // same_language event MUST NOT kill manual forced Whisper session
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'same_language', videoId: 'fEt2anArPb4', lang: 'es' }
    }));
    assert.equal(iaBtn.getAttribute('data-active'), '1');
    assert.equal(cmds.some(c => c.action === 'stop'), false);

    // Clicking again stops Whisper & restores inactive outline IA icon
    iaBtn.click();
    assert.equal(iaBtn.getAttribute('data-active'), '0');
    assert.equal(iaBtn.querySelector('svg')?.getAttribute('data-ia-mode'), '0');
    assert.ok(cmds.some(c => c.action === 'stop' && c.videoId === 'fEt2anArPb4'));

    // Auto-started non-forced session gets upgraded to manualForce: true with immediate banner on [IA] click (NOT killed!)
    cmds.length = 0;
    fakePlayer.isSubtitlesOn = () => false;
    fakePlayer.getOption = () => [];
    fakePlayer.getPlayerResponse = () => ({ videoDetails: { videoId: 'fEt2anArPb4' } });
    fakeWin.ytcfg = { get: () => '' };
    fakeWin.fetch = async () => ({ ok: true, status: 200, text: async () => '{}' });
    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'fEt2anArPb4',
        doc: fakeDoc,
        win: fakeWin
    });
    await new Promise(r => setTimeout(r, 35));
    assert.equal(cmds.filter(c => c.action === 'start' && c.manualForce === false).length, 1);
    assert.equal(iaBtn.getAttribute('data-active'), '1');

    iaBtn.click();
    assert.equal(iaBtn.getAttribute('data-active'), '1');
    assert.ok(cmds.some(c => c.action === 'start' && c.targetLang === '-es' && c.manualForce === true));
    assert.equal(cmds.some(c => c.action === 'stop'), false);
    assert.equal(elements.get('supratube-fallback-captions')?.children[0]?.textContent, 'Iniciando subtítulos IA...');

    // Displaced background tab preempted event turns off [IA] button cleanly
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'preempted', videoId: 'fEt2anArPb4' }
    }));
    assert.equal(iaBtn.getAttribute('data-active'), '0');

    removeAiSubtitleButtons(fakeDoc);
    assert.equal(leftGroup.children.length, 1);

    // Also verify content.js does not block SUPRATUBE_WHISPER_START when AudioContext.resume() stays pending
    const csCode = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
    const sent = [];
    const domVideo = {
        isConnected: true,
        paused: false,
        ended: false,
        captureStream: () => ({ getAudioTracks: () => [{ kind: 'audio' }] }),
        addEventListener() {}
    };
    const cListeners = {};
    const cWin = {
        document: { documentElement: { dataset: {} }, querySelector: () => domVideo },
        addEventListener(ev, fn) { (cListeners[ev] ||= []).push(fn); },
        dispatchEvent() {}
    };
    cWin.AudioContext = class {
        constructor() { this.state = 'suspended'; this.destination = {}; }
        resume() { return new Promise(() => {}); }
        createMediaStreamSource() { return { connect() {} }; }
        createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
        createGain() { return { gain: { value: 0 }, connect() {} }; }
    };
    cWin.top = cWin.self = cWin;
    vm.runInNewContext(csCode, {
        window: cWin,
        document: cWin.document,
        AudioContext: cWin.AudioContext,
        MediaStream: class { constructor(t) { this.tracks = t; } },
        Float32Array,
        CustomEvent: FakeCustomEvent,
        WeakMap,
        chrome: {
            runtime: {
                id: 'ext1',
                lastError: null,
                onMessage: { addListener() {} },
                sendMessage: (msg, cb) => { sent.push(msg); cb?.({ ok: true }); }
            },
            storage: { local: { get: (_k, cb) => cb?.({}) }, onChanged: { addListener() {} } }
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    });
    for (const fn of (cListeners['supratube-whisper-cmd'] || [])) {
        fn({ detail: { action: 'start', videoId: 'fEt2anArPb4', targetLang: '-es', spokenLang: 'en', manualForce: true } });
    }
    await new Promise(r => setTimeout(r, 30));
    assert.ok(sent.some(m => m.action === 'SUPRATUBE_WHISPER_START' && m.videoId === 'fEt2anArPb4' && m.targetLang === '-es' && m.spokenLang === 'en' && m.manualForce === true));
});

test('manual [IA] survives in-flight auto fallback, keeps paused readiness banner, and translates foreign legacy captions on the fly', async () => {
    const { LanguageVoter } = await import('../offscreen-src/whisper-utils.js');
    const elements = new Map();
    const vidListeners = {};
    const videoEl = {
        currentTime: 3,
        paused: true,
        setAttribute() {},
        removeAttribute() {},
        addEventListener(ev, fn) { (vidListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { vidListeners[ev] = (vidListeners[ev] || []).filter(f => f !== fn); }
    };
    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const createNode = tag => {
        const listeners = {};
        return {
            tagName: String(tag).toUpperCase(),
            id: '',
            className: '',
            style: {},
            children: [],
            parentElement: null,
            ...makeAttrs(),
            appendChild(c) { c.parentElement = this; this.children.push(c); if (c.id) elements.set(c.id, c); return c; },
            insertBefore(c) { return this.appendChild(c); },
            replaceChildren() { this.children = []; },
            remove() { if (this.id) elements.delete(this.id); },
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
            removeEventListener() {},
            click() { for (const fn of (listeners.click || [])) fn({ preventDefault() {}, stopPropagation() {} }); }
        };
    };

    const controlsRoot = createNode('div');
    controlsRoot.className = 'ytp-right-controls';
    const ccBtn = createNode('button');
    ccBtn.className = 'ytp-subtitles-button ytp-button';
    ccBtn.closest = () => controlsRoot;
    controlsRoot.appendChild(ccBtn);

    const fakeDoc = {
        head: createNode('head'),
        documentElement: { dataset: { supratubeWhisperBridge: '1' } },
        createElement: tag => createNode(tag),
        createElementNS: (_ns, tag) => createNode(tag),
        getElementById: id => elements.get(id) || null,
        querySelector: sel => (sel === '.ytp-subtitles-button' ? ccBtn : null),
        querySelectorAll: () => []
    };

    let releaseInnertube = null;
    const winListeners = {};
    const cmds = [];
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=fEt2anArPb4', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        ytcfg: { get: () => '' },
        fetch: async url => {
            if (String(url).includes('/youtubei/v1/player')) {
                await new Promise(r => { releaseInnertube = r; });
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        videoDetails: { videoId: 'fEt2anArPb4', defaultAudioLanguage: 'es' },
                        streamingData: { adaptiveFormats: [{ audioTrack: { id: 'es.4', audioIsDefault: true } }] }
                    })
                };
            }
            return { ok: true, status: 200, text: async () => '{}' };
        },
        addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { winListeners[ev] = (winListeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            if (ev.type === 'supratube-whisper-cmd') cmds.push(ev.detail);
            for (const fn of (winListeners[ev.type] || [])) fn(ev);
        }
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 960,
        isSubtitlesOn: () => false,
        getOption: () => [],
        getPlayerResponse: () => ({ videoDetails: { videoId: 'fEt2anArPb4' } }),
        getVideoData: () => ({ video_id: 'fEt2anArPb4' }),
        querySelector: sel => {
            if (sel === 'video') return videoEl;
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; }
    };

    const translateRequests = [];
    const mockRequestFn = async url => {
        translateRequests.push(url);
        return {
            status: 200,
            text: JSON.stringify({ sentences: [{ trans: 'Soy Iron Man.' }] })
        };
    };

    const iaBtn = ensureAiSubtitleButton({
        player: fakePlayer,
        doc: fakeDoc,
        win: fakeWin,
        enabled: true,
        onToggle: () => startManualAiCaptions({
            player: fakePlayer,
            videoId: 'fEt2anArPb4',
            userLang: 'es',
            doc: fakeDoc,
            win: fakeWin,
            requestFn: mockRequestFn
        })
    });

    // Start auto applySmartSubtitles (leaves obtainRawSegmentsForVideo in flight)
    await applySmartSubtitles(fakePlayer, {
        enabled: true,
        userLang: 'es',
        expectedVideoId: 'fEt2anArPb4',
        doc: fakeDoc,
        win: fakeWin
    });

    // User clicks [IA] while paused and while auto obtainRawSegmentsForVideo is still in flight
    iaBtn.click();
    const box = elements.get('supratube-fallback-captions');
    assert.equal(box?.children[0]?.textContent, 'Subtítulos IA listos (reproduce el video)');
    assert.equal(box?.style.display, 'block');

    // waiting_play keeps banner visible in manual mode
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'waiting_play', videoId: 'fEt2anArPb4' }
    }));
    assert.equal(box?.children[0]?.textContent, 'Subtítulos IA listos (reproduce el video)');
    assert.equal(box?.style.display, 'block');

    // Resolve delayed Innertube call returning audioLanguage='es' & no captions -> MUST NOT kill manual [IA]!
    releaseInnertube?.();
    await new Promise(r => setTimeout(r, 40));
    assert.equal(iaBtn.getAttribute('data-active'), '1');
    assert.equal(cmds.some(c => c.action === 'stop'), false);

    // Simulate legacy v1.0.9 worker checking LanguageVoter without manualForce on Spanish video:
    const startCmd = cmds.find(c => c.action === 'start');
    assert.equal(startCmd?.targetLang, '-es');
    const legacyVoter = new LanguageVoter();
    legacyVoter.observe({ lang: 'es', conf: 0.9, ts: 1 });
    legacyVoter.observe({ lang: 'es', conf: 0.9, ts: 2 });
    assert.equal(legacyVoter.shouldAbortForSameLanguage(startCmd.targetLang), false);

    // Pressing play transitions readiness banner to listening
    videoEl.paused = false;
    for (const fn of (vidListeners.play || [])) fn();
    assert.equal(box?.children[0]?.textContent, 'Subtítulos IA escuchando...');

    // Legacy v1.0.9 worker failing to translate foreign speech ('en' -> same raw text) translates immediately BEFORE rendering:
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'caption', videoId: 'fEt2anArPb4', mode: 'final', lang: 'en', raw: 'I am Iron Man.', translated: 'I am Iron Man.' }
    }));
    assert.notEqual(box?.children[0]?.textContent, 'I am Iron Man.');
    await new Promise(r => setTimeout(r, 30));
    assert.ok(translateRequests.some(u => u.includes('translate.googleapis.com')));
    assert.equal(box?.children[0]?.textContent, 'Soy Iron Man.');

    clearFallbackCaptions(fakeDoc, fakeWin);
});

test('manual [IA] recovers automatically from offscreen unavailable via in-page PCM16 capture and maximus-bridge-stt', async () => {
    const elements = new Map();
    let capturedProc = null;
    const videoEl = {
        currentTime: 4,
        paused: false,
        ended: false,
        muted: false,
        volume: 1,
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {},
        captureStream: () => ({ getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }] })
    };
    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const createNode = tag => {
        const listeners = {};
        return {
            tagName: String(tag).toUpperCase(),
            id: '',
            className: '',
            style: {},
            children: [],
            parentElement: null,
            ...makeAttrs(),
            appendChild(c) { c.parentElement = this; this.children.push(c); if (c.id) elements.set(c.id, c); return c; },
            insertBefore(c) { return this.appendChild(c); },
            replaceChildren() { this.children = []; },
            remove() { if (this.id) elements.delete(this.id); },
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
            removeEventListener() {},
            click() { for (const fn of (listeners.click || [])) fn({ preventDefault() {}, stopPropagation() {} }); }
        };
    };

    const controlsRoot = createNode('div');
    controlsRoot.className = 'ytp-right-controls';
    const ccBtn = createNode('button');
    ccBtn.className = 'ytp-subtitles-button ytp-button';
    ccBtn.closest = () => controlsRoot;
    controlsRoot.appendChild(ccBtn);

    const fakeDoc = {
        head: createNode('head'),
        documentElement: { dataset: { supratubeWhisperBridge: '1', maximusBridge: '1' } },
        createElement: tag => createNode(tag),
        createElementNS: (_ns, tag) => createNode(tag),
        getElementById: id => elements.get(id) || null,
        querySelector: sel => (sel === '.ytp-subtitles-button' ? ccBtn : null),
        querySelectorAll: () => []
    };

    const winListeners = {};
    const sttBridgeReqs = [];
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=fEt2anArPb4', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        MediaStream: class { constructor(t) { this.tracks = t; } },
        AudioContext: class {
            constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
            createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
            createScriptProcessor() {
                capturedProc = { connect() {}, disconnect() {}, onaudioprocess: null };
                return capturedProc;
            }
            createGain() { return { gain: { value: 0 }, connect() {} }; }
        },
        addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { winListeners[ev] = (winListeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            if (ev.type === 'maximus-bridge-stt' && ev.detail?.requestId) {
                sttBridgeReqs.push(ev.detail);
                fakeWin.dispatchEvent(new FakeCustomEvent(`maximus-bridge-stt-res-${ev.detail.requestId}`, {
                    detail: { ok: true, text: 'Escucha la voz de tu alma.' }
                }));
            }
            for (const fn of (winListeners[ev.type] || [])) fn(ev);
        }
    };
    const fakePlayer = {
        id: 'movie_player',
        clientWidth: 960,
        getVideoData: () => ({ video_id: 'fEt2anArPb4' }),
        querySelector: sel => {
            if (sel === 'video') return videoEl;
            if (sel === '.ytp-subtitles-button') return ccBtn;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; }
    };

    const iaBtn = ensureAiSubtitleButton({
        player: fakePlayer,
        doc: fakeDoc,
        win: fakeWin,
        enabled: true,
        onToggle: () => startManualAiCaptions({
            player: fakePlayer,
            videoId: 'fEt2anArPb4',
            userLang: 'es',
            doc: fakeDoc,
            win: fakeWin
        })
    });

    iaBtn.click();
    // Simulate legacy v1.0.3 Service Worker failing SUPRATUBE_WHISPER_START:
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'error', videoId: 'fEt2anArPb4', error: 'offscreen unavailable' }
    }));

    const box = elements.get('supratube-fallback-captions');
    assert.equal(iaBtn.getAttribute('data-active'), '1');
    assert.notEqual(box?.children[0]?.textContent, 'Subtítulos IA: offscreen unavailable');
    assert.equal(box?.children[0]?.textContent, 'Subtítulos IA escuchando...');
    assert.ok(capturedProc && typeof capturedProc.onaudioprocess === 'function');

    // Feed 2s of speech samples (8 x 4096) followed by 0.6s of silence (3 x 4096) to flush utterance:
    const speechBuf = new Float32Array(4096);
    for (let i = 0; i < speechBuf.length; i++) speechBuf[i] = 0.08 * Math.sin(i * 0.1);
    const silenceBuf = new Float32Array(4096);
    for (let i = 0; i < 8; i++) capturedProc.onaudioprocess({ inputBuffer: { getChannelData: () => speechBuf } });
    for (let i = 0; i < 3; i++) capturedProc.onaudioprocess({ inputBuffer: { getChannelData: () => silenceBuf } });

    await new Promise(r => setTimeout(r, 30));
    assert.equal(sttBridgeReqs.length, 1);
    assert.ok(sttBridgeReqs[0].pcm16B64.length > 100);
    assert.equal(box?.children[0]?.textContent, 'Escucha la voz de tu alma.');

    iaBtn.click();
    assert.equal(iaBtn.getAttribute('data-active'), '0');
    assert.equal(capturedProc.onaudioprocess, null);
});

test('in-page STT detects English audio, translates AI captions to IP language before rendering, and hides traditional native subtitles', async () => {
    const elements = new Map();
    let capturedProc = null;
    const shownHistory = [];
    const unloadedModules = [];
    let toggleCalls = 0;

    const videoEl = {
        currentTime: 5,
        paused: false,
        ended: false,
        muted: false,
        volume: 1,
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {},
        captureStream: () => ({ getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }] })
    };
    const makeAttrs = (init = {}) => {
        const map = { ...init };
        return {
            setAttribute(k, v) { map[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
            hasAttribute(k) { return Object.prototype.hasOwnProperty.call(map, k); },
            removeAttribute(k) { delete map[k]; }
        };
    };
    const createNode = tag => ({
        tagName: String(tag).toUpperCase(),
        id: '',
        className: '',
        style: {},
        children: [],
        parentElement: null,
        ...makeAttrs(),
        set textContent(v) {
            this._txt = String(v ?? '');
            if (this.getAttribute('data-supratube-seg') === '1') shownHistory.push(this._txt);
        },
        get textContent() { return this._txt || ''; },
        appendChild(c) { c.parentElement = this; this.children.push(c); if (c.id) elements.set(c.id, c); return c; },
        insertBefore(c) { return this.appendChild(c); },
        replaceChildren() { this.children = []; },
        remove() { if (this.id) elements.delete(this.id); },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {}
    });

    const fakeDoc = {
        head: createNode('head'),
        documentElement: { ...makeAttrs(), dataset: { supratubeWhisperBridge: '1', maximusBridge: '1' } },
        createElement: tag => createNode(tag),
        createElementNS: (_ns, tag) => createNode(tag),
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };

    const winListeners = {};
    const sttBridgeReqs = [];
    const gtxReqs = [];
    class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/shorts/KBIKtrmM80Y', pathname: '/shorts/KBIKtrmM80Y', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        MediaStream: class { constructor(t) { this.tracks = t; } },
        AudioContext: class {
            constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
            createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
            createScriptProcessor() {
                capturedProc = { connect() {}, disconnect() {}, onaudioprocess: null };
                return capturedProc;
            }
            createGain() { return { gain: { value: 0 }, connect() {} }; }
        },
        addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn) { winListeners[ev] = (winListeners[ev] || []).filter(f => f !== fn); },
        dispatchEvent(ev) {
            if (ev.type === 'maximus-bridge-stt' && ev.detail?.requestId) {
                sttBridgeReqs.push(ev.detail);
                fakeWin.dispatchEvent(new FakeCustomEvent(`maximus-bridge-stt-res-${ev.detail.requestId}`, {
                    detail: { ok: true, text: 'Oh, that is skinny.' }
                }));
            }
            for (const fn of (winListeners[ev.type] || [])) fn(ev);
        }
    };
    const fakePlayer = {
        id: 'shorts-player',
        clientWidth: 342,
        ...makeAttrs(),
        isSubtitlesOn: () => true,
        toggleSubtitles: () => { toggleCalls++; },
        setOption() {},
        unloadModule: mod => { unloadedModules.push(mod); },
        getPlayerResponse: () => ({
            videoDetails: { videoId: 'KBIKtrmM80Y', defaultAudioLanguage: 'en', title: 'Doctor Who Tenth Meets Eleventh' }
        }),
        getVideoData: () => ({ video_id: 'KBIKtrmM80Y', title: 'Doctor Who Tenth Meets Eleventh' }),
        querySelector: sel => {
            if (sel === 'video') return videoEl;
            if (sel === '#supratube-fallback-captions') return elements.get('supratube-fallback-captions') || null;
            return null;
        },
        querySelectorAll: () => [],
        appendChild: el => { if (el.id) elements.set(el.id, el); return el; }
    };

    const requestFn = async (url, opts) => {
        gtxReqs.push({ url, body: opts?.body || '' });
        return {
            status: 200,
            text: JSON.stringify({ sentences: [{ trans: 'Oh, eso es muy flaco.' }] })
        };
    };

    const started = startManualAiCaptions({
        player: fakePlayer,
        videoId: 'KBIKtrmM80Y',
        userLang: 'es',
        doc: fakeDoc,
        win: fakeWin,
        requestFn
    });
    assert.equal(started, true);
    assert.equal(fakePlayer.getAttribute('data-supratube-ai-subs-active'), '1');
    assert.equal(fakeDoc.documentElement.getAttribute('data-supratube-ai-subs-active'), '1');
    assert.ok(unloadedModules.includes('captions'));
    assert.equal(toggleCalls, 1);
    const iaStyle = elements.get('supratube-ia-cc-style');
    assert.match(iaStyle?.textContent || '', /\[data-supratube-ai-subs-active="1"\] \.ytp-caption-window-container/);

    // Simulate offscreen unavailable -> in-page STT captures PCM16
    fakeWin.dispatchEvent(new FakeCustomEvent('supratube-whisper-evt', {
        detail: { kind: 'error', videoId: 'KBIKtrmM80Y', error: 'offscreen unavailable' }
    }));
    const speechBuf = new Float32Array(4096);
    for (let i = 0; i < speechBuf.length; i++) speechBuf[i] = 0.08 * Math.sin(i * 0.1);
    const silenceBuf = new Float32Array(4096);
    for (let i = 0; i < 8; i++) capturedProc.onaudioprocess({ inputBuffer: { getChannelData: () => speechBuf } });
    for (let i = 0; i < 3; i++) capturedProc.onaudioprocess({ inputBuffer: { getChannelData: () => silenceBuf } });

    await new Promise(r => setTimeout(r, 40));
    assert.equal(sttBridgeReqs.length, 1);
    assert.equal(sttBridgeReqs[0].language, 'en');
    assert.equal(sttBridgeReqs[0].modelId, 'onnx-community/whisper-small');
    assert.ok(gtxReqs.some(r => String(r.url).includes('sl=auto') && String(r.url).includes('tl=es')));
    assert.equal(shownHistory.includes('Oh, that is skinny.'), false, 'never flashes untranslated English before Spanish translation');
    assert.equal(elements.get('supratube-fallback-captions')?.children[0]?.textContent, 'Oh, eso es muy flaco.');

    clearFallbackCaptions(fakeDoc, fakeWin);
    assert.equal(fakePlayer.getAttribute('data-supratube-ai-subs-active'), null);
    assert.equal(fakeDoc.documentElement.getAttribute('data-supratube-ai-subs-active'), null);
});

test('translateCueBatch falls back cleanly through client=it/at/gtx, clients5, and MyMemory when Google rate-limits with 429', async () => {
    const seenUrls = [];
    const out = await translateCueBatch({
        texts: ['As you can see these men are heavily armed.'],
        sourceLang: 'auto',
        targetLang: 'es',
        requestFn: async url => {
            const u = String(url);
            seenUrls.push(u);
            if (u.includes('client=it') || u.includes('client=at') || u.includes('client=gtx') || u.includes('clients5.google.com')) {
                return { status: 429, text: '<html>Too Many Requests</html>' };
            }
            if (u.includes('api.mymemory.translated.net')) {
                return {
                    status: 200,
                    text: JSON.stringify({ responseData: { translatedText: 'Como pueden ver estos hombres están fuertemente armados.' } })
                };
            }
            return { status: 404, text: '' };
        }
    });
    assert.ok(seenUrls.some(u => u.includes('client=it')));
    assert.ok(seenUrls.some(u => u.includes('client=at')));
    assert.ok(seenUrls.some(u => u.includes('client=gtx')));
    assert.ok(seenUrls.some(u => u.includes('clients5.google.com')));
    assert.ok(seenUrls.some(u => u.includes('api.mymemory.translated.net') && u.includes('autodetect%7Ces') && u.includes('de=')));
    assert.deepEqual(out, ['Como pueden ver estos hombres están fuertemente armados.']);
});

test('fallback caption overlay is draggable inside Watch and Shorts players, persists coordinates, and blocks video toggle clicks', () => {
    const store = new Map();
    const createMockEl = tag => {
        const listeners = new Map();
        const attrs = new Map();
        const el = {
            tagName: String(tag || 'div').toUpperCase(),
            id: '',
            className: '',
            textContent: '',
            children: [],
            style: {},
            clientWidth: 800,
            clientHeight: 450,
            offsetWidth: 220,
            offsetHeight: 44,
            appendChild: child => { el.children.push(child); return child; },
            setAttribute: (k, v) => attrs.set(k, String(v)),
            getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
            removeAttribute: k => attrs.delete(k),
            addEventListener: (ev, fn) => {
                if (!listeners.has(ev)) listeners.set(ev, new Set());
                listeners.get(ev).add(fn);
            },
            removeEventListener: (ev, fn) => {
                listeners.get(ev)?.delete(fn);
            },
            emit: (ev, payload = {}) => {
                for (const fn of [...(listeners.get(ev) || [])]) fn(payload);
            },
            getBoundingClientRect: () => {
                const l = parseFloat(el.style.left);
                const t = parseFloat(el.style.top);
                return {
                    left: Number.isFinite(l) ? l : 290,
                    top: Number.isFinite(t) ? t : 350,
                    width: el.offsetWidth,
                    height: el.offsetHeight
                };
            }
        };
        return el;
    };

    for (const [playerId, pathname, testVid] of [['movie_player', '/watch', 'dQw4w9WgXcQ'], ['shorts-player', '/shorts/abc12345678', 'abc12345678']]) {
        const elements = new Map();
        const winListeners = new Map();
        const videoEl = createMockEl('video');
        let playerClicked = 0;
        const player = createMockEl('div');
        player.id = playerId;
        player.clientWidth = playerId === 'shorts-player' ? 380 : 900;
        player.clientHeight = playerId === 'shorts-player' ? 680 : 500;
        player.offsetWidth = player.clientWidth;
        player.offsetHeight = player.clientHeight;
        player.getBoundingClientRect = () => ({ left: 0, top: 0, width: player.clientWidth, height: player.clientHeight });
        player.appendChild = child => {
            if (child.id) elements.set(child.id, child);
            player.children.push(child);
            return child;
        };
        player.querySelector = sel => (sel === 'video' ? videoEl : (sel === '#supratube-fallback-captions' ? (elements.get('supratube-fallback-captions') || null) : null));
        player.addEventListener('click', () => { playerClicked++; });

        const doc = {
            documentElement: {
                dataset: { supratubeWhisperBridge: '1', supratubeSettings: JSON.stringify({ asrEngine: 'sherpa' }) },
                setAttribute() {},
                removeAttribute() {}
            },
            head: createMockEl('head'),
            createElement: tag => createMockEl(tag),
            getElementById: id => elements.get(id) || null,
            querySelector: sel => (sel === 'video' ? videoEl : null),
            querySelectorAll: () => []
        };
        const win = {
            location: { href: pathname === '/watch' ? `https://www.youtube.com/watch?v=${testVid}` : `https://www.youtube.com/shorts/${testVid}`, pathname },
            localStorage: {
                getItem: k => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => store.set(k, String(v))
            },
            addEventListener: (ev, fn) => {
                if (!winListeners.has(ev)) winListeners.set(ev, new Set());
                winListeners.get(ev).add(fn);
            },
            removeEventListener: (ev, fn) => {
                winListeners.get(ev)?.delete(fn);
            },
            emit: (ev, payload = {}) => {
                for (const fn of [...(winListeners.get(ev) || [])]) fn(payload);
            },
            dispatchEvent: () => {},
            setTimeout,
            clearTimeout
        };

        startManualAiCaptions({
            player,
            videoId: testVid,
            userLang: 'es',
            doc,
            win,
            requestFn: async () => ({ status: 200, text: '' })
        });
        const box = elements.get('supratube-fallback-captions');
        assert.ok(box, `${playerId} created caption overlay`);
        assert.equal(box.style.pointerEvents, 'auto');
        assert.equal(box.style.cursor, 'grab');

        let stoppedClick = false;
        box.emit('click', { stopPropagation: () => { stoppedClick = true; } });
        assert.equal(stoppedClick, true);
        assert.equal(playerClicked, 0);

        let downStopped = false;
        box.emit('pointerdown', {
            button: 0,
            clientX: 120,
            clientY: 200,
            stopPropagation: () => { downStopped = true; },
            preventDefault: () => {}
        });
        assert.equal(downStopped, true);

        win.emit('pointermove', { clientX: 60, clientY: 80, stopPropagation: () => {} });
        win.emit('pointerup', { stopPropagation: () => {} });
        assert.equal(box.getAttribute('data-supratube-custom-pos'), '1');
        const draggedLeft = parseFloat(box.style.left);
        const draggedTop = parseFloat(box.style.top);
        assert.ok(Number.isFinite(draggedLeft) && draggedLeft >= 4);
        assert.ok(Number.isFinite(draggedTop) && draggedTop >= 4);
        assert.equal(box.style.bottom, 'auto');

        // Next video inherits saved dragged position for this player type, until double-click resets it:
        clearFallbackCaptions(doc, win);
        win.location.href = pathname === '/watch' ? 'https://www.youtube.com/watch?v=xYz98765432' : 'https://www.youtube.com/shorts/xYz98765432';
        startManualAiCaptions({
            player,
            videoId: 'xYz98765432',
            userLang: 'es',
            doc,
            win,
            requestFn: async () => ({ status: 200, text: '' })
        });
        const nextBox = elements.get('supratube-fallback-captions');
        assert.equal(nextBox.getAttribute('data-supratube-custom-pos'), '1');
        assert.equal(parseFloat(nextBox.style.left), draggedLeft);
        assert.equal(parseFloat(nextBox.style.top), draggedTop);

        nextBox.emit('dblclick', { stopPropagation: () => {}, preventDefault: () => {} });
        assert.equal(nextBox.getAttribute('data-supratube-custom-pos'), null);
        assert.equal(nextBox.style.left, '50%');

        clearFallbackCaptions(doc, win);
    }
});

test('detectTextLanguageHint identifies Spanish Watch/Shorts metadata without mislabeling neutral gaming/podcast titles as English', () => {
    assert.equal(detectTextLanguageHint('Todo eres tu, Úsalo a tu favor. #jau #rsame #manifestation #fullconcept', ''), 'es');
    assert.equal(detectTextLanguageHint('Resumen del capitulo para todos en español', ''), 'es');
    assert.equal(detectTextLanguageHint('Podcast #42 - GTA VI', ''), '');
    assert.equal(detectTextLanguageHint('How to build an electric motor from scratch', ''), 'en');
});

test('startManualAiCaptions honors aiAudioLang override and renders Spanish Sherpa captions directly without external HTTP translation', () => {
    const cmds = [];
    const reqUrls = [];
    const elements = new Map();
    const listeners = new Map();
    const mk = tag => ({
        tagName: String(tag || 'div').toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        children: [],
        style: {},
        appendChild: ch => ch,
        setAttribute() {},
        getAttribute: () => null,
        removeAttribute() {},
        addEventListener() {},
        removeEventListener() {}
    });
    const videoEl = mk('video');
    const player = {
        id: 'movie_player',
        clientWidth: 900,
        clientHeight: 500,
        children: [],
        style: {},
        getVideoData: () => ({ video_id: 'dQw4w9WgXcQ', title: 'GTA VI Gameplay' }),
        setAttribute() {},
        removeAttribute() {},
        querySelector: sel => (sel === 'video' ? videoEl : (sel === '#supratube-fallback-captions' ? (elements.get('supratube-fallback-captions') || null) : null)),
        querySelectorAll: () => [],
        appendChild: ch => { if (ch.id) elements.set(ch.id, ch); return ch; }
    };
    const doc = {
        documentElement: {
            dataset: {
                supratubeWhisperBridge: '1',
                supratubeSettings: JSON.stringify({ asrEngine: 'sherpa', aiAudioLang: 'es' })
            },
            setAttribute() {},
            removeAttribute() {}
        },
        head: mk('head'),
        createElement: tag => {
            const el = mk(tag);
            el.appendChild = c => { el.children.push(c); return c; };
            return el;
        },
        getElementById: id => elements.get(id) || null,
        querySelector: sel => (sel === 'video' ? videoEl : null),
        querySelectorAll: () => []
    };
    const win = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', pathname: '/watch' },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
        addEventListener: (ev, fn) => {
            if (!listeners.has(ev)) listeners.set(ev, new Set());
            listeners.get(ev).add(fn);
        },
        removeEventListener: (ev, fn) => listeners.get(ev)?.delete(fn),
        dispatchEvent: ev => {
            if (ev?.type === 'supratube-whisper-cmd') cmds.push(ev.detail);
            for (const fn of [...(listeners.get(ev?.type) || [])]) fn(ev);
        },
        setTimeout,
        clearTimeout
    };

    const ok = startManualAiCaptions({
        player,
        videoId: 'dQw4w9WgXcQ',
        userLang: 'es',
        doc,
        win,
        requestFn: async url => { reqUrls.push(String(url)); return { status: 200, text: '' }; }
    });
    assert.equal(ok, true);
    assert.equal(cmds[0].spokenLang, 'es');
    assert.equal(cmds[0].aiAudioLang, 'es');

    // Short Spanish phrase from Sherpa ES renders IMMEDIATELY without hitting translate.googleapis.com:
    win.dispatchEvent(new win.CustomEvent('supratube-whisper-evt', {
        detail: {
            kind: 'caption',
            videoId: 'dQw4w9WgXcQ',
            engine: 'sherpa',
            lang: 'es',
            raw: 'No preguntes si',
            translated: 'No preguntes si'
        }
    }));
    assert.equal(reqUrls.length, 0);
    assert.equal(elements.get('supratube-fallback-captions')?.children[0]?.textContent, 'No preguntes si');
    clearFallbackCaptions(doc, win);
});
