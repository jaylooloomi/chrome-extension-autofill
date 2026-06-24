// Typed wrapper over chrome.storage.local.
// Everything Autofy persists lives here: profile, API config, and the site
// mapping cache. Nothing is ever sent to a developer server (spec §1, §8).

import type { ApiConfig, Profile, SiteCacheEntry } from './types';

const KEYS = {
  profile: 'profile',
  apiConfig: 'apiConfig',
  siteCache: 'siteCache',
  prefs: 'prefs',
} as const;

/** UI + fill preferences (separate from API config). */
export interface Prefs {
  /** Interface language; 'auto' follows the browser. */
  uiLanguage: string;
  /** Fill output language; 'auto' uses the page language. */
  fillLanguage: string;
  /** Fill fields the profile doesn't cover with realistic AI sample data. */
  fillGaps: boolean;
}

const DEFAULT_PREFS: Prefs = { uiLanguage: 'auto', fillLanguage: 'auto', fillGaps: true };

async function get<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj[key] as T | undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getProfile(): Promise<Profile> {
  return (await get<Profile>(KEYS.profile)) ?? {};
}

export async function setProfile(profile: Profile): Promise<void> {
  await set(KEYS.profile, profile);
}

/** Default config: Ollama on the local daemon (no key needed). Used when the
 *  user hasn't saved anything, so the extension is usable on first load. */
export const DEFAULT_API_CONFIG: ApiConfig = {
  provider: 'ollama',
  apiKey: '',
  model: 'minimax-m2.5:cloud',
  endpoint: 'http://localhost:11434/v1',
};

export async function getApiConfig(): Promise<ApiConfig | null> {
  return (await get<ApiConfig>(KEYS.apiConfig)) ?? DEFAULT_API_CONFIG;
}

export async function setApiConfig(config: ApiConfig): Promise<void> {
  await set(KEYS.apiConfig, config);
}

function cacheKey(domain: string, formSignature: string): string {
  return `${domain}::${formSignature}`;
}

type SiteCache = Record<string, SiteCacheEntry>;

export async function getCacheEntry(
  domain: string,
  formSignature: string,
): Promise<SiteCacheEntry | null> {
  const all = (await get<SiteCache>(KEYS.siteCache)) ?? {};
  return all[cacheKey(domain, formSignature)] ?? null;
}

export async function putCacheEntry(entry: SiteCacheEntry): Promise<void> {
  const all = (await get<SiteCache>(KEYS.siteCache)) ?? {};
  all[cacheKey(entry.domain, entry.formSignature)] = entry;
  await set(KEYS.siteCache, all);
}

export async function getPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...((await get<Partial<Prefs>>(KEYS.prefs)) ?? {}) };
}

export async function setPrefs(prefs: Prefs): Promise<void> {
  await set(KEYS.prefs, prefs);
}

export async function exportAll(): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(null);
}

export async function importAll(data: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(data);
}
