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
    encodeBase64Bytes
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
        ...makeAttrs({ viewBox: '0 0 24 24', width: '24', height: '24' }),
        querySelector: sel => (sel.includes('path') ? pathEl : null)
    };
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
            if (sel.includes('path')) return pathEl;
            if (sel.includes('svg')) return svgEl;
            return null;
        },
        matches: () => false
    };
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
        querySelector: sel => (sel === '.ytp-subtitles-button' ? ccBtn : null),
        querySelectorAll: () => []
    };
    const listeners = {};
    class FakeCustomEvent {
        constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    }
    const fakeWin = {
        location: { href: 'https://www.youtube.com/watch?v=ccActiveVid1', pathname: '/watch', origin: 'https://www.youtube.com' },
        CustomEvent: FakeCustomEvent,
        MutationObserver: FakeMutationObserver,
        ytcfg: { get: () => '' },
        fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
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
    assert.match(ccBtn.getAttribute('data-tooltip-title') || '', /^Subtítulos IA \(c\)$/);
    assert.equal(ccBtn.getAttribute('data-title-no-tooltip'), 'Subtítulos IA');
    assert.notEqual(pathEl.getAttribute('d'), origHollowPath);

    // Simulate YouTube fighting back to overwrite attributes while fallback is active:
    ccBtn.setAttribute('aria-pressed', 'false');
    ccBtn.setAttribute('data-tooltip-title', 'Subtítulos no disponibles');
    ccBtn.setAttribute('aria-disabled', 'true');
    pathEl.setAttribute('d', origHollowPath);
    obsCallback?.([]);
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(ccBtn.getAttribute('data-tooltip-title'), 'Subtítulos IA (c)');
    assert.equal(ccBtn.getAttribute('aria-disabled'), null);
    assert.notEqual(pathEl.getAttribute('d'), origHollowPath);

    clearFallbackCaptions(fakeDoc, fakeWin);
    assert.equal(obsDisconnected, true);
    assert.equal(ccBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(ccBtn.getAttribute('data-supratube-cc-active'), null);
    assert.equal(ccBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(ccBtn.disabled, true);
    assert.equal(ccBtn.style.display, 'none');
    assert.equal(ccBtn.getAttribute('data-tooltip-title'), 'Subtítulos no disponibles');
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
    const csCode = fs.readFileSync(path.resolve('content.js'), 'utf8');
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
