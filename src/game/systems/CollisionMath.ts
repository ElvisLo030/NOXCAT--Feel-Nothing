export interface CollisionPoint {
  readonly x: number;
  readonly y: number;
}

export interface CollisionCircle extends CollisionPoint {
  readonly radius: number;
}

function pointToSegmentDistance(
  point: CollisionPoint,
  start: CollisionPoint,
  end: CollisionPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/** True for either clockwise or counter-clockwise convex polygons. */
export function pointInConvexPolygon(
  point: CollisionPoint,
  polygon: readonly CollisionPoint[],
): boolean {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const cross = (end.x - start.x) * (point.y - start.y)
      - (end.y - start.y) * (point.x - start.x);
    if (Math.abs(cross) <= 1e-7) continue;
    const nextSign = Math.sign(cross);
    if (sign !== 0 && sign !== nextSign) return false;
    sign = nextSign;
  }
  return true;
}

/**
 * Signed visual separation between one circle and a projected card polygon.
 * Values <= 0 mean the two rendered silhouettes overlap.
 */
export function circlePolygonSeparation(
  circle: CollisionCircle,
  polygon: readonly CollisionPoint[],
): number {
  if (polygon.length < 2) return Number.POSITIVE_INFINITY;
  if (pointInConvexPolygon(circle, polygon)) return -Math.max(0, circle.radius);
  let edgeDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    edgeDistance = Math.min(
      edgeDistance,
      pointToSegmentDistance(circle, polygon[index]!, polygon[(index + 1) % polygon.length]!),
    );
  }
  return edgeDistance - Math.max(0, circle.radius);
}

/** Minimum separation from a compound NOXCAT silhouette to one card. */
export function compoundPolygonSeparation(
  circles: readonly CollisionCircle[],
  polygon: readonly CollisionPoint[],
): number {
  return circles.reduce(
    (minimum, circle) => Math.min(minimum, circlePolygonSeparation(circle, polygon)),
    Number.POSITIVE_INFINITY,
  );
}

function polygonBounds(polygon: readonly CollisionPoint[]): Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}> {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    if (point.x < left) left = point.x;
    if (point.x > right) right = point.x;
    if (point.y < top) top = point.y;
    if (point.y > bottom) bottom = point.y;
  }
  return { left, right, top, bottom };
}

function pointInPolygon(point: CollisionPoint, polygon: readonly CollisionPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    if (
      (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y) + currentPoint.x
    ) inside = !inside;
  }
  return inside;
}

function segmentIntersection(
  firstStart: CollisionPoint,
  firstEnd: CollisionPoint,
  secondStart: CollisionPoint,
  secondEnd: CollisionPoint,
): boolean {
  const cross = (a: CollisionPoint, b: CollisionPoint, c: CollisionPoint): number => (
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  );
  const firstSideA = cross(firstStart, firstEnd, secondStart);
  const firstSideB = cross(firstStart, firstEnd, secondEnd);
  const secondSideA = cross(secondStart, secondEnd, firstStart);
  const secondSideB = cross(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-7;
  const onSegment = (start: CollisionPoint, point: CollisionPoint, end: CollisionPoint): boolean => (
    point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon
  );
  if (Math.sign(firstSideA) !== Math.sign(firstSideB)
    && Math.sign(secondSideA) !== Math.sign(secondSideB)) return true;
  if (Math.abs(firstSideA) <= epsilon && onSegment(firstStart, secondStart, firstEnd)) return true;
  if (Math.abs(firstSideB) <= epsilon && onSegment(firstStart, secondEnd, firstEnd)) return true;
  if (Math.abs(secondSideA) <= epsilon && onSegment(secondStart, firstStart, secondEnd)) return true;
  return Math.abs(secondSideB) <= epsilon && onSegment(secondStart, firstEnd, secondEnd);
}

/**
 * Exact separation for arbitrary transformed polygons, with a cheap AABB
 * rejection when they are farther apart than gameplay can care about.
 */
export function polygonSeparation(
  first: readonly CollisionPoint[],
  second: readonly CollisionPoint[],
  maximumRelevantDistance = Number.POSITIVE_INFINITY,
): number {
  if (first.length < 3 || second.length < 3) return Number.POSITIVE_INFINITY;
  const firstBounds = polygonBounds(first);
  const secondBounds = polygonBounds(second);
  const gapX = Math.max(0, firstBounds.left - secondBounds.right, secondBounds.left - firstBounds.right);
  const gapY = Math.max(0, firstBounds.top - secondBounds.bottom, secondBounds.top - firstBounds.bottom);
  const boundsGap = Math.hypot(gapX, gapY);
  if (boundsGap > maximumRelevantDistance) return boundsGap;

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (segmentIntersection(
        firstStart,
        firstEnd,
        second[secondIndex]!,
        second[(secondIndex + 1) % second.length]!,
      )) return -1;
    }
  }
  if (pointInPolygon(first[0]!, second) || pointInPolygon(second[0]!, first)) return -1;

  let distance = Number.POSITIVE_INFINITY;
  for (const point of first) {
    for (let index = 0; index < second.length; index += 1) {
      distance = Math.min(distance, pointToSegmentDistance(
        point,
        second[index]!,
        second[(index + 1) % second.length]!,
      ));
    }
  }
  for (const point of second) {
    for (let index = 0; index < first.length; index += 1) {
      distance = Math.min(distance, pointToSegmentDistance(
        point,
        first[index]!,
        first[(index + 1) % first.length]!,
      ));
    }
  }
  return distance;
}

/**
 * Minimum separation reached by two linearly moving points in one simulation
 * step. Using relative motion makes fast drags and fast documents unable to
 * tunnel through each other when a phone delivers a 30 Hz frame.
 */
export function sweptPointDistance(
  firstStart: CollisionPoint,
  firstEnd: CollisionPoint,
  secondStart: CollisionPoint,
  secondEnd: CollisionPoint,
): number {
  const startX = firstStart.x - secondStart.x;
  const startY = firstStart.y - secondStart.y;
  const deltaX = (firstEnd.x - firstStart.x) - (secondEnd.x - secondStart.x);
  const deltaY = (firstEnd.y - firstStart.y) - (secondEnd.y - secondStart.y);
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const progress = lengthSquared <= Number.EPSILON
    ? 0
    : clamp(-(startX * deltaX + startY * deltaY) / lengthSquared, 0, 1);
  return Math.hypot(startX + deltaX * progress, startY + deltaY * progress);
}

/** Minimum one-dimensional distance reached while moving across one frame. */
export function sweptAxisDistance(start: number, end: number, target: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(target)) {
    return Number.POSITIVE_INFINITY;
  }
  if ((start <= target && end >= target) || (end <= target && start >= target)) return 0;
  return Math.min(Math.abs(start - target), Math.abs(end - target));
}

/**
 * Locates where a linearly moving point crossed a monotonically sampled
 * threshold. Projectile uses this to start its first dangerous sweep at the
 * exact near-plane entry rather than at the overshot end-of-frame sample.
 */
export function interpolateThresholdCrossing(
  start: CollisionPoint,
  end: CollisionPoint,
  startValue: number,
  endValue: number,
  threshold: number,
): CollisionPoint {
  const deltaValue = endValue - startValue;
  if (
    !Number.isFinite(startValue)
    || !Number.isFinite(endValue)
    || !Number.isFinite(threshold)
    || Math.abs(deltaValue) <= Number.EPSILON
  ) {
    return { x: end.x, y: end.y };
  }
  const progress = clamp((threshold - startValue) / deltaValue, 0, 1);
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
