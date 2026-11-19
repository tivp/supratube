import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterWhisperText,
    stripCaptionOverlap,
    LanguageVoter,
    computeLangSoftmax,
    selectRealtimeAsrSpec,
    normalizeAsrEngine,
    normalizeAiAudioLang,
    hasSherpaLanguageModel,
    formatStreamingTailText,
    computeAdaptiveSpeechThreshold,
    gentleConditionPcm,
    SileroStreamingVadState
} from '../offscreen-src/whisper-utils.js';

test('filterWhisperText suppresses instrumental single stopwords, hallucinations, and n-gram loops', () => {
    assert.equal(filterWhisperText(''), '');
    assert.equal(filterWhisperText('   ...   '), '');
    assert.equal(filterWhisperText('[Music]'), '');
    assert.equal(filterWhisperText('(applause)'), '');
    assert.equal(filterWhisperText('♪'), '');
    assert.equal(filterWhisperText('Thank you for watching.'), '');
    assert.equal(filterWhisperText('Thanks.'), '');
    // Empirically observed Whisper bleed on instrumental aqz-KE-bpKQ:
    assert.equal(filterWhisperText('I'), '');
    assert.equal(filterWhisperText('The'), '');
    assert.equal(filterWhisperText('the.'), '');
    assert.equal(filterWhisperText('El'), '');
    assert.equal(filterWhisperText('you'), '');
    assert.equal(filterWhisperText('You'), '');
    assert.equal(filterWhisperText('Music'), '');
    // Empirically observed CJK repetition loop collapsed <40% -> rejected cleanly:
    assert.equal(filterWhisperText('お客さん、お客さん、お客さん、お客さん、お客さん、お客さん'), '');
    assert.equal(filterWhisperText('hello hello hello hello hello hello hello'), '');
    // Partial stutter inside real sentence is collapsed cleanly while keeping the sentence:
    assert.equal(
        filterWhisperText('I think bueno bueno bueno we should go now.'),
        'I think bueno we should go now.'
    );
    // Genuine speech preserved intact:
    assert.equal(
        filterWhisperText('  Alright so here we are one of the elephants.  '),
        'Alright so here we are one of the elephants.'
    );
    assert.equal(filterWhisperText('Sí, claro.'), 'Sí, claro.');
});

test('stripCaptionOverlap removes repeated trailing/leading seam words across cut windows', () => {
    assert.equal(
        stripCaptionOverlap('here we are in front of', 'in front of the elephants'),
        'the elephants'
    );
    assert.equal(
        stripCaptionOverlap('First sentence ended.', 'Brand new sentence'),
        'Brand new sentence'
    );
    assert.equal(
        stripCaptionOverlap('one two', 'one two'),
        ''
    );
});

test('LanguageVoter locks after 2 agreeing detections and detects same-language auto abort', () => {
    const voter = new LanguageVoter();
    assert.equal(voter.forcedLanguage(), null);

    voter.observe({ lang: 'en', conf: 0.72, lockedConf: null, ts: 1000 });
    assert.equal(voter.locked, null);
    assert.equal(voter.shouldAbortForSameLanguage('es', false), false);

    voter.observe({ lang: 'en', conf: 0.85, lockedConf: null, ts: 2000 });
    assert.equal(voter.locked, 'en');
    assert.equal(voter.forcedLanguage(), 'en');
    assert.equal(voter.shouldAbortForSameLanguage('es', false), false);

    // Now test Spanish video when user IP language is 'es':
    voter.reset();
    voter.observe({ lang: 'es', conf: 0.61, lockedConf: null, ts: 3000 });
    voter.observe({ lang: 'es', conf: 0.78, lockedConf: null, ts: 4000 });
    assert.equal(voter.locked, 'es');
    assert.equal(voter.shouldAbortForSameLanguage('es', false), true);
    assert.equal(voter.shouldAbortForSameLanguage('es', true), false);

    // Redetect when locked confidence drops below 0.4 or after silence:
    voter.observe({ lang: 'fr', conf: 0.82, lockedConf: 0.12, ts: 5000 });
    assert.equal(voter.redetect, true);
    assert.equal(voter.forcedLanguage(), null);
    voter.observe({ lang: 'fr', conf: 0.88, lockedConf: 0.10, ts: 6000 });
    assert.equal(voter.locked, 'fr');
});

