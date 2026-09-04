import type { BossDNA } from './bossSchema.js';

export const DEFAULT_ANNOYANCE = '需求一直改';

export const FALLBACK_BOSS = {
  schemaVersion: 1,
  seed: 270_027,
  bossName: 'FINAL_v27 無限改稿獸',
  openingLine: '這次真的只改一點點。',
  weakPointLabel: '最終版',
  theme: 'office',
  attacks: [
    { pattern: 'paper_rain', intensity: 1, durationMs: 6_500 },
    { pattern: 'returnable_burst', intensity: 2, durationMs: 7_000 },
    { pattern: 'deadline_beam', intensity: 3, durationMs: 8_000 },
  ],
  battleLines: [
    '這版先叫最終版。',
    '我只再改一個地方。',
    '上一版其實比較好。',
    '這個能今天交嗎？',
    '字再大一點點。',
    '等等，我有新想法。',
    '剛剛那版先不要刪。',
    '顏色好像還差一點。',
    '可以再給三個版本嗎？',
    '這真的只是微調。',
    '先照我的感覺改。',
    '最終版再加一個需求。',
  ],
  resultLine: '你終於交出了真正的最終版。',
} as const satisfies BossDNA;

/** Return an isolated copy so session code can never mutate the permanent fallback. */
export function createFallbackBoss(): BossDNA {
  return {
    ...FALLBACK_BOSS,
    attacks: FALLBACK_BOSS.attacks.map((attack) => ({ ...attack })),
    battleLines: [...FALLBACK_BOSS.battleLines],
  };
}
