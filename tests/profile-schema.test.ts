import { describe, it, expect } from 'vitest';
import { getByPath, setByPath, listProfilePaths } from '../src/shared/profile-schema';
import type { Profile } from '../src/shared/types';

describe('profile path helpers', () => {
  const profile: Profile = {
    basics: { email: 'a@b.com', fullName: 'Wang' },
    custom: { PIN: '1234' },
  };

  it('reads scalar values by dotted path', () => {
    expect(getByPath(profile, 'basics.email')).toBe('a@b.com');
    expect(getByPath(profile, 'custom.PIN')).toBe('1234');
  });

  it('returns undefined for missing or non-scalar paths', () => {
    expect(getByPath(profile, 'basics.phone')).toBeUndefined();
    expect(getByPath(profile, 'basics')).toBeUndefined();
    expect(getByPath(profile, 'nope.deep.path')).toBeUndefined();
  });

  it('sets values immutably, creating intermediate objects', () => {
    const next = setByPath(profile, 'address.city', 'Taipei');
    expect(getByPath(next, 'address.city')).toBe('Taipei');
    expect(getByPath(profile, 'address.city')).toBeUndefined(); // original untouched
  });

  it('clears a leaf when set to empty string', () => {
    const next = setByPath(profile, 'basics.email', '');
    expect(getByPath(next, 'basics.email')).toBeUndefined();
    expect(getByPath(next, 'basics.fullName')).toBe('Wang'); // sibling kept
  });

  it('lists all scalar leaf paths', () => {
    const paths = listProfilePaths(profile);
    expect(paths).toContain('basics.email');
    expect(paths).toContain('basics.fullName');
    expect(paths).toContain('custom.PIN');
  });
});
