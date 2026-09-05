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
    { pattern: 'comment_crossfire', intensity: 3, durationMs: 7_000 },
  ],
  resultLine: '你終於交出了真正的最終版。',
} as const satisfies BossDNA;

/** Return an isolated copy so session code can never mutate the permanent fallback. */
export function createFallbackBoss(): BossDNA {
  return {
    ...FALLBACK_BOSS,
    attacks: FALLBACK_BOSS.attacks.map((attack) => ({ ...attack })),
  };
}
