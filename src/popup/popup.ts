// Popup: shows setup status and a shortcut to settings (i18n-aware).

import { getApiConfig, getProfile, getPrefs } from '../shared/storage';
import { listProfilePaths } from '../shared/profile-schema';
import { t, resolveLocale, type Locale } from '../shared/i18n';

const stateEl = document.getElementById('state') as HTMLParagraphElement;

document.getElementById('open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function applyI18n(locale: Locale): void {
  document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!, locale);
  });
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
}

void refresh();
