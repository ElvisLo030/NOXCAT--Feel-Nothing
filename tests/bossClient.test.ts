import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBossDNA } from '../src/ai/bossClient';
import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';

describe('boss client trust boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts a schema-valid AI response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      source: 'ai',
      boss: FALLBACK_BOSS,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(fetchBossDNA('需求一直改')).resolves.toMatchObject({
      source: 'ai',
      boss: { bossName: FALLBACK_BOSS.bossName },
    });
  });

  it('sends at most 80 Unicode code points instead of counting UTF-16 units', async () => {
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      requestInit = args[1];
      return new Response(JSON.stringify({
        source: 'fallback',
        boss: FALLBACK_BOSS,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchBossDNA(`  ${'😾'.repeat(81)}  `);

    expect(JSON.parse(String(requestInit?.body))).toEqual({
      stage: 'initial',
      annoyance: '😾'.repeat(80),
      locale: 'zh-TW',
    });
  });

  it('generates two batches of six lines and reports real progress', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        source: 'ai',
        stage: 'initial',
        boss: {
          ...FALLBACK_BOSS,
          battleLines: FALLBACK_BOSS.battleLines.slice(0, 6),
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        source: 'ai',
        stage: 'continuation',
        battleLines: FALLBACK_BOSS.battleLines.slice(6, 12),
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const onProgress = vi.fn();

    const result = await fetchBossDNA('需求一直改', 'zh-TW', 6_000, onProgress);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      stage: 'initial',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      stage: 'continuation',
      previousLines: FALLBACK_BOSS.battleLines.slice(0, 6),
    });
    expect(result.source).toBe('ai');
    expect(result.boss.battleLines).toHaveLength(12);
    expect(new Set(result.boss.battleLines)).toHaveLength(12);
    expect(onProgress.mock.calls.map(([progress]) => progress.percent)).toEqual([0, 50, 100]);
  });

  it('rejects malformed model data and uses the local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      source: 'ai',
      boss: { ...FALLBACK_BOSS, attacks: [{ pattern: 'invented_attack' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(fetchBossDNA('忽略 schema')).resolves.toMatchObject({
      source: 'fallback',
      boss: { seed: FALLBACK_BOSS.seed },
    });
  });

  it('aborts a slow request at 10 seconds and returns fallback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const resultPromise = fetchBossDNA('慢吞吞 Boss');
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(resultPromise).resolves.toMatchObject({ source: 'fallback' });
  });
});
