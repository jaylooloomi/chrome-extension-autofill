import { describe, it, expect } from 'vitest';
import { normalizeHost, isHostDisabled } from '../src/shared/site';

describe('per-site host matching', () => {
  it('normalizes www prefix and case', () => {
    expect(normalizeHost('WWW.Example.com')).toBe('example.com');
    expect(normalizeHost('think4u-tech.com')).toBe('think4u-tech.com');
  });

  it('matches the disabled list www-insensitively', () => {
    expect(isHostDisabled('think4u-tech.com', ['www.think4u-tech.com'])).toBe(true);
    expect(isHostDisabled('www.x.com', ['x.com'])).toBe(true);
    expect(isHostDisabled('a.com', ['b.com'])).toBe(false);
    expect(isHostDisabled('x.com', [])).toBe(false);
  });
});
