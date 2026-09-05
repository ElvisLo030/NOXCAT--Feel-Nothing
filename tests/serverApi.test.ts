import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../server/index.js';
import { FALLBACK_BOSS } from '../src/ai/fallbackBoss.js';

interface RunningApi {
  baseUrl: string;
  server: Server;
}

const originalNodeEnv = process.env.NODE_ENV;
const originalApiKey = process.env.OPENAI_API_KEY;

async function startApi(): Promise<RunningApi> {
  const app = await createApp();
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    candidate.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error == null ? resolve() : reject(error)));
  });
}

async function postBoss(baseUrl: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/boss`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/boss acceptance boundary', () => {
  const runningServers: Server[] = [];

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.OPENAI_API_KEY;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await Promise.all(runningServers.splice(0).map(closeServer));
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  async function freshApi(): Promise<string> {
    const running = await startApi();
    runningServers.push(running.server);
    return running.baseUrl;
  }

  it('rejects a 3969-byte JSON body with 413', async () => {
    const baseUrl = await freshApi();
    const validJson = JSON.stringify({ annoyance: '', locale: 'zh-TW' });
    const body = validJson + ' '.repeat(3_969 - Buffer.byteLength(validJson));

    const response = await fetch(`${baseUrl}/api/boss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    expect(Buffer.byteLength(body)).toBe(3_969);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'payload_too_large' });
  });

  it('accepts a valid JSON body at the 3968-byte limit', async () => {
    const baseUrl = await freshApi();
    const validJson = JSON.stringify({ annoyance: '', locale: 'zh-TW' });
    const body = validJson + ' '.repeat(3_968 - Buffer.byteLength(validJson));

    const response = await fetch(`${baseUrl}/api/boss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    expect(Buffer.byteLength(body)).toBe(3_968);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source: 'fallback',
      boss: FALLBACK_BOSS,
    });
  });

  it('returns a generic 400 response for malformed JSON without exposing a stack', async () => {
    const response = await fetch(`${await freshApi()}/api/boss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"annoyance":',
    });

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'invalid_json' });
    expect(body).not.toMatch(/(?:stack|SyntaxError|node_modules)/i);
  });

  it('serves health and API 404 responses from the same hardened Express app', async () => {
    const baseUrl = await freshApi();
    const [health, missing] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/not-a-route`),
    ]);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });
    expect(health.headers.get('x-powered-by')).toBeNull();

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('rejects an annoyance containing 81 Unicode code points', async () => {
    const response = await postBoss(await freshApi(), {
      annoyance: '😾'.repeat(81),
      locale: 'zh-TW',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
  });

  it.each([
    ['an unknown field', { annoyance: '星期一', locale: 'zh-TW', execute: true }],
    ['an unsupported locale', { annoyance: '星期一', locale: 'en-US' }],
  ])('rejects %s', async (_caseName, payload) => {
    const response = await postBoss(await freshApi(), payload);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
  });

  it('normalizes an empty annoyance to the permanent fallback', async () => {
    const response = await postBoss(await freshApi(), {
      annoyance: '   ',
      locale: 'zh-TW',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source: 'fallback',
      boss: FALLBACK_BOSS,
    });
  });

  it('rate limits the eleventh request from the same IP', async () => {
    const baseUrl = await freshApi();
    for (let request = 1; request <= 10; request += 1) {
      const response = await postBoss(baseUrl, { annoyance: '需求一直改', locale: 'zh-TW' });
      expect(response.status).toBe(200);
      expect(response.headers.get('ratelimit-limit')).toBe('10');
    }

    const response = await postBoss(baseUrl, { annoyance: '需求一直改', locale: 'zh-TW' });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).not.toBeNull();
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
  });
});
