// Content script bootstrap: a Fill button anchored next to the form's submit
// button when one is detected (else above the field region, else floating),
// driving the scan -> map -> fill -> review flow (spec §6).

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

async function bootstrap(): Promise<void> {
  const prefs = await getPrefs();
  const locale = resolveLocale(prefs.uiLanguage);

  // Cached anchor target (the form's submit button), refreshed on DOM changes
  // rather than recomputed every scroll frame.
  let submitEl: HTMLElement | null = findSubmitButton(document);

  function getAnchor(): Anchor | null {
    if (submitEl?.isConnected) {
      const r = submitEl.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, place: 'left' };
      }
    }
    // Fallback: top-left of the bounding box of all fillable fields.
    let minLeft = Infinity;
    let minTop = Infinity;
    for (const el of visibleFillable()) {
      const r = el.getBoundingClientRect();
      minLeft = Math.min(minLeft, r.left);
      minTop = Math.min(minTop, r.top);
    }
    if (!Number.isFinite(minLeft)) return null;
    return { rect: { left: minLeft, top: minTop, right: minLeft, bottom: minTop }, place: 'above' };
  }

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
    { fillLabel: t('fab_fill', locale), getAnchor },
  );

  // Show the button only when there are fillable fields; re-detect the submit
  // button and visibility on DOM changes (SPA-rendered forms).
  function refresh(): void {
    submitEl = findSubmitButton(document);
    ui.setVisible(visibleFillable().length > 0);
  }
  refresh();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });
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
