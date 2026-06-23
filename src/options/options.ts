// Options page logic: API config, résumé-paste profile draft, profile editing,
// and backup import/export (spec §5.7).

import type { ApiConfig, Profile, ProviderName } from '../shared/types';
import {
  getApiConfig,
  setApiConfig,
  getProfile,
  setProfile,
  exportAll,
  importAll,
} from '../shared/storage';
import { sendToBackground } from '../shared/messages';
import { SCALAR_FIELDS, getByPath, setByPath } from '../shared/profile-schema';

const SUGGESTED_MODEL: Record<ProviderName, string> = {
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

const KEY_HELP: Record<ProviderName, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let currentProfile: Profile = {};

function status(el: HTMLElement, msg: string, ok = true): void {
  el.textContent = msg;
  el.className = `status ${ok ? 'ok' : 'err'}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 4000);
}

function renderProfileFields(): void {
  const container = $('profile-fields');
  container.innerHTML = '';
  for (const f of SCALAR_FIELDS) {
    const label = document.createElement('label');
    if (f.type === 'textarea') label.className = 'full';
    label.textContent = f.label;
    const input =
      f.type === 'textarea'
        ? document.createElement('textarea')
        : document.createElement('input');
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
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '#profile-fields [data-path]',
  );
  inputs.forEach((input) => {
    const path = input.dataset.path!;
    next = setByPath(next, path, input.value.trim());
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

function updateKeyHelp(provider: ProviderName): void {
  ($('key-help') as HTMLAnchorElement).href = KEY_HELP[provider];
}

async function init(): Promise<void> {
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
  updateKeyHelp(providerSel.value as ProviderName);

  providerSel.addEventListener('change', () => {
    const p = providerSel.value as ProviderName;
    updateKeyHelp(p);
    if (!modelInput.value.trim()) modelInput.value = SUGGESTED_MODEL[p];
  });

  $('save-api').addEventListener('click', async () => {
    const next: ApiConfig = {
      provider: providerSel.value as ProviderName,
      model: modelInput.value.trim() || SUGGESTED_MODEL[providerSel.value as ProviderName],
      apiKey: ($('apiKey') as HTMLInputElement).value.trim(),
      endpoint: ($('endpoint') as HTMLInputElement).value.trim() || undefined,
    };
    if (!next.apiKey) {
      status($('api-status'), 'Please paste an API key.', false);
      return;
    }
    await setApiConfig(next);
    status($('api-status'), 'Saved.');
  });

  // Profile
  currentProfile = await getProfile();
  renderProfileFields();

  $('save-profile').addEventListener('click', async () => {
    currentProfile = readProfileFromForm();
    await setProfile(currentProfile);
    status($('profile-status'), 'Profile saved.');
  });

  // Résumé paste
  $('parse-resume').addEventListener('click', async () => {
    const text = ($('resume') as HTMLTextAreaElement).value.trim();
    if (!text) {
      status($('resume-status'), 'Paste some résumé text first.', false);
      return;
    }
    status($('resume-status'), 'Parsing with AI…');
    const resp = await sendToBackground({ kind: 'PARSE_RESUME', text });
    if (!resp.ok) {
      status($('resume-status'), `Error: ${resp.message}`, false);
      return;
    }
    if (resp.kind !== 'PARSE_RESUME') return;
    currentProfile = mergeProfile(readProfileFromForm(), resp.profile);
    renderProfileFields();
    status($('resume-status'), 'Draft ready — review and save below.');
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
      status($('backup-status'), 'Imported. Reloading…');
      setTimeout(() => location.reload(), 800);
    } catch {
      status($('backup-status'), 'Invalid backup file.', false);
    }
  });
}

void init();