test('computeLangSoftmax normalizes logits and honors forced language above 0.2 probability', () => {
    const langs = [['en', 0], ['es', 1], ['fr', 2]];
    const data = new Float32Array([5.0, 2.0, 0.0]);
    const free = computeLangSoftmax(data, langs, null);
    assert.equal(free.chosen, 'en');
    assert.equal(free.detected, 'en');
    assert.ok(free.conf > 0.9);

    // Marginal tie where forced language is at 0.25 prob keeps locked language:
    const tieData = new Float32Array([Math.log(3), Math.log(1), Math.log(0.01)]);
    const kept = computeLangSoftmax(tieData, langs, 'es');
    assert.equal(kept.detected, 'en');
    assert.equal(kept.chosen, 'es');
    assert.ok(kept.lockedConf > 0.2);
});

test('leading dash targetLang (-es) bypasses legacy v1.0.9 shouldAbortForSameLanguage even with manualForce=false', () => {
    const voter = new LanguageVoter();
    voter.observe({ lang: 'es', conf: 0.9, ts: 1000 });
    voter.observe({ lang: 'es', conf: 0.92, ts: 2000 });
    assert.equal(voter.locked, 'es');
    // Standard auto-mode aborts on same-language Spanish video:
    assert.equal(voter.shouldAbortForSameLanguage('es', false), true);
    // Legacy v1.0.9 caller without manualForce arg (defaults to false) MUST NOT abort when targetLang is '-es':
    assert.equal(voter.shouldAbortForSameLanguage('-es'), false);
    assert.equal(voter.shouldAbortForSameLanguage('-es', false), false);
});

test('selectRealtimeAsrSpec routes known languages to Sherpa Kroko, uses Acoustic LID when unknown, and honors Whisper choice', () => {
    assert.equal(normalizeAsrEngine('moonshine'), 'sherpa');
    assert.equal(normalizeAsrEngine('whisper'), 'whisper');
    assert.equal(normalizeAiAudioLang('es-419'), 'es');
    assert.equal(normalizeAiAudioLang('pt'), 'auto');
    assert.equal(hasSherpaLanguageModel('es'), true);
    assert.equal(hasSherpaLanguageModel('ja'), false);

    const enSherpa = selectRealtimeAsrSpec('en', true, 'sherpa');
    assert.equal(enSherpa.primaryEngine, 'sherpa');
    assert.equal(enSherpa.lidAutoPromote, false);
    assert.equal(enSherpa.candidates[0].id, 'csukuangfj/sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06');
    assert.equal(enSherpa.candidates[0].device, 'wasm');
    assert.equal(enSherpa.candidates[1].id, 'onnx-community/whisper-base');
    assert.equal(enSherpa.candidates[2].id, 'onnx-community/whisper-tiny');

    const esSherpa = selectRealtimeAsrSpec('es-419', true, 'sherpa');
    assert.equal(esSherpa.primaryEngine, 'sherpa');
    assert.equal(esSherpa.lidAutoPromote, false);
    assert.equal(esSherpa.candidates[0].id, 'csukuangfj/sherpa-onnx-streaming-zipformer-es-kroko-2025-08-06');

    // Unknown spokenLang MUST NOT force English — uses 39MB Whisper-Tiny Acoustic LID then auto-promotes:
    const autoSherpa = selectRealtimeAsrSpec('', true, 'sherpa');
    assert.equal(autoSherpa.primaryEngine, 'whisper');
    assert.equal(autoSherpa.lidAutoPromote, true);
    assert.equal(autoSherpa.candidates[0].id, 'onnx-community/whisper-tiny');
    assert.equal(autoSherpa.candidates[0].device, 'wasm');

    const jaSherpa = selectRealtimeAsrSpec('ja', true, 'sherpa');
    assert.equal(jaSherpa.primaryEngine, 'whisper');
    assert.equal(jaSherpa.lidAutoPromote, false);
    assert.equal(jaSherpa.candidates[0].id, 'onnx-community/whisper-base');

    const whisperChoice = selectRealtimeAsrSpec('es-419', true, 'whisper');
    assert.equal(whisperChoice.primaryEngine, 'whisper');
    assert.equal(whisperChoice.candidates[0].id, 'onnx-community/whisper-base');
    assert.deepEqual(whisperChoice.candidates[0].dtype, { encoder_model: 'fp32', decoder_model_merged: 'q4' });
    assert.equal(whisperChoice.candidates[1].id, 'onnx-community/whisper-tiny');
    assert.ok(whisperChoice.candidates.every(c => !/moonshine/i.test(c.engine) && !/moonshine/i.test(c.id)));
});

