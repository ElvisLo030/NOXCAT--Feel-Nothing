import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function cssRule(styles: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

function cssZIndex(rule: string): number {
  const match = rule.match(/\bz-index\s*:\s*(-?\d+)/);
  if (!match?.[1]) throw new Error('CSS rule is missing a numeric z-index');
  return Number(match[1]);
}

describe('delivery assets', () => {
  it('declares the required mobile and PWA metadata with an existing icon', async () => {
    const index = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
    const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      start_url?: string;
      display?: string;
      orientation?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
    };

    expect(index).toContain('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(index).toContain('<meta name="theme-color"');
    expect(index).toContain('<link rel="icon" href="/favicon.svg"');
    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(manifest).toMatchObject({
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
    });

    const icon = manifest.icons?.[0];
    expect(icon).toMatchObject({
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
    });
    expect(icon?.purpose?.split(/\s+/)).toContain('maskable');
    const iconStats = await stat(
      path.join(projectRoot, 'public', icon?.src?.replace(/^\//, '') ?? ''),
    );
    expect(iconStats.isFile()).toBe(true);
    expect(iconStats.size).toBeGreaterThan(64);
  });

  it('ships an exact copy of the supplied official wordmark', async () => {
    const supplied = path.join(
      projectRoot,
      'docs',
      'official-assets-20260904',
      'NOXCAT LOGO',
      'NOXCAT LOGO_10.png',
    );
    const shipped = path.join(
      projectRoot,
      'public',
      'assets',
      'ip',
      'noxcat',
      'noxcat-logo-official-white.png',
    );

    await expect(sha256(shipped)).resolves.toBe(await sha256(supplied));
  });

  it('keeps the unchanged official wordmark above decorative scanlines', async () => {
    const [controller, styles] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'app', 'AppController.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'styles.css'), 'utf8'),
    ]);
    expect(controller).toContain(
      '<img class="official-wordmark" src="/assets/ip/noxcat/noxcat-logo-official-white.png" alt="NOXCAT" />',
    );

    const scanlines = cssRule(styles, '.scanlines');
    const brandLockup = cssRule(styles, '.brand-lockup');
    const wordmark = cssRule(styles, '.official-wordmark');
    expect(cssZIndex(brandLockup)).toBeGreaterThan(cssZIndex(scanlines));
    expect(wordmark).not.toMatch(/\b(?:filter|opacity|transform)\s*:/);
  });

  it('keeps placeholder and superseded character files out of public assets', async () => {
    const assetDirectory = path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat');
    const names = (await readdir(assetDirectory)).map((name) => name.toLowerCase());

    expect(names).toContain('noxcat-logo-bun-v5.svg');
    expect(names.some((name) => name.includes('placeholder'))).toBe(false);
    expect(names.some((name) => /(?:^|[-_])v[1-4](?:[-_.]|$)/.test(name))).toBe(false);
  });

  it('contains a local Face Landmarker task and valid WebAssembly binaries', async () => {
    const model = await readFile(path.join(projectRoot, 'public', 'models', 'face_landmarker.task'));
    expect(model.byteLength).toBeGreaterThan(1_000_000);
    expect([...model.subarray(2, 6)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const wasmDirectory = path.join(projectRoot, 'public', 'vendor', 'mediapipe', 'wasm');
    const wasmNames = (await readdir(wasmDirectory)).filter((name) => name.endsWith('.wasm'));
    expect(wasmNames).toHaveLength(3);
    for (const name of wasmNames) {
      const wasm = await readFile(path.join(wasmDirectory, name));
      expect(wasm.byteLength).toBeGreaterThan(1_000_000);
      expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    }
  });
});
