// Content script bootstrap: anchors a Fill button to each detected form (or a
// floating one when there is no form) and orchestrates the
// scan -> map -> fill -> review flow (spec §6). Heavy work only on click.

import { scanFields, findFormContainers } from './detector';
import { resolve } from './refs';
import { fillFields } from './fill-engine';
import { sendToBackground } from '../shared/messages';
import { mountUI, type FillTarget, type ReviewContext } from './review-ui';

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

  function computeTargets(): FillTarget[] {
    const forms = findFormContainers(document);
    return forms.length
      ? forms.map((f) => ({ root: f, anchor: f }))
      : [{ root: document, anchor: null }];
  }

  /** A cheap signature of the current form set, to skip needless re-renders. */
  function targetsKey(targets: FillTarget[]): string {
    return targets.map((t, i) => (t.anchor ? t.anchor.id || `f${i}` : 'body')).join('|');
  }

  let lastKey = '';
  function refresh(): void {
    const targets = computeTargets();
    const key = targetsKey(targets);
    if (key === lastKey) return;
    lastKey = key;
    ui.setTargets(targets);
  }

  refresh();

  // Re-detect forms on SPA DOM changes (debounced). Our own button lives in a
  // shadow root, so it doesn't trigger this observer.
  let debounce: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 800);
  }).observe(document.documentElement, { childList: true, subtree: true });

  async function runFill(root: ParentNode) {
    const { fields, formSignature } = scanFields(root);
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
    ui.setBusy(false);

    if (!resp.ok) {
      ui.toast(`Autofy: ${resp.message}`);
      return;
    }
    if (resp.kind !== 'MAP_FIELDS') return;

    const results = fillFields(resp.map, resolve);
    const ctx: ReviewContext = { domain: location.hostname, formSignature };
    ui.showReview(fields, results, resp.map, ctx, resolve, resp.fake);
    if (resp.fake) ui.toast('No profile set — filled with sample data. Review before submitting.');
    else if (resp.fromCache) ui.toast('Filled from cache (no AI call).');
  }
}
