// Content script bootstrap: injects the floating button and orchestrates the
// scan -> map -> fill -> review flow (spec §6). Runs on every page; the heavy
// work only happens when the user clicks Fill.

import { scanFields } from './detector';
import { resolve } from './refs';
import { fillFields } from './fill-engine';
import { sendToBackground } from '../shared/messages';
import { mountUI, type ReviewContext } from './review-ui';

// Avoid double-injection (e.g. SPA re-entry).
if (!(window as unknown as { __autofy?: boolean }).__autofy) {
  (window as unknown as { __autofy?: boolean }).__autofy = true;

  const ui = mountUI({
    onFill: runFill,
    onConfirm: (values, ctx) => {
      void sendToBackground({
        kind: 'RECORD_CORRECTIONS',
        domain: ctx.domain,
        formSignature: ctx.formSignature,
        values,
      });
    },
  });

  async function runFill() {
    const { fields, formSignature } = scanFields(document);
    if (fields.length === 0) {
      ui.toast('Autofy: no fillable fields found on this page.');
      return;
    }
    ui.setBusy(true);
    const resp = await sendToBackground({
      kind: 'MAP_FIELDS',
      fields,
      formSignature,
      url: location.href,
    });
    ui.setBusy(false);

    if (!resp.ok) {
      ui.toast(`Autofy: ${resp.message}`);
      return;
    }
    if (resp.kind !== 'MAP_FIELDS') return;

    const results = fillFields(resp.map, resolve);
    const ctx: ReviewContext = { domain: location.hostname, formSignature };
    ui.showReview(fields, results, resp.map, ctx, resolve);
    if (resp.fromCache) ui.toast('Filled from cache (no AI call).');
  }
}
