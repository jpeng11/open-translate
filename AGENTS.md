# Agent Development Guide

Guidance for AI coding agents working on Open Translate (see [agents.md](https://agents.md/)).
`CLAUDE.md` is a symlink to this file for Claude Code. See [AI_POLICY.md](AI_POLICY.md) for
the AI contribution policy, and `.agents/` for reusable skills and commands
(e.g. `.agents/commands/review-branch`).

## Commands

- **Install:** `pnpm install` (pnpm only — never commit a `package-lock.json`)
- **Type check:** `pnpm compile` (`tsc --noEmit`; strict mode with `noUncheckedIndexedAccess`)
- **Build (Chrome MV3):** `pnpm build` → `.output/chrome-mv3/`
- **Build (Firefox):** `pnpm build:firefox`
- **Unit tests:** `pnpm test` (Vitest; tests live in `tests/unit/`)
- **E2E test:** `pnpm test:e2e` (Playwright + built extension; run `pnpm build` first)
- **Dev with live reload:** `pnpm dev`
- **Store zip:** `pnpm zip`

Run `pnpm compile` and `pnpm test` before every commit; run `pnpm build` before finishing a task.

## Directory Structure

- `lib/` — shared core: provider client (`provider.ts`), settings schema (`settings.ts`),
  provider presets (`presets.ts`), Grok OAuth (`grokAuth.ts`), translation cache (`cache.ts`),
  message types (`messaging.ts`)
- `entrypoints/background.ts` — MV3 service worker: translation queue, cache, runtime messages
- `entrypoints/content/` — content script: block detection (`dom.ts`), page translation
  (`index.ts`), selection/hover/input tools (`quick-tools.ts`)
- `entrypoints/popup/`, `entrypoints/options/` — React + Tailwind UI
- `plan.md` — the project tracker; update its checkboxes when you complete roadmap work
- `tests/unit/` — Vitest unit tests

## Landing site sync

User-facing product changes (README Features, presets, settings, popup/content UX, privacy)
must be mirrored in the sibling site at `../open-translate-landing` (marketing homepage +
`/docs`). After shipping a feature there: update docs/homepage, set `FEATURE_SYNC.md`
**Synced commit** to this repo’s `HEAD`, and run `pnpm sync:check` in the landing repo.
Non-product commits can use `pnpm sync:bump` in the landing repo instead.

## Project Invariants

- **Batch protocol is locked:** translation requests send a JSON array of strings; the model
  must return a same-length JSON array. Index-validate, retry once, then fall back per-item.
- **Privacy:** API keys and OAuth tokens live only in `chrome.storage.local`. Never log them,
  never send page content anywhere except the user-configured endpoint. No telemetry.
- **Chrome MV3 messaging:** never return a Promise from an `onMessage` listener — use
  `sendResponse` + `return true` (Chrome ignores returned Promises).
- **Grok OAuth:** the device flow must request the `grok-cli:access` scope, and proxy requests
  must send `x-grok-client-version` — removing either breaks inference with misleading errors.
- **DOM injection:** only touch leaf blocks; mark nodes with `data-ot-state`; restores must be
  lossless (originals are wrapped, never destroyed).

## Git Guidelines

- Work on `main`; small imperative commits. Phase completions get a `Complete Phase N` commit
  and a `phase-N` tag (lightweight tags — push them explicitly).
- Never commit secrets, `.env` files, or lockfiles other than `pnpm-lock.yaml`.
- Do not create issues or PRs unless the user asks.
