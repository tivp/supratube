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
