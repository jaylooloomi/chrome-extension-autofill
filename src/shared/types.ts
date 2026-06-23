// Core data contracts shared across content script, service worker, and pages.
// This file is the single source of truth for shapes that cross module
// boundaries (see spec §3).

/** Tag categories Autofy knows how to detect and fill. */
export type FieldTag = 'input' | 'select' | 'textarea' | 'contenteditable';

/** A single fillable field, reduced to the semantic context an LLM needs.
 *  We never send raw HTML — only this schema (spec §4.1). */
export interface FieldSchema {
  /** Internal id; resolves to a real DOM node via the refs registry. */
  ref: string;
  tag: FieldTag;
  /** input type, or 'select' / 'textarea' / 'contenteditable'. */
  type: string;
  label?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  nearbyText?: string;
  required?: boolean;
  /** Present for <select> / radio groups. */
  options?: { value: string; text: string }[] | null;
  /** Stable signature used as a cache key (spec §7). */
  signature: string;
}

export interface ExperienceItem {
  company?: string;
  title?: string;
  start?: string;
  end?: string;
  description?: string;
}

export interface EducationItem {
  school?: string;
  degree?: string;
  field?: string;
  start?: string;
  end?: string;
}

/** Structured personal profile (job-seeker oriented). */
export interface Profile {
  basics?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  job?: {
    availableFrom?: string;
    expectedSalary?: string;
    summary?: string;
    linkedin?: string;
    website?: string;
    portfolio?: string;
    workAuthorization?: string;
    experience?: ExperienceItem[];
    education?: EducationItem[];
  };
  /** User-defined extra key/value pairs (e.g. door PIN, referral code). */
  custom?: Record<string, string>;
}

/** Request sent to the LLM: which fields, against which profile (spec §4.2). */
export interface MappingRequest {
  fields: FieldSchema[];
  profile: Profile;
}

/** LLM answer: ref -> value. `null` means "no matching data, leave empty". */
export type MappingResponse = Record<string, string | null>;

/** Dotted path into a Profile, e.g. 'basics.email' or 'custom.PIN' (spec §3). */
export type ProfilePath = string;

/** A learned site mapping (spec §4.5). */
export interface SiteCacheEntry {
  domain: string;
  formSignature: string;
  version: number;
  /** field.signature -> profile path. */
  map: Record<string, ProfilePath>;
  updatedAt: number;
}

export type ProviderName = 'openai' | 'gemini' | 'anthropic';

export interface ApiConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  /** Optional override for an OpenAI-compatible endpoint. */
  endpoint?: string;
}

/** Abstraction every provider adapter implements (spec §5.5).
 *  Adapters force JSON output mode; the expected shape is described in the
 *  prompt and validated by the caller (works for dynamic-keyed responses). */
export interface LLMProvider {
  readonly name: ProviderName;
  complete(opts: { prompt: string; signal?: AbortSignal }): Promise<unknown>;
}

/** Typed error thrown by provider adapters so the UI can show a useful code. */
export class LLMError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Result of attempting to fill one field (spec §5.2). */
export interface FillResult {
  ref: string;
  status: 'filled' | 'skipped' | 'error';
  value?: string | null;
  reason?: string;
}
