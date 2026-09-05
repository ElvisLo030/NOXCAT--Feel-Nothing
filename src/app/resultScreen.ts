export type ResultKind = 'won' | 'overloaded' | 'escaped';

export interface ResultPresentationInput {
  readonly won: boolean;
  readonly lives: number;
  readonly resultLine: string;
}

export interface ResultPresentation {
  readonly kind: ResultKind;
  readonly modifier: 'won' | 'lost';
  readonly eyebrow: string;
  readonly title: string;
  readonly line: string;
}

export function resultKind(won: boolean, lives: number): ResultKind {
  if (won) return 'won';
  return lives === 0 ? 'overloaded' : 'escaped';
}

/** Boss resultLine is a victory punchline; losses get dedicated fail copy. */
export function presentResultScreen(input: ResultPresentationInput): ResultPresentation {
  const kind = resultKind(input.won, input.lives);
  if (kind === 'won') {
    return {
      kind,
      modifier: 'won',
      eyebrow: 'ROUND COMPLETE',
      title: 'BOSS DEFEATED',
      line: input.resultLine,
    };
  }
  if (kind === 'overloaded') {
    return {
      kind,
      modifier: 'lost',
      eyebrow: 'ROUND FAILED',
      title: 'NOXCAT OVERLOADED',
      line: '煩惱把果凍貓壓垮了，再玩一次',
    };
  }
  return {
    kind,
    modifier: 'lost',
    eyebrow: 'TIME UP',
    title: 'BOSS ESCAPED',
    line: '時間到了，Boss 溜走了。',
  };
}
