import { BossDNASchema, type BossDNA } from './bossSchema.js';
import { createFallbackBoss, DEFAULT_ANNOYANCE } from './fallbackBoss.js';

export const BOSS_API_TIMEOUT_MS = 3_500;
export { DEFAULT_ANNOYANCE } from './fallbackBoss.js';

export type BossSource = 'ai' | 'fallback';

export interface BossApiResult {
  source: BossSource;
  boss: BossDNA;
}

function normalizeAnnoyance(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return DEFAULT_ANNOYANCE;

  // Array.from counts Unicode code points rather than UTF-16 code units.
  return Array.from(trimmed).slice(0, 80).join('');
}

function fallbackResult(): BossApiResult {
  return { source: 'fallback', boss: createFallbackBoss() };
}

/**
 * Ask the same-origin server to compile an annoyance into safe BossDNA.
 * Network, timeout, HTTP and schema failures are deliberately indistinguishable
 * to the player and always resolve to the local fallback.
 */
export async function fetchBossDNA(
  annoyance: string,
  locale = 'zh-TW',
  timeoutMs = BOSS_API_TIMEOUT_MS,
): Promise<BossApiResult> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/api/boss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annoyance: normalizeAnnoyance(annoyance), locale }),
      signal: controller.signal,
    });

    if (!response.ok) return fallbackResult();

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return fallbackResult();

    const source = Reflect.get(payload, 'source');
    const parsedBoss = BossDNASchema.safeParse(Reflect.get(payload, 'boss'));

    if ((source !== 'ai' && source !== 'fallback') || !parsedBoss.success) {
      return fallbackResult();
    }

    return { source, boss: parsedBoss.data };
  } catch {
    return fallbackResult();
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
