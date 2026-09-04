import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
}

/** Small in-memory limiter suitable for the single-process hackathon service. */
export function createRateLimitMiddleware(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const maxRequests = options.maxRequests ?? MAX_REQUESTS_PER_WINDOW;
  const now = options.now ?? Date.now;
  const clients = new Map<string, RateLimitEntry>();
  let requestsUntilSweep = 100;

  return (request: Request, response: Response, next: NextFunction): void => {
    const currentTime = now();
    const clientKey = request.ip || request.socket.remoteAddress || 'unknown';
    const existing = clients.get(clientKey);
    const entry =
      existing && existing.resetAt > currentTime
        ? existing
        : { count: 0, resetAt: currentTime + windowMs };

    entry.count += 1;
    clients.set(clientKey, entry);

    response.setHeader('RateLimit-Limit', String(maxRequests));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, maxRequests - entry.count)),
    );
    response.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1_000)));

    if (entry.count > maxRequests) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000))),
      );
      response.status(429).json({ error: 'rate_limited' });
      return;
    }

    requestsUntilSweep -= 1;
    if (requestsUntilSweep <= 0) {
      requestsUntilSweep = 100;
      for (const [key, value] of clients) {
        if (value.resetAt <= currentTime) clients.delete(key);
      }
    }

    next();
  };
}
