import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FALLBACK_BOSS } from '../src/ai/fallbackBoss.js';
import { BOSS_SYSTEM_PROMPT, generateBoss } from '../server/services/generateBoss.js';

const originalApiKey = process.env.OPENAI_API_KEY;

function createClientWithParsedOutput(outputParsed: unknown): {
  client: OpenAI;
  parse: ReturnType<typeof vi.fn>;
} {
  const parse = vi.fn().mockResolvedValue({ output_parsed: outputParsed });
  return {
    client: { responses: { parse } } as unknown as OpenAI,
    parse,
  };
}

describe('generateBoss OpenAI trust boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('accepts schema-valid structured AI output', async () => {
    const annoyance = '需求又改了';
    const { client, parse } = createClientWithParsedOutput(FALLBACK_BOSS);

    const result = await generateBoss(annoyance, {
      client,
      model: 'test-model',
      requestId: 'valid-ai',
    });

    expect(result).toEqual({ source: 'ai', boss: FALLBACK_BOSS });
    expect(parse).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      instructions: BOSS_SYSTEM_PROMPT,
      input: `UNTRUSTED_USER_DATA_JSON\n${JSON.stringify({ annoyance, locale: 'zh-TW' })}`,
      max_output_tokens: 500,
      reasoning: { effort: 'minimal' },
      store: false,
    }));
  });

  it('uses fallback when a refusal or missing output produces null', async () => {
    const { client } = createClientWithParsedOutput(null);

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
    const parse = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const client = { responses: { parse } } as unknown as OpenAI;

    await expect(generateBoss('網路壞了', {
      client,
      requestId: 'sdk-error',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });

  it('uses fallback immediately when no API key or client is available', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(generateBoss('沒有金鑰', {
      requestId: 'no-key',
    })).resolves.toEqual({ source: 'fallback', boss: FALLBACK_BOSS });
  });
});
