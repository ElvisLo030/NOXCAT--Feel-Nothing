import { describe, expect, it } from 'vitest';

import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';
import { presentResultScreen } from '../src/app/resultScreen';

describe('presentResultScreen', () => {
  it('keeps the compiled victory line on a win', () => {
    expect(presentResultScreen({
      won: true,
      lives: 2,
      resultLine: FALLBACK_BOSS.resultLine,
    })).toEqual({
      kind: 'won',
      modifier: 'won',
      eyebrow: 'ROUND COMPLETE',
      title: 'BOSS DEFEATED',
      line: FALLBACK_BOSS.resultLine,
    });
  });

  it('does not show the victory punchline after a death', () => {
    const presented = presentResultScreen({
      won: false,
      lives: 0,
      resultLine: FALLBACK_BOSS.resultLine,
    });
    expect(presented).toEqual({
      kind: 'overloaded',
      modifier: 'lost',
      eyebrow: 'ROUND FAILED',
      title: 'NOXCAT OVERLOADED',
      line: '煩惱把果凍貓壓垮了，再玩一次',
    });
    expect(presented.line).not.toBe(FALLBACK_BOSS.resultLine);
  });

  it('uses a timeout-specific line when the boss escapes', () => {
    const presented = presentResultScreen({
      won: false,
      lives: 3,
      resultLine: FALLBACK_BOSS.resultLine,
    });
    expect(presented).toEqual({
      kind: 'escaped',
      modifier: 'lost',
      eyebrow: 'TIME UP',
      title: 'BOSS ESCAPED',
      line: '時間到了，Boss 溜走了。',
    });
    expect(presented.line).not.toBe(FALLBACK_BOSS.resultLine);
  });
});
