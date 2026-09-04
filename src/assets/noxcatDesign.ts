export interface NoxcatDesignPoint {
  readonly x: number;
  readonly y: number;
}

/** Official high-saturation accent specified by the supplied usage guide. */
export const NOXCAT_OFFICIAL_GREEN = 0x91d500;
export const NOXCAT_OFFICIAL_BLACK = 0x101820;

export const NOXCAT_BUN_START = { x: 32, y: 176 } as const;

/**
 * Cubic segments in SVG order: control 1, control 2, end point.
 * These are the same coordinates used by noxcat-logo-bun-v5.svg.
 */
export const NOXCAT_BUN_CURVES = [
  [21, 176, 15, 172, 11, 164],
  [6, 154, 6, 139, 7, 124],
  [7, 108, 12, 92, 22, 76],
  [18, 63, 14, 44, 15, 33],
  [16, 26, 20, 24, 27, 27],
  [38, 31, 47, 38, 55, 45],
  [61, 49, 65, 52, 69, 53],
  [73, 49, 76, 46, 79, 43],
  [79, 30, 78, 14, 82, 9],
  [85, 5, 89, 7, 95, 12],
  [104, 21, 114, 36, 124, 51],
  [126, 55, 128, 58, 131, 60],
  [154, 65, 174, 78, 186, 96],
  [194, 108, 197, 122, 196, 138],
  [196, 154, 189, 166, 178, 172],
  [174, 176, 168, 176, 160, 176],
] as const;

export const NOXCAT_FACE_TEXTURE = { width: 52, height: 44 } as const;

export const NOXCAT_GOGGLE_LENSES = [
  { x: 2, y: 1, width: 21, height: 13, radius: 2 },
  { x: 29, y: 1, width: 21, height: 13, radius: 2 },
] as const;

export const NOXCAT_EYES = [
  {
    x: 13,
    y: 29,
    width: 20,
    height: 28,
  },
  {
    x: 38,
    y: 29,
    width: 20,
    height: 29,
  },
] as const;

/** Samples the SVG cubics for Phaser's fallback polygon texture. */
export function sampleNoxcatBunOutline(samplesPerCurve = 12): NoxcatDesignPoint[] {
  const steps = Math.max(2, Math.floor(samplesPerCurve));
  const points: NoxcatDesignPoint[] = [{ ...NOXCAT_BUN_START }];
  let fromX = NOXCAT_BUN_START.x;
  let fromY = NOXCAT_BUN_START.y;

  for (const [control1X, control1Y, control2X, control2Y, endX, endY] of NOXCAT_BUN_CURVES) {
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const inverse = 1 - t;
      points.push({
        x: inverse ** 3 * fromX
          + 3 * inverse ** 2 * t * control1X
          + 3 * inverse * t ** 2 * control2X
          + t ** 3 * endX,
        y: inverse ** 3 * fromY
          + 3 * inverse ** 2 * t * control1Y
          + 3 * inverse * t ** 2 * control2Y
          + t ** 3 * endY,
      });
    }
    fromX = endX;
    fromY = endY;
  }

  // This closing edge is the logo-led bun's intentionally long, flat base.
  points.push({ ...NOXCAT_BUN_START });
  return points;
}
