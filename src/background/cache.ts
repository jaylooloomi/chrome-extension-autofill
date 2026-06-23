// Site mapping cache + learning (spec §4.5, §5.6).
//
// We store, per (domain + form signature), a map of field.signature ->
// ProfilePath. On a second visit we resolve those paths against the current
// profile locally — zero AI calls. We learn the paths by reverse-looking-up
// each filled value back to the profile field that produced it.

import type { FieldSchema, MappingResponse, ProfilePath, Profile } from '../shared/types';
import { getByPath, listProfilePaths } from '../shared/profile-schema';
import { getCacheEntry, putCacheEntry } from '../shared/storage';

export const CACHE_VERSION = 1;

/** Minimum share of fields a cache entry must fill before we trust it instead
 *  of falling back to the LLM (the form may have changed). */
export const MIN_COVERAGE = 0.5;

/** Find the profile path whose current value equals `value` (first match). */
export function reverseLookup(profile: Profile, value: string): ProfilePath | null {
  for (const path of listProfilePaths(profile)) {
    if (getByPath(profile, path) === value) return path;
  }
  return null;
}

/** Convert a ref-keyed mapping into a signature-keyed one using the schema. */
export function toSignatureValues(
  fields: FieldSchema[],
  map: MappingResponse,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fields) out[f.signature] = map[f.ref] ?? null;
  return out;
}

/** Merge learned field.signature -> ProfilePath into the cache entry. */
export async function learn(
  domain: string,
  formSignature: string,
  sigValues: Record<string, string | null>,
  profile: Profile,
): Promise<void> {
  const existing = await getCacheEntry(domain, formSignature);
  const map: Record<string, ProfilePath> = { ...(existing?.map ?? {}) };
  for (const [sig, value] of Object.entries(sigValues)) {
    if (value == null || value === '') continue;
    const path = reverseLookup(profile, value);
    if (path) map[sig] = path;
  }
  await putCacheEntry({
    domain,
    formSignature,
    version: CACHE_VERSION,
    map,
    updatedAt: Date.now(),
  });
}

export interface CacheApplyResult {
  map: MappingResponse;
  coverage: number;
}

/** Resolve a cached entry against the current profile. Returns null when there
 *  is no entry. The caller checks `coverage` against MIN_COVERAGE. */
export async function getCachedMapping(
  domain: string,
  formSignature: string,
  fields: FieldSchema[],
  profile: Profile,
): Promise<CacheApplyResult | null> {
  const entry = await getCacheEntry(domain, formSignature);
  if (!entry) return null;
  const map: MappingResponse = {};
  let covered = 0;
  for (const f of fields) {
    const path = entry.map[f.signature];
    const value = path ? (getByPath(profile, path) ?? null) : null;
    map[f.ref] = value;
    if (value != null) covered++;
  }
  return { map, coverage: fields.length ? covered / fields.length : 0 };
}
