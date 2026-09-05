import {
  BossContinuationBatchSchema,
  BossDNASchema,
  BossInitialBatchSchema,
  type BossDNA,
  type BossInitialBatch,
} from './bossSchema.js';
import { createFallbackBoss, DEFAULT_ANNOYANCE } from './fallbackBoss.js';

export const BOSS_API_TIMEOUT_MS = 10_000;
export { DEFAULT_ANNOYANCE } from './fallbackBoss.js';

export type BossSource = 'ai' | 'fallback';

export interface BossApiResult {
  source: BossSource;
  boss: BossDNA;
}

export interface BossCompileProgress {
  completedBatches: 0 | 1 | 2;
  percent: 0 | 50 | 100;
  message: string;
}

export type BossCompileProgressHandler = (progress: BossCompileProgress) => void;

const RESERVE_BATTLE_LINES = [
  '備用碎念也已經排進時程了。',
  '你以為第二批會比較客氣嗎？',
  '這句沒有重複，麻煩還是有。',
  '進度往前，問題正在後退。',
  '連備案都比這個麻煩可靠。',
  '最後一句先到，最後一版還沒。',
] as const;

function normalizeAnnoyance(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return DEFAULT_ANNOYANCE;
  return Array.from(trimmed).slice(0, 80).join('');
}

function fallbackResult(): BossApiResult {
  return { source: 'fallback', boss: createFallbackBoss() };
}

function getSource(payload: object): BossSource | null {
  const source = Reflect.get(payload, 'source');
  return source === 'ai' || source === 'fallback' ? source : null;
}

function buildFallbackContinuation(previousLines: readonly string[]): string[] {
  const previous = new Set(previousLines);
  return [...createFallbackBoss().battleLines, ...RESERVE_BATTLE_LINES]
    .filter((line) => !previous.has(line))
    .slice(0, 6);
}

async function postBossStage(body: object, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/api/boss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function assembleBoss(
  initial: BossInitialBatch,
  continuation: readonly string[],
): BossDNA | null {
  const parsed = BossDNASchema.safeParse({
    ...initial,
    battleLines: [...initial.battleLines, ...continuation],
  });
  if (!parsed.success || new Set(parsed.data.battleLines).size !== 12) return null;
  return parsed.data;
}

/** Compile BossDNA as two real batches of six AI battle lines. */
export async function fetchBossDNA(
  annoyance: string,
  locale = 'zh-TW',
  timeoutMs = BOSS_API_TIMEOUT_MS,
  onProgress?: BossCompileProgressHandler,
): Promise<BossApiResult> {
  const normalizedAnnoyance = normalizeAnnoyance(annoyance);
  onProgress?.({ completedBatches: 0, percent: 0, message: '正在生成第一批 6 句對話…' });

  const initialPayload = await postBossStage({
    stage: 'initial',
    annoyance: normalizedAnnoyance,
    locale,
  }, timeoutMs);

  if (typeof initialPayload !== 'object' || initialPayload === null) {
    onProgress?.({ completedBatches: 2, percent: 100, message: '已切換離線備用 BOSS' });
    return fallbackResult();
  }

  const initialSource = getSource(initialPayload);
  const legacyBoss = BossDNASchema.safeParse(Reflect.get(initialPayload, 'boss'));
  if (initialSource && legacyBoss.success) {
    onProgress?.({ completedBatches: 2, percent: 100, message: '12 句對話生成完成' });
    return { source: initialSource, boss: legacyBoss.data };
  }

  const initialBoss = BossInitialBatchSchema.safeParse(Reflect.get(initialPayload, 'boss'));
  if (!initialSource || !initialBoss.success) {
    onProgress?.({ completedBatches: 2, percent: 100, message: '已切換離線備用 BOSS' });
    return fallbackResult();
  }

  onProgress?.({
    completedBatches: 1,
    percent: 50,
    message: '第一批完成，正在生成第二批 6 句…',
  });

  const continuationPayload = await postBossStage({
    stage: 'continuation',
    annoyance: normalizedAnnoyance,
    bossName: initialBoss.data.bossName,
    previousLines: initialBoss.data.battleLines,
    locale,
  }, timeoutMs);

  let continuationSource: BossSource = 'fallback';
  let continuation = buildFallbackContinuation(initialBoss.data.battleLines);
  if (typeof continuationPayload === 'object' && continuationPayload !== null) {
    const parsedSource = getSource(continuationPayload);
    const parsedBatch = BossContinuationBatchSchema.safeParse({
      battleLines: Reflect.get(continuationPayload, 'battleLines'),
    });
    if (parsedSource && parsedBatch.success) {
      continuationSource = parsedSource;
      continuation = parsedBatch.data.battleLines;
    }
  }

  let boss = assembleBoss(initialBoss.data, continuation);
  if (!boss) {
    continuationSource = 'fallback';
    boss = assembleBoss(
      initialBoss.data,
      buildFallbackContinuation(initialBoss.data.battleLines),
    );
  }

  onProgress?.({ completedBatches: 2, percent: 100, message: '12 句對話生成完成' });
  if (!boss) return fallbackResult();

  return {
    source: initialSource === 'ai' && continuationSource === 'ai' ? 'ai' : 'fallback',
    boss,
  };
}
