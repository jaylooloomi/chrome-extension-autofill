import { describe, it, expect, vi } from 'vitest';
import { buildMappingPrompt, validateMapping, mapFields } from '../src/background/mapping';
import { LLMError } from '../src/shared/types';
import type { FieldSchema, LLMProvider } from '../src/shared/types';

const fields: FieldSchema[] = [
  { ref: 'field_0', tag: 'input', type: 'email', signature: 'email:email' },
  { ref: 'field_1', tag: 'input', type: 'text', signature: 'years:text' },
];

function provider(impl: LLMProvider['complete']): LLMProvider {
  return { name: 'openai', complete: impl };
}

describe('mapping', () => {
  it('builds a prompt that references the field refs and forbids prose', () => {
    const prompt = buildMappingPrompt({ fields, profile: { basics: { email: 'a@b.com' } } });
    expect(prompt).toContain('field_0');
    expect(prompt).toContain('No prose');
    expect(prompt).toContain('a@b.com');
  });

  it('asks for consistent sample data in fake mode (no nulls)', () => {
    const prompt = buildMappingPrompt({ fields, profile: {} }, true);
    expect(prompt).toContain('SAMPLE');
    expect(prompt).toContain('Do NOT return null');
    expect(prompt).not.toContain('Never invent data');
  });

  it('passes the fake prompt through mapFields when opts.fake is set', async () => {
    const complete = vi.fn().mockResolvedValue({ field_0: 'a@b.com', field_1: 'Sam' });
    await mapFields({ fields, profile: {} }, provider(complete), { fake: true });
    const sentPrompt = (complete.mock.calls[0][0] as { prompt: string }).prompt;
    expect(sentPrompt).toContain('SAMPLE');
  });

  it('coerces a raw response and fills every ref', () => {
    const map = validateMapping({ field_0: 'a@b.com', field_1: 42 }, fields);
    expect(map).toEqual({ field_0: 'a@b.com', field_1: '42' });
  });

  it('defaults missing refs to null', () => {
    const map = validateMapping({ field_0: 'a@b.com' }, fields);
    expect(map.field_1).toBeNull();
  });

  it('throws PARSE on a non-object response', () => {
    expect(() => validateMapping('nope', fields)).toThrow(LLMError);
  });

  it('never sends captcha (noFill) fields to the model and forces them null', () => {
    const withCaptcha: FieldSchema[] = [
      ...fields,
      { ref: 'field_2', tag: 'input', type: 'text', signature: 'captcha:text', noFill: true },
    ];
    const prompt = buildMappingPrompt({ fields: withCaptcha, profile: {} });
    expect(prompt).not.toContain('field_2');
    const map = validateMapping(
      { field_0: 'a@b.com', field_1: 'x', field_2: 'IGNORED' },
      withCaptcha,
    );
    expect(map.field_2).toBeNull();
  });

  it('returns a validated map from a provider', async () => {
    const p = provider(vi.fn().mockResolvedValue({ field_0: 'a@b.com', field_1: null }));
    const map = await mapFields({ fields, profile: {} }, p);
    expect(map).toEqual({ field_0: 'a@b.com', field_1: null });
  });

  it('retries once on a parse failure', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new LLMError('PARSE', 'bad'))
      .mockResolvedValueOnce({ field_0: 'ok', field_1: null });
    const map = await mapFields({ fields, profile: {} }, provider(complete));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(map.field_0).toBe('ok');
  });

  it('does not retry on auth errors', async () => {
    const complete = vi.fn().mockRejectedValue(new LLMError('AUTH', 'bad key'));
    await expect(mapFields({ fields, profile: {} }, provider(complete))).rejects.toThrow('bad key');
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
