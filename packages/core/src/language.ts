import type { LLMClient } from './providers/types.js';

export type OutputLanguage = 'auto' | 'zh' | 'en';

export function isOutputLanguage(v: unknown): v is OutputLanguage {
  return v === 'auto' || v === 'zh' || v === 'en';
}

/** Instruction appended to every agent's system prompt to control output language. */
export function languageDirective(lang: OutputLanguage): string {
  switch (lang) {
    case 'zh':
      return (
        'IMPORTANT: Write ALL output — every field, summary, research question, ' +
        'critique, and note — in Simplified Chinese (简体中文). Keep paper titles, ' +
        'author names, and established technical terms in their original language.'
      );
    case 'en':
      return 'IMPORTANT: Write ALL output in English.';
    case 'auto':
    default:
      return 'IMPORTANT: Write all output in the same language as the research topic.';
  }
}

/**
 * Wrap an LLMClient so every generate/parse call carries the language directive.
 * Central injection point — agents stay language-agnostic.
 */
export function withLanguage(llm: LLMClient, lang: OutputLanguage): LLMClient {
  const dir = languageDirective(lang);
  const wrap = (system: string) => `${system}\n\n${dir}`;
  return {
    provider: llm.provider,
    model: llm.model,
    generate: (args) => llm.generate({ ...args, system: wrap(args.system) }),
    parse: (args) => llm.parse({ ...args, system: wrap(args.system) }),
  };
}
