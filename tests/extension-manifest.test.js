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
                getManifest: () => ({ version: '1.0.6' }),
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
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

    let syncCalls = 0;
    const storeData = {
        supratube_last_sync_check: Date.now() - (20 * 60 * 1000),
        supratube_github_cache: {
            extVersion: '1.0.6',
            sha: 'sha_old',
            modulos: modMap,
            codigoCompilado: compileBundle(modMap)
        }
    };
    const autoSandbox = {
        chrome: {
            runtime: {
                id: 'test-ext',
                getManifest: () => ({ version: '1.0.6' }),
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                onMessage: { addListener() {} }
            },
            storage: {
                local: {
                    get: async keys => {
                        const out = {};
                        const arr = Array.isArray(keys) ? keys : [keys];
                        for (const k of arr) out[k] = storeData[k];
                        return out;
                    },
                    set: async obj => Object.assign(storeData, obj),
                    remove: async k => { delete storeData[k]; }
                }
            },
            tabs: { query: async () => [] },
            userScripts: {
                register: async () => { syncCalls++; },
                unregister: async () => {},
                getScripts: async () => [{ id: 'supratube-github-bundle' }]
            }
        },
        fetch: async url => {
            if (url.includes('/commits/main')) {
                return { ok: true, json: async () => ({ sha: 'sha_new', commit: { message: 'fix: update' } }) };
            }
            const name = url.split('/modules/')[1]?.split('?')[0];
            if (name && modMap[name] !== undefined) {
                return { ok: true, text: async () => modMap[name] };
            }
            return { ok: false, status: 404 };
        },
        Map,
        Promise,
        Date,
        AbortController,
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(bg, autoSandbox, { filename: 'background.js' });
    const updated = await autoSandbox.verificarActualizacionAutomaticaEnFondo();
    assert.equal(updated, true);
    assert.equal(syncCalls, 1);
    assert.equal(storeData.supratube_github_cache.sha, 'sha_new');
    const skippedCooldown = await autoSandbox.verificarActualizacionAutomaticaEnFondo();
    assert.equal(skippedCooldown, false);
});
