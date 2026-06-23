import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './helpers/chrome-mock';
import {
  learn,
  getCachedMapping,
  reverseLookup,
  toSignatureValues,
} from '../src/background/cache';
import type { FieldSchema, Profile } from '../src/shared/types';

const chromeMock = installChromeMock();

const profile: Profile = {
  basics: { email: 'a@b.com', fullName: 'Wang Da-ming' },
  custom: { PIN: '1234' },
};

const fields: FieldSchema[] = [
  { ref: 'field_0', tag: 'input', type: 'email', signature: 'email:email' },
  { ref: 'field_1', tag: 'input', type: 'text', signature: 'pin:text' },
];

describe('site cache', () => {
  beforeEach(() => chromeMock.reset());

  it('reverse-looks-up a value to its profile path', () => {
    expect(reverseLookup(profile, 'a@b.com')).toBe('basics.email');
    expect(reverseLookup(profile, '1234')).toBe('custom.PIN');
    expect(reverseLookup(profile, 'unknown')).toBeNull();
  });

  it('learns from a mapping and replays it with zero AI', async () => {
    const map = { field_0: 'a@b.com', field_1: '1234' };
    await learn('jobs.example.com', 'sig1', toSignatureValues(fields, map), profile);

    const hit = await getCachedMapping('jobs.example.com', 'sig1', fields, profile);
    expect(hit).not.toBeNull();
    expect(hit!.coverage).toBe(1);
    expect(hit!.map).toEqual({ field_0: 'a@b.com', field_1: '1234' });
  });

  it('reflects an updated profile when replaying the cached path', async () => {
    await learn('jobs.example.com', 'sig1', toSignatureValues(fields, { field_0: 'a@b.com', field_1: '1234' }), profile);
    const updated: Profile = { ...profile, basics: { ...profile.basics, email: 'new@b.com' } };
    const hit = await getCachedMapping('jobs.example.com', 'sig1', fields, updated);
    expect(hit!.map.field_0).toBe('new@b.com'); // path resolved against new profile
  });

  it('returns null when there is no entry', async () => {
    expect(await getCachedMapping('unknown.com', 'sigX', fields, profile)).toBeNull();
  });
});
