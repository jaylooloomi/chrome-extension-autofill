// Options page: API config, fill/UI language, résumé paste & file import,
// profile editing, and backup (spec §5.7). UI strings are translated at runtime.

import type { ApiConfig, Profile, ProviderName } from '../shared/types';
import {
  getApiConfig,
  setApiConfig,
  getProfile,
  setProfile,
  getPrefs,
  setPrefs,
  exportAll,
  importAll,
  type Prefs,
} from '../shared/storage';
import { sendToBackground } from '../shared/messages';
import { SCALAR_FIELDS, getByPath, setByPath } from '../shared/profile-schema';
import { t, resolveLocale, LOCALES, FILL_LANGUAGES, type Locale } from '../shared/i18n';

const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434/v1';

const SUGGESTED_MODEL: Record<ProviderName, string> = {
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5', // cheap/fast default for the JSON-mapping task
  ollama: 'minimax-m2.5:cloud',
};

/** Curated model suggestions shown in the combobox per provider. For Ollama the
 *  live list from the daemon is merged on top. Users can still type any value. */
const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-5'],
  ollama: ['minimax-m2.5:cloud', 'qwen3-coder-next:cloud', 'llama3.2:3b'],
};

const KEY_HELP: Record<ProviderName, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  ollama: 'https://docs.ollama.com/cloud',
};

