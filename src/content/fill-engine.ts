// Robust fill engine (spec §4.3, §5.2). This layer decides whether Autofy
// actually beats the incumbents' "漏填" problem: it sets values the way each
// field type and each framework expects, and reports — never silently skips —
// anything it cannot fill.

import type { FillResult, MappingResponse } from '../shared/types';

/** Find the real `value` setter up the prototype chain. Setting `.value`
 *  directly on React/Vue-controlled inputs gets reverted; going through the
 *  native setter + dispatching events makes the framework accept the change. */
function nativeValueSetter(el: Element): ((v: string) => void) | null {
  let proto: object | null = el;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) return desc.set.bind(el);
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const setter = nativeValueSetter(el);
  if (setter) setter(value);
  else el.value = value;
  fire(el, 'input');
  fire(el, 'change');
}

const FALSY = new Set(['', 'false', 'no', '0', 'off', 'unchecked', 'none']);

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function isContentEditableEl(el: HTMLElement): boolean {
  const ce = el.getAttribute('contenteditable');
  return ce === '' || ce === 'true' || el.isContentEditable;
}

/** Pick the option whose value or text best matches `value`:
 *  exact value -> exact text -> case-insensitive -> substring. */
function matchOption(
  options: { value: string; text: string }[],
  value: string,
): string | null {
  const v = norm(value);
  const byValue = options.find((o) => o.value === value);
  if (byValue) return byValue.value;
  const byText = options.find((o) => o.text === value);
  if (byText) return byText.value;
  const ci = options.find((o) => norm(o.value) === v || norm(o.text) === v);
  if (ci) return ci.value;
  const sub = options.find((o) => norm(o.text).includes(v) || v.includes(norm(o.text)));
  return sub ? sub.value : null;
}

function fillSelect(el: HTMLSelectElement, value: string): FillResult {
  const options = Array.from(el.options).map((o) => ({
    value: o.value,
    text: (o.textContent || '').trim(),
  }));
  const match = matchOption(options, value);
  if (match == null) {
    return { ref: '', status: 'error', value, reason: `no option matches "${value}"` };
  }
  el.value = match;
  fire(el, 'input');
  fire(el, 'change');
  return { ref: '', status: 'filled', value: match };
}

function fillRadio(el: HTMLInputElement, value: string): FillResult {
  const name = el.name;
  const group = name
    ? Array.from(
        el.ownerDocument.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${name.replace(/["\\]/g, '\\$&')}"]`,
        ),
      )
    : [el];
  const v = norm(value);
  const target =
    group.find((r) => r.value === value) ??
    group.find((r) => norm(r.value) === v) ??
    group.find((r) => norm((r.labels?.[0]?.textContent || '').trim()) === v) ??
    group.find((r) => norm((r.labels?.[0]?.textContent || '').trim()).includes(v));
  if (!target) {
    return { ref: '', status: 'error', value, reason: `no radio matches "${value}"` };
  }
  target.checked = true;
  fire(target, 'input');
  fire(target, 'change');
  return { ref: '', status: 'filled', value: target.value };
}

function fillCheckbox(el: HTMLInputElement, value: string): FillResult {
  const checked = !FALSY.has(norm(value));
  el.checked = checked;
  fire(el, 'input');
  fire(el, 'change');
  return { ref: '', status: 'filled', value: String(checked) };
}

/** Fill a single element with a value. Returns a result (ref filled by caller). */
export function fillElement(el: Element, value: string): FillResult {
  try {
    if (el instanceof HTMLSelectElement) return fillSelect(el, value);
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      if (type === 'radio') return fillRadio(el, value);
      if (type === 'checkbox') return fillCheckbox(el, value);
      setNativeValue(el, value);
      return { ref: '', status: 'filled', value };
    }
    if (el instanceof HTMLTextAreaElement) {
      setNativeValue(el, value);
      return { ref: '', status: 'filled', value };
    }
    if (el instanceof HTMLElement && isContentEditableEl(el)) {
      el.textContent = value;
      fire(el, 'input');
      return { ref: '', status: 'filled', value };
    }
    return { ref: '', status: 'error', value, reason: 'unsupported element' };
  } catch (err) {
    return { ref: '', status: 'error', value, reason: String(err) };
  }
}

/** Apply a mapping to the page. `resolve` turns a ref into a live element.
 *  null values are recorded as 'skipped'; unresolved/failed as 'error'. */
export function fillFields(
  map: MappingResponse,
  resolve: (ref: string) => Element | undefined,
): FillResult[] {
  const results: FillResult[] = [];
  for (const [ref, value] of Object.entries(map)) {
    if (value == null || value === '') {
      results.push({ ref, status: 'skipped', value });
      continue;
    }
    const el = resolve(ref);
    if (!el) {
      results.push({ ref, status: 'error', value, reason: 'ref not found' });
      continue;
    }
    results.push({ ...fillElement(el, value), ref });
  }
  return results;
}
