import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterWhisperText,
    stripCaptionOverlap,
    LanguageVoter,
    computeLangSoftmax
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
