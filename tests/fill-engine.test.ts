import { describe, it, expect } from 'vitest';
import { fillElement, fillFields, setNativeValue } from '../src/content/fill-engine';

describe('fill engine', () => {
  it('sets input value and dispatches input + change', () => {
    document.body.innerHTML = `<input id="t" type="text">`;
    const el = document.getElementById('t') as HTMLInputElement;
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    el.addEventListener('change', () => seen.push('change'));
    setNativeValue(el, 'hello');
    expect(el.value).toBe('hello');
    expect(seen).toEqual(['input', 'change']);
  });

  it('matches <select> by value or by option text', () => {
    document.body.innerHTML = `<select id="s"><option value="US">United States</option><option value="CA">Canada</option></select>`;
    const el = document.getElementById('s') as HTMLSelectElement;
    expect(fillElement(el, 'Canada').status).toBe('filled');
    expect(el.value).toBe('CA');
    expect(fillElement(el, 'US').status).toBe('filled');
    expect(el.value).toBe('US');
  });

  it('reports an error when no option matches', () => {
    document.body.innerHTML = `<select id="s"><option value="US">United States</option></select>`;
    const el = document.getElementById('s') as HTMLSelectElement;
    const r = fillElement(el, 'Atlantis');
    expect(r.status).toBe('error');
  });

  it('handles checkboxes by truthiness', () => {
    document.body.innerHTML = `<input id="c" type="checkbox">`;
    const el = document.getElementById('c') as HTMLInputElement;
    expect(fillElement(el, 'true').status).toBe('filled');
    expect(el.checked).toBe(true);
    fillElement(el, 'false');
    expect(el.checked).toBe(false);
  });

  it('checks the right radio in a group', () => {
    document.body.innerHTML = `
      <input type="radio" name="c" value="red">
      <input type="radio" name="c" value="blue">`;
    const first = document.querySelector('input[value="red"]') as HTMLInputElement;
    fillElement(first, 'blue');
    expect((document.querySelector('input[value="blue"]') as HTMLInputElement).checked).toBe(true);
  });

  it('fills contenteditable elements', () => {
    document.body.innerHTML = `<div id="d" contenteditable="true"></div>`;
    const el = document.getElementById('d') as HTMLElement;
    expect(fillElement(el, 'note').status).toBe('filled');
    expect(el.textContent).toBe('note');
  });

  it('skips null values and flags unresolved refs in fillFields', () => {
    document.body.innerHTML = `<input id="t" type="text">`;
    const el = document.getElementById('t') as HTMLInputElement;
    const resolve = (ref: string) => (ref === 'field_0' ? el : undefined);
    const results = fillFields({ field_0: 'x', field_1: null, field_2: 'y' }, resolve);
    const byRef = Object.fromEntries(results.map((r) => [r.ref, r.status]));
    expect(byRef.field_0).toBe('filled');
    expect(byRef.field_1).toBe('skipped');
    expect(byRef.field_2).toBe('error'); // ref not found
    expect(el.value).toBe('x');
  });
});
