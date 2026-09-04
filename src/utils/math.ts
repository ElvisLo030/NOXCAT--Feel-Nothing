export interface Vector2Like {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp minimum (${min}) cannot exceed maximum (${max})`);
  }

  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function inverseLerp(start: number, end: number, value: number): number {
  if (start === end) {
    return 0;
  }

  return clamp01((value - start) / (end - start));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = inverseLerp(edge0, edge1, value);
  return amount * amount * (3 - 2 * amount);
}

export function magnitude(vector: Vector2Like): number {
  return Math.hypot(vector.x, vector.y);
}

export function distanceSquared(a: Vector2Like, b: Vector2Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clampMagnitude<T extends Vector2Like>(vector: T, maxLength: number): Vector2Like {
  if (maxLength < 0) {
    throw new RangeError('maxLength must be non-negative');
  }

  const lengthSquared = vector.x * vector.x + vector.y * vector.y;
  const maxLengthSquared = maxLength * maxLength;
  if (lengthSquared <= maxLengthSquared || lengthSquared === 0) {
    return { x: vector.x, y: vector.y };
  }

  const scale = maxLength / Math.sqrt(lengthSquared);
  return { x: vector.x * scale, y: vector.y * scale };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('median requires at least one value');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] as number;
  }

  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
