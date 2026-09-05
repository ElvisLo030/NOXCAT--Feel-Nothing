export interface OllamaChatMessage {
  role: string;
  content: string;
  images?: string[];
  [key: string]: unknown;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  options?: Record<string, unknown>;
  think?: boolean;
  format?: string | Record<string, unknown>;
  keep_alive?: string | number;
  [key: string]: unknown;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: Record<string, unknown>;
  think?: boolean;
  format?: string | Record<string, unknown>;
  keep_alive?: string | number;
  [key: string]: unknown;
}

export interface OllamaClientOptions {
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  [key: string]: unknown;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  [key: string]: unknown;
}

/**
 * Ensures that the Ollama request body contains top-level `think: false`
 * unless the caller explicitly provided a `think` value.
 * Preserves all original fields (model, messages, prompt, stream, options, etc.).
 * `think` is strictly top-level and never placed inside `options`.
 */
export function applyOllamaThinkDefault<T extends Record<string, unknown>>(
  body: T,
): T & { think: boolean } {
  return {
    ...body,
    think: body.think !== undefined ? Boolean(body.think) : false,
  };
}

export function getOllamaBaseUrl(): string {
  const envUrl = process.env.OLLAMA_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
  if (!envUrl) return 'http://127.0.0.1:11434';
  return envUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
}

export function resolveOllamaUrl(baseURL: string, endpoint: string): string {
  const cleanBase = baseURL.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

export async function sendOllamaRequest<T = unknown>(
  endpoint: '/api/chat' | '/api/generate' | string,
  body: Record<string, unknown>,
  options: OllamaClientOptions = {},
): Promise<T> {
  const normalizedBody = applyOllamaThinkDefault(body);
  const baseURL = options.baseURL ?? getOllamaBaseUrl();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = resolveOllamaUrl(baseURL, endpoint);

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(normalizedBody),
    signal: options.signal ?? (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Ollama request to ${endpoint} failed with status ${response.status}${
        errorText ? `: ${errorText}` : ''
      }`,
    );
  }

  return response.json() as Promise<T>;
}

export async function ollamaChat<T = OllamaChatResponse>(
  request: OllamaChatRequest,
  options?: OllamaClientOptions,
): Promise<T> {
  return sendOllamaRequest<T>('/api/chat', request, options);
}

export async function ollamaGenerate<T = OllamaGenerateResponse>(
  request: OllamaGenerateRequest,
  options?: OllamaClientOptions,
): Promise<T> {
  return sendOllamaRequest<T>('/api/generate', request, options);
}

/**
 * Creates a fetch wrapper that ensures any requests directed to Ollama's
 * `/api/chat`, `/api/generate`, or OpenAI-compatible completions endpoints include
 * top-level `think: false` in the JSON request body (unless explicitly set).
 */
export function createOllamaFetch(
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlString: string;
    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else {
      urlString = input.url;
    }

    const isOllamaEndpoint = /\/api\/(chat|generate)\b/.test(urlString)
      || (/\/v1\/chat\/completions\b/.test(urlString) && /11434|ollama/i.test(urlString));

    if (isOllamaEndpoint && init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const modified = applyOllamaThinkDefault(parsed);
          init = {
            ...init,
            body: JSON.stringify(modified),
          };
        }
      } catch {
        // Non-JSON body, forward unchanged
      }
    }

    return baseFetch(input, init);
  };
}

export class OllamaClient {
  private baseURL: string;
  private fetchImpl: typeof globalThis.fetch;
  private timeout?: number;

  constructor(options: OllamaClientOptions = {}) {
    this.baseURL = options.baseURL ?? getOllamaBaseUrl();
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeout = options.timeout;
  }

  async chat<T = OllamaChatResponse>(
    request: OllamaChatRequest,
    options?: OllamaClientOptions,
  ): Promise<T> {
    return ollamaChat<T>(request, {
      baseURL: options?.baseURL ?? this.baseURL,
      fetch: options?.fetch ?? this.fetchImpl,
      timeout: options?.timeout ?? this.timeout,
      headers: options?.headers,
      signal: options?.signal,
    });
  }

  async generate<T = OllamaGenerateResponse>(
    request: OllamaGenerateRequest,
    options?: OllamaClientOptions,
  ): Promise<T> {
    return ollamaGenerate<T>(request, {
      baseURL: options?.baseURL ?? this.baseURL,
      fetch: options?.fetch ?? this.fetchImpl,
      timeout: options?.timeout ?? this.timeout,
      headers: options?.headers,
      signal: options?.signal,
    });
  }
}

export default OllamaClient;
