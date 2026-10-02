# ARS — Academic-Research-Skills

A multi-agent academic research framework — from idea to publication.

> **Status:** Milestone 1 — reusable agent framework + a Deep Research vertical slice
> (4 agents) proving every pattern the full 32-agent system needs.

## Architecture

```
packages/core   ← the framework: ClaudeClient, Agent abstraction, ResearchContext,
                  Pipeline orchestrator, Zod schemas, agents, Semantic Scholar client
apps/server     ← Hono API + SSE (start runs, stream agent events), preflight, CLI demo
apps/web        ← Vite + React UI: topic input, pipeline stages, live agent timeline
```

Every agent follows one pattern (`defineAgent()`), so scaling from 4 → 32 agents and
1 → 10 pipeline stages is additive.

## Setup

```bash
npm install
```

Credentials live in `.env`. If you started from an active cc-switch session, `.env`
was generated for you with the relay token + base URL. Otherwise copy `.env.example`
to `.env` and fill in either a relay token (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`)
or a real Anthropic key (`ANTHROPIC_API_KEY`).

> The relay token from cc-switch is **not persisted** — it only lives inside the
> Claude Code process. If cc-switch rotates it, update `.env` to match.

## Verify your endpoint

```bash
npm run check
```

Probes whether your endpoint accepts the model, adaptive thinking, the effort
parameter, structured outputs, and streaming — then writes the working feature flags
back to `.env`. `ClaudeClient` degrades gracefully for anything unsupported.

## Run

```bash
# CLI end-to-end (no UI): literature → research question → devil's advocate → citation check
npm run demo -- "your research topic"

# Web app (server + Vite)
npm run dev
```

## Choosing a model / bringing your own API key

The web UI has a **模型设置 (Model settings)** panel. Pick a preset and paste your key:

- **默认** — use the server's `.env` credentials (no input needed).
- **Anthropic 官方 / 兼容中转** — Anthropic Messages API (official or any relay).
- **腾讯混元 Hunyuan** — native preset for Hunyuan's OpenAI-compatible endpoint
  (`https://api.hunyuan.cloud.tencent.com/v1`), models `hunyuan-turbos-latest` /
  `hunyuan-t1-latest` / `hunyuan-large` / `hunyuan-turbo`. Bring the key from
  hunyuan.tencent.com (Bearer auth).
- **OpenAI-compatible** — OpenAI, DeepSeek, Moonshot/Kimi, 智谱 GLM, OpenRouter, or a
  fully custom Base URL. Almost every model provider exposes an OpenAI-compatible endpoint.

Your key is stored only in the browser (localStorage) and sent per-run to the local
server, which forwards it to the provider you chose — it is never persisted or logged
server-side. The provider layer lives in `packages/core/src/providers/` (`anthropic.ts`,
`openai.ts`, `factory.ts`, `presets.ts`); agents call a single `LLMClient` interface, so
they are provider-agnostic.

## Export

The finished paper can be downloaded in multiple formats (all generated client-side, no
server round-trip):

- **Markdown** (`.md`) — the pre-assembled document.
- **LaTeX** (`.tex`) — a self-contained `article` with `ctex` (CJK), `hyperref`, and a
  `thebibliography` built from the verified references.
- **Word** (`.docx`) — a real OOXML file via the `docx` library (title, abstract,
  headings, references).
- **PDF** — a print-optimized view; the browser's print dialog lets you "Save as PDF".
- **JSON** (`.json`) — the structured paper object (title/abstract/sections/references +
  the assembled Markdown), handy for scripting or re-importing.
- **渲染预览** — a rendered Markdown view of the assembled document inside the UI, so the
  finished paper can be read without exporting first.

## Run history

Finished runs are **archived to SQLite**, so they survive a page refresh *and* a server
restart (the live run store itself stays in memory, which is what streams events):

- On `run.done` / `run.error`, the run's full event snapshot is written to the `runs`
  table (`apps/server/src/runArchive.ts`). Re-archiving the same id overwrites it.
- `GET /api/runs` lists the signed-in user's runs — live runs first, then archived,
  newest first.
- `GET /api/runs/:id` replays a snapshot: it serves the live run when present and falls
  back to the archive afterwards, so reopening a past run restores the entire agent
  timeline and the finished paper.

Both endpoints are owner-only (401 without a session, 404 for another user's run).

- **Search:** `GET /api/runs?q=<关键词>` filters by topic substring (case-insensitive,
  `LOWER(topic) LIKE`), with `?limit=` (capped at 200).
- **Delete:** `DELETE /api/runs/:id` removes an archived run. A still-running run is
  refused with `409` — finish or reload first.

## Stage selection (run only what you need)

A full run executes both stages (10 agents, e.g. 22 credits). You can run **just one
stage** and pay only for it:

| Selection | Steps | Cost |
|---|---|---|
| Full pipeline | 4 + 6 | 22 |
| `deep-research` only | 4 | 4 |
| `paper-drafting` only | 6 | 18 |

- `POST /api/runs` accepts `stages: ['deep-research']` (unknown ids are dropped; if
  nothing valid remains it falls back to the full pipeline and charges accordingly).
- `GET /api/pricing?stages=deep-research` returns the cost of that subset plus
  `fullRunCost` for comparison.
- The run emits a `run.stages` event with the resolved subset, so the UI renders only
  the stages actually being executed.
- Credits are gated on the **selected** cost, still refunded in full if the run fails.

## Tests

```bash
npm test          # vitest run
npm run test:watch
```

Unit tests live in `packages/core/test/` and cover the pure, dependency-free parts of the
framework: Markdown assembly (`draft.ts`), every Zod schema, the language-injection
wrapper, the agent registry, and the pipeline shape (unique agent names, stage ownership).

## Paid layer — accounts, credits, payments

ARS can run as a **paid, pay-per-use site**. Credits buy access to the ARS platform
(the multi-agent orchestration itself); users still bring their own model key, so the
server carries **near-zero LLM cost**.

- **Accounts:** email + password. Sessions are a signed **httpOnly cookie** (works for
  both the `POST /api/runs` request and the SSE stream, which can't send auth headers).
  New users get `SIGNUP_BONUS_CREDITS` free credits.
- **Credits:** each research run costs `RUN_COST_CREDITS`, charged up front and
  **refunded automatically if the run fails**. Out of credits → the run is rejected
  with `402` and the UI opens the top-up dialog.
- **Persistence:** SQLite (`better-sqlite3`) at `DATABASE_PATH` — the first persistent
  layer. Tables: `users`, `sessions`, `ledger` (audit trail), `payments` (idempotent by
  `provider + ref`, so a doubled webhook never double-credits), `runs` (archived research
  runs + their event snapshots).
- **Payments** are pluggable via `PAYMENT_PROVIDER` — **one codebase, two sites**:

  | Site | `PAYMENT_PROVIDER` | `SITE_CURRENCY` | Status |
  |------|--------------------|-----------------|--------|
  | International | `stripe` | `USD` | ✅ real Stripe Checkout + signed webhook |
  | Domestic | `alipay` | `CNY` | 🚧 scaffold in `billing/alipay.ts` (add merchant keys) |
  | Local/dev | `mock` | any | ✅ instant credit, full flow, no real money |

  A provider with missing credentials is auto-disabled and its checkout returns `503`.

Copy `.env.example` → `.env` and set `SESSION_SECRET`, `PAYMENT_PROVIDER`, the credit
amounts, and (for Stripe) `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Then `npm run dev`.

**Stripe webhook (local):** `stripe listen --forward-to localhost:8787/api/billing/webhook/stripe`
and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`.

## Deploy online

The server serves both the API and the built frontend, so **one Node service is the
whole site**. Users bring their own provider + API key in the UI, so the server needs
**no model credentials** — but the paid layer **does** need a persistent database.

> ⚠ **Persistence is money-critical.** `DATABASE_PATH` must live on a **persistent disk**
> (Render Disk / Docker volume). On an ephemeral filesystem (e.g. Render's free plan) a
> redeploy wipes all users & credits. `render.yaml` provisions a 1 GB disk on a paid
> instance; the Dockerfile declares a `/data` volume.

**Render (easiest):** push this repo to GitHub → Render → New → Blueprint → pick the repo
(`render.yaml` is included). Or New → Web Service with build `npm install && npm run build`
and start `npm start`.

**Docker (any host — Railway, Fly.io, a VPS):**

```bash
docker build -t ars .
docker run -p 8787:8787 -v ars-data:/data \
  -e SESSION_SECRET=$(openssl rand -hex 32) -e PAYMENT_PROVIDER=stripe ars
# the -v volume keeps users & credits across restarts; add -e ANTHROPIC_API_KEY=... for a server default
```

**Notes**
- `.env` is git-ignored and never shipped. Set optional server credentials as platform
  env vars (`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` or `ANTHROPIC_API_KEY`) only if you
  want the "默认（服务器 .env）" option to work for everyone; otherwise leave them unset.
- The server binds `PORT` (platforms set this automatically).
- The credit database is persisted at `DATABASE_PATH`; finished **research runs** are
  archived in the same database (`runs` table), so history survives restarts.

## Milestone roadmap

- **M1 (now)** framework + Deep Research slice (4 agents)
- M2 remaining Deep Research agents (PRISMA, methodology, Socratic mentor, …)
- M3 Academic Paper writing team (12 agents) + MD/DOCX/LaTeX→PDF output
- M4 Reviewer team (7 agents) + 0–100 scoring & revision roadmap
- M5 full 10-stage pipeline + resume-at-any-stage
- M6 persistence, style calibration, bilingual abstracts, chart generation
