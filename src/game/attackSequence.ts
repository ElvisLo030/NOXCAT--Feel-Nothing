import { PatternIdSchema, type AttackStep, type PatternId } from '../ai/bossSchema';
import type { SeededRng } from '../utils/rng';

// 未被 BossDNA 指定的招式沿用原九招展示關卡的平衡數值。
const DEFAULT_ATTACK_SETTINGS = {
  paper_rain: { intensity: 1, durationMs: 5_400 },
  top_downpour: { intensity: 2, durationMs: 5_400 },
  comment_crossfire: { intensity: 1, durationMs: 5_400 },
  pulse_barrage: { intensity: 2, durationMs: 5_800 },
  alternating_zipper: { intensity: 2, durationMs: 5_800 },
  closing_walls: { intensity: 2, durationMs: 5_800 },
  revision_homing: { intensity: 2, durationMs: 5_400 },
  returnable_burst: { intensity: 2, durationMs: 6_000 },
  deadline_beam: { intensity: 3, durationMs: 5_200 },
} as const satisfies Record<PatternId, Omit<AttackStep, 'pattern'>>;

export function createAttackPool(bossAttacks: readonly AttackStep[]): AttackStep[] {
  return PatternIdSchema.options.map((pattern) => {
    // AI 重複指定同一招時採第一筆設定，招池仍只保留一份。
    const configured = bossAttacks.find((attack) => attack.pattern === pattern);
    return configured ? { ...configured } : { pattern, ...DEFAULT_ATTACK_SETTINGS[pattern] };
  });
}

export function shuffleAttackRound(
  pool: readonly AttackStep[],
  rng: SeededRng,
  previousPattern?: PatternId,
): AttackStep[] {
  const round = rng.shuffled(pool);
  if (round.length > 1 && round[0]!.pattern === previousPattern) {
    const swapIndex = rng.int(1, round.length - 1);
    [round[0], round[swapIndex]] = [round[swapIndex]!, round[0]!];
  }
  return round;
}
