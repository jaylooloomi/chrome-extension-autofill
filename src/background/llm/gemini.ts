// Google Gemini adapter. Forces JSON via responseMimeType.

import type { ApiConfig, LLMProvider, ProviderName } from '../../shared/types';
import { LLMError } from '../../shared/types';
import { codeForStatus, extractJson } from './provider';

export class GeminiProvider implements LLMProvider {
  readonly name: ProviderName = 'gemini';
  constructor(private config: ApiConfig) {}

  async complete({ prompt, signal }: { prompt: string; signal?: AbortSignal }): Promise<unknown> {
    const base = (
      this.config.endpoint || 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');
    const url = `${base}/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) {
      throw new LLMError(codeForStatus(res.status), await res.text());
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return extractJson(text);
  }
}
