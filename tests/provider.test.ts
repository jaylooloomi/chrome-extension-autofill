import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractJson, createProvider, codeForStatus } from '../src/background/llm/provider';
import { LLMError } from '../src/shared/types';
import type { ApiConfig } from '../src/shared/types';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('parses fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extracts an object embedded in prose', () => {
    expect(extractJson('Here you go: {"a":1} done')).toEqual({ a: 1 });
  });
  it('throws PARSE on garbage', () => {
    expect(() => extractJson('not json at all')).toThrow(LLMError);
  });
});

describe('codeForStatus', () => {
  it('maps statuses to stable codes', () => {
    expect(codeForStatus(401)).toBe('AUTH');
    expect(codeForStatus(429)).toBe('RATE_LIMIT');
    expect(codeForStatus(500)).toBe('SERVER');
  });
});

describe('createProvider', () => {
  it('returns the matching adapter', () => {
    expect(createProvider({ provider: 'openai', apiKey: 'k', model: 'm' }).name).toBe('openai');
    expect(createProvider({ provider: 'gemini', apiKey: 'k', model: 'm' }).name).toBe('gemini');
    expect(createProvider({ provider: 'anthropic', apiKey: 'k', model: 'm' }).name).toBe('anthropic');
    expect(createProvider({ provider: 'ollama', apiKey: '', model: 'm' }).name).toBe('ollama');
  });
});

describe('OllamaProvider via mocked fetch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the configured endpoint, sends no auth without a key, and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"field_0":"y"}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await createProvider({
      provider: 'ollama',
      apiKey: '',
      model: 'minimax-m2.5:cloud',
      endpoint: 'http://localhost:11434/v1',
    }).complete({ prompt: 'p' });
    expect(out).toEqual({ field_0: 'y' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).model).toBe('minimax-m2.5:cloud');
  });

  it('defaults to localhost:11434 when no endpoint is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await createProvider({ provider: 'ollama', apiKey: '', model: 'm' }).complete({ prompt: 'p' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });
});

describe('OpenAIProvider via mocked fetch', () => {
  const config: ApiConfig = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-x' };
  afterEach(() => vi.restoreAllMocks());

  it('parses a chat completion into JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"field_0":"x"}' } }] }),
      }),
    );
    const out = await createProvider(config).complete({ prompt: 'p' });
    expect(out).toEqual({ field_0: 'x' });
  });

  it('throws LLMError with an AUTH code on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }),
    );
    await expect(createProvider(config).complete({ prompt: 'p' })).rejects.toMatchObject({
      code: 'AUTH',
    });
  });
});
