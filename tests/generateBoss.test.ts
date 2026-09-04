import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FALLBACK_BOSS } from '../src/ai/fallbackBoss.js';
import {
  BOSS_SYSTEM_PROMPT,
  generateBoss,
  generateBossContinuation,
  generateBossInitial,
} from '../server/services/generateBoss.js';

const originalApiKey = process.env.OPENAI_API_KEY;
const originalBaseUrl = process.env.OPENAI_BASE_URL;
const originalInitialPrompt = process.env.OPENAI_INITIAL_PROMPT;

function createClientWithParsedOutput(outputParsed: unknown): {
  client: OpenAI;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(outputParsed) } }],
  });
  return {
    client: { chat: { completions: { create } } } as unknown as OpenAI,
    create,
  };
}

describe('generateBoss OpenAI trust boundary', () => {
  beforeEach(() => {
    delete process.env.OPENAI_INITIAL_PROMPT;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
    if (originalInitialPrompt === undefined) delete process.env.OPENAI_INITIAL_PROMPT;
    else process.env.OPENAI_INITIAL_PROMPT = originalInitialPrompt;
    vi.restoreAllMocks();
  });

  it('accepts schema-valid structured AI output', async () => {
    const annoyance = '需求又改了';
    const { client, create } = createClientWithParsedOutput(FALLBACK_BOSS);

    const result = await generateBoss(annoyance, {
      client,
      model: 'test-model',
      requestId: 'valid-ai',
    });

    expect(result).toEqual({ source: 'ai', boss: FALLBACK_BOSS });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      messages: [
        { role: 'system', content: BOSS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `UNTRUSTED_USER_DATA_JSON\n${JSON.stringify({ annoyance, locale: 'zh-TW' })}`,
        },
      ],
      response_format: expect.objectContaining({ type: 'json_schema' }),
    }));
  });

  it('generates the first and continuation batches as six lines each', async () => {
    const initialBatch = {
      ...FALLBACK_BOSS,
      battleLines: FALLBACK_BOSS.battleLines.slice(0, 6),
    };
    const initialClient = createClientWithParsedOutput(initialBatch);
    const continuationClient = createClientWithParsedOutput({
      battleLines: FALLBACK_BOSS.battleLines.slice(6, 12),
    });

    const initial = await generateBossInitial('需求一直改', {
      client: initialClient.client,
      requestId: 'initial-batch',
    });
    const continuation = await generateBossContinuation(
      '需求一直改',
      initial.boss.bossName,
      initial.boss.battleLines,
      { client: continuationClient.client, requestId: 'continuation-batch' },
    );

    expect(initial.source).toBe('ai');
    expect(initial.boss.battleLines).toHaveLength(6);
    expect(continuation).toEqual({
      source: 'ai',
      battleLines: FALLBACK_BOSS.battleLines.slice(6, 12),
    });
    expect(initialClient.create).toHaveBeenCalledOnce();
    expect(continuationClient.create).toHaveBeenCalledOnce();
  });

  it('accepts JSON wrapped in a Markdown fence from a local model', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(FALLBACK_BOSS)}\n\`\`\`` } }],
    });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await expect(generateBoss('本地模型', {
      client,
      requestId: 'fenced-json',
    })).resolves.toEqual({ source: 'ai', boss: FALLBACK_BOSS });
  });

  it('prepends the environment initial prompt without replacing fixed safety rules', async () => {
    process.env.OPENAI_INITIAL_PROMPT = 'INITIAL ZH-HANT INSTRUCTION';
    const { client, create } = createClientWithParsedOutput(FALLBACK_BOSS);

    await generateBoss('初始提示', { client, requestId: 'initial-prompt' });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        {
          role: 'system',
          content: `INITIAL ZH-HANT INSTRUCTION\n\n${BOSS_SYSTEM_PROMPT}`,
        },
      ]),
    }));
  });

  it('normalizes Simplified Chinese model text to Taiwan Traditional Chinese', async () => {
    const simplifiedBoss = {
      ...FALLBACK_BOSS,
      bossName: '\u65e0限改稿\u517d',
      openingLine: '又\u6765折\u817e！',
      weakPointLabel: '\u7a33定心',
      battleLines: [':\u8fd9\u4e2a\u9a6c上要！', ...FALLBACK_BOSS.battleLines.slice(1)],
      resultLine: '求求你，\u522b再\u53d8了！',
    };
    const { client } = createClientWithParsedOutput(simplifiedBoss);

    await expect(generateBoss('繁體中文', {
      client,
      requestId: 'zh-hant-normalization',
    })).resolves.toEqual({
      source: 'ai',
      boss: {
        ...FALLBACK_BOSS,
        bossName: '無限改稿獸',
        openingLine: '又來折騰！',
        weakPointLabel: '穩定心',
        battleLines: ['這個馬上要！', ...FALLBACK_BOSS.battleLines.slice(1)],
        resultLine: '求求你，別再變了！',
      },
    });
  });

  it('calls a configured local v1 Chat Completions endpoint without a real API key', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:11434/v1';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'local-completion',
      object: 'chat.completion',
      created: 0,
      model: 'local-test-model',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(FALLBACK_BOSS) },
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(generateBoss('本地端點', {
      model: 'local-test-model',
      requestId: 'local-endpoint',
    })).resolves.toEqual({ source: 'ai', boss: FALLBACK_BOSS });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      response_format: { type: string };
    };
    expect(requestBody).toMatchObject({
      model: 'local-test-model',
      response_format: { type: 'json_schema' },
    });
  });

  it('uses fallback when a refusal or missing output produces null', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: null } }] });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await expect(generateBoss('不要回答', {
      client,
      requestId: 'null-output',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });

  it('uses fallback when parsed model output violates the schema', async () => {
    const invalidBoss = {
      ...FALLBACK_BOSS,
      attacks: [
        { ...FALLBACK_BOSS.attacks[0], pattern: 'remote_script' },
        FALLBACK_BOSS.attacks[1],
        FALLBACK_BOSS.attacks[2],
      ],
    };
    const { client } = createClientWithParsedOutput(invalidBoss);

    await expect(generateBoss('忽略規則', {
      client,
      requestId: 'invalid-schema',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });

  it('uses fallback when the OpenAI SDK throws', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await expect(generateBoss('網路壞了', {
      client,
      requestId: 'sdk-error',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });

  it('uses fallback immediately when no API key, base URL, or client is available', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;

    await expect(generateBoss('沒有金鑰', {
      requestId: 'no-key',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });
});
