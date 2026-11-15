import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { compileBundle } from '../tools/build-bundle.mjs';
import { ORDEN_MODULOS } from '../modules/config.js';

test('compileBundle builds a syntactically valid IIFE from all 10 modules', () => {
    const map = {};
    for (const name of ORDEN_MODULOS) {
        map[name] = fs.readFileSync(path.resolve('modules', name), 'utf8');
    }
    const bundled = compileBundle(map);
    assert.match(bundled, /window\.__supratubeEjecutado/);
    assert.doesNotMatch(bundled, /^import\s+/m);
    assert.doesNotMatch(bundled, /^export\s+/m);
    assert.doesNotThrow(() => new vm.Script(bundled, { filename: 'script.js' }));
});

test('generated script.js exists on disk and parses cleanly', () => {
    const code = fs.readFileSync(path.resolve('script.js'), 'utf8');
    assert.ok(code.length > 5000);
    assert.doesNotThrow(() => new vm.Script(code, { filename: 'script.js' }));
});

test('legacy 9-module v1.0.3 GitHub auto-update bundle still provides createTranscriptDownloadController', () => {
    const LEGACY_V103_MODULES = [
        'config.js',
        'utils.js',
        'adblock.js',
        'sponsorblock.js',
        'quality.js',
        'geo-lang.js',
        'subtitles.js',
        'ai-summary.js',
        'main.js'
    ];
    const bloques = LEGACY_V103_MODULES.map(nombre => {
        let codigo = fs.readFileSync(path.resolve('modules', nombre), 'utf8');
        codigo = codigo.replace(/^import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^import\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^export\s+(async\s+function|function|const|let)/gm, '$1');
        return `// --- ${nombre} ---\n${codigo.trim()}`;
    });
    const legacyBundle = `(() => {\n'use strict';\n${bloques.join('\n\n')}\nreturn typeof createTranscriptDownloadController === 'function' ? createTranscriptDownloadController : (typeof __supratubeTdExports !== 'undefined' && __supratubeTdExports && __supratubeTdExports.createTranscriptDownloadController);\n})();`;
    assert.doesNotMatch(legacyBundle, /^import\s+/m);
    assert.doesNotMatch(legacyBundle, /^export\s+/m);
    const noop = () => {};
    const fakeEl = { dataset: {}, appendChild: noop, querySelector: () => null, querySelectorAll: () => [] };
    const fakeDoc = {
        readyState: 'loading',
        documentElement: fakeEl,
        head: fakeEl,
        body: fakeEl,
        cookie: '',
        addEventListener: noop,
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop })
    };
    const fakeWin = {
        location: { href: 'https://www.youtube.com/shorts/hEiN78-5caU', pathname: '/shorts/hEiN78-5caU', search: '' },
        navigator: { language: 'es-419' },
        fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
        Response: function() {},
        XMLHttpRequest: { prototype: {} },
        document: fakeDoc,
        addEventListener: noop,
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval: noop,
        URL
    };
    const factory = vm.runInNewContext(legacyBundle, {
        window: fakeWin,
        document: fakeDoc,
        navigator: fakeWin.navigator,
        location: fakeWin.location,
        fetch: fakeWin.fetch,
        XMLHttpRequest: fakeWin.XMLHttpRequest,
        Response: fakeWin.Response,
        Event: class {},
        CustomEvent: class {},
        MutationObserver: class { observe() {} disconnect() {} },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URL
    });
    assert.equal(typeof factory, 'function');
});
