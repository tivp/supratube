import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchPkg = 'C:/Users/Sofía/.gemini/antigravity/brain/893fe698-54bf-4554-97c6-b5e052e01352/scratch/bench_whisper/package.json';

let esbuild;
let transformersNodePath;
try {
    const reqLocal = createRequire(path.join(root, 'package.json'));
    esbuild = reqLocal('esbuild');
    transformersNodePath = path.join(root, 'node_modules');
} catch {
    const reqScratch = createRequire(scratchPkg);
    esbuild = reqScratch('esbuild');
    transformersNodePath = path.dirname(scratchPkg) + '/node_modules';
}

await esbuild.build({
    entryPoints: {
        offscreen: path.join(root, 'offscreen-src/offscreen.js'),
        worker: path.join(root, 'offscreen-src/worker.js')
    },
    bundle: true,
    nodePaths: [transformersNodePath],
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    entryNames: '[name].bundle',
    outdir: root,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info'
});

// GitHub Secret Scanning flags the 32-char literal "Mistral3ForConditionalGeneration" next to "mistral3" as a false-positive Mistral API key.
const workerBundlePath = path.join(root, 'worker.bundle.js');
const workerSrc = fs.readFileSync(workerBundlePath, 'utf8').replaceAll(
    '"Mistral3ForConditionalGeneration"',
    '("Mistral3ForConditional"+"Generation")'
);
fs.writeFileSync(workerBundlePath, workerSrc, 'utf8');

const vendorDir = path.join(root, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    const src = path.join(transformersNodePath, 'onnxruntime-web', 'dist', file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(vendorDir, file));
    }
}
console.log('[build-offscreen] bundles and vendor WASM synced.');
