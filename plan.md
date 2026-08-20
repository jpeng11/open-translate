# Open Translate — Project Plan & Tracker

> Single source of truth for project status. Update checkboxes as work lands.
> Git: work on `main`, commit each meaningful step, end each phase with a
> `Complete Phase N` commit + `phase-N` tag + push to
> `git@github.com:jpeng11/open-translate.git`.

**Goal:** Open-source bilingual translator with Immersive Translate–like UX,
where users connect their own AI models (OpenAI-compatible endpoints).
Original branding, MIT license, no proprietary code copied.

**Stack:** WXT + React 19 + TypeScript + Vite, Tailwind CSS (popup/options),
`chrome.storage.local` for settings/keys, Vitest (later), MV3. Package
manager: **pnpm**.

**Privacy rules (non-negotiable):**

- API keys only in `chrome.storage.local`; never logged, never leave the
  machine except to the user-configured `baseUrl`.
- No telemetry of page content.

## Current focus

**Phase 8 — coding-agent subscriptions.** Most target users already pay for a
coding agent, so let them sign in with that subscription instead of buying API
keys. Grok OAuth (Phase 1) proved the pattern; Copilot is next.

## Phase 0 — Scaffold and tracker

- [x] `git init` + universal `.gitignore` (AI artifacts, node, build output, secrets, OS)
- [x] WXT React + TS scaffold with `background`, `content`, `popup` entrypoints
- [x] `plan.md` tracker (this file)
- [x] README: install, load unpacked, configure model, privacy note
- [x] Wire `origin` → `git@github.com:jpeng11/open-translate.git`, initial push

## Phase 1 — Bring-your-own AI

- [x] Manifest: `host_permissions: ["<all_urls>"]`, `storage` + `activeTab` permissions
- [x] Settings schema: `baseUrl`, `apiKey`, `model`, `targetLang`,
      `neverTranslateLangs[]`, `displayMode`, `maxCharsPerPage`, `excludedSites`
- [x] Presets (fill base URL/model only): OpenAI, OpenRouter, DeepSeek, Groq,
      Ollama (`http://localhost:11434/v1` + `OLLAMA_ORIGINS` note), Custom
- [x] Provider client: JSON-array batch protocol, index validation, retry once,
      per-item fallback, concurrency limit
- [x] Options page: provider form + Test connection
- [x] Popup: target language, Translate/Restore, provider status
- [x] MV3 keepalive: long-lived Port from content script during translation
- [x] Grok OAuth ("Sign in with X"): device-code flow against `auth.x.ai`,
      tokens auto-refresh, requests via `cli-chat-proxy.grok.com/v1` with
      `X-XAI-Token-Auth` + `x-grok-model-override` headers (SuperGrok /
      X Premium+ subscription; useful for keyless testing)

## Phase 2 — Bilingual webpage (MVP)

- [x] Leaf-block detection (p, h1–h6, li, blockquote, td, …; skip nav/code/pre/script)
- [x] Batch ~20–40 strings per request via background worker (≤30 items / ≤4k chars)
- [x] Inline markup: MVP translates block plain text (original stays visible in
      bilingual mode); tag preservation deferred to Phase 7
- [x] Inject translation under original (bilingual) or hide original
      (translation-only); data attributes for restore
- [x] Translation cache `(text, targetLang, model)` in `storage.session`
- [x] Cost guard: per-page char cap (default 100k) + "Translate rest" button
- [x] MutationObserver for SPA content (debounced, ignores own nodes)
- [x] Per-batch error indication (inline error chip with message tooltip)
- [x] Site exclude list (popup toggle + options textarea)

**MVP definition of done:** On a long English article in Chrome, configure an
OpenAI-compatible key, click Translate, see stable bilingual paragraphs;
Restore works; keys never logged.

## Phase 3 — Quick translate tools

- [x] Selection translation floating panel (select text → "⇄ Translate" button)
- [x] Hover translation (hold Alt/Option and hover a paragraph)
- [x] Input-box translation (press Space 3× quickly inside an input/textarea)

## Phase 4 — Documents

- [x] Upload page (`documents.html`, linked from popup): PDF / EPUB / TXT / MD / SRT / ASS
- [x] PDF text-layer extraction (pdf.js, line/paragraph reconstruction); scanned-PDF OCR
      deferred to Phase 6+; layout-preserved bilingual remains a stretch goal
- [x] EPUB chapter walk (container → OPF → spine) + bilingual HTML export
- [x] Bilingual SRT/ASS download (round-trip-valid SRT; ASS override tags preserved)

