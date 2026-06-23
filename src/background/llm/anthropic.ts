// Anthropic Claude adapter. Browser/extension calls require the
// `anthropic-dangerous-direct-browser-access` header for CORS.

import type { ApiConfig, LLMProvider, ProviderName } from '../../shared/types';
import { LLMError } from '../../shared/types';
import { codeForStatus, extractJson } from './provider';

export class AnthropicProvider implements LLMProvider {
  readonly name: ProviderName = 'anthropic';
  constructor(private config: ApiConfig) {}

  async complete({ prompt, signal }: { prompt: string; signal?: AbortSignal }): Promise<unknown> {
    const base = (this.config.endpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new LLMError(codeForStatus(res.status), await res.text());
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text =
      data.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('') ?? '';
    return extractJson(text);
  }
}
