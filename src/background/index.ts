// Service worker: routes typed messages, applies the cache, calls the LLM via
// the user's key, and learns site mappings (spec §1, §5, §6).

import type { Msg, Resp } from '../shared/messages';
import { LLMError } from '../shared/types';
import type { ApiConfig } from '../shared/types';
import { getApiConfig, getProfile } from '../shared/storage';
import { createProvider } from './llm/provider';
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
  const config = await getApiConfig();
  if (!isConfigured(config)) {
    return { ok: false, code: 'NO_CONFIG', message: 'Set up your provider in Autofy options.' };
  }
  const profile = await getProfile();
  const domain = domainOf(msg.url);

  const cached = await getCachedMapping(domain, msg.formSignature, msg.fields, profile);
  if (cached && cached.coverage >= MIN_COVERAGE) {
    return { ok: true, kind: 'MAP_FIELDS', map: cached.map, fromCache: true };
  }

  const provider = createProvider(config);
  const map = await mapFields({ fields: msg.fields, profile }, provider);
  // Learn the site mapping for next time (best-effort).
  try {
    await learn(domain, msg.formSignature, toSignatureValues(msg.fields, map), profile);
  } catch {
    /* learning is non-critical */
  }
  return { ok: true, kind: 'MAP_FIELDS', map, fromCache: false };
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
