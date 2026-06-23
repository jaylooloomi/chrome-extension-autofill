// OpenAI (and OpenAI-compatible) adapter. Uses JSON object response mode.

import type { ApiConfig, LLMProvider, ProviderName } from '../../shared/types';
import { LLMError } from '../../shared/types';
import { codeForStatus, extractJson } from './provider';

export class OpenAIProvider implements LLMProvider {
  readonly name: ProviderName = 'openai';
  constructor(private config: ApiConfig) {}

  async complete({ prompt, signal }: { prompt: string; signal?: AbortSignal }): Promise<unknown> {
    const base = (this.config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
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
