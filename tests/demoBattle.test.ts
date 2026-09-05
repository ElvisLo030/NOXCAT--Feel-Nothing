import { describe, expect, it } from 'vitest';
import { BossDNASchema, PatternIdSchema, type PatternId } from '../src/ai/bossSchema';
import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';
import {
  ALL_ATTACK_DEMO_SEQUENCE,
  createAllAttackDemoSequence,
  demoPatternOrder,
  shouldUseAllAttackDemo,
} from '../src/game/demoBattle';
import { AttackDirector, type AttackDirectorHooks } from '../src/game/systems/AttackDirector';
import type { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { SeededRng } from '../src/utils/rng';

describe('all-attack development showcase', () => {
  it('contains every implemented pattern exactly once in deterministic order', () => {
    const patterns = demoPatternOrder();

    expect(patterns).toEqual([
      'paper_rain',
      'top_downpour',
      'comment_crossfire',
      'pulse_barrage',
      'alternating_zipper',
      'closing_walls',
      'revision_homing',
      'returnable_burst',
      'deadline_beam',
    ]);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(new Set(patterns)).toEqual(new Set(PatternIdSchema.options));
  });

  it('returns isolated steps so a battle cannot mutate the permanent showcase', () => {
    const first = createAllAttackDemoSequence();
    const second = createAllAttackDemoSequence();

    expect(first).toEqual(ALL_ATTACK_DEMO_SEQUENCE);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });

  it('uses all attacks for local fallback development, with explicit overrides', () => {
    expect(shouldUseAllAttackDemo('fallback', true, null)).toBe(true);
    expect(shouldUseAllAttackDemo('ai', true, null)).toBe(false);
    expect(shouldUseAllAttackDemo('ai', true, 'all')).toBe(true);
    expect(shouldUseAllAttackDemo('fallback', true, 'off')).toBe(false);
    expect(shouldUseAllAttackDemo('fallback', false, 'all')).toBe(false);
  });

  it('does not weaken the production BossDNA three-attack contract', () => {
    expect(BossDNASchema.safeParse(FALLBACK_BOSS).success).toBe(true);
    expect(BossDNASchema.safeParse({
      ...FALLBACK_BOSS,
      attacks: createAllAttackDemoSequence(),
    }).success).toBe(false);
  });

  it('lets AttackDirector visit all nine steps before wrapping', () => {
    const visited: string[] = [];
    const director = new AttackDirector(
      { attacks: createAllAttackDemoSequence() },
      new SeededRng(FALLBACK_BOSS.seed),
      {} as ProjectileSystem,
      {
        onPatternChanged: (pattern: PatternId) => visited.push(pattern),
      } as unknown as AttackDirectorHooks,
    );

    director.start();
    for (let index = 1; index < ALL_ATTACK_DEMO_SEQUENCE.length; index += 1) {
      director.pause();
      director.resume(true);
    }
    expect(visited).toEqual(demoPatternOrder());

    director.pause();
    director.resume(true);
    expect(visited.at(-1)).toBe('paper_rain');
  });
});
