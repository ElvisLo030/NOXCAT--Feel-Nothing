import { describe, expect, it, vi } from 'vitest';

import {
  applyOllamaThinkDefault,
  createOllamaFetch,
  OllamaClient,
  ollamaChat,
  ollamaGenerate,
} from '../server/services/ollamaClient.js';

describe('Ollama client / wrapper layer', () => {
  describe('applyOllamaThinkDefault', () => {
    it('defaults think to false when not provided', () => {
      const body = {
        model: 'gemma4:e2b',
        messages: [{ role: 'user', content: 'hello' }],
      };
      const result = applyOllamaThinkDefault(body);

      expect(result.think).toBe(false);
      expect(result.model).toBe('gemma4:e2b');
      expect(result.messages).toEqual([{ role: 'user', content: 'hello' }]);
    });

    it('preserves caller-specified think: true', () => {
      const body = {
        model: 'gemma4:e2b',
        prompt: 'test prompt',
        think: true,
      };
      const result = applyOllamaThinkDefault(body);

      expect(result.think).toBe(true);
      expect(result.prompt).toBe('test prompt');
    });

    it('preserves caller-specified think: false', () => {
      const body = {
        model: 'gemma4:e2b',
        prompt: 'test prompt',
        think: false,
      };
      const result = applyOllamaThinkDefault(body);

      expect(result.think).toBe(false);
    });

    it('keeps think at top-level and does not place it inside options', () => {
      const body = {
        model: 'gemma4:e2b',
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0.7, num_predict: 128 },
      };
      const result = applyOllamaThinkDefault(body);

      expect(result.think).toBe(false);
      expect(result.options).toEqual({ temperature: 0.7, num_predict: 128 });
      expect((result.options as Record<string, unknown>).think).toBeUndefined();
    });

    it('preserves all standard fields: model, messages, prompt, stream, options', () => {
      const body = {
        model: 'gemma4:e2b',
        messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }],
        prompt: 'standalone prompt',
        stream: false,
        options: { seed: 42 },
        format: 'json',
      };
      const result = applyOllamaThinkDefault(body);

      expect(result).toEqual({
        model: 'gemma4:e2b',
        messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }],
        prompt: 'standalone prompt',
        stream: false,
        options: { seed: 42 },
        format: 'json',
        think: false,
      });
    });
  });

  describe('ollamaChat HTTP calls', () => {
    it('sends POST to /api/chat with top-level think: false by default', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await ollamaChat(
        {
          model: 'gemma4:e2b',
          messages: [{ role: 'user', content: '打敗改稿獸' }],
          stream: false,
        },
        { baseURL: 'http://127.0.0.1:11434', fetch: fetchMock },
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:11434/api/chat');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(false);
      expect(body.model).toBe('gemma4:e2b');
      expect(body.stream).toBe(false);
      expect(body.messages).toEqual([{ role: 'user', content: '打敗改稿獸' }]);
    });

    it('preserves explicit think: true on /api/chat', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await ollamaChat(
        {
          model: 'gemma4:e2b',
          messages: [{ role: 'user', content: '思考一下' }],
          think: true,
        },
        { baseURL: 'http://127.0.0.1:11434', fetch: fetchMock },
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(true);
    });
  });

  describe('ollamaGenerate HTTP calls', () => {
    it('sends POST to /api/generate with top-level think: false by default', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ response: 'generated text', done: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await ollamaGenerate(
        {
          model: 'gemma4:e2b',
          prompt: '生成 boss 名稱',
          stream: false,
          options: { temperature: 0.2 },
        },
        { baseURL: 'http://127.0.0.1:11434', fetch: fetchMock },
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:11434/api/generate');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(false);
      expect(body.model).toBe('gemma4:e2b');
      expect(body.prompt).toBe('生成 boss 名稱');
      expect(body.stream).toBe(false);
      expect(body.options).toEqual({ temperature: 0.2 });
      expect((body.options as Record<string, unknown>).think).toBeUndefined();
    });

    it('preserves explicit think: true on /api/generate', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ response: 'thinking text', done: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await ollamaGenerate(
        {
          model: 'gemma4:e2b',
          prompt: '深入推理',
          think: true,
        },
        { baseURL: 'http://127.0.0.1:11434', fetch: fetchMock },
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(true);
    });
  });

  describe('OllamaClient class instance', () => {
    it('supports client.chat() and client.generate() with think: false by default', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ done: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const client = new OllamaClient({
        baseURL: 'http://127.0.0.1:11434',
        fetch: fetchMock,
      });

      await client.chat({
        model: 'gemma4:e2b',
        messages: [{ role: 'user', content: 'test' }],
      });
      const [, chatInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const chatBody = JSON.parse(chatInit.body as string) as Record<string, unknown>;
      expect(chatBody.think).toBe(false);

      await client.generate({
        model: 'gemma4:e2b',
        prompt: 'test prompt',
      });
      const [, genInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const genBody = JSON.parse(genInit.body as string) as Record<string, unknown>;
      expect(genBody.think).toBe(false);
    });
  });

  describe('createOllamaFetch wrapper', () => {
    it('intercepts /api/chat and injects think: false into body string', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const wrappedFetch = createOllamaFetch(baseFetch);

      await wrappedFetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        body: JSON.stringify({ model: 'gemma4:e2b', messages: [] }),
      });

      expect(baseFetch).toHaveBeenCalledOnce();
      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(false);
    });

    it('intercepts /api/generate and injects think: false into body string', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const wrappedFetch = createOllamaFetch(baseFetch);

      await wrappedFetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        body: JSON.stringify({ model: 'gemma4:e2b', prompt: 'test' }),
      });

      expect(baseFetch).toHaveBeenCalledOnce();
      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(false);
    });

    it('retains caller-specified think: true in createOllamaFetch', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const wrappedFetch = createOllamaFetch(baseFetch);

      await wrappedFetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        body: JSON.stringify({ model: 'gemma4:e2b', messages: [], think: true }),
      });

      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.think).toBe(true);
    });

    it('does not modify non-Ollama URLs', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const wrappedFetch = createOllamaFetch(baseFetch);

      const rawBody = JSON.stringify({ model: 'gpt-4o', messages: [] });
      await wrappedFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: rawBody,
      });

      const [, init] = baseFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBe(rawBody);
      const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(parsed.think).toBeUndefined();
    });
  });
});
