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
      annoyance: '😾'.repeat(80),
      locale: 'zh-TW',
    });
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

  it('aborts a slow request at 3.5 seconds and returns fallback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const resultPromise = fetchBossDNA('慢吞吞 Boss');
    await vi.advanceTimersByTimeAsync(3_501);
    await expect(resultPromise).resolves.toMatchObject({ source: 'fallback' });
  });
});
