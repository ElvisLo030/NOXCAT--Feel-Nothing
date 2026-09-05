import type { AttackStep, PatternId } from '../ai/bossSchema';

/**
 * The local showcase is deliberately separate from BossDNA. Remote and
 * fallback BossDNA payloads must keep their schema-mandated three attacks,
 * while a development battle can exercise every renderer/pattern in one run.
 */
export const ALL_ATTACK_DEMO_SEQUENCE = [
  { pattern: 'paper_rain', intensity: 1, durationMs: 5_400 },
  { pattern: 'top_downpour', intensity: 2, durationMs: 5_400 },
  { pattern: 'comment_crossfire', intensity: 1, durationMs: 5_400 },
  { pattern: 'pulse_barrage', intensity: 2, durationMs: 5_800 },
  { pattern: 'alternating_zipper', intensity: 2, durationMs: 5_800 },
  { pattern: 'closing_walls', intensity: 2, durationMs: 5_800 },
  { pattern: 'revision_homing', intensity: 2, durationMs: 5_400 },
  { pattern: 'returnable_burst', intensity: 2, durationMs: 6_000 },
  { pattern: 'deadline_beam', intensity: 3, durationMs: 5_200 },
] as const satisfies readonly AttackStep[];

export function createAllAttackDemoSequence(): AttackStep[] {
  return ALL_ATTACK_DEMO_SEQUENCE.map((step) => ({ ...step }));
}

export function shouldUseAllAttackDemo(
  source: 'ai' | 'fallback',
  isDevelopment: boolean,
  requestedMode: string | null,
): boolean {
  if (!isDevelopment) return false;
  if (requestedMode === 'all') return true;
  if (requestedMode === 'off') return false;
  return source === 'fallback';
}

export function demoPatternOrder(): PatternId[] {
  return ALL_ATTACK_DEMO_SEQUENCE.map(({ pattern }) => pattern);
}
