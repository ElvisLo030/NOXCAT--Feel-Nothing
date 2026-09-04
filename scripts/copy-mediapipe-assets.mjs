import { access, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageEntry = import.meta.resolve('@mediapipe/tasks-vision');
const packageDir = dirname(fileURLToPath(packageEntry));
const source = resolve(packageDir, 'wasm');
const target = resolve('public/vendor/mediapipe/wasm');

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
await Promise.all([
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
].map((name) => access(resolve(target, name))));
console.log(`Copied MediaPipe WASM assets: ${target}`);
