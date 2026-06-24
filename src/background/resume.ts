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

/** Prompt to invent a complete sample profile from scratch (no input text). */
export function buildGenerateProfilePrompt(language?: string): string {
  const langLine =
    language && language !== 'auto'
      ? `Write all names, addresses, and free text in ${language}.`
      : '';
  return [
    'Generate a realistic, internally-consistent SAMPLE profile for ONE fictional job applicant.',
    'Return ONLY a JSON object matching this schema (fill as many fields as you reasonably can):',
    JSON.stringify(PROFILE_JSON_SCHEMA),
    'Keep values consistent: an email derived from the name, a matching phone and address,',
    '2-3 work experiences and 1-2 education entries, and a short professional summary.',
    'Use realistic but clearly fictional data.',
    langLine,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateProfile(
  provider: LLMProvider,
  language?: string,
  signal?: AbortSignal,
): Promise<Profile> {
  const raw = await provider.complete({ prompt: buildGenerateProfilePrompt(language), signal });
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LLMError('PARSE', 'profile generation did not return a JSON object');
  }
  return raw as Profile;
}
