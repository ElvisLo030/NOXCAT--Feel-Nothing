/** Official NOXCAT brand palette for Phaser-rendered UI and effects. */
export const PALETTE = {
  green: 0x91d500,
  black: 0x101820,
  white: 0xf6f6f6,
  lightGray: 0xdad9d7,
  midGray: 0xb2b2b2,
} as const;

/** CSS-compatible equivalents for Phaser text styles. */
export const PALETTE_CSS = {
  green: '#91D500',
  black: '#101820',
  white: '#F6F6F6',
  lightGray: '#DAD9D7',
  midGray: '#B2B2B2',
} as const;

export const BOOST_PALETTE = {
  blue: 0x3aa8ff,
  cyan: 0x7af2ff,
  deep: 0x0e2a4a,
  spark: 0xe0f7ff,
} as const;

export const BOOST_PALETTE_CSS = {
  blue: '#3BA8FF',
  cyan: '#7AF2FF',
  deep: '#0E2A4A',
  spark: '#E0F7FF',
} as const;

/** 玩法訊號獨立於 IP 配色：紅色標示危險，綠色標示安全與反彈。 */
export const COMBAT_COLORS = { danger: 0xff5364, safe: PALETTE.green } as const;
export const COMBAT_CSS = { danger: '#FF5364', safe: PALETTE_CSS.green } as const;
