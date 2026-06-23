// AI semantic mapping (spec §4.2, §5.4): turn (field schema + profile) into a
// { ref -> value|null } object. We never send raw HTML, only the schema, and we
// instruct the model to leave fields null rather than invent data.

import type { FieldSchema, LLMProvider, MappingRequest, MappingResponse } from '../shared/types';
import { LLMError } from '../shared/types';

const FEW_SHOT = `Examples (job application context):
- A field labelled "Email Address" / name "applicant_email" -> the profile email.
- "Years of experience" with no matching profile data -> null.
- A <select> "Country" -> choose the option text matching the profile country.
- "Are you authorized to work?" -> use job.workAuthorization if present, else null.`;

export function buildMappingPrompt(req: MappingRequest): string {
  return [
    'You map web form fields to a user profile for autofill.',
    'You are given FIELDS (each with a "ref") and a PROFILE (JSON).',
    'Return ONLY a JSON object mapping each field ref to the value to fill.',
    'Rules:',
    '- Use a string value drawn from the profile when a field clearly matches.',
    '- For <select>/radio fields, return the option TEXT or value that fits.',
    '- For checkboxes, return "true" or "false".',
    '- If the profile has no matching data, return null for that ref. Never invent data.',
    '- Output strictly: { "field_0": "value", "field_1": null, ... }. No prose.',
    '',
    FEW_SHOT,
    '',
    `FIELDS:\n${JSON.stringify(req.fields, null, 0)}`,
    '',
    `PROFILE:\n${JSON.stringify(req.profile, null, 0)}`,
  ].join('\n');
}

/** Coerce a raw model response into a clean MappingResponse covering every ref.
 *  Throws LLMError('PARSE') if the response is not an object. */
export function validateMapping(raw: unknown, fields: FieldSchema[]): MappingResponse {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LLMError('PARSE', 'mapping response is not a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const out: MappingResponse = {};
  for (const field of fields) {
    const v = obj[field.ref];
    if (typeof v === 'string') out[field.ref] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[field.ref] = String(v);
    else out[field.ref] = null;
  }
  return out;
}

/** Run a mapping request through a provider, retrying once on a parse failure. */
export async function mapFields(
  req: MappingRequest,
  provider: LLMProvider,
  signal?: AbortSignal,
): Promise<MappingResponse> {
  const prompt = buildMappingPrompt(req);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.complete({ prompt, signal });
      return validateMapping(raw, req.fields);
    } catch (err) {
      lastErr = err;
      if (err instanceof LLMError && err.code !== 'PARSE') throw err; // don't retry auth/rate
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new LLMError('PARSE', 'mapping failed after retry');
}
