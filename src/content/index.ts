// Content script bootstrap: injects a Fill button beside the form's submit
// button when one is detected (in-flow, scrolls with the page), or a floating
// draggable button otherwise. Drives scan -> map -> fill -> review (spec §6).

import { scanFields, isFillable, findSubmitButton } from './detector';
import { resolve } from './refs';
import { fillFields } from './fill-engine';
import { sendToBackground } from '../shared/messages';
import { getPrefs } from '../shared/storage';
import { resolveLocale, t } from '../shared/i18n';
import { mountUI, type Anchor, type ReviewContext, type UIController } from './review-ui';

if (!(window as unknown as { __autofy?: boolean }).__autofy) {
  (window as unknown as { __autofy?: boolean }).__autofy = true;
  void bootstrap();
}

/** Visible fillable fields on the page (excludes hidden / zero-size). */
function visibleFillable(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('input, select, textarea, [contenteditable]'),
  ).filter((el) => {
    if (!isFillable(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

/** Top-left of the bounding box of all fillable fields (for the floating FAB). */
function fieldAnchor(): Anchor | null {
  let minLeft = Infinity;
  let minTop = Infinity;
  for (const el of visibleFillable()) {
    const r = el.getBoundingClientRect();
    minLeft = Math.min(minLeft, r.left);
    minTop = Math.min(minTop, r.top);
  }
  return Number.isFinite(minLeft) ? { left: minLeft, top: minTop } : null;
}

async function bootstrap(): Promise<void> {
  const prefs = await getPrefs();
  const locale = resolveLocale(prefs.uiLanguage);

  const ui: UIController = mountUI(
    {
      onFill: () => void runFill(ui),
      onConfirm: (values, ctx) => {
        void sendToBackground({
          kind: 'RECORD_CORRECTIONS',
          domain: ctx.domain,
          formSignature: ctx.formSignature,
          values,
        });
      },
    },
    { fillLabel: t('fab_fill', locale), getFieldAnchor: fieldAnchor },
  );

  // Per-site disable: hide the button entirely on hostnames the user opted out.
  let siteDisabled = (prefs.disabledSites ?? []).includes(location.hostname);

  // Re-detect the submit button + field presence on load and on DOM changes.
  function refresh(): void {
    const show = !siteDisabled && visibleFillable().length > 0;
    ui.setVisible(show);
    ui.setSubmitTarget(show ? findSubmitButton(document) : null);
  }
  refresh();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // React live when the user toggles this site in the popup (no reload needed).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.prefs) return;
    const next = changes.prefs.newValue as { disabledSites?: string[] } | undefined;
    siteDisabled = (next?.disabledSites ?? []).includes(location.hostname);
    refresh();
  });
}

async function runFill(ui: UIController): Promise<void> {
  const t0 = performance.now();
  const { fields, formSignature } = scanFields(document);
  const tScan = performance.now();
  if (fields.length === 0) {
    ui.toast('Autofy: no fillable fields found here.');
    return;
  }
  ui.setBusy(true);
  const resp = await sendToBackground({
    kind: 'MAP_FIELDS',
    fields,
    formSignature,
    url: location.href,
    pageLang: document.documentElement.lang || navigator.language || 'en',
  });
  const tResp = performance.now();
  ui.setBusy(false);

  if (!resp.ok) {
    console.warn('[Autofy] MAP_FIELDS failed:', resp.code, resp.message, `(${Math.round(tResp - tScan)}ms)`);
    ui.toast(`Autofy: ${resp.message}`);
    return;
  }
  if (resp.kind !== 'MAP_FIELDS') return;

  const results = fillFields(resp.map, resolve);
  const tFill = performance.now();
  const ctx: ReviewContext = { domain: location.hostname, formSignature };
  ui.showReview(fields, results, resp.map, ctx, resolve, resp.sample);

  console.info('[Autofy] fill timings (ms):', {
    scan: Math.round(tScan - t0),
    roundtrip_incl_AI: Math.round(tResp - tScan),
    fill: Math.round(tFill - tResp),
    total: Math.round(tFill - t0),
    fields: fields.length,
    fromCache: resp.fromCache,
    sample: resp.sample,
  });

  if (resp.sample) ui.toast('Filled (gaps use AI sample data) — review before submitting.');
  else if (resp.fromCache) ui.toast('Filled from cache (no AI call).');
}
