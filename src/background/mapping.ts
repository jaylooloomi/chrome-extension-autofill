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

/** Build the mapping prompt.
 *  - `fake`: user has no profile → invent fully consistent sample data.
 *  - `fillGaps`: user HAS a profile → use it, and fill the fields it doesn't
 *    cover with consistent sample data instead of leaving them null. */
export function buildMappingPrompt(
  req: MappingRequest,
  fake = false,
  language?: string,
  fillGaps = false,
): string {
  // Never send captcha / do-not-fill fields to the model.
  const fields = req.fields.filter((f) => !f.noFill);
  const langLine =
    language && language !== 'auto'
      ? `- Write any text you generate (names, addresses, free text, option choices) in ${language}.`
      : '';
  if (fillGaps && !fake) {
    return [
      'You fill a web form for the user from their PROFILE, completing any gaps with sample data.',
      'You are given FIELDS (each with a "ref") and a PROFILE (JSON).',
      'Rules:',
      '- For each field, use the matching PROFILE value when one exists.',
      '- For fields the PROFILE does NOT cover, generate realistic, internally-consistent',
      '  SAMPLE data that fits the field and stays consistent with the profile (e.g. an',
      '  email or phone for the same person/company, a plausible <select> option, sensible',
      '  checkbox choices).',
      '- For <select>/radio, return one of the provided option TEXT or value — a REAL choice,',
      '  never an empty/placeholder option like "Select…".',
      '- For checkboxes, return "true" or "false".',
      '- Fill EVERY field; avoid null unless no sensible value is possible.',
      langLine,
      '- Output strictly: { "field_0": "value", ... }. No prose.',
      '',
      `FIELDS:\n${JSON.stringify(fields, null, 0)}`,
      '',
      `PROFILE:\n${JSON.stringify(req.profile, null, 0)}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (fake) {
    return [
      'Generate realistic SAMPLE form data for autofill testing.',
      'You are given FIELDS (each with a "ref"). The user has NO profile, so',
      'invent data for ONE plausible, internally-consistent fictional job applicant.',
      'Rules:',
      '- Fill EVERY field with a sensible value matching its type, label, and options.',
      '- Keep values consistent (same person: name, an email derived from that name, a',
      '  matching phone, address, etc.).',
      '- For <select>/radio fields, return one of the provided option TEXT or value —',
      '  pick a REAL choice, never an empty/placeholder option like "Select…".',
      '- For checkboxes, return "true" or "false".',
      '- Use realistic but clearly fictional data. Do NOT return null — fill everything.',
      langLine,
      '- Output strictly: { "field_0": "value", ... }. No prose.',
      '',
      `FIELDS:\n${JSON.stringify(fields, null, 0)}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    'You map web form fields to a user profile for autofill.',
    'You are given FIELDS (each with a "ref") and a PROFILE (JSON).',
    'Return ONLY a JSON object mapping each field ref to the value to fill.',
    'Rules:',
    '- Use a string value drawn from the profile when a field clearly matches.',
    '- For <select>/radio fields, return the option TEXT or value that fits.',
    '- For checkboxes, return "true" or "false".',
    '- If the profile has no matching data, return null for that ref. Never invent data.',
    langLine,
    '- Output strictly: { "field_0": "value", "field_1": null, ... }. No prose.',
    '',
    FEW_SHOT,
    '',
    `FIELDS:\n${JSON.stringify(fields, null, 0)}`,
    '',
    `PROFILE:\n${JSON.stringify(req.profile, null, 0)}`,
  ]
    .filter(Boolean)
    .join('\n');
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
    if (field.noFill) {
      out[field.ref] = null; // captcha / verification code — leave for the user
      continue;
    }
    const v = obj[field.ref];
    if (typeof v === 'string') out[field.ref] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[field.ref] = String(v);
    else out[field.ref] = null;
  }
  return out;
}

const PLACEHOLDER_OPTION =
  /^(\s*|--+|select|choose|請選擇|请选择|選擇|选择|請選取|please\s*select|n\/a)\s*$/i;

/** Local last-resort value for a field the LLM left empty (sample/gap modes).
 *  Guarantees no non-captcha field stays blank even if the model is lazy. */
function fallbackValue(f: FieldSchema): string {
  const opts = (f.options ?? []).filter(
    (o) => !(PLACEHOLDER_OPTION.test(o.text) || o.value === ''),
  );
  if (opts.length) return opts[0].value || opts[0].text; // select / radio
  switch (f.type) {
    case 'email':
      return 'sample@example.com';
    case 'tel':
      return '0912000000';
    case 'number':
      return '1';
    case 'url':
      return 'https://example.com';
    case 'date':
      return '2025-01-01';
    case 'checkbox':
      return 'true';
    default:
      return 'Sample';
  }
}

/** Fill any non-captcha field the LLM left null/empty with a local fallback.
 *  Used only in sample / gap-fill modes so the form is never left half-empty. */
export function fillRemainingGaps(
  fields: FieldSchema[],
  map: MappingResponse,
): MappingResponse {
  const out: MappingResponse = { ...map };
  for (const f of fields) {
    if (f.noFill) continue; // captcha — leave for the user
    const v = out[f.ref];
    if (v == null || v === '') out[f.ref] = fallbackValue(f);
  }
  return out;
}

/** Run a mapping request through a provider, retrying once on a parse failure.
 *  Pass `fake: true` to generate sample data when the user has no profile. */
export async function mapFields(
  req: MappingRequest,
  provider: LLMProvider,
  opts: { fake?: boolean; fillGaps?: boolean; language?: string; signal?: AbortSignal } = {},
): Promise<MappingResponse> {
  const { fake = false, fillGaps = false, language, signal } = opts;
  const prompt = buildMappingPrompt(req, fake, language, fillGaps);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = Date.now();
    try {
      const raw = await provider.complete({ prompt, signal });
      // Per-attempt latency: this is the raw LLM round-trip. A second line here
      // means attempt 1 failed to parse and we silently retried — that DOUBLES
      // the user-visible wait, so it's a prime "why is it slow" suspect.
      console.info(
        `[Autofy map] LLM attempt ${attempt + 1}: ${Date.now() - t}ms ` +
          `(prompt ${prompt.length} chars, ${req.fields.length} fields)`,
      );
      return validateMapping(raw, req.fields);
    } catch (err) {
      lastErr = err;
      console.debug(
        `[Autofy map] LLM attempt ${attempt + 1} failed after ${Date.now() - t}ms:`,
        err instanceof LLMError ? `${err.code} ${err.message}` : String(err),
      );
      if (err instanceof LLMError && err.code !== 'PARSE') throw err; // don't retry auth/rate
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new LLMError('PARSE', 'mapping failed after retry');
}
