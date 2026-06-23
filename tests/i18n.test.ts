import { describe, it, expect } from 'vitest';
import { t, resolveLocale } from '../src/shared/i18n';

describe('i18n', () => {
  it('translates known keys per locale', () => {
    expect(t('save_api', 'en')).toBe('Save API settings');
    expect(t('save_api', 'zh-TW')).toBe('儲存 API 設定');
    expect(t('save_api', 'ja')).toBe('API 設定を保存');
  });

  it('falls back to English / the key when missing', () => {
    expect(t('does_not_exist', 'ja')).toBe('does_not_exist');
  });

  it('resolves browser-ish locale strings to supported locales', () => {
    expect(resolveLocale('zh-TW')).toBe('zh-TW');
    expect(resolveLocale('zh-CN')).toBe('zh-CN');
    expect(resolveLocale('ja-JP')).toBe('ja');
    expect(resolveLocale('fr')).toBe('en');
  });
});
