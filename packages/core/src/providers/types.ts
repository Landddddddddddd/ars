import type { z } from 'zod/v4';
import type { Effort } from '../config.js';

export type ProviderKind = 'anthropic' | 'openai';

export interface ProviderConfig {
  provider: ProviderKind;
  model: string;
  /** OpenAI-style key, or Anthropic x-api-key. */
  apiKey?: string;
  /** Anthropic bearer token (relays). Ignored for openai provider. */
  authToken?: string;
  baseURL?: string;
  effort?: Effort;
  /** Anthropic-only feature toggles. Undefined = all enabled. */
  features?: {
    thinking: boolean;
    effortParam: boolean;
    structured: boolean;
    stream: boolean;
  };
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenArgs {
  system: string;
  messages: Message[];
  effort?: Effort;
  maxTokens?: number;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
}

export interface ParseArgs<T> {
  system: string;
  messages: Message[];
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

/** Uniform interface every agent talks to, regardless of provider. */
export interface LLMClient {
  readonly provider: ProviderKind;
  readonly model: string;
  generate(args: GenArgs): Promise<string>;
  parse<T>(args: ParseArgs<T>): Promise<T>;
}
