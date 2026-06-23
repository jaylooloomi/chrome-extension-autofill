// End-to-end-ish pipeline test (no browser/network): a realistic ATS-style form
// goes through detector -> (simulated mapping) -> fill-engine, then the same
// mapping is learned and replayed from cache. Proves the modules fit together
// and that detector signatures are stable enough for the cache to work.

import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './helpers/chrome-mock';
import { scanFields } from '../src/content/detector';
import { resolve } from '../src/content/refs';
import { fillFields } from '../src/content/fill-engine';
import { toSignatureValues, learn, getCachedMapping } from '../src/background/cache';
import type { MappingResponse, Profile } from '../src/shared/types';

const chromeMock = installChromeMock();

const FORM = `
  <h2>Personal information</h2>
  <label for="fn">First name</label><input id="fn" name="first_name" type="text">
  <label for="em">Email</label><input id="em" name="email" type="email">
  <label for="co">Country</label>
  <select id="co" name="country">
    <option value="">--</option>
    <option value="US">United States</option>
    <option value="CA">Canada</option>
  </select>
  <fieldset><legend>Gender</legend>
    <label>Male <input type="radio" name="g" value="m"></label>
    <label>Female <input type="radio" name="g" value="f"></label>
  </fieldset>
  <label for="cl">Cover letter</label><textarea id="cl" name="cover"></textarea>
`;

const profile: Profile = {
  basics: { firstName: 'Da-ming', email: 'd@e.com' },
  address: { country: 'Canada' },
  custom: { gender: 'f', cover: 'My cover letter' },
};

describe('full pipeline', () => {
  beforeEach(() => chromeMock.reset());

  it('detects, fills every field type, and caches for replay', async () => {
    document.body.innerHTML = FORM;
    const { fields, formSignature } = scanFields(document);

    // Simulate the LLM mapping by keying expected values to each field's ref.
    const want: Record<string, string> = {
      first_name: 'Da-ming',
      email: 'd@e.com',
      country: 'Canada',
      g: 'f',
      cover: 'My cover letter',
    };
    const map: MappingResponse = {};
    for (const f of fields) map[f.ref] = f.name ? (want[f.name] ?? null) : null;

    // Fill the live DOM.
    const results = fillFields(map, resolve);
    expect(results.every((r) => r.status === 'filled')).toBe(true);

    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('Da-ming');
    expect((document.getElementById('em') as HTMLInputElement).value).toBe('d@e.com');
    expect((document.getElementById('co') as HTMLSelectElement).value).toBe('CA'); // "Canada" -> CA
    expect((document.querySelector('input[value="f"]') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('cl') as HTMLTextAreaElement).value).toBe('My cover letter');

    // Learn the site mapping, then replay it with zero AI.
    await learn('jobs.example.com', formSignature, toSignatureValues(fields, map), profile);
    const hit = await getCachedMapping('jobs.example.com', formSignature, fields, profile);
    expect(hit).not.toBeNull();
    expect(hit!.coverage).toBe(1);
    expect(hit!.map).toEqual(map);
  });
});
