import { describe, expect, it } from 'vitest';

import { BossDNASchema } from '../src/ai/bossSchema.js';
import { FALLBACK_BOSS } from '../src/ai/fallbackBoss.js';

describe('BossDNASchema', () => {
  it('accepts the permanent fallback boss', () => {
    expect(BossDNASchema.parse(FALLBACK_BOSS)).toEqual(FALLBACK_BOSS);
  });

  it('rejects an unknown attack pattern', () => {
    const candidate = {
      ...FALLBACK_BOSS,
      attacks: [
        { ...FALLBACK_BOSS.attacks[0], pattern: 'execute_user_code' },
        FALLBACK_BOSS.attacks[1],
        FALLBACK_BOSS.attacks[2],
      ],
    };

    expect(BossDNASchema.safeParse(candidate).success).toBe(false);
  });

  it('rejects text beyond the schema limit', () => {
    const candidate = { ...FALLBACK_BOSS, bossName: '太'.repeat(25) };
    expect(BossDNASchema.safeParse(candidate).success).toBe(false);
  });

  it.each([0, 4, 1.5])('rejects invalid intensity %s', (intensity) => {
    const candidate = {
      ...FALLBACK_BOSS,
      attacks: [
        { ...FALLBACK_BOSS.attacks[0], intensity },
        FALLBACK_BOSS.attacks[1],
        FALLBACK_BOSS.attacks[2],
      ],
    };

    expect(BossDNASchema.safeParse(candidate).success).toBe(false);
  });
});