test('formatStreamingTailText truncates cleanly on word boundaries without losing trailing speech', () => {
    assert.equal(formatStreamingTailText('hello   world'), 'hello world');
    const longText = 'one two three four five six seven eight nine ten eleven twelve';
    const tail = formatStreamingTailText(longText, 28);
    assert.ok(tail.length <= 28);
    assert.ok(tail.endsWith('eleven twelve'));
});

test('computeAdaptiveSpeechThreshold raises floor gradually during steady background music and detects speech peaks above it', () => {
    let floor = 0.0015;
    for (let i = 0; i < 40; i++) {
        const res = computeAdaptiveSpeechThreshold(floor, 0.007, false);
        floor = res.nextNoiseFloor;
    }
    assert.ok(floor > 0.005 && floor <= 0.008, `noise floor adapted to music bed: ${floor}`);
    const musicHold = computeAdaptiveSpeechThreshold(floor, 0.0075, true);
    assert.equal(musicHold.isSpeech, false, 'steady music no longer locks VAD open after adaptation');

    const voicePeak = computeAdaptiveSpeechThreshold(floor, 0.025, false);
    assert.equal(voicePeak.isSpeech, true, 'clear speech peak above adapted floor triggers VAD');
});

test('SileroStreamingVadState rejects short transient pops and confirms sustained speech with hysteresis', () => {
    const vad = new SileroStreamingVadState({ onset: 0.45, offset: 0.30, minSpeechFrames: 8, minSilenceFrames: 13 });

    // 4-frame transient pop (< 8 frames) followed by 13 frames of silence must NOT confirm speech:
    assert.equal(vad.pushProb(0.8).justStarted, true);
    for (let i = 0; i < 3; i++) {
        const s = vad.pushProb(0.7);
        assert.equal(s.isSpeech, true);
        assert.equal(s.speechConfirmed, false);
    }
    for (let i = 0; i < 12; i++) {
        const s = vad.pushProb(0.05);
        assert.equal(s.isSpeech, true);
        assert.equal(s.justEnded, false);
    }
    const popEnd = vad.pushProb(0.05);
    assert.equal(popEnd.isSpeech, false);
    assert.equal(popEnd.justEnded, false, 'short transient pop must not emit justEnded confirmed speech');

    // Sustained speech (>= 8 frames) holds across minor dips (>= offset 0.30) and fires justEnded after 13 silence frames:
    assert.equal(vad.pushProb(0.6).justStarted, true);
    for (let i = 0; i < 6; i++) assert.equal(vad.pushProb(0.55).speechConfirmed, false);
    const confirmed = vad.pushProb(0.32); // 8th active frame >= offset 0.30
    assert.equal(confirmed.speechConfirmed, true);
    assert.equal(confirmed.isSpeech, true);
    for (let i = 0; i < 12; i++) {
        const s = vad.pushProb(0.1);
        assert.equal(s.isSpeech, true);
        assert.equal(s.justEnded, false);
    }
    const cleanEnd = vad.pushProb(0.1);
    assert.equal(cleanEnd.isSpeech, false);
    assert.equal(cleanEnd.justEnded, true);
});

