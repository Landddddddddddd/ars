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
- **OpenAI-compatible** — OpenAI, DeepSeek, Moonshot/Kimi, 智谱 GLM, OpenRouter, or a
  fully custom Base URL. Almost every model provider exposes an OpenAI-compatible endpoint.

Your key is stored only in the browser (localStorage) and sent per-run to the local
server, which forwards it to the provider you chose — it is never persisted or logged
server-side. The provider layer lives in `packages/core/src/providers/` (`anthropic.ts`,
`openai.ts`, `factory.ts`, `presets.ts`); agents call a single `LLMClient` interface, so
they are provider-agnostic.

## Deploy online

The server serves both the API and the built frontend, so **one Node service is the
whole site**. Users bring their own provider + API key in the UI, so the server needs
**no credentials** — great for a public deployment.

**Render (easiest):** push this repo to GitHub → Render → New → Blueprint → pick the repo
(`render.yaml` is included). Or New → Web Service with build `npm install && npm run build`
and start `npm start`.

**Docker (any host — Railway, Fly.io, a VPS):**

```bash
docker build -t ars .
docker run -p 8787:8787 ars        # optionally: -e ANTHROPIC_API_KEY=... for a server default
```

**Notes**
- `.env` is git-ignored and never shipped. Set optional server credentials as platform
  env vars (`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` or `ANTHROPIC_API_KEY`) only if you
  want the "默认（服务器 .env）" option to work for everyone; otherwise leave them unset.
- The server binds `PORT` (platforms set this automatically).
- Runs are stored in memory (M1) — fine for a demo; add persistence for production.

## Milestone roadmap

- **M1 (now)** framework + Deep Research slice (4 agents)
- M2 remaining Deep Research agents (PRISMA, methodology, Socratic mentor, …)
- M3 Academic Paper writing team (12 agents) + MD/DOCX/LaTeX→PDF output
- M4 Reviewer team (7 agents) + 0–100 scoring & revision roadmap
- M5 full 10-stage pipeline + resume-at-any-stage
- M6 persistence, style calibration, bilingual abstracts, chart generation
