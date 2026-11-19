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
    assert.ok(manifest.permissions.includes('offscreen'));
    assert.ok(manifest.host_permissions.includes('https://sponsor.ajay.app/*'));
    assert.ok(manifest.host_permissions.includes('https://raw.githubusercontent.com/*'));
    assert.ok(manifest.host_permissions.includes('https://ipapi.co/*'));
    assert.ok(manifest.host_permissions.includes('https://translate.googleapis.com/*'));
    assert.ok(manifest.host_permissions.includes('https://clients5.google.com/*'));
    assert.ok(manifest.host_permissions.includes('https://huggingface.co/*'));
    assert.ok(manifest.host_permissions.includes('https://*.hf.co/*'));
    assert.match(String(manifest.content_security_policy?.extension_pages || ''), /wasm-unsafe-eval/);
    for (const rel of [
        'icons/icon-16.png',
        'icons/icon-48.png',
        'icons/icon-128.png',
        'background.js',
        'content.js',
        'page-hook.js',
        'popup.html',
        'popup.js',
        'offscreen.html',
        'offscreen.bundle.js',
        'worker.bundle.js',
        'vendor/ort-wasm-simd-threaded.asyncify.mjs',
        'vendor/ort-wasm-simd-threaded.asyncify.wasm'
    ]) {
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
                getManifest: () => ({ version: '1.0.14' }),
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
            extVersion: '1.0.14',
            sha: 'sha_old',
            modulos: modMap,
            codigoCompilado: compileBundle(modMap)
        }
    };
    const autoSandbox = {
        chrome: {
            runtime: {
                id: 'test-ext',
                getManifest: () => ({ version: '1.0.14' }),
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

test('actualizarScriptsDesdeGithub hot-reinitializes modern tabs, reloads legacy pre-teardown tabs, and repairs missing content bridge', async () => {
    const bg = fs.readFileSync(path.resolve('background.js'), 'utf8');
    const modMap = {};
    for (const mod of ORDEN_MODULOS) {
        modMap[mod] = fs.readFileSync(path.resolve('modules', mod), 'utf8');
    }

    const reloadedTabs = [];
    const scriptedInjections = [];
    const executedCodes = [];
    const fetchedUrls = [];
    let modernTeardownCount = 0;

    // Tab 1: Modern tab (>= v1.0.10) with dead content bridge -> repairs bridge + runs with __supratubeForceReinit
    // Tab 2: Legacy tab (<= v1.0.9) without __supratubeTeardown -> reloads tab cleanly
    const tabStates = {
        101: { executed: true, hasTeardown: true, aliveBridge: false },
        202: { executed: true, hasTeardown: false, aliveBridge: true }
    };

    const storeData = {};
    const sandbox = {
        chrome: {
            runtime: {
                id: 'test-ext',
                getManifest: () => ({ version: '1.0.14' }),
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                onMessage: { addListener() {} }
            },
            storage: {
                local: {
                    get: async () => storeData,
                    set: async obj => Object.assign(storeData, obj),
                    remove: async () => {}
                }
            },
            tabs: {
                query: async () => [
                    { id: 101, url: 'https://www.youtube.com/watch?v=t86sKsR4pnk' },
                    { id: 202, url: 'https://www.youtube.com/watch?v=abc123def45' }
                ],
                sendMessage: async (tabId, msg) => {
                    if (msg?.action === 'SUPRATUBE_PING' && !tabStates[tabId].aliveBridge) {
                        throw new Error('Could not establish connection. Receiving end does not exist.');
                    }
                    return { ok: true };
                },
                reload: async tabId => { reloadedTabs.push(tabId); }
            },
            scripting: {
                executeScript: async opts => {
                    const tabId = opts?.target?.tabId;
                    if (opts?.files) {
                        scriptedInjections.push({ tabId, world: opts.world || 'ISOLATED', files: opts.files });
                        if (opts.files.includes('content.js')) tabStates[tabId].aliveBridge = true;
                        return [{ result: true }];
                    }
                    if (typeof opts?.func === 'function') {
                        const st = tabStates[tabId];
                        return [{ result: { executed: st.executed, hasTeardown: st.hasTeardown } }];
                    }
                    return [{ result: false }];
                }
            },
            userScripts: {
                register: async () => {},
                unregister: async () => {},
                getScripts: async () => [],
                execute: async opts => {
                    const tabId = opts?.target?.tabId;
                    const code = opts?.js?.[0]?.code || '';
                    executedCodes.push({ tabId, code });
                    // Simulate running inside the tab window using tabStates
                    const tabWin = {
                        __supratubeEjecutado: tabStates[tabId].executed,
                        __supratubeTeardown: tabStates[tabId].hasTeardown ? () => {
                            modernTeardownCount++;
                            tabWin.__supratubeEjecutado = false;
                        } : undefined
                    };
                    const noop = () => {};
                    const fakeEl = { dataset: {}, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], remove: noop };
                    const fakeDoc = {
                        readyState: 'loading',
                        documentElement: fakeEl,
                        head: fakeEl,
                        body: fakeEl,
                        cookie: '',
                        addEventListener: noop,
                        removeEventListener: noop,
                        getElementById: () => null,
                        querySelector: () => null,
                        querySelectorAll: () => [],
                        createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop })
                    };
                    Object.assign(tabWin, {
                        location: { href: 'https://www.youtube.com/watch?v=t86sKsR4pnk', pathname: '/watch', search: '?v=t86sKsR4pnk' },
                        navigator: { language: 'es-419' },
                        fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
                        Response: function() {},
                        XMLHttpRequest: { prototype: {} },
                        document: fakeDoc,
                        addEventListener: noop,
                        removeEventListener: noop,
                        setTimeout: () => 1,
                        clearTimeout: noop,
                        setInterval: () => 1,
                        clearInterval: noop,
                        URL
                    });
                    vm.runInNewContext(code, {
                        window: tabWin,
                        document: fakeDoc,
                        navigator: tabWin.navigator,
                        location: tabWin.location,
                        fetch: tabWin.fetch,
                        XMLHttpRequest: tabWin.XMLHttpRequest,
                        Response: tabWin.Response,
                        Event: class {},
                        CustomEvent: class {},
                        AbortController,
                        MutationObserver: class { observe() {} disconnect() {} },
                        setTimeout: tabWin.setTimeout,
                        clearTimeout: tabWin.clearTimeout,
                        setInterval: tabWin.setInterval,
                        clearInterval: tabWin.clearInterval,
                        URL
                    });
                    tabStates[tabId].executed = tabWin.__supratubeEjecutado;
                }
            }
        },
        fetch: async url => {
            fetchedUrls.push(url);
            if (url.includes('/commits/main')) {
                return { ok: true, json: async () => ({ sha: 'sha_new', commit: { message: 'fix: hot reinit' } }) };
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

    vm.runInNewContext(bg, sandbox, { filename: 'background.js' });
    const result = await sandbox.actualizarScriptsDesdeGithub();
    assert.equal(result.ok, true);
    assert.equal(result.pestanasActualizadas, 2);
    assert.ok(fetchedUrls.some(u => u.includes('/sha_new/modules/config.js')));

    // Dead bridge on tab 101 must have been repaired by re-injecting page-hook.js + content.js
    assert.ok(scriptedInjections.some(s => s.tabId === 101 && s.files.includes('content.js')));
    assert.ok(scriptedInjections.some(s => s.tabId === 101 && s.files.includes('page-hook.js')));

    // Modern tab 101 must be torn down and re-executed in-place without reloading
    assert.equal(modernTeardownCount, 1);
    assert.equal(executedCodes.some(e => e.tabId === 101), true);
    assert.equal(reloadedTabs.includes(101), false);

    // Legacy tab 202 (without __supratubeTeardown) only reloads on explicit manual update (recargarLegado: true)
    assert.deepEqual(reloadedTabs, []);

    const manualRes = await sandbox.actualizarScriptsDesdeGithub({ recargarLegado: true });
    assert.equal(manualRes.ok, true);
    assert.deepEqual(reloadedTabs, [202]);

    // Older remote version (1.0.9 < local 1.0.10) must NOT downgrade local extension or register stale userScript
    let unregisteredDowngrade = 0;
    let downgradeRegistered = 0;
    const oldStoreData = {};
    const oldRemoteSandbox = {
        ...sandbox,
        chrome: {
            ...sandbox.chrome,
            storage: {
                local: {
                    get: async () => oldStoreData,
                    set: async obj => Object.assign(oldStoreData, obj),
                    remove: async k => { delete oldStoreData[k]; }
                }
            },
            userScripts: {
                register: async () => { downgradeRegistered++; },
                unregister: async () => { unregisteredDowngrade++; },
                getScripts: async () => [],
                execute: async () => {}
            }
        },
        fetch: async url => {
            fetchedUrls.push(url);
            if (url.includes('/commits/main')) {
                return { ok: true, json: async () => ({ sha: 'sha_old_109', commit: { message: 'v1.0.9' } }) };
            }
            if (url.includes('/modules/config.js')) {
                return { ok: true, text: async () => modMap['config.js'].replace("version: '1.0.14'", "version: '1.0.9'") };
            }
            return { ok: false, status: 500 };
        }
    };
    vm.runInNewContext(bg, oldRemoteSandbox, { filename: 'background.js' });
    const dgRes = await oldRemoteSandbox.actualizarScriptsDesdeGithub({ recargarLegado: true });
    assert.equal(dgRes.ok, true);
    assert.equal(dgRes.localVigente, true);
    assert.equal(downgradeRegistered, 0);
    assert.ok(unregisteredDowngrade >= 1);
});

test('SupraTube branding, simple humane copy, and transparent credits stay consistent across manifest, popup, and README', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
    const popupHtml = fs.readFileSync(path.resolve('popup.html'), 'utf8');
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');

    assert.equal(manifest.name, 'SupraTube');
    assert.equal(manifest.action.default_title, 'SupraTube');
    assert.doesNotMatch(manifest.name, /maximus/i);
    assert.match(manifest.description, /vanilla/i);

    assert.match(popupHtml, /<title>SupraTube<\/title>/);
    assert.match(popupHtml, /<div class="titulo">SupraTube<\/div>/);
    assert.doesNotMatch(popupHtml, /Maximus Motor/i);
    assert.match(popupHtml, /Gemini 4 Hydrogen Extra/);
    assert.match(popupHtml, /<select[^>]*data-setting="asrEngine"[^>]*>/);
    assert.match(popupHtml, /<option value="sherpa">/);
    assert.match(popupHtml, /<option value="turbo">/);
    assert.match(popupHtml, /<option value="whisper">/);
    assert.match(popupHtml, /<select[^>]*data-setting="aiAudioLang"[^>]*>/);
    assert.match(popupHtml, /<option value="auto">/);
    assert.match(popupHtml, /<option value="es">/);
    assert.doesNotMatch(popupHtml, /moonshine/i);
    assert.equal(fs.existsSync(path.resolve('vendor/sherpa-asr.wasm')), true);
    assert.equal(fs.existsSync(path.resolve('vendor/silero_vad.onnx')), true);
    assert.ok(manifest.host_permissions.includes('https://api.mymemory.translated.net/*'));

    assert.match(readme, /^#\s+SupraTube/m);
    assert.match(readme, /conserven?d?o lo vanilla|conservando lo vanilla/i);
    assert.match(readme, /Gemini 4 Hydrogen Extra en Antigravity/i);
    assert.match(readme, /greasyfork\.org\/en\/scripts\/561432/);
    assert.match(readme, /greasyfork\.org\/scripts\/508784/);
    assert.match(readme, /greasyfork\.org\/scripts\/537017/);
});

test('background.js retries transient offscreen startup connection errors and exposes swVersion', async () => {
    const bg = fs.readFileSync(path.resolve('background.js'), 'utf8');
    let msgListener = null;
    let sendAttempts = 0;
    let initPayload = null;
    const sandbox = {
        chrome: {
            runtime: {
                id: 'ext_test',
                getManifest: () => ({ version: '1.0.14' }),
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                onMessage: { addListener: fn => { msgListener = fn; } },
                getContexts: async () => [],
                sendMessage: async payload => {
                    if (payload?.target === 'offscreen' && payload?.type === 'INIT') {
                        sendAttempts++;
                        initPayload = payload;
                        if (sendAttempts < 3) {
                            throw new Error('Could not establish connection. Receiving end does not exist.');
                        }
                        return { ok: true };
                    }
                    return { ok: true };
                }
            },
            offscreen: { createDocument: async () => {} },
            tabs: { onRemoved: { addListener() {} }, query: async () => [], sendMessage: async () => {} },
            storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
            scripting: { executeScript: async () => [] },
            userScripts: { register: async () => {}, unregister: async () => {}, getScripts: async () => [], execute: async () => {} }
        },
        fetch: async () => ({ ok: false, status: 500 }),
        AbortController,
        setTimeout,
        clearTimeout,
        URLSearchParams
    };
    vm.runInNewContext(bg, sandbox, { filename: 'background.js' });

    const startRes = await new Promise(resolve => {
        msgListener({ action: 'SUPRATUBE_WHISPER_START', videoId: 'fEt2anArPb4', targetLang: '-es', asrEngine: 'whisper', aiAudioLang: 'es', manualForce: true }, { tab: { id: 9 } }, resolve);
    });
    assert.equal(startRes?.ok, true);
    assert.equal(sendAttempts, 3);
    assert.equal(initPayload?.asrEngine, 'whisper');
    assert.equal(initPayload?.aiAudioLang, 'es');

    const statusRes = await new Promise(resolve => {
        msgListener({ action: 'SUPRATUBE_GET_STATUS' }, {}, resolve);
    });
    assert.equal(statusRes?.ok, true);
    assert.equal(statusRes?.swVersion, '1.0.14');
});