test('gentleConditionPcm avoids amplifying quiet SFX/noise floor while mildly lifting quiet speech', () => {
    const noise = new Float32Array(256);
    for (let i = 0; i < noise.length; i++) noise[i] = (i % 2 === 0 ? 1 : -1) * 0.004;
    const condNoise = gentleConditionPcm(noise);
    let maxNoise = 0;
    for (let i = 0; i < condNoise.length; i++) maxNoise = Math.max(maxNoise, Math.abs(condNoise[i]));
    assert.ok(maxNoise < 0.015, `quiet room tone must not be boosted (max=${maxNoise})`);

    const quietSpeech = new Float32Array(256);
    for (let i = 0; i < quietSpeech.length; i++) quietSpeech[i] = Math.sin(i * 0.2) * 0.08;
    const condSpeech = gentleConditionPcm(quietSpeech);
    let maxQuiet = 0;
    for (let i = 0; i < condSpeech.length; i++) maxQuiet = Math.max(maxQuiet, Math.abs(condSpeech[i]));
    assert.ok(maxQuiet >= 0.12 && maxQuiet <= 0.48, `quiet speech gently lifted without over-gain (max=${maxQuiet})`);

    const normalSpeech = new Float32Array(256);
    for (let i = 0; i < normalSpeech.length; i++) normalSpeech[i] = Math.sin(i * 0.2) * 0.4;
    const condNormal = gentleConditionPcm(normalSpeech);
    let maxNormal = 0;
    for (let i = 0; i < condNormal.length; i++) maxNormal = Math.max(maxNormal, Math.abs(condNormal[i]));
    assert.ok(maxNormal >= 0.35 && maxNormal <= 0.45, `normal speech left unboosted (max=${maxNormal})`);
});

test('filterWhisperText suppresses empirical onomatopoeias, filler hallucinations, and non-Latin stray output on Latin videos', () => {
    for (const junk of ['Ahhh...', 'Jajaja', 'Oh!', 'Mmm', 'Rue de la Cicada', '9 o\'clock on', 'Nine o\'clock on.', 'Margerizer.', '1-0-0-0-0-0-0']) {
        assert.equal(filterWhisperText(junk, 'en'), '', `expected empty for junk: ${junk}`);
    }
    assert.equal(filterWhisperText('わっ', 'en'), '');
    assert.equal(filterWhisperText('고춧가루', 'es'), '');
    assert.equal(filterWhisperText('Para entender cómo medimos el ritmo.', 'es'), 'Para entender cómo medimos el ritmo.');
});

test('selectRealtimeAsrSpec routes turbo engine to Whisper Large-v3-Turbo WebGPU q4f16 with safe fallbacks', () => {
    assert.equal(normalizeAsrEngine('turbo'), 'turbo');
    const turboSpec = selectRealtimeAsrSpec('es', true, 'turbo', true);
    assert.equal(turboSpec.primaryEngine, 'whisper');
    assert.equal(turboSpec.candidates[0].id, 'onnx-community/whisper-large-v3-turbo');
    assert.deepEqual(turboSpec.candidates[0].dtype, { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' });
    assert.equal(turboSpec.candidates[1].id, 'onnx-community/whisper-base');
    assert.equal(turboSpec.candidates[2].id, 'onnx-community/whisper-tiny');

    const turboNoF16 = selectRealtimeAsrSpec('en', true, 'turbo', false);
    assert.deepEqual(turboNoF16.candidates[0].dtype, { encoder_model: 'q4', decoder_model_merged: 'q4' });
});
