import { describe, expect, it } from 'vitest';

import { SeededRng, mulberry32 } from '../src/utils/rng';

describe('seeded RNG', () => {
  it('produces the same sequence for the same seed', () => {
    const first = new SeededRng(270_027);
    const second = new SeededRng(270_027);

    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  it('produces distinct sequences for distinct seeds', () => {
    const first = new SeededRng(1);
    const second = new SeededRng(2);

    expect(Array.from({ length: 5 }, () => first.next())).not.toEqual(
      Array.from({ length: 5 }, () => second.next()),
    );
  });

  it('keeps values and integer picks inside their requested bounds', () => {
    const rng = new SeededRng(42);

    for (let index = 0; index < 100; index += 1) {
      expect(rng.next()).toBeGreaterThanOrEqual(0);
      expect(rng.next()).toBeLessThan(1);
      expect(rng.int(2, 4)).toBeGreaterThanOrEqual(2);
      expect(rng.int(2, 4)).toBeLessThanOrEqual(4);
    }
  });

  it('exposes a deterministic Mulberry32 function form', () => {
    const first = mulberry32(99);
    const second = mulberry32(99);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});
