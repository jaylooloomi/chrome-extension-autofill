// Field detection: scan the DOM and reduce each fillable field to a FieldSchema
// (spec §4.1, §5.1). Label resolution follows the signal priority:
//   <label for> -> aria-label -> aria-labelledby -> wrapping <label>
// with placeholder / name / id kept as separate signals.

import type { FieldSchema, FieldTag } from '../shared/types';
import { register, reset } from './refs';

export interface ScanResult {
  fields: FieldSchema[];
  formSignature: string;
}

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

export function isFillable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled') || (el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !SKIP_INPUT_TYPES.has(type);
  }
  if (tag === 'select' || tag === 'textarea') return true;
  if (isContentEditable(el)) return true;
  return false;
}

function isContentEditable(el: Element): boolean {
  const ce = el.getAttribute('contenteditable');
  return ce === '' || ce === 'true';
}

function escapeAttr(value: string): string {
  // Minimal CSS attribute-value escape (jsdom lacks CSS.escape).
  return value.replace(/["\\]/g, '\\$&');
}

function textOf(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

export function getLabel(el: HTMLElement): string | undefined {
  const id = el.getAttribute('id');
  if (id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${escapeAttr(id)}"]`);
    const t = textOf(forLabel);
    if (t) return t;
  }
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby
      .split(/\s+/)
      .map((rid) => textOf(el.ownerDocument.getElementById(rid)))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    // Strip the control's own text so we get just the label copy.
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input,select,textarea').forEach((n) => n.remove());
    const t = textOf(clone);
    if (t) return t;
  }

  // Fallback for the common <div>Label</div><input> pattern (no <label> tag):
  // use the immediately preceding non-control sibling's short text.
  const prev = el.previousElementSibling;
  if (prev && !/^(input|select|textarea|label)$/i.test(prev.tagName)) {
    const t = textOf(prev)?.replace(/^[*\s]+/, '');
    if (t && t.length <= 40) return t;
  }
  return undefined;
}

export function getNearbyText(el: HTMLElement): string | undefined {
  const legend = el.closest('fieldset')?.querySelector('legend');
  const t = textOf(legend);
  if (t) return t;

  // Walk up looking for a preceding heading within the same section.
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (/^h[1-6]$/i.test(sib.tagName)) return textOf(sib);
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}

function tagOf(el: HTMLElement): FieldTag {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (isContentEditable(el)) return 'contenteditable';
  return 'input';
}

function typeOf(el: HTMLElement, tag: FieldTag): string {
  if (tag === 'input') return ((el as HTMLInputElement).type || 'text').toLowerCase();
  return tag;
}

function optionsOf(el: HTMLElement, tag: FieldTag, type: string): FieldSchema['options'] {
  if (tag === 'select') {
    return Array.from((el as HTMLSelectElement).options).map((o) => ({
      value: o.value,
      text: (o.textContent || '').trim(),
    }));
  }
  if (tag === 'input' && type === 'radio') {
    const name = (el as HTMLInputElement).name;
    if (!name) return null;
    const group = el.ownerDocument.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${escapeAttr(name)}"]`,
    );
    return Array.from(group).map((r) => ({
      value: r.value,
      text: getLabel(r) || r.value,
    }));
  }
  return null;
}

function normalizeToken(s: string | undefined): string {
  if (!s) return '';
  // Lowercase and drop separators/punctuation so 'First Name', 'first_name',
  // and 'firstName' collapse to the same token. We deliberately KEEP digits so
  // semantically distinct fields like address_line_1 / _2 stay separate.
  return s.toLowerCase().replace(/[\s_\-]+/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function fieldSignature(parts: {
  name?: string;
  id?: string;
  label?: string;
  type: string;
}): string {
  const token =
    normalizeToken(parts.name) ||
    normalizeToken(parts.id) ||
    normalizeToken(parts.label) ||
    'field';
  return `${token}:${parts.type}`;
}

// Captcha / verification-code fields must never be auto-filled: the value lives
// in an image the user reads, so any filled value is wrong and may trip anti-bot.
const CAPTCHA_RE =
  /captcha|驗證碼|验证码|verif(?:y|ication)\s*code|security\s*code|圖形驗證|圖片驗證|認證碼|確認碼|人機|i'?m not a robot/i;

export function isCaptchaField(parts: {
  label?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  nearbyText?: string;
}): boolean {
  const hay = [parts.label, parts.name, parts.id, parts.placeholder, parts.nearbyText]
    .filter(Boolean)
    .join(' ');
  return CAPTCHA_RE.test(hay);
}

function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function computeFormSignature(fields: FieldSchema[]): string {
  const sigs = fields.map((f) => f.signature).sort();
  return `${fields.length}-${hash(sigs.join('|'))}`;
}

/** Scan a root for fillable fields, returning schemas + a form signature.
 *  Radio inputs are collapsed into one schema per name group. */
export function scanFields(root: ParentNode = document): ScanResult {
  reset();
  const candidates = root.querySelectorAll<HTMLElement>(
    'input, select, textarea, [contenteditable=""], [contenteditable="true"]',
  );
  const fields: FieldSchema[] = [];
  const seenRadioGroups = new Set<string>();

  for (const el of Array.from(candidates)) {
    if (!isFillable(el)) continue;
    const tag = tagOf(el);
    const type = typeOf(el, tag);

    if (tag === 'input' && type === 'radio') {
      const name = (el as HTMLInputElement).name;
      const groupKey = name || `__radio_${fields.length}`;
      if (seenRadioGroups.has(groupKey)) continue;
      seenRadioGroups.add(groupKey);
    }

    const name = (el as HTMLInputElement).name || undefined;
    const id = el.getAttribute('id') || undefined;
    const label = getLabel(el);
    const placeholder = (el as HTMLInputElement).placeholder || undefined;
    const required =
      el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';

    const nearbyText = getNearbyText(el);
    const ref = register(el);
    fields.push({
      ref,
      tag,
      type,
      label,
      placeholder,
      name,
      id,
      nearbyText,
      required,
      options: optionsOf(el, tag, type),
      noFill: isCaptchaField({ label, name, id, placeholder, nearbyText }) || undefined,
      signature: fieldSignature({ name, id, label, type }),
    });
  }

  return { fields, formSignature: computeFormSignature(fields) };
}

/** Find <form> elements that contain at least one fillable field. Used to
 *  anchor the Fill button to the relevant form on the page (pure DOM). */
export function findFormContainers(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll('form')).filter((f) =>
    Array.from(f.querySelectorAll('input, select, textarea, [contenteditable]')).some(isFillable),
  );
}

// Words that mark a form's submit / primary action button (en + zh + ja).
const SUBMIT_RE =
  /submit|apply|send|register|sign\s?up|continue|next|book|reserve|confirm|送出|傳送|送信|提交|確定|确定|確認|确认|立即預約|預約|预约|報名|报名|註冊|注册|申請|申请|下一步|寄出|发送|登録|送信/i;

function buttonText(el: Element): string {
  return `${el.textContent ?? ''} ${(el as HTMLInputElement).value ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
}

/** Best-effort detection of a form's submit / primary action button so the Fill
 *  button can sit next to it. Pure DOM heuristics (no AI): prefer real submit
 *  inputs, else buttons whose text matches a submit word; pick the lowest one
 *  on the page (submit buttons sit at the bottom). Returns null if none fit. */
export function findSubmitButton(root: ParentNode = document): HTMLElement | null {
  const all = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="button"], [role="button"]',
    ),
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const submits = all.filter(
    (el) => (el as HTMLInputElement).type === 'submit' || el.getAttribute('type') === 'submit',
  );
  const byText = all.filter((el) => SUBMIT_RE.test(buttonText(el)));
  const pool = submits.length ? submits : byText;
  if (!pool.length) return null;

  // Lowest on the page wins (the action button is usually at the bottom).
  return pool.reduce((a, b) =>
    b.getBoundingClientRect().top >= a.getBoundingClientRect().top ? b : a,
  );
}
