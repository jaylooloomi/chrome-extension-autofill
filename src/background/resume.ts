// Résumé paste -> Profile draft (spec §5.7). Reuses the same BYOK + JSON
// machinery as field mapping. The result is a draft the user reviews/edits in
// the options page; manual editing remains the source of truth.

import type { LLMProvider, Profile } from '../shared/types';
import { LLMError } from '../shared/types';
import { PROFILE_JSON_SCHEMA } from '../shared/profile-schema';

export function buildResumePrompt(text: string): string {
  return [
    'Extract a structured job-application profile from the résumé text below.',
    'Return ONLY a JSON object matching this schema (omit fields you cannot find):',
    JSON.stringify(PROFILE_JSON_SCHEMA),
    'Do not invent data. Use empty/omitted fields when unknown.',
    '',
    'RÉSUMÉ:',
    text,
  ].join('\n');
}

export async function parseResume(
  text: string,
  provider: LLMProvider,
  signal?: AbortSignal,
): Promise<Profile> {
  const raw = await provider.complete({ prompt: buildResumePrompt(text), signal });
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LLMError('PARSE', 'résumé parse did not return a JSON object');
  }
  return raw as Profile;
}
