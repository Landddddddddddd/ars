import { randomUUID } from 'node:crypto';
import {
  loadConfig,
  createLLM,
  defaultProviderConfig,
  createContext,
  runPipeline,
  assembleMarkdown,
  isOutputLanguage,
} from '@ars/core';
import type { AgentEvent } from '@ars/core';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

async function main() {
  const topic = process.argv.slice(2).join(' ').trim() || 'AI-assisted systematic literature review';
  const cfg = loadConfig();
  const llm = createLLM(defaultProviderConfig(cfg));
  const lang = isOutputLanguage(process.env.ARS_LANG) ? process.env.ARS_LANG : 'auto';
  const ctx = createContext(randomUUID(), topic, lang);

  console.log(bold(`\nARS Deep Research (demo)`));
  console.log(`Topic: ${cyan(topic)}`);
  console.log(`Model: ${cfg.model}  Endpoint: ${cfg.baseURL ?? 'api.anthropic.com'}\n`);

  const emit = (e: AgentEvent) => {
    switch (e.type) {
      case 'agent.start':
        console.log(`\n${bold('▶ ' + e.title)} ${dim('(' + e.agent + ')')}`);
        break;
      case 'agent.thinking':
        process.stdout.write(dim(e.delta));
        break;
      case 'agent.output':
        process.stdout.write(e.delta);
        break;
      case 'agent.result':
        console.log(`\n  ${green('✔ ' + e.summary)}`);
        break;
      case 'agent.error':
        console.log(`\n  \x1b[31m✗ ${e.message}\x1b[0m`);
        break;
    }
  };

  await runPipeline({ ctx, llm, emit });

  console.log(bold('\n\n═══ Summary ═══'));
  console.log(`Papers:            ${ctx.papers.length}`);
  console.log(`Citations verified: ${ctx.citationChecks.filter((c) => c.verified).length}/${ctx.citationChecks.length}`);
  console.log(`Research questions: ${ctx.researchQuestions.length}`);
  console.log(`Critiques:          ${ctx.critiques.length}`);
  console.log(`Draft sections:     ${ctx.draft?.sections.length ?? 0}`);
  console.log(`Review items:       ${ctx.draftReview.length}`);

  if (ctx.draft) {
    console.log(bold('\n\n═══ Paper Draft ═══\n'));
    console.log(assembleMarkdown(ctx.draft));
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
