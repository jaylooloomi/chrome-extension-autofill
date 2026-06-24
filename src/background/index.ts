// Service worker: routes typed messages, applies the cache, calls the LLM via
// the user's key, and learns site mappings (spec §1, §5, §6).

import type { Msg, Resp } from '../shared/messages';
import { LLMError } from '../shared/types';
import type { ApiConfig } from '../shared/types';
import { getApiConfig, getProfile, getPrefs } from '../shared/storage';
import { listProfilePaths } from '../shared/profile-schema';
import { createProvider, codeForStatus } from './llm/provider';
import { mapFields } from './mapping';
import { parseResume } from './resume';
import { getCachedMapping, learn, MIN_COVERAGE, toSignatureValues } from './cache';

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Ollama's local daemon needs no key; every cloud provider does. */
function isConfigured(config: ApiConfig | null): config is ApiConfig {
  if (!config) return false;
  return config.provider === 'ollama' || Boolean(config.apiKey);
}

async function handleMapFields(
  msg: Extract<Msg, { kind: 'MAP_FIELDS' }>,
): Promise<Resp> {
  const t0 = Date.now();
  const config = await getApiConfig();
  if (!isConfigured(config)) {
    return { ok: false, code: 'NO_CONFIG', message: 'Set up your provider in Autofy options.' };
  }
  const [profile, prefs] = await Promise.all([getProfile(), getPrefs()]);
  const domain = domainOf(msg.url);
  const tLoad = Date.now();

  // No profile at all -> generate plausible sample data instead of leaving
  // everything blank (fake-data mode). Skip the cache in this mode.
  const fake = listProfilePaths(profile).length === 0;

  if (!fake) {
    const cached = await getCachedMapping(domain, msg.formSignature, msg.fields, profile);
    if (cached && cached.coverage >= MIN_COVERAGE) {
      console.info('[Autofy bg] cache hit (no AI):', {
        load: tLoad - t0,
        cache: Date.now() - tLoad,
        fields: msg.fields.length,
      });
      return { ok: true, kind: 'MAP_FIELDS', map: cached.map, fromCache: true, fake: false };
    }
  }

  const language = prefs.fillLanguage === 'auto' ? msg.pageLang : prefs.fillLanguage;
  const provider = createProvider(config);
  const tBeforeLLM = Date.now();
  const map = await mapFields({ fields: msg.fields, profile }, provider, { fake, language });
  const tLLM = Date.now();
  if (!fake) {
    // Learn the site mapping for next time (best-effort).
    try {
      await learn(domain, msg.formSignature, toSignatureValues(msg.fields, map), profile);
    } catch {
      /* learning is non-critical */
    }
  }
  console.info('[Autofy bg] timings (ms):', {
    load: tLoad - t0,
    preLLM: tBeforeLLM - tLoad,
    llm: tLLM - tBeforeLLM,
    learn: Date.now() - tLLM,
    total: Date.now() - t0,
    provider: config.provider,
    model: config.model,
    fields: msg.fields.length,
    fake,
  });
  return { ok: true, kind: 'MAP_FIELDS', map, fromCache: false, fake };
}

/** List available models for a provider — used by the options "Test connection"
 *  button to confirm reachability and populate the model picker. */
async function listModels(config: ApiConfig): Promise<string[]> {
  if (config.provider === 'gemini') {
    const base = config.endpoint || 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(`${base.replace(/\/$/, '')}/models?key=${encodeURIComponent(config.apiKey)}`);
    if (!res.ok) throw new LLMError(codeForStatus(res.status), await res.text());
    const d = (await res.json()) as { models?: { name?: string }[] };
    return (d.models ?? []).map((m) => (m.name ?? '').replace(/^models\//, '')).filter(Boolean);
  }
  if (config.provider === 'anthropic') {
    const base = config.endpoint || 'https://api.anthropic.com/v1';
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) throw new LLMError(codeForStatus(res.status), await res.text());
    const d = (await res.json()) as { data?: { id?: string }[] };
    return (d.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  }
  // openai / ollama (OpenAI-compatible /v1/models)
  const fallback =
    config.provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1';
  const base = (config.endpoint || fallback).replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const res = await fetch(`${base}/models`, { headers });
  if (!res.ok) throw new LLMError(codeForStatus(res.status), await res.text());
  const d = (await res.json()) as { data?: { id?: string }[] };
  return (d.data ?? []).map((m) => m.id ?? '').filter(Boolean);
}

async function handleTestConnection(
  msg: Extract<Msg, { kind: 'TEST_CONNECTION' }>,
): Promise<Resp> {
  const models = await listModels(msg.config);
  return { ok: true, kind: 'TEST_CONNECTION', models };
}

async function handleParseResume(
  msg: Extract<Msg, { kind: 'PARSE_RESUME' }>,
): Promise<Resp> {
  const config = await getApiConfig();
  if (!isConfigured(config)) {
    return { ok: false, code: 'NO_CONFIG', message: 'Set up your provider in Autofy options.' };
  }
  const provider = createProvider(config);
  const profile = await parseResume(msg.text, provider);
  return { ok: true, kind: 'PARSE_RESUME', profile };
}

async function handleRecordCorrections(
  msg: Extract<Msg, { kind: 'RECORD_CORRECTIONS' }>,
): Promise<Resp> {
  const profile = await getProfile();
  await learn(msg.domain, msg.formSignature, msg.values, profile);
  return { ok: true, kind: 'RECORD_CORRECTIONS' };
}

async function handle(msg: Msg): Promise<Resp> {
  switch (msg.kind) {
    case 'MAP_FIELDS':
      return handleMapFields(msg);
    case 'PARSE_RESUME':
      return handleParseResume(msg);
    case 'RECORD_CORRECTIONS':
      return handleRecordCorrections(msg);
    case 'TEST_CONNECTION':
      return handleTestConnection(msg);
    default:
      return { ok: false, code: 'UNKNOWN', message: 'unknown message' };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err: unknown) => {
      const resp: Resp =
        err instanceof LLMError
          ? { ok: false, code: err.code, message: err.message }
          : { ok: false, code: 'INTERNAL', message: String(err) };
      sendResponse(resp);
    });
  return true; // keep the message channel open for the async response
});
