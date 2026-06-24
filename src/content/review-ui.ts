// Fill button + pre-submit review panel (spec §4.4, §5.3).
//
// Two button modes:
//  - inline: when a submit button is detected, a real in-flow button is injected
//    next to it (its own Shadow DOM keeps styling isolated). It scrolls with the
//    page like part of the form — not a floating overlay.
//  - floating: fallback when no submit button is found — a fixed, draggable FAB.
// The review panel + toast are always fixed overlays in a top-level host.
// The panel NEVER submits; captcha fields are flagged "manual" and left blank.

import type { FieldSchema, FillResult, MappingResponse } from '../shared/types';
import { fillElement } from './fill-engine';

export interface ReviewContext {
  domain: string;
  formSignature: string;
}

/** Top-left of the form's field region (viewport coords) for the floating FAB. */
export interface Anchor {
  left: number;
  top: number;
}

export interface UIHandlers {
  onFill(): void;
  onConfirm(values: Record<string, string | null>, ctx: ReviewContext): void;
}

export interface UIOptions {
  /** Localized label for the Fill button (e.g. "AutoFill" / "自動填寫"). */
  fillLabel: string;
  /** Field-region top-left for positioning the floating FAB, or null. */
  getFieldAnchor?: () => Anchor | null;
}

const STYLES = `
:host { all: initial; }
.fab {
  border: none; cursor: pointer; padding: 11px 20px; border-radius: 24px;
  background: #4f46e5; color: #fff; font: 600 14px/1 system-ui, sans-serif;
  white-space: nowrap; user-select: none;
}
.fab:hover { filter: brightness(1.05); }
.fab[disabled] { opacity: .7; cursor: default; }
.fab.floating {
  position: fixed; left: 20px; top: 20px; z-index: 2147483646;
  cursor: grab; touch-action: none; box-shadow: 0 6px 20px rgba(79,70,229,.45);
}
.fab.floating.dragging { cursor: grabbing; box-shadow: 0 10px 28px rgba(79,70,229,.55); }
.fab.inline { box-shadow: 0 2px 8px rgba(79,70,229,.35); vertical-align: middle; }
.panel {
  position: fixed; right: 20px; bottom: 84px; z-index: 2147483647;
  width: 340px; max-height: 70vh; display: none; flex-direction: column;
  background: #fff; color: #111; border-radius: 14px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.25); font: 13px system-ui, sans-serif;
}
.panel.open { display: flex; }
.head { padding: 12px 14px; background: #4f46e5; color: #fff; font-weight: 600; }
.head .sub { font-weight: 400; opacity: .85; font-size: 11px; }
.rows { overflow-y: auto; padding: 6px 0; }
.row { padding: 7px 14px; border-bottom: 1px solid #f0f0f0; }
.row .lbl { font-size: 11px; color: #555; margin-bottom: 3px; display: flex; gap: 6px;
  justify-content: space-between; align-items: center; }
.row input { width: 100%; box-sizing: border-box; padding: 5px 7px; font: 13px system-ui;
  border: 1px solid #ddd; border-radius: 6px; }
.badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; white-space: nowrap; }
.badge.filled { background: #dcfce7; color: #166534; }
.badge.skipped { background: #f3f4f6; color: #6b7280; }
.badge.error { background: #fee2e2; color: #991b1b; }
.badge.manual { background: #fef3c7; color: #92400e; }
.foot { padding: 10px 14px; display: flex; gap: 8px; border-top: 1px solid #eee; }
.foot button { flex: 1; padding: 8px; border-radius: 8px; border: none; cursor: pointer;
  font: 600 13px system-ui; }
.confirm { background: #4f46e5; color: #fff; }
.close { background: #f3f4f6; color: #333; }
.toast { position: fixed; right: 20px; bottom: 84px; z-index: 2147483647;
  background: #111; color: #fff; padding: 10px 14px; border-radius: 10px;
  font: 13px system-ui; max-width: 300px; display: none; }
.toast.show { display: block; }
`;

const HL_FILLED = '2px solid #22c55e';
const HL_ERROR = '2px solid #ef4444';
const HL_MANUAL = '2px dashed #f59e0b';