function keyOptional(provider: ProviderName): boolean {
  return provider === 'ollama';
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let currentProfile: Profile = {};
let prefs: Prefs = { uiLanguage: 'auto', fillLanguage: 'auto', fillGaps: true, disabledSites: [] };
let locale: Locale = 'en';

function status(el: HTMLElement, msg: string, ok = true): void {
  el.textContent = msg;
  el.className = `status ${ok ? 'ok' : 'err'}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 4000);
}

function applyI18n(): void {
  document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!, locale);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-ph]').forEach((el) => {
    (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(el.dataset.i18nPh!, locale);
  });
}

function fillSelect(sel: HTMLSelectElement, opts: { code: string; name: string }[], selected: string): void {
  sel.innerHTML = '';
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o.code;
    opt.textContent = o.name;
    sel.appendChild(opt);
  }
  sel.value = selected;
}

function renderProfileFields(): void {
  const container = $('profile-fields');
  container.innerHTML = '';
  for (const f of SCALAR_FIELDS) {
    const label = document.createElement('label');
    if (f.type === 'textarea') label.className = 'full';
    label.textContent = t(f.labelKey, locale);
    const input =
      f.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (input instanceof HTMLInputElement) input.type = f.type ?? 'text';
    if (f.placeholder) input.placeholder = f.placeholder;
    input.dataset.path = f.path;
    input.value = getByPath(currentProfile, f.path) ?? '';
    label.appendChild(input);
    container.appendChild(label);
  }
}

function readProfileFromForm(): Profile {
  let next = currentProfile;
  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#profile-fields [data-path]')
    .forEach((input) => {
      next = setByPath(next, input.dataset.path!, input.value.trim());
    });
  return next;
}

function mergeProfile(base: Profile, draft: Profile): Profile {
  return {
    ...base,
    ...draft,
    basics: { ...base.basics, ...draft.basics },
    address: { ...base.address, ...draft.address },
    job: { ...base.job, ...draft.job },
    custom: { ...base.custom, ...draft.custom },
  };
}

function applyProviderUI(provider: ProviderName): void {
  ($('key-help') as HTMLAnchorElement).href = KEY_HELP[provider];
  $('provider-note').textContent = provider === 'ollama' ? t('ollama_note', locale) : '';
  ($('key-optional') as HTMLElement).hidden = !keyOptional(provider);
  const endpoint = $('endpoint') as HTMLInputElement;
  if (provider === 'ollama' && !endpoint.value.trim()) endpoint.value = OLLAMA_DEFAULT_ENDPOINT;
}

async function draftFromResume(text: string): Promise<void> {
  const statusEl = $('resume-status');
  const btn = $('parse-resume') as HTMLButtonElement;
  const importBtn = $('import-resume') as HTMLButtonElement;
  if (!text.trim()) {
    status(statusEl, t('resume_empty', locale), false);
    return;
  }
  // Persistent loading state — the LLM can take 10-30s (esp. thinking models),
  // so don't let the message auto-clear or the button look idle.
  btn.disabled = true;
  importBtn.disabled = true;
  btn.textContent = '…';
  statusEl.textContent = t('resume_parsing', locale);
  statusEl.className = 'status';
  console.info('[Autofy] PARSE_RESUME start —', text.length, 'chars');
  const started = Date.now();
  try {
    const resp = await sendToBackground({ kind: 'PARSE_RESUME', text });
    console.info('[Autofy] PARSE_RESUME done in', Date.now() - started, 'ms', resp.ok ? 'ok' : resp);
    if (!resp.ok) {
      statusEl.textContent = `❌ ${resp.message}`;
      statusEl.className = 'status err';
      return;
    }
    if (resp.kind !== 'PARSE_RESUME') return;
    currentProfile = mergeProfile(readProfileFromForm(), resp.profile);
    renderProfileFields();
    status(statusEl, `✅ ${t('resume_drafted', locale)}`);
  } catch (e) {
    console.error('[Autofy] PARSE_RESUME threw:', e);
    statusEl.textContent = `❌ ${String(e)}`;
    statusEl.className = 'status err';
  } finally {
    btn.disabled = false;
    importBtn.disabled = false;
    btn.textContent = t('draft_profile', locale);
  }
}

async function generateProfileWithAI(): Promise<void> {
  const statusEl = $('resume-status');
  const buttons = ['parse-resume', 'import-resume', 'generate-profile'].map(
    (id) => $(id) as HTMLButtonElement,
  );
  const genBtn = $('generate-profile') as HTMLButtonElement;
  buttons.forEach((b) => (b.disabled = true));
  genBtn.textContent = '…';
  statusEl.textContent = t('resume_parsing', locale);
  statusEl.className = 'status';
  const language = prefs.fillLanguage !== 'auto' ? prefs.fillLanguage : locale;
  console.info('[Autofy] GENERATE_PROFILE start —', language);
  const started = Date.now();
  try {
    const resp = await sendToBackground({ kind: 'GENERATE_PROFILE', language });
    console.info('[Autofy] GENERATE_PROFILE done in', Date.now() - started, 'ms', resp.ok ? 'ok' : resp);
    if (!resp.ok) {
      statusEl.textContent = `❌ ${resp.message}`;
      statusEl.className = 'status err';
      return;
    }
    if (resp.kind !== 'GENERATE_PROFILE') return;
    currentProfile = resp.profile;
    renderProfileFields();
    status(statusEl, `✅ ${t('resume_drafted', locale)}`);
  } catch (e) {
    console.error('[Autofy] GENERATE_PROFILE threw:', e);
    statusEl.textContent = `❌ ${String(e)}`;
    statusEl.className = 'status err';
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    genBtn.textContent = t('generate_profile', locale);
  }
}

async function init(): Promise<void> {
  prefs = await getPrefs();
  locale = resolveLocale(prefs.uiLanguage);

  // Language selectors
  const uiLang = $('uiLang') as HTMLSelectElement;
  fillSelect(uiLang, [{ code: 'auto', name: t('auto', locale) }, ...LOCALES], prefs.uiLanguage);
  applyI18n();
  uiLang.addEventListener('change', async () => {
    prefs.uiLanguage = uiLang.value;
    await setPrefs(prefs);
    locale = resolveLocale(prefs.uiLanguage);
    // Re-label the "Auto" option in the new locale.
    uiLang.options[0].textContent = t('auto', locale);
    applyI18n();
    applyProviderUI(($('provider') as HTMLSelectElement).value as ProviderName);
    // Re-render profile field labels in the new locale (preserve edits).
    currentProfile = readProfileFromForm();
    renderProfileFields();
  });

  const fillLang = $('fillLang') as HTMLSelectElement;
  fillSelect(
    fillLang,
    FILL_LANGUAGES.map((l) => (l.code === 'auto' ? { code: 'auto', name: t('auto', locale) } : l)),
    prefs.fillLanguage,
  );
  fillLang.addEventListener('change', async () => {
    prefs.fillLanguage = fillLang.value;
    await setPrefs(prefs);
  });

  const fillGaps = $('fillGaps') as HTMLInputElement;
  fillGaps.checked = prefs.fillGaps;
  fillGaps.addEventListener('change', async () => {
    prefs.fillGaps = fillGaps.checked;
    await setPrefs(prefs);
  });

  // API config
  const config = await getApiConfig();
  const providerSel = $('provider') as HTMLSelectElement;
  const modelInput = $('model') as HTMLInputElement;
  if (config) {
    providerSel.value = config.provider;
    modelInput.value = config.model;
    ($('apiKey') as HTMLInputElement).value = config.apiKey;
    ($('endpoint') as HTMLInputElement).value = config.endpoint ?? '';
  } else {
    modelInput.value = SUGGESTED_MODEL.gemini;
  }
  function populateModelList(models: string[]): void {
    const list = $('model-list') as HTMLDataListElement;
    list.innerHTML = '';
    for (const m of [...new Set(models)]) {
      const o = document.createElement('option');
      o.value = m;
      list.appendChild(o);
    }
  }

  /** Silently fetch the live Ollama model list and merge it into the combobox. */
  async function autoLoadOllamaModels(): Promise<void> {
    const cfg = formConfig();
    if (cfg.provider !== 'ollama') return;
    const resp = await sendToBackground({ kind: 'TEST_CONNECTION', config: cfg });
    if (resp.ok && resp.kind === 'TEST_CONNECTION') {
      populateModelList([...resp.models, ...PROVIDER_MODELS.ollama]);
    }
  }

  applyProviderUI(providerSel.value as ProviderName);
  populateModelList(PROVIDER_MODELS[providerSel.value as ProviderName]);
  if (providerSel.value === 'ollama') void autoLoadOllamaModels();

  providerSel.addEventListener('change', () => {
    const p = providerSel.value as ProviderName;
    applyProviderUI(p);
    modelInput.value = SUGGESTED_MODEL[p]; // old model id won't work on a new provider
    populateModelList(PROVIDER_MODELS[p]);
    if (p === 'ollama') void autoLoadOllamaModels();
  });

  function formConfig(): ApiConfig {
    const provider = providerSel.value as ProviderName;
    return {
      provider,
      model: modelInput.value.trim() || SUGGESTED_MODEL[provider],
      apiKey: ($('apiKey') as HTMLInputElement).value.trim(),
      endpoint: ($('endpoint') as HTMLInputElement).value.trim() || undefined,
    };
  }

  $('save-api').addEventListener('click', async () => {
    const next = formConfig();
    if (!next.apiKey && !keyOptional(next.provider)) {
      status($('api-status'), t('popup_need_key', locale), false);
      return;
    }
    await setApiConfig(next);
    status($('api-status'), t('saved', locale));
  });

  // Test connection: confirm reachability and auto-load the model list.
  $('test-conn').addEventListener('click', async () => {
    const cfg = formConfig();
    status($('api-status'), t('test_testing', locale));
    const resp = await sendToBackground({ kind: 'TEST_CONNECTION', config: cfg });
    if (!resp.ok) {
      const hint = cfg.provider === 'ollama' ? ` — ${t('ollama_fail_hint', locale)}` : '';
      status($('api-status'), `❌ ${resp.message}${hint}`, false);
      return;
    }
    if (resp.kind !== 'TEST_CONNECTION') return;
    const list = $('model-list') as HTMLDataListElement;
    list.innerHTML = '';
    for (const m of resp.models) {
      const o = document.createElement('option');
      o.value = m;
      list.appendChild(o);
    }
    // Prefill the model if empty (prefer the suggested one if present).
    if (!modelInput.value.trim() && resp.models.length) {
      modelInput.value = resp.models.includes(SUGGESTED_MODEL[cfg.provider])
        ? SUGGESTED_MODEL[cfg.provider]
        : resp.models[0];
    }
    status($('api-status'), `✅ ${t('test_ok', locale)} · ${resp.models.length}`);
  });

  // Profile
  currentProfile = await getProfile();
  renderProfileFields();

  $('save-profile').addEventListener('click', async () => {
    currentProfile = readProfileFromForm();
    await setProfile(currentProfile);
    status($('profile-status'), t('saved', locale));
  });

  // Résumé: paste or import a text file
  $('parse-resume').addEventListener('click', () =>
    draftFromResume(($('resume') as HTMLTextAreaElement).value),
  );
  $('import-resume').addEventListener('click', () => ($('resume-file') as HTMLInputElement).click());
  $('generate-profile').addEventListener('click', () => void generateProfileWithAI());
  $('resume-file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    ($('resume') as HTMLTextAreaElement).value = text;
    await draftFromResume(text);
  });

  // Backup
  $('export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'autofy-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('import-btn').addEventListener('click', () => ($('import-file') as HTMLInputElement).click());
  $('import-file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      await importAll(data);
      status($('backup-status'), t('saved', locale));
      setTimeout(() => location.reload(), 800);
    } catch {
      status($('backup-status'), 'Invalid backup file.', false);
    }
  });
}

void init();
