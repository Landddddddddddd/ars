import { describe, it, expect } from 'vitest';
import { isOutputLanguage, languageDirective, withLanguage, type OutputLanguage } from '../src/language';
import type { LLMClient, ParseArgs, GenArgs } from '../src/providers/types';

function fakeLLM(sink: { system: string[] }): LLMClient {
  return {
    provider: 'openai',
    model: 'test-model',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generate: async (args: GenArgs) => {
      sink.system.push(args.system);
      return { text: 'ok', usage: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: async <T,>(args: ParseArgs): Promise<T> => {
      sink.system.push(args.system);
      return {} as T;
    },
  } as unknown as LLMClient;
}

describe('isOutputLanguage', () => {
  it('accepts exactly the three supported values', () => {
    expect(isOutputLanguage('auto')).toBe(true);
    expect(isOutputLanguage('zh')).toBe(true);
    expect(isOutputLanguage('en')).toBe(true);
  });

  it('rejects anything else (so callers can fall back to auto)', () => {
    expect(isOutputLanguage('ZH')).toBe(false);
    expect(isOutputLanguage('english')).toBe(false);
    expect(isOutputLanguage(undefined)).toBe(false);
    expect(isOutputLanguage(null)).toBe(false);
  });
});

describe('languageDirective', () => {
  it('asks for Simplified Chinese when zh is selected', () => {
    expect(languageDirective('zh')).toContain('Simplified Chinese');
  });

  it('asks for English when en is selected', () => {
    expect(languageDirective('en')).toContain('English');
  });

  it('mirrors the topic language when auto is selected', () => {
    expect(languageDirective('auto')).toContain('same language as the research topic');
  });

  it('never returns an empty directive for any supported value', () => {
    for (const lang of ['auto', 'zh', 'en'] as OutputLanguage[]) {
      expect(languageDirective(lang).length).toBeGreaterThan(10);
    }
  });
});

describe('withLanguage', () => {
  it('appends the directive to every generate call', async () => {
    const sink = { system: [] as string[] };
    const llm = withLanguage(fakeLLM(sink), 'zh');
    await llm.generate({ system: 'BASE', prompt: 'p' });
    expect(sink.system[0]).toBe('BASE\n\n' + languageDirective('zh'));
  });

  it('appends the directive to every parse call', async () => {
    const sink = { system: [] as string[] };
    const llm = withLanguage(fakeLLM(sink), 'en');
    await llm.parse({ system: 'BASE', prompt: 'p', schema: {} as never });
    expect(sink.system[0]).toContain('IMPORTANT: Write ALL output in English.');
  });

  it('passes the underlying provider/model through unchanged', () => {
    const llm = withLanguage(fakeLLM({ system: [] }), 'auto');
    expect(llm.provider).toBe('openai');
    expect(llm.model).toBe('test-model');
  });
});
