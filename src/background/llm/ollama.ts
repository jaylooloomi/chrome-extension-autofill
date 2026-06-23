// Ollama adapter. Ollama exposes an OpenAI-compatible endpoint at
// http://localhost:11434/v1, and brokers cloud models (e.g. minimax-m2.5:cloud)
// once the user has run `ollama signin`. No API key is needed for the local
// daemon; an optional key is forwarded for ollama.com cloud usage.
//
// CORS note: Ollama must allow the extension origin — set OLLAMA_ORIGINS=*
// (or include the extension id) and restart Ollama, else fetch is blocked.

import type { ApiConfig, LLMProvider, ProviderName } from '../../shared/types';
import { LLMError } from '../../shared/types';
import { codeForStatus, extractJson } from './provider';

export const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434/v1';

export class OllamaProvider implements LLMProvider {
  readonly name: ProviderName = 'ollama';
  constructor(private config: ApiConfig) {}

  async complete({ prompt, signal }: { prompt: string; signal?: AbortSignal }): Promise<unknown> {
    const base = (this.config.endpoint || OLLAMA_DEFAULT_ENDPOINT).replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new LLMError(codeForStatus(res.status), await res.text());
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    return extractJson(content);
  }
}
