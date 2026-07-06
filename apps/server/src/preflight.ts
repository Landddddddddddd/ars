import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { loadConfig } from '@ars/core';

const cfg = loadConfig();

function makeClient(): Anthropic {
  const opts: Record<string, unknown> = {};
  if (cfg.authToken) opts.authToken = cfg.authToken;
  else if (cfg.apiKey) opts.apiKey = cfg.apiKey;
  if (cfg.baseURL) opts.baseURL = cfg.baseURL;
  return new Anthropic(opts as any);
}

const client = makeClient();
const base = {
  model: cfg.model,
  max_tokens: 64,
  messages: [{ role: 'user' as const, content: 'Reply with the single word: ok' }],
};

async function probe(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  process.stdout.write(`  ${name.padEnd(22)} `);
  try {
    await fn();
    console.log('✓ supported');
    return true;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.log('✗ not supported — ' + msg.slice(0, 100));
    return false;
  }
}

function updateEnv(flags: Record<string, string>): void {
  const path = resolve(process.cwd(), '.env');
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [k, v] of Object.entries(flags)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : text.trimEnd() + '\n' + line + '\n';
  }
  writeFileSync(path, text);
}

async function main() {
  console.log(`\nARS preflight — endpoint: ${cfg.baseURL ?? 'api.anthropic.com'}`);
  console.log(`Model: ${cfg.model}\n`);

  const modelOk = await probe('model + auth', () => client.messages.create({ ...base }));
  if (!modelOk) {
    console.log(
      '\n✗ Base call failed. Check ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ARS_MODEL in .env.\n',
    );
    process.exitCode = 1;
    return;
  }

  const thinking = await probe('adaptive thinking', () =>
    client.messages.create({ ...base, thinking: { type: 'adaptive', display: 'summarized' } } as any),
  );
  const effort = await probe('effort param', () =>
    client.messages.create({ ...base, output_config: { effort: 'medium' } } as any),
  );
  const structured = await probe('structured output', () =>
    (client.messages as any).parse({
      ...base,
      messages: [{ role: 'user', content: 'Return an object with word="ok".' }],
      output_config: { format: zodOutputFormat(z.object({ word: z.string() })) },
    }),
  );
  const stream = await probe('streaming', async () => {
    const s = client.messages.stream({ ...base } as any);
    await s.finalMessage();
  });

  updateEnv({
    ARS_THINKING: thinking ? '1' : '0',
    ARS_EFFORT_PARAM: effort ? '1' : '0',
    ARS_STRUCTURED: structured ? '1' : '0',
    ARS_STREAM: stream ? '1' : '0',
  });

  console.log('\nFeature flags written to .env. ClaudeClient will use them automatically.');
  console.log('Next: npm run demo -- "your topic"   or   npm run dev\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
