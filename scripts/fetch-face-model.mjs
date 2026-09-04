import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const target = resolve('public/models/face_landmarker.task');
const source = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

function isValidTask(bytes) {
  return bytes.byteLength > 1_000_000
    && bytes[2] === 0x50
    && bytes[3] === 0x4b
    && bytes[4] === 0x03
    && bytes[5] === 0x04;
}

let existing;
try {
  existing = await readFile(target);
} catch {
  existing = null;
}

if (existing && isValidTask(existing)) {
  console.log(`Face model already exists: ${target}`);
} else {
  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to download face model (${response.status})`);
  const downloaded = new Uint8Array(await response.arrayBuffer());
  if (!isValidTask(downloaded)) throw new Error('Downloaded face model is incomplete or invalid');
  await writeFile(target, downloaded);
  console.log(`Downloaded face model: ${target}`);
}
