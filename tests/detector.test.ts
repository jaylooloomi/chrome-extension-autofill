import { describe, it, expect } from 'vitest';
import { scanFields, getLabel, fieldSignature } from '../src/content/detector';

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe('detector', () => {
  it('resolves labels via <label for>, aria-label, and wrapping label', () => {
    setBody(`
      <label for="e">Email Address</label><input id="e" name="applicant_email" type="email">
      <input id="p" type="tel" aria-label="Phone Number">
      <label>Full Name <input id="n" type="text"></label>
    `);
    const byId = document.getElementById('e') as HTMLElement;
    expect(getLabel(byId)).toBe('Email Address');
    expect(getLabel(document.getElementById('p') as HTMLElement)).toBe('Phone Number');
    expect(getLabel(document.getElementById('n') as HTMLElement)).toBe('Full Name');
  });

  it('extracts a schema for standard inputs and skips hidden/submit', () => {
    setBody(`
      <input type="text" name="first" placeholder="First">
      <input type="hidden" name="csrf">
      <input type="submit" value="Go">
      <textarea name="bio"></textarea>
      <select name="country"><option value="US">United States</option><option value="CA">Canada</option></select>
    `);
    const { fields } = scanFields(document);
    const names = fields.map((f) => f.name);
    expect(names).toContain('first');
    expect(names).toContain('bio');
    expect(names).toContain('country');
    expect(names).not.toContain('csrf');
    const select = fields.find((f) => f.name === 'country')!;
    expect(select.tag).toBe('select');
    expect(select.options).toHaveLength(2);
    expect(select.options?.[1]).toEqual({ value: 'CA', text: 'Canada' });
  });

  it('collapses a radio group into a single field with options', () => {
    setBody(`
      <fieldset><legend>Gender</legend>
        <label>Male <input type="radio" name="g" value="m"></label>
        <label>Female <input type="radio" name="g" value="f"></label>
      </fieldset>
    `);
    const { fields } = scanFields(document);
    const radios = fields.filter((f) => f.type === 'radio');
    expect(radios).toHaveLength(1);
    expect(radios[0].options).toHaveLength(2);
    expect(radios[0].nearbyText).toBe('Gender');
  });

  it('assigns unique refs and a stable form signature', () => {
    const html = `<input name="a" type="text"><input name="b" type="text">`;
    setBody(html);
    const first = scanFields(document);
    expect(new Set(first.fields.map((f) => f.ref)).size).toBe(first.fields.length);
    setBody(html);
    const second = scanFields(document);
    expect(second.formSignature).toBe(first.formSignature);
  });

  it('normalizes separators/case but keeps digits distinct', () => {
    // separators + case collapse to one token
    expect(fieldSignature({ name: 'first_name', type: 'text' })).toBe(
      fieldSignature({ label: 'First Name', type: 'text' }),
    );
    // digits stay significant so line 1 and line 2 do not collide
    expect(fieldSignature({ name: 'address_line_1', type: 'text' })).not.toBe(
      fieldSignature({ name: 'address_line_2', type: 'text' }),
    );
  });
});
