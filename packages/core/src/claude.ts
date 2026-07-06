// Backward-compat shim. The Anthropic client now lives in providers/anthropic.ts
// and implements the shared LLMClient interface. Prefer `createLLM(...)`.
export { AnthropicLLM as ClaudeClient } from './providers/anthropic.js';
export type { Message, GenArgs, ParseArgs } from './providers/types.js';