## Phase 5 — Video subtitles

- [x] YouTube bilingual overlay via caption-DOM mirroring (robust against private
      API changes; works for auto-generated and live captions); stale-result guard
- [x] Cue-level translation cache (normalized cues route through the session cache)
- [x] Settings toggle (`videoSubtitles`, on by default; respects excluded sites)
- [ ] Additional platforms where feasible without brittle private APIs (deferred —
      Netflix/Prime DRM players make DOM mirroring unreliable; revisit on demand)

## Phase 6 — Images

- [x] Right-click "Translate this image" → the user's own vision-capable model does
      OCR + translation in one call (BYO-model instead of bundling ~15 MB Tesseract
      WASM, which is also CSP-hostile in MV3); result panel anchored to the image
- [x] 6 MB image cap; data-URL passthrough; clear error for fetch failures
- [ ] Manga balloon detection (stretch — deferred)

## Phase 7 — Hardening

- [x] Firefox build via WXT (`pnpm build:firefox` → `.output/firefox-mv2`) + store zips
      (`pnpm zip`, `pnpm zip:firefox`)
- [x] Custom glossary ("term = translation" lines; only entries present in the batch
      are injected into the prompt)
- [ ] Inline-tag preservation (placeholder tokens) — deferred: bilingual mode keeps the
      original formatting visible, so the payoff doesn't justify the protocol risk yet
- [x] Per-site auto-translate rules (hostname + subdomains; skips unconfigured/excluded)
- [x] Privacy policy (PRIVACY.md), Ollama/CORS docs, README feature list refresh

## Phase 8 — Coding-agent subscriptions (bring-your-own agent)

Sign in with a coding-agent subscription instead of an API key. Each of these
is its own OAuth flow and must be verified live before being called done —
the Grok flow taught us that scopes/headers fail with misleading errors.

Every agent supports both paths where the vendor allows it: OAuth subscription
sign-in and an API-key preset. All endpoints verified against official docs
(GitHub device flow docs, developers.openai.com/codex/auth, Anthropic +
Gemini OpenAI-compat docs) on 2026-08-20.

- [x] Grok / SuperGrok (Sign in with X) — shipped and verified live (Phase 1);
      API-key pair: `xai-key`
- [x] GitHub Copilot — device flow (official GitHub OAuth device endpoints) +
      `copilot_internal/v2/token` exchange with `Copilot-Integration-Id`
      (scopes the issued token — required for full model access) +
      editor headers against the OpenAI-compatible `api.githubcopilot.com`
      (`lib/copilotAuth.ts`); **needs live verification by a Copilot subscriber**.
      No API-key pair exists: GitHub Models was retired 2026-07-30 (official docs)
- [x] Claude Pro/Max — Claude Code OAuth PKCE in copy/paste mode (no localhost
      redirect needed) + Anthropic `/v1/messages` dialect with
      `anthropic-beta: oauth-2025-04-20` and the Claude Code identity system
      block (`lib/claudeAuth.ts`); **needs live verification by a subscriber**.
      API-key pair: `anthropic` (OpenAI-compat endpoint)
- [x] ChatGPT Plus/Pro — Codex device-auth flow (officially documented for
      headless devices; requires the "Device code authorization" toggle in
      ChatGPT Settings → Security) + ChatGPT Codex backend Responses/SSE
      dialect (`lib/codexAuth.ts`); **needs live verification by a subscriber**.
      API-key pair: `openai`
- [ ] Gemini CLI (Google OAuth) — **infeasible in a browser extension**:
      Google installed-app OAuth requires a loopback redirect (extensions
      can't listen on localhost), the device flow disallows cloud scopes, and
      OOB copy/paste was retired. API-key pair `gemini` (official
      OpenAI-compat endpoint) is the supported path

## Testing & release

- [x] Unit suite: Vitest + `wxt/testing` fake browser, 110+ tests across
      provider (batch protocol, auth headers, Anthropic/Codex dialects),
      cache, settings, presets, OAuth flows (Grok, Copilot, Claude, Codex),
      content DOM logic, documents (SRT/ASS/TXT/HTML export, chunking),
      subtitles, images, glossary (`pnpm test`)
- [x] E2E smoke: Playwright loads the built extension into Chromium, drives a
      real translate + restore against a mock OpenAI server (`pnpm test:e2e`,
      requires `pnpm build` first)
- [x] Grok OAuth verified live end-to-end (device flow, scopes, proxy headers)
- [x] Both targets build clean; store zips generate (`pnpm zip`, `pnpm zip:firefox`)
- [x] Tagged `v0.1.0`
