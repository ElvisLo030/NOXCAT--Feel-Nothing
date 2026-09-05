import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const OFFICIAL_WORDMARK_SHA256 =
  'e203024cad2d6f0b5f096d6dacd6dcd55c526101cfbd6479e5d0e01df8ab2148';
const FACE_LANDMARKER_SHA256 =
  '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';

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

  it('keeps the PWA icon within the official character identity and palette', async () => {
    const icon = await readFile(path.join(projectRoot, 'public', 'favicon.svg'), 'utf8');
    expect(icon).toContain('id="flat-bun-body"');
    expect(icon).toContain('id="green-eyes"');
    expect(icon).toContain('id="forehead-goggles"');

    const colours = new Set(
      [...icon.matchAll(/#[0-9a-f]{6}/gi)].map(([colour]) => colour.toUpperCase()),
    );
    expect(colours).toEqual(new Set(['#DAD9D7', '#101820', '#B2B2B2', '#91D500']));
    expect(icon.match(/<ellipse\b/g)).toHaveLength(2);
    expect(icon).not.toContain('#F6F6F6');
  });

  it('ships an exact copy of the supplied official wordmark', async () => {
    const shipped = path.join(
      projectRoot,
      'public',
      'assets',
      'ip',
      'noxcat',
      'noxcat-logo-official-white.png',
    );

    // The organizer's raw pack is intentionally gitignored. Keeping its
    // reviewed digest here lets a clean checkout verify the shipped copy
    // without making the private source archive a test dependency.
    await expect(sha256(shipped)).resolves.toBe(OFFICIAL_WORDMARK_SHA256);
  });

  it('ships the generated concept-led Boss as a real transparent RGBA texture', async () => {
    const bossPath = path.join(
      projectRoot,
      'public',
      'assets',
      'boss',
      'boss-office-base-v1.png',
    );
    const png = await readFile(bossPath);

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(png[24]).toBe(8);
    // PNG colour type 6 is truecolour + alpha, not an opaque checkerboard.
    expect(png[25]).toBe(6);
    expect(png.byteLength).toBeGreaterThan(500_000);

    const [registry, bossSource] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'game', 'entities', 'Boss.ts'), 'utf8'),
    ]);
    expect(registry).toContain("scene.load.image(bossKey, '/assets/boss/boss-office-base-v1.png')");
    expect(registry).toContain('makeBossFallback');
    expect(bossSource).toContain("AssetRegistry.key('boss.crt')");
    expect(bossSource).not.toMatch(/draw(?:Shell|Hands|PaperWalls|CentralPaperStack|RearSilhouette)/);
  });

  it('reuses the generated Boss as a subdued grayscale homepage backdrop', async () => {
    const [controller, styles] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'app', 'AppController.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'styles.css'), 'utf8'),
    ]);

    expect(controller).toContain(
      '<img class="start-boss-ghost" src="/assets/boss/boss-office-base-v1.png" alt="" />',
    );
    const ghost = cssRule(styles, '.start-boss-ghost');
    expect(ghost).toMatch(/opacity\s*:\s*\.28/);
    expect(ghost).toMatch(/filter\s*:[^;]*grayscale\(1\)[^;]*saturate\(0\)/);
    expect(ghost).toMatch(/mask-image\s*:[^;]*linear-gradient/);
  });

  it('ships generated transparent projectile textures through the asset registry', async () => {
    const projectileDirectory = path.join(projectRoot, 'public', 'assets', 'projectiles');
    const files = [
      'paper-generated-v1.png',
      'returnable-generated-v1.png',
    ];
    for (const name of files) {
      const png = await readFile(path.join(projectileDirectory, name));
      expect([...png.subarray(0, 8)], name).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png.readUInt32BE(16), name).toBe(192);
      expect(png.readUInt32BE(20), name).toBe(248);
      expect(png[24], name).toBe(8);
      expect(png[25], name).toBe(6);
      expect(png.byteLength, name).toBeGreaterThan(75_000);
    }

    const [registry, projectileSource] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'game', 'entities', 'Projectile.ts'), 'utf8'),
    ]);
    expect(registry).toContain('/assets/projectiles/paper-generated-v1.png');
    expect(registry).toContain('/assets/projectiles/returnable-generated-v1.png');
    expect(registry).toContain('makePaper(scene, false)');
    expect(registry).toContain('makePaper(scene, true)');
    expect(projectileSource).toContain('PROJECTILE_CARD_WIDTH = 40');
    expect(projectileSource).toContain('PROJECTILE_CARD_HEIGHT = 52');
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

  it('keeps placeholders out while retaining the legacy vector reference', async () => {
    const assetDirectory = path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat');
    const names = (await readdir(assetDirectory)).map((name) => name.toLowerCase());

    expect(names).toContain('noxcat-logo-bun-v5.svg');
    expect(names.some((name) => name.includes('placeholder'))).toBe(false);
    expect(names.some((name) => /(?:^|[-_])v[1-4](?:[-_.]|$)/.test(name))).toBe(false);
  });

  it('contains a local Face Landmarker task and valid WebAssembly binaries', async () => {
    const modelPath = path.join(projectRoot, 'public', 'models', 'face_landmarker.task');
    const model = await readFile(modelPath);
    expect(model.byteLength).toBeGreaterThan(1_000_000);
    expect([...model.subarray(2, 6)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await sha256(modelPath)).toBe(FACE_LANDMARKER_SHA256);

    const wasmDirectory = path.join(projectRoot, 'public', 'vendor', 'mediapipe', 'wasm');
    const wasmNames = (await readdir(wasmDirectory)).filter((name) => name.endsWith('.wasm'));
    expect(wasmNames).toHaveLength(3);
    for (const name of wasmNames) {
      const wasm = await readFile(path.join(wasmDirectory, name));
      expect(wasm.byteLength).toBeGreaterThan(1_000_000);
      expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    }
  });

  it('keeps every self-hosted MediaPipe runtime file byte-identical to the installed package', async () => {
    const packageDirectory = path.join(
      projectRoot,
      'node_modules',
      '@mediapipe',
      'tasks-vision',
    );
    const packageMetadata = JSON.parse(
      await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
    ) as { version?: string };
    expect(packageMetadata.version).toBe('0.10.35');

    const sourceDirectory = path.join(packageDirectory, 'wasm');
    const vendoredDirectory = path.join(projectRoot, 'public', 'vendor', 'mediapipe', 'wasm');
    const [sourceNames, vendoredNames] = await Promise.all([
      readdir(sourceDirectory),
      readdir(vendoredDirectory),
    ]);
    expect(vendoredNames.sort()).toEqual(sourceNames.sort());

    for (const name of sourceNames) {
      const [sourceDigest, vendoredDigest] = await Promise.all([
        sha256(path.join(sourceDirectory, name)),
        sha256(path.join(vendoredDirectory, name)),
      ]);
      expect(vendoredDigest, name).toBe(sourceDigest);
    }
  });
});
