import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { compileBundle } from '../tools/build-bundle.mjs';
import { ORDEN_MODULOS } from '../modules/config.js';

test('compileBundle builds a syntactically valid IIFE from all 8 modules', () => {
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
