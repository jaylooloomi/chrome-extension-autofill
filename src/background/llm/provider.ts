// Provider factory + shared helpers for the LLM adapters (spec §5.5).

import type { ApiConfig, LLMProvider } from '../../shared/types';
import { LLMError } from '../../shared/types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';

export function createProvider(config: ApiConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new LLMError('CONFIG', `unknown provider: ${String(config.provider)}`);
  }
}

/** Map an HTTP status to a stable error code shown in the UI. */
export function codeForStatus(status: number): string {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  return 'HTTP';
}

/** Parse a model's text output into JSON, tolerating ```json fences and prose
 *  around the object. Throws LLMError('PARSE') if nothing parses. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to extraction
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.search(/[{[]/);
  if (start >= 0) {
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }
  throw new LLMError('PARSE', 'model did not return valid JSON');
}
