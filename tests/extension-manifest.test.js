import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ORDEN_MODULOS } from '../modules/config.js';
import { compileBundle } from '../tools/build-bundle.mjs';

test('manifest.json is valid MV3 with crystal icons, userScripts, and required host permissions', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.icons['128'], 'icons/icon-128.png');
    assert.equal(manifest.action.default_icon, 'icons/icon-128.png');
    assert.ok(manifest.permissions.includes('userScripts'));
    assert.ok(manifest.permissions.includes('storage'));
    assert.ok(manifest.permissions.includes('scripting'));
    assert.ok(manifest.host_permissions.includes('https://sponsor.ajay.app/*'));
    assert.ok(manifest.host_permissions.includes('https://raw.githubusercontent.com/*'));
    assert.ok(manifest.host_permissions.includes('https://ipapi.co/*'));
    assert.ok(manifest.host_permissions.includes('https://translate.googleapis.com/*'));
    assert.ok(manifest.host_permissions.includes('https://clients5.google.com/*'));
    for (const rel of ['icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png', 'background.js', 'content.js', 'page-hook.js', 'popup.html', 'popup.js']) {
        assert.equal(fs.existsSync(path.resolve(rel)), true, `${rel} must exist`);
    }
});

test('background.js targets tivp/supratube, keeps ORDEN_MODULOS parity, and compiles identical bundle', async () => {
    const bg = fs.readFileSync(path.resolve('background.js'), 'utf8');
    assert.match(bg, /repos\/tivp\/supratube\/commits\/main/);
    assert.match(bg, /raw\.githubusercontent\.com\/tivp\/supratube\/main/);
    for (const mod of ORDEN_MODULOS) {
        assert.ok(bg.includes(`'${mod}'`), `background.js must include ${mod}`);
    }
    assert.doesNotThrow(() => new vm.Script(bg, { filename: 'background.js' }));
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.resolve('page-hook.js'), 'utf8'), { filename: 'page-hook.js' }));
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.resolve('content.js'), 'utf8'), { filename: 'content.js' }));

    let unregistered = 0;
    const staleCache = {
        sha: 'oldsha',
        extVersion: '1.0.3',
        modulos: { 'config.js': '', 'main.js': '' },
        codigoCompilado: '(() => {})()'
    };
    const sandbox = {
        chrome: {
            runtime: {
                id: 'test-ext',
                getManifest: () => ({ version: '1.0.5' }),
                onInstalled: { addListener() {} },
                onMessage: { addListener() {} }
            },
            storage: {
                local: {
                    get: async () => ({ supratube_github_cache: staleCache }),
                    set: async () => {},
                    remove: async () => {}
                }
            },
            userScripts: {
                register: async () => {},
                unregister: async () => { unregistered++; },
                getScripts: async () => [{ id: 'supratube-github-bundle' }]
            }
        },
        fetch: async () => ({ ok: false, status: 500 }),
        Map,
        Promise,
        Date,
        AbortController,
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(bg, sandbox, { filename: 'background.js' });
    const modMap = {};
    for (const mod of ORDEN_MODULOS) {
        modMap[mod] = fs.readFileSync(path.resolve('modules', mod), 'utf8');
    }
    assert.equal(sandbox.compilarBundleDesdeModulos(modMap), compileBundle(modMap));
    assert.equal(sandbox.esCacheValido(staleCache), false);
    const cacheCheck = await sandbox.asegurarUserScriptDesdeCache();
    assert.equal(cacheCheck.activo, false);
    assert.ok(unregistered >= 1);
    const parsedMods = sandbox.parseOrdenModulosDesdeConfig(modMap['config.js']);
    assert.deepEqual(Array.from(parsedMods), Array.from(ORDEN_MODULOS));
});
