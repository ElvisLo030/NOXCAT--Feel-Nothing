import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NOXCAT_BUN_CURVES,
  NOXCAT_BUN_START,
  NOXCAT_OFFICIAL_BLACK,
  sampleNoxcatBunOutline,
} from '../src/assets/noxcatDesign';

const projectRoot = process.cwd();
const assetDirectory = path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat');

describe('NOXCAT character assets', () => {
  it('keeps the procedural load-failure fallback synchronized with the legacy flat silhouette', async () => {
    const [svg, registry] = await Promise.all([
      readFile(path.join(assetDirectory, 'noxcat-logo-bun-v5.svg'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
    ]);
    const pathData = svg.match(/<path[\s\S]*?\bd="([^"]+)"/)?.[1];
    expect(pathData).toBeTruthy();
    const svgNumbers = [...(pathData ?? '').matchAll(/-?\d+(?:\.\d+)?/g)]
      .map(([number]) => Number(number));
    const fallbackNumbers = [
      NOXCAT_BUN_START.x,
      NOXCAT_BUN_START.y,
      ...NOXCAT_BUN_CURVES.flatMap((curve) => [...curve]),
      NOXCAT_BUN_START.x,
      NOXCAT_BUN_START.y,
    ];

    expect(svgNumbers).toEqual(fallbackNumbers);
    expect(NOXCAT_OFFICIAL_BLACK).toBe(0x101820);
    const fallback = registry.match(
      /private static makeNoxcatFallbacks[\s\S]*?(?=\n\s*private static makeHitFlash)/,
    )?.[0];
    expect(fallback).toContain('fillPoints(sampleNoxcatBunOutline()');
  });

  it('closes the conservative collision silhouette with the same horizontal base', () => {
    const outline = sampleNoxcatBunOutline();
    expect(outline[0]).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)).toEqual({ x: 160, y: 176 });
    expect(outline.at(-1)).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)?.y).toBe(outline.at(-1)?.y);
  });

  it('ships all five transparent PNG poses and keeps goggles permanently baked into the character', async () => {
    const expected = new Map<string, readonly [number, number]>([
      ['noxcat-L-front.png', [1468, 1071]],
      ['noxcat-R-front.png', [1468, 1071]],
      ['noxcat-L-side.png', [1536, 1024]],
      ['noxcat-R-side.png', [1536, 1024]],
      ['noxcat-up.png', [1024, 1536]],
    ]);
    for (const [filename, [width, height]] of expected) {
      const png = await readFile(path.join(assetDirectory, filename));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(width);
      expect(png.readUInt32BE(20)).toBe(height);
      expect(png[25]).toBe(6);
    }

    const [registry, app] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'app', 'AppController.ts'), 'utf8'),
    ]);
    for (const filename of expected.keys()) {
      expect(registry).toContain(`/assets/ip/noxcat/${filename}`);
    }
    expect(registry).not.toContain("'noxcat.goggles'");
    expect(app).not.toContain('goggles-enabled');
    expect(app).not.toContain('gogglesVisible');
  });
});
