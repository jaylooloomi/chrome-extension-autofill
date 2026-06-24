// Popup: setup status, a shortcut to settings, and a per-site disable toggle.

import { getApiConfig, getProfile, getPrefs, setPrefs } from '../shared/storage';
import { listProfilePaths } from '../shared/profile-schema';
import { t, resolveLocale, type Locale } from '../shared/i18n';

const stateEl = document.getElementById('state') as HTMLParagraphElement;
const toggleBtn = document.getElementById('toggle-site') as HTMLButtonElement;

document.getElementById('open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function applyI18n(locale: Locale): void {
  document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!, locale);
  });
}

/** Active tab's hostname (http/https only); ok=false for chrome:// etc. */
async function currentSite(): Promise<{ host: string; ok: boolean }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';
    if (!/^https?:/i.test(url)) return { host: '', ok: false };
    return { host: new URL(url).hostname, ok: true };
  } catch {
    return { host: '', ok: false };
  }
}

async function refresh(): Promise<void> {
  const [config, profile, prefs] = await Promise.all([getApiConfig(), getProfile(), getPrefs()]);
  const locale = resolveLocale(prefs.uiLanguage);
  applyI18n(locale);

  const ready = Boolean(config?.apiKey) || config?.provider === 'ollama';
  const fieldCount = listProfilePaths(profile).length;
  if (!ready) {
    stateEl.textContent = t('popup_need_key', locale);
    stateEl.className = 'state warn';
  } else if (fieldCount === 0) {
    stateEl.textContent = t('popup_need_profile', locale);
    stateEl.className = 'state warn';
  } else {
    stateEl.textContent = `${t('popup_ready', locale)} · ${config!.provider} · ${fieldCount}`;
    stateEl.className = 'state ok';
  }

  // Per-site disable toggle
  const { host, ok } = await currentSite();
  if (!ok) {
    toggleBtn.hidden = true;
    return;
  }
  const disabled = prefs.disabledSites.includes(host);
  toggleBtn.hidden = false;
  toggleBtn.title = host;
  toggleBtn.textContent = disabled ? t('popup_enable_site', locale) : t('popup_disable_site', locale);
  toggleBtn.onclick = async () => {
    const p = await getPrefs();
    const set = new Set(p.disabledSites);
    if (set.has(host)) set.delete(host);
    else set.add(host);
    p.disabledSites = [...set];
    await setPrefs(p);
    void refresh();
  };
}

void refresh();
