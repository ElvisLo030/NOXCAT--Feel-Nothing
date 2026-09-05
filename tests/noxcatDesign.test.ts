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

describe('NOXCAT code-native asset design', () => {
  it('keeps fallback cubic coordinates synchronized with the flat SVG body', async () => {
    const [svg, registry] = await Promise.all([
      readFile(
        path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat', 'noxcat-logo-bun-v5.svg'),
        'utf8',
      ),
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
    expect(bodyFallback).not.toContain('fillRoundedRect');
  });

  it('closes the sampled silhouette with the same long horizontal bun base', () => {
    const outline = sampleNoxcatBunOutline();
    expect(outline[0]).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)).toEqual({ x: 160, y: 176 });
    expect(outline.at(-1)).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-2)?.y).toBe(outline.at(-1)?.y);
  });

  it('defines independent pure-green eyes and forehead goggle assets', async () => {
    expect(NOXCAT_OFFICIAL_GREEN).toBe(0x91d500);
    expect(NOXCAT_GOGGLE_LENSES).toHaveLength(2);
    expect(NOXCAT_EYES).toHaveLength(2);
    expect(NOXCAT_EYES.every((eye) => eye.height >= 25)).toBe(true);
    expect(
      NOXCAT_EYES.every((eye) => Object.keys(eye).sort().join(',') === 'height,width,x,y'),
    ).toBe(true);

    const goggleBottom = Math.max(
      ...NOXCAT_GOGGLE_LENSES.map((lens) => lens.y + lens.height),
    );
    const eyeTop = Math.min(...NOXCAT_EYES.map((eye) => eye.y - eye.height / 2));
    expect(goggleBottom).toBeLessThan(eyeTop);

    const registry = await readFile(
      path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'),
      'utf8',
    );
    const eyesRenderer = registry.match(
      /private static makeNoxcatEyes[\s\S]*?(?=\n\s*private static makeNoxcatGoggles)/,
    )?.[0];
    const gogglesRenderer = registry.match(
      /private static makeNoxcatGoggles[\s\S]*?(?=\n\s*private static makeHitFlash)/,
    )?.[0];
    const executableEyesRenderer = eyesRenderer?.replace(/\/\/.*$/gm, '');
    expect(eyesRenderer).toContain("this.key('noxcat.eyes')");
    expect(eyesRenderer).toContain('fillStyle(NOXCAT_OFFICIAL_GREEN, 1)');
    expect(executableEyesRenderer).not.toMatch(/pupil|highlight|fillCircle|stroke/i);
    expect(gogglesRenderer).toContain("this.key('noxcat.goggles')");
    expect(gogglesRenderer).toContain('NOXCAT_GOGGLE_LENSES');
  });
});
