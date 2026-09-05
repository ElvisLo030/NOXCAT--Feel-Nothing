import logoSvg from '../../public/assets/ip/noxcat/noxcat-logo-traced.svg?raw';
import { PALETTE } from '../theme/palette';

export interface NoxcatDesignPoint {
  readonly x: number;
  readonly y: number;
}

/** Trace the supplied logo's shape; use the requested green game eyes. */
export const NOXCAT_OFFICIAL_GREEN = PALETTE.green;
export const NOXCAT_OFFICIAL_BLACK = 0x2c2925;
export const NOXCAT_EYE_COLOR = NOXCAT_OFFICIAL_GREEN;

const viewBox = logoSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
export const NOXCAT_FACE_TEXTURE = {
  width: Number(viewBox[1]),
  height: Number(viewBox[2]),
};
export const NOXCAT_DISPLAY_WIDTH = 138;
export const NOXCAT_DISPLAY_HEIGHT = NOXCAT_DISPLAY_WIDTH
  * NOXCAT_FACE_TEXTURE.height / NOXCAT_FACE_TEXTURE.width;

function pathElement(id: string): string {
  return logoSvg.match(new RegExp(`<path id="${id}"[^>]+/>`))![0];
}

/** Sample the same fitted SVG curves for fallback rendering and collision. */
function pathPoints(id: string): NoxcatDesignPoint[] {
  const path = pathElement(id).match(/\bd="([^"]+)"/)![1]!;
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  let from = { x: numbers[0]!, y: numbers[1]! };
  const points = [from];
  for (let index = 2; index < numbers.length; index += 6) {
    const [x1, y1, x2, y2, x3, y3] = numbers.slice(index, index + 6) as [number, number, number, number, number, number];
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      const q = 1 - t;
      points.push({
        x: q ** 3 * from.x + 3 * q ** 2 * t * x1 + 3 * q * t ** 2 * x2 + t ** 3 * x3,
        y: q ** 3 * from.y + 3 * q ** 2 * t * y1 + 3 * q * t ** 2 * y2 + t ** 3 * y3,
      });
    }
    from = { x: x3, y: y3 };
  }
  return points;
}

const bodyOutline = pathPoints('body');
export const NOXCAT_EYES = [pathPoints('eye-left'), pathPoints('eye-right')];
export const NOXCAT_BUN_START = bodyOutline[0]!;

export function sampleNoxcatBunOutline(): NoxcatDesignPoint[] {
  return [...bodyOutline, bodyOutline[0]!];
}

export type NoxcatSvgLayer = 'body' | 'eyes' | 'goggles' | 'all';

/** Homepage and Phaser load layers from this one SVG, with the same viewBox. */
export function noxcatSvg(layer: NoxcatSvgLayer = 'all'): string {
  const eyes = logoSvg.match(/<g id="eyes"[\s\S]*?<\/g>/)![0];
  const goggles = logoSvg.slice(logoSvg.indexOf('  <g id="goggles"'), logoSvg.lastIndexOf('</svg>'))
    .replace('display="none"', 'display="inline"');
  const content = layer === 'body' ? pathElement('body')
    : layer === 'eyes' ? eyes
    // The standalone accessory texture needs the shared outline for its strap clip.
    : layer === 'goggles' ? `<defs>${pathElement('body')}</defs>${goggles}`
    : `${pathElement('body')}${eyes}${goggles}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NOXCAT_FACE_TEXTURE.width} ${NOXCAT_FACE_TEXTURE.height}" aria-hidden="true">${content}</svg>`;
}
