// Popup: shows setup status and a shortcut to settings.

import { getApiConfig, getProfile } from '../shared/storage';
import { listProfilePaths } from '../shared/profile-schema';

const stateEl = document.getElementById('state') as HTMLParagraphElement;

document.getElementById('open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function refresh(): Promise<void> {
  const [config, profile] = await Promise.all([getApiConfig(), getProfile()]);
  const ready = Boolean(config?.apiKey) || config?.provider === 'ollama';
  const fieldCount = listProfilePaths(profile).length;

  if (!ready) {
    stateEl.textContent = 'Add your API key in settings to start.';
    stateEl.className = 'state warn';
  } else if (fieldCount === 0) {
    stateEl.textContent = `Key set (${config!.provider}). Now fill in your profile.`;
    stateEl.className = 'state warn';
  } else {
    stateEl.textContent = `Ready · ${config!.provider} · ${fieldCount} profile fields.`;
    stateEl.className = 'state ok';
  }
}

void refresh();
