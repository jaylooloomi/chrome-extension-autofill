// Fill button(s) + pre-submit review panel (spec §4.4, §5.3).
// Rendered inside a Shadow DOM so host-page CSS cannot break it. A Fill button
// is anchored to each detected form (or floats bottom-right when no form is
// found). The panel NEVER submits — it highlights, lists, and lets the user
// edit; captcha/verification fields are flagged "manual" and left blank.

import type { FieldSchema, FillResult, MappingResponse } from '../shared/types';
import { fillElement } from './fill-engine';

export interface ReviewContext {
  domain: string;
  formSignature: string;
}

/** A place to put a Fill button. `anchor` null => floating bottom-right. */
export interface FillTarget {
  root: ParentNode;
  anchor: HTMLElement | null;
}

export interface UIHandlers {
  onFill(root: ParentNode): void;
  onConfirm(values: Record<string, string | null>, ctx: ReviewContext): void;
}

const STYLES = `
:host { all: initial; }
.fab {
  position: fixed; z-index: 2147483646;
  width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
  background: #4f46e5; color: #fff; font: 600 13px/1 system-ui, sans-serif;
  box-shadow: 0 6px 20px rgba(79,70,229,.45); transition: transform .15s;
}
.fab:hover { transform: scale(1.06); }
.fab[disabled] { opacity: .6; cursor: default; }
.panel {
  position: fixed; right: 20px; bottom: 84px; z-index: 2147483647;
  width: 340px; max-height: 70vh; display: none; flex-direction: column;
  background: #fff; color: #111; border-radius: 14px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.25); font: 13px system-ui, sans-serif;
}
.panel.open { display: flex; }
.head { padding: 12px 14px; background: #4f46e5; color: #fff; font-weight: 600;
  display: flex; justify-content: space-between; align-items: center; }
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
  toast(message: string): void;
  setTargets(targets: FillTarget[]): void;
  showReview(
    fields: FieldSchema[],
    results: FillResult[],
    map: MappingResponse,
    ctx: ReviewContext,
    resolve: (ref: string) => Element | undefined,
    fake?: boolean,
  ): void;
}

function labelFor(f: FieldSchema): string {
  return f.label || f.name || f.placeholder || f.id || f.ref;
}

export function mountUI(handlers: UIHandlers): UIController {
  const host = document.createElement('div');
  host.id = 'autofy-root';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'panel';
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  shadow.append(panel, toastEl);
  (document.documentElement || document.body).appendChild(host);

  let buttons: { btn: HTMLButtonElement; anchor: HTMLElement | null }[] = [];
  let busy = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let rafScheduled = false;

  function place(item: { btn: HTMLButtonElement; anchor: HTMLElement | null }): void {
    const { btn, anchor } = item;
    btn.style.position = 'fixed';
    if (!anchor) {
      btn.style.right = '20px';
      btn.style.bottom = '20px';
      btn.style.left = 'auto';
      btn.style.top = 'auto';
      btn.style.display = 'block';
      return;
    }
    const r = anchor.getBoundingClientRect();
    const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.width === 0;
    btn.style.display = offscreen ? 'none' : 'block';
    const left = Math.min(window.innerWidth - 64, Math.max(8, r.right - 64));
    const top = Math.min(window.innerHeight - 60, Math.max(8, r.top + 8));
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function reposition(): void {
    for (const item of buttons) place(item);
  }

  function scheduleReposition(): void {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      reposition();
    });
  }
  window.addEventListener('scroll', scheduleReposition, { passive: true, capture: true });
  window.addEventListener('resize', scheduleReposition, { passive: true });

  function clearHighlights(resolve: (ref: string) => Element | undefined, refs: string[]) {
    for (const ref of refs) {
      const el = resolve(ref);
      if (el instanceof HTMLElement) el.style.outline = '';
    }
  }

  const controller: UIController = {
    setBusy(b) {
      busy = b;
      for (const { btn } of buttons) {
        btn.disabled = b;
        btn.textContent = b ? '…' : 'Fill';
      }
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
    },
    setTargets(targets) {
      for (const { btn } of buttons) btn.remove();
      buttons = targets.map((t) => {
        const btn = document.createElement('button');
        btn.className = 'fab';
        btn.textContent = busy ? '…' : 'Fill';
        btn.disabled = busy;
        btn.title = 'Autofy — fill this form';
        btn.addEventListener('click', () => handlers.onFill(t.root));
        shadow.appendChild(btn);
        return { btn, anchor: t.anchor };
      });
      reposition();
    },
    showReview(fields, results, map, ctx, resolve, fake = false) {
      const status = new Map(results.map((r) => [r.ref, r]));
      panel.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'head';
      const filledCount = results.filter((r) => r.status === 'filled').length;
      const sub = fake
        ? `⚠ SAMPLE DATA (no profile) · ${filledCount}/${fields.length} filled · review before submitting`
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
          // Don't learn captcha / do-not-fill fields.
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
