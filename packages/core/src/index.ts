export { loadConfig, hasServerCredentials } from './config.js';
export type { ArsConfig, Effort } from './config.js';

export { ClaudeClient } from './claude.js';

// Multi-provider LLM layer
export { createLLM, defaultProviderConfig, resolveProviderConfig } from './providers/factory.js';
export { AnthropicLLM } from './providers/anthropic.js';
export { OpenAICompatibleLLM } from './providers/openai.js';
export { PROVIDER_PRESETS } from './providers/presets.js';
export type { ProviderPreset } from './providers/presets.js';
export type {
  LLMClient,
  ProviderConfig,
  ProviderKind,
  Message,
  GenArgs,
  ParseArgs,
} from './providers/types.js';

export { defineAgent } from './agent.js';
export type { Agent, AgentRunArgs } from './agent.js';

export { createContext } from './context.js';
export type { ResearchContext } from './context.js';

export { withLanguage, languageDirective, isOutputLanguage } from './language.js';
export type { OutputLanguage } from './language.js';

export type { AgentEvent, TimestampedEvent, StageId, Emit, ResultPayloads } from './events.js';

export * from './schemas.js';

export { AgentRegistry } from './registry.js';

export {
  runPipeline,
  runDeepResearch,
  deepResearchAgents,
  paperDraftingAgents,
  STAGES,
  STAGE_TITLES,
} from './pipeline.js';
export type { PipelineArgs, StageDef } from './pipeline.js';

export { assembleMarkdown } from './draft.js';

export { suggestResearchTopics } from './suggest.js';
export type { SuggestedTopic } from './suggest.js';

export { SemanticScholar } from './clients/semanticScholar.js';
export { OpenAlex } from './clients/openAlex.js';
export { LiteratureClient } from './clients/literatureClient.js';
export type { LitPaper, VerifyResult, VerifyStatus } from './clients/literature.js';

export * as agents from './agents/index.js';
