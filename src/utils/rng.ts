/**
 * Stateful Mulberry32 generator. All combat layout randomness should flow
 * through an instance of this class rather than Math.random().
 */
export class SeededRng {
  readonly seed: number;

  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) {
      throw new TypeError('seed must be a finite number');
    }

    this.seed = Math.trunc(seed) >>> 0;
    this.state = this.seed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  range(min: number, max: number): number {
    if (min > max) {
      throw new RangeError(`range minimum (${min}) cannot exceed maximum (${max})`);
    }

    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new TypeError('integer range bounds must be integers');
    }
    if (minInclusive > maxInclusive) {
      throw new RangeError(
        `integer range minimum (${minInclusive}) cannot exceed maximum (${maxInclusive})`,
      );
    }

    return Math.floor(this.range(minInclusive, maxInclusive + 1));
  }

  chance(probability: number): boolean {
    if (probability < 0 || probability > 1) {
      throw new RangeError('probability must be between 0 and 1');
    }

    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError('cannot pick from an empty collection');
    }

    return values[this.int(0, values.length - 1)] as T;
  }

  shuffled<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
    }
    return result;
  }
}

export function mulberry32(seed: number): () => number {
  const rng = new SeededRng(seed);
  return () => rng.next();
}
