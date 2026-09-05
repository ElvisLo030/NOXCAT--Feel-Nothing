import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NOXCAT_BUN_CURVES,
  NOXCAT_BUN_START,
  NOXCAT_EYES,
  NOXCAT_GOGGLE_LENSES,
  NOXCAT_OFFICIAL_BLACK,
  NOXCAT_OFFICIAL_GREEN,
  sampleNoxcatBunOutline,
} from '../src/assets/noxcatDesign';

const projectRoot = process.cwd();
const assetDirectory = path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat');

describe('NOXCAT layered SVG character', () => {
  it('keeps the procedural fallback synchronized with the flat SVG silhouette', async () => {
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
    expect(svg).toContain('fill="#101820"');
    expect(NOXCAT_OFFICIAL_BLACK).toBe(0x101820);
    const bodyFallback = registry.match(
      /private static makeNoxcatBody[\s\S]*?(?=\n\s*private static makeNoxcatEyes)/,
    )?.[0];
    expect(bodyFallback).toContain('fillPoints(sampleNoxcatBunOutline()');
  });

  it('closes the sampled collision silhouette with the same horizontal base', () => {
    const outline = sampleNoxcatBunOutline();
    expect(outline[0]).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)).toEqual({ x: 160, y: 176 });
    expect(outline.at(-1)).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)?.y).toBe(outline.at(-1)?.y);
  });

  it('keeps the eyes and optional goggles as independent runtime layers', async () => {
    expect(NOXCAT_OFFICIAL_GREEN).toBe(0x91d500);
    expect(NOXCAT_EYES).toHaveLength(2);
    expect(NOXCAT_GOGGLE_LENSES).toHaveLength(2);
    const [registry, app] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'app', 'AppController.ts'), 'utf8'),
    ]);
    expect(registry).toContain("'noxcat.body'");
    expect(registry).toContain("'noxcat.eyes'");
    expect(registry).toContain("'noxcat.goggles'");
    expect(registry).toContain('/assets/ip/noxcat/noxcat-logo-bun-v5.svg');
    expect(registry).not.toMatch(/scene\.load\.image\([^\n]*noxcat-[LR]-(?:front|side)\.png/);
    expect(app).toContain('goggles-enabled');
    expect(app).toContain('gogglesVisible');
  });
});
