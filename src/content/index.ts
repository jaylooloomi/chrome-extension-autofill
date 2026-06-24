// Content script bootstrap: a floating, draggable Fill button that scans the
// page and runs the scan -> map -> fill -> review flow (spec §6). Heavy work
// only happens on click.

import { scanFields } from './detector';
import { resolve } from './refs';
import { fillFields } from './fill-engine';
import { sendToBackground } from '../shared/messages';
import { getPrefs } from '../shared/storage';
import { resolveLocale, t } from '../shared/i18n';
import { mountUI, type ReviewContext, type UIController } from './review-ui';

if (!(window as unknown as { __autofy?: boolean }).__autofy) {
  (window as unknown as { __autofy?: boolean }).__autofy = true;
  void bootstrap();
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
    { fillLabel: t('fab_fill', locale) },
  );
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
  ui.showReview(fields, results, resp.map, ctx, resolve, resp.fake);

  // Timing breakdown — see the page console (the background/service-worker
  // console has the per-stage backend timings).
  console.info('[Autofy] fill timings (ms):', {
    scan: Math.round(tScan - t0),
    roundtrip_incl_AI: Math.round(tResp - tScan),
    fill: Math.round(tFill - tResp),
    total: Math.round(tFill - t0),
    fields: fields.length,
    fromCache: resp.fromCache,
    fake: resp.fake,
  });

  if (resp.fake) ui.toast('No profile set — filled with sample data. Review before submitting.');
  else if (resp.fromCache) ui.toast('Filled from cache (no AI call).');
}
