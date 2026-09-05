import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NOXCAT_BUN_START,
  NOXCAT_DISPLAY_HEIGHT,
  NOXCAT_DISPLAY_WIDTH,
  NOXCAT_EYES,
  NOXCAT_EYE_COLOR,
  NOXCAT_FACE_TEXTURE,
  NOXCAT_OFFICIAL_BLACK,
  NOXCAT_OFFICIAL_GREEN,
  noxcatSvg,
  sampleNoxcatBunOutline,
} from '../src/assets/noxcatDesign';

const projectRoot = process.cwd();
const assetDirectory = path.join(projectRoot, 'public', 'assets', 'ip', 'noxcat');

describe('NOXCAT layered SVG character', () => {
  it('preserves the source SVG paths in each rendered logo layer', async () => {
    const [svg, registry] = await Promise.all([
      readFile(path.join(assetDirectory, 'noxcat-logo-traced.svg'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
    ]);
    for (const id of ['body', 'eye-left', 'eye-right']) {
      const source = svg.match(new RegExp(`<path id="${id}"[^>]+/>`))?.[0];
      expect(source).toBeTruthy();
      expect(noxcatSvg(id === 'body' ? 'body' : 'eyes')).toContain(source);
      expect(noxcatSvg()).toContain(source);
    }
    expect(svg).toContain('fill="#2c2925"');
    expect(NOXCAT_OFFICIAL_BLACK).toBe(0x2c2925);
    const bodyFallback = registry.match(
      /private static makeNoxcatBody[\s\S]*?(?=\n\s*private static makeNoxcatEyes)/,
    )?.[0];
    expect(bodyFallback).toContain('fillPoints(sampleNoxcatBunOutline()');
  });

  it('closes the collision silhouette within the shared logo coordinates', () => {
    const outline = sampleNoxcatBunOutline();
    expect(outline[0]).toEqual(NOXCAT_BUN_START);
    expect(outline.at(-1)).toEqual(NOXCAT_BUN_START);
    expect(outline.length).toBeGreaterThan(50);
    for (const point of outline) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(NOXCAT_FACE_TEXTURE.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(NOXCAT_FACE_TEXTURE.height);
    }
    expect(NOXCAT_DISPLAY_HEIGHT / NOXCAT_DISPLAY_WIDTH)
      .toBeCloseTo(NOXCAT_FACE_TEXTURE.height / NOXCAT_FACE_TEXTURE.width, 10);
  });

  it('preserves the traced eye proportions, tilt and unequal height', () => {
    expect(NOXCAT_EYE_COLOR).toBe(0x91d500);
    expect(NOXCAT_EYES).toHaveLength(2);
    const centres = NOXCAT_EYES.map((eye) => {
      expect(eye.length).toBeGreaterThan(3);
      const centre = {
        x: eye.reduce((total, point) => total + point.x, 0) / eye.length,
        y: eye.reduce((total, point) => total + point.y, 0) / eye.length,
      };
      const width = Math.max(...eye.map((point) => point.x)) - Math.min(...eye.map((point) => point.x));
      const height = Math.max(...eye.map((point) => point.y)) - Math.min(...eye.map((point) => point.y));
      expect(Math.abs(width / NOXCAT_FACE_TEXTURE.width - 0.11)).toBeLessThan(0.005);
      expect(Math.abs(height / NOXCAT_FACE_TEXTURE.height - 0.19)).toBeLessThan(0.005);
      const tilt = eye.reduce((sum, point) => sum + (point.x - centre.x) * (point.y - centre.y), 0);
      expect(tilt).toBeGreaterThan(0);
      return centre;
    });
    expect(centres[0]!.x).toBeLessThan(centres[1]!.x);
    expect(centres[0]!.y).toBeGreaterThan(centres[1]!.y);
  });

  it('keeps every goggles reference resolvable in standalone and combined SVGs', () => {
    for (const layer of ['goggles', 'all'] as const) {
      const svg = noxcatSvg(layer);
      const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const match of svg.matchAll(/(?:href="#|url\(#)([^"\s)]+)/g)) {
        expect(ids).toContain(match[1]);
      }
    }
    expect(noxcatSvg('goggles')).toMatch(/<defs><path id="body"[^>]+\/><\/defs>/);
  });

  it('registers the preview, eyes and optional goggles in the same viewBox', async () => {
    expect(NOXCAT_OFFICIAL_GREEN).toBe(0x91d500);
    const viewBox = `viewBox="0 0 ${NOXCAT_FACE_TEXTURE.width} ${NOXCAT_FACE_TEXTURE.height}"`;
    for (const layer of ['body', 'eyes', 'goggles', 'all'] as const) {
      expect(noxcatSvg(layer)).toContain(viewBox);
    }
    const allLayers = noxcatSvg();
    for (const id of ['body', 'eye-left', 'eye-right']) {
      const source = allLayers.match(new RegExp(`<path id="${id}"[^>]+/>`))?.[0];
      expect(source).toBeTruthy();
      expect(noxcatSvg(id === 'body' ? 'body' : 'eyes')).toContain(source);
    }
    expect(noxcatSvg('goggles')).toContain('id="goggles"');
    expect(noxcatSvg('eyes')).not.toContain('id="goggles"');
    const [registry, app] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'assets', 'AssetRegistry.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'app', 'AppController.ts'), 'utf8'),
    ]);
    expect(registry).toContain("'noxcat.body'");
    expect(registry).toContain("'noxcat.eyes'");
    expect(registry).toContain("'noxcat.goggles'");
    expect(registry).toContain('noxcatSvg(layer)');
    expect(registry).not.toMatch(/scene\.load\.image\([^\n]*noxcat-[LR]-(?:front|side)\.png/);
    expect(app).toContain('goggles-enabled');
    expect(app).toContain('gogglesVisible');
    expect(app).toContain('${noxcatSvg()}');
  });
});
