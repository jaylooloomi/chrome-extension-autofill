// Profile field definitions + dotted-path helpers.
// Shared by the options form (rendering/validation) and the cache resolver
// (turning a learned ProfilePath back into a concrete value).

import type { Profile, ProfilePath } from './types';

export interface FieldDef {
  path: ProfilePath;
  /** i18n key for the field label (see shared/i18n.ts). */
  labelKey: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'textarea';
}

/** Scalar profile fields rendered as individual inputs in the options page. */
export const SCALAR_FIELDS: FieldDef[] = [
  { path: 'basics.fullName', labelKey: 'pf_full_name', placeholder: 'Wang Da-ming' },
  { path: 'basics.firstName', labelKey: 'pf_first_name' },
  { path: 'basics.lastName', labelKey: 'pf_last_name' },
  { path: 'basics.email', labelKey: 'pf_email', type: 'email', placeholder: 'you@example.com' },
  { path: 'basics.phone', labelKey: 'pf_phone', type: 'tel' },
  { path: 'address.line1', labelKey: 'pf_addr1' },
  { path: 'address.line2', labelKey: 'pf_addr2' },
  { path: 'address.city', labelKey: 'pf_city' },
  { path: 'address.state', labelKey: 'pf_state' },
  { path: 'address.postalCode', labelKey: 'pf_postal' },
  { path: 'address.country', labelKey: 'pf_country' },
  { path: 'job.availableFrom', labelKey: 'pf_available_from', type: 'date' },
  { path: 'job.expectedSalary', labelKey: 'pf_expected_salary' },
  { path: 'job.workAuthorization', labelKey: 'pf_work_auth' },
  { path: 'job.linkedin', labelKey: 'pf_linkedin' },
  { path: 'job.website', labelKey: 'pf_website' },
  { path: 'job.portfolio', labelKey: 'pf_portfolio' },
  { path: 'job.summary', labelKey: 'pf_summary', type: 'textarea' },
];

/** Read a scalar value at a dotted path. Returns undefined if absent or if the
 *  path lands on a non-scalar (e.g. an array/object). */
export function getByPath(profile: Profile, path: ProfilePath): string | undefined {
  const parts = path.split('.');
  let cur: unknown = profile;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (cur == null) return undefined;
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
  return undefined;
}

/** Set a scalar value at a dotted path, creating intermediate objects.
 *  An empty string clears (deletes) the leaf. Returns a new object. */
export function setByPath(profile: Profile, path: ProfilePath, value: string): Profile {
  const parts = path.split('.');
  const root: Record<string, unknown> = { ...(profile as Record<string, unknown>) };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = cur[part];
    cur[part] = next && typeof next === 'object' ? { ...(next as object) } : {};
    cur = cur[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (value === '') delete cur[leaf];
  else cur[leaf] = value;
  return root as Profile;
}

/** Enumerate every scalar leaf path present in a profile (incl. custom.*). */
export function listProfilePaths(profile: Profile): ProfilePath[] {
  const out: ProfilePath[] = [];
  const walk = (obj: unknown, prefix: string) => {
    if (obj == null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v != null && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else if (typeof v === 'string' || typeof v === 'number') out.push(p);
    }
  };
  walk(profile, '');
  return out;
}

/** JSON schema describing a Profile — used to force structured output when
 *  parsing a pasted résumé into a profile draft (spec §5.7). */
export const PROFILE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    basics: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
    },
    address: {
      type: 'object',
      properties: {
        line1: { type: 'string' },
        line2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
      },
    },
    job: {
      type: 'object',
      properties: {
        availableFrom: { type: 'string' },
        expectedSalary: { type: 'string' },
        summary: { type: 'string' },
        linkedin: { type: 'string' },
        website: { type: 'string' },
        portfolio: { type: 'string' },
        workAuthorization: { type: 'string' },
        experience: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              company: { type: 'string' },
              title: { type: 'string' },
              start: { type: 'string' },
              end: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        education: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              school: { type: 'string' },
              degree: { type: 'string' },
              field: { type: 'string' },
              start: { type: 'string' },
              end: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;