export interface UIController {
  setBusy(busy: boolean): void;
  setVisible(visible: boolean): void;
  /** Pass the detected submit button (inline mode) or null (floating mode). */
  setSubmitTarget(el: HTMLElement | null): void;
  toast(message: string): void;
  showReview(
    fields: FieldSchema[],
    results: FillResult[],
    map: MappingResponse,
    ctx: ReviewContext,
    resolve: (ref: string) => Element | undefined,
    sample?: boolean,
  ): void;
}

function labelFor(f: FieldSchema): string {
  return f.label || f.name || f.placeholder || f.id || f.ref;
}

function shadowWithStyles(host: HTMLElement): ShadowRoot {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);
  return shadow;
}

export function mountUI(handlers: UIHandlers, opts: UIOptions): UIController {
  let busy = false;
  let visible = false;
  let submitEl: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // Top-level host: panel + toast (fixed overlays) + the floating FAB.
  const mainHost = document.createElement('div');
  mainHost.id = 'autofy-root';
  const mainShadow = shadowWithStyles(mainHost);
  const floatingFab = makeFab('floating');
  const panel = document.createElement('div');
  panel.className = 'panel';
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  mainShadow.append(floatingFab, panel, toastEl);
  (document.documentElement || document.body).appendChild(mainHost);

  // Inline host: injected into the page next to the submit button on demand.
  const inlineHost = document.createElement('span');
  inlineHost.id = 'autofy-inline';
  inlineHost.style.cssText = 'display:inline-block;vertical-align:middle;margin:0 8px;';
  const inlineShadow = shadowWithStyles(inlineHost);
  const inlineFab = makeFab('inline');
  inlineShadow.appendChild(inlineFab);

  function makeFab(kind: 'floating' | 'inline'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `fab ${kind}`;
    btn.textContent = opts.fillLabel;
    btn.title = 'Autofy';
    if (kind === 'inline') {
      btn.addEventListener('click', () => {
        if (!busy) handlers.onFill();
      });
    }
    return btn;
  }

  function setLabel(): void {
    const text = busy ? '…' : opts.fillLabel;
    floatingFab.textContent = text;
    inlineFab.textContent = text;
    floatingFab.disabled = busy;
    inlineFab.disabled = busy;
  }

  // ---- floating placement + drag ----
  function placeFloating(): void {
    if (customPos) {
      applyXY(customPos.left, customPos.top);
      return;
    }
    const a = opts.getFieldAnchor?.() ?? null;
    const w = floatingFab.offsetWidth || 100;
    const h = floatingFab.offsetHeight || 40;
    if (a) applyXY(a.left, a.top - h - 10);
    else applyXY(window.innerWidth - w - 20, window.innerHeight - h - 20);
  }
  function applyXY(left: number, top: number): void {
    const w = floatingFab.offsetWidth || 100;
    const h = floatingFab.offsetHeight || 40;
    const x = Math.min(window.innerWidth - w - 4, Math.max(4, left));
    const y = Math.min(window.innerHeight - h - 4, Math.max(4, top));
    floatingFab.style.left = `${Math.round(x)}px`;
    floatingFab.style.top = `${Math.round(y)}px`;
  }
  let raf = false;
  function scheduleFloat(): void {
    if (raf || floatingFab.style.display === 'none') return;
    raf = true;
    requestAnimationFrame(() => {
      raf = false;
      placeFloating();
    });
  }
  window.addEventListener('scroll', scheduleFloat, { passive: true, capture: true });
  window.addEventListener('resize', scheduleFloat, { passive: true });

  let customPos: { left: number; top: number } | null = null;
  let dragging = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  floatingFab.addEventListener('pointerdown', (e) => {
    if (busy) return;
    dragging = true;
    moved = false;
    const r = floatingFab.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    sx = e.clientX;
    sy = e.clientY;
    floatingFab.classList.add('dragging');
    floatingFab.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  floatingFab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      moved = true;
      customPos = { left: ox + dx, top: oy + dy };
      applyXY(customPos.left, customPos.top);
    }
  });
  floatingFab.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    floatingFab.classList.remove('dragging');
    try {
      floatingFab.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!moved && !busy) handlers.onFill();
  });

  // ---- mode rendering ----
  function render(): void {
    if (!visible) {
      floatingFab.style.display = 'none';
      inlineHost.remove();
      return;
    }
    if (submitEl?.isConnected && submitEl.parentElement) {
      // inline mode: insert before the submit button (if not already there)
      floatingFab.style.display = 'none';
      if (inlineHost.nextSibling !== submitEl || inlineHost.parentElement !== submitEl.parentElement) {
        submitEl.parentElement.insertBefore(inlineHost, submitEl);
      }
    } else {
      // floating mode
      inlineHost.remove();
      floatingFab.style.display = '';
      scheduleFloat();
    }
  }

  function clearHighlights(resolve: (ref: string) => Element | undefined, refs: string[]) {
    for (const ref of refs) {
      const el = resolve(ref);
      if (el instanceof HTMLElement) el.style.outline = '';
    }
  }

  const controller: UIController = {
    setBusy(b) {
      busy = b;
      setLabel();
    },
    setVisible(v) {
      visible = v;
      render();
    },
    setSubmitTarget(el) {
      submitEl = el;
      render();
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
    },
    showReview(fields, results, map, ctx, resolve, sample = false) {
      const status = new Map(results.map((r) => [r.ref, r]));
      panel.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'head';
      const filledCount = results.filter((r) => r.status === 'filled').length;
      const sub = sample
        ? `⚠ includes AI sample data · ${filledCount}/${fields.length} filled · review before submitting`
        : `${filledCount}/${fields.length} filled · nothing is sent automatically`;
      head.innerHTML = `<span>Review &amp; submit<br><span class="sub">${sub}</span></span>`;
      panel.appendChild(head);

      const rows = document.createElement('div');
      rows.className = 'rows';
      const inputs: { field: FieldSchema; input: HTMLInputElement }[] = [];

      for (const f of fields) {
        const st = status.get(f.ref)?.status ?? 'skipped';
        const manual = Boolean(f.noFill);
        const el = resolve(f.ref);
        if (el instanceof HTMLElement) {
          el.style.outline = manual
            ? HL_MANUAL
            : st === 'error'
              ? HL_ERROR
              : st === 'filled'
                ? HL_FILLED
                : '';
        }
        const row = document.createElement('div');
        row.className = 'row';
        const lbl = document.createElement('div');
        lbl.className = 'lbl';
        const badgeClass = manual ? 'manual' : st;
        const badgeText = manual ? 'manual ✋' : st;
        lbl.innerHTML = `<span>${escapeHtml(labelFor(f))}</span><span class="badge ${badgeClass}">${badgeText}</span>`;
        const input = document.createElement('input');
        input.value = map[f.ref] ?? '';
        if (manual) input.placeholder = 'enter this yourself (e.g. captcha)';
        row.append(lbl, input);
        rows.appendChild(row);
        inputs.push({ field: f, input });
      }
      panel.appendChild(rows);

      const foot = document.createElement('div');
      foot.className = 'foot';
      const confirm = document.createElement('button');
      confirm.className = 'confirm';
      confirm.textContent = 'Apply edits & remember';
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = 'Close';
      foot.append(confirm, close);
      panel.appendChild(foot);
      panel.classList.add('open');

      const refs = fields.map((f) => f.ref);
      close.addEventListener('click', () => {
        panel.classList.remove('open');
        clearHighlights(resolve, refs);
      });
      confirm.addEventListener('click', () => {
        const values: Record<string, string | null> = {};
        for (const { field, input } of inputs) {
          const v = input.value;
          const el = resolve(field.ref);
          if (el && v !== '') fillElement(el, v);
          if (!field.noFill) values[field.signature] = v === '' ? null : v;
        }
        handlers.onConfirm(values, ctx);
        panel.classList.remove('open');
        clearHighlights(resolve, refs);
        controller.toast('Saved. Autofy will remember this form.');
      });
    },
  };

  return controller;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
