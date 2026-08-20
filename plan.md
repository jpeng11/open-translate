# Open Translate — Project Plan & Tracker

> Single source of truth for project status. Update checkboxes as work lands.
> Git: work on `main`, commit each meaningful step, end each phase with a
> `Complete Phase N` commit + `phase-N` tag + push to
> `git@github.com:jpeng11/open-translate.git`.

**Goal:** Open-source bilingual translator with Immersive Translate–like UX,
where users connect their own AI models (OpenAI-compatible endpoints).
Original branding, MIT license, no proprietary code copied.

**Stack:** WXT + React 19 + TypeScript + Vite, Tailwind CSS (popup/options),
`chrome.storage.local` for settings/keys, Vitest (later), MV3.

**Privacy rules (non-negotiable):**

- API keys only in `chrome.storage.local`; never logged, never leave the
  machine except to the user-configured `baseUrl`.
- No telemetry of page content.

## Current focus

**Phase 2 — Bilingual webpage MVP** (Phases 0–1 in this working session)

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

## Phase 2 — Bilingual webpage (MVP)

- [ ] Leaf-block detection (p, h1–h6, li, blockquote, td, …; skip nav/code/pre/script)
- [ ] Batch ~20–40 strings per request via background worker
- [ ] Inline markup: MVP translates block plain text (original stays visible in
      bilingual mode); tag preservation deferred to Phase 7
- [ ] Inject translation under original (bilingual) or hide original
      (translation-only); data attributes for restore
- [ ] Translation cache `(text, targetLang, model)` in `storage.session`
- [ ] Cost guard: per-page char cap (default 100k) + "translate rest" affordance
- [ ] MutationObserver for SPA content (debounced, ignores own nodes)
- [ ] Per-batch error indication
- [ ] Site exclude list

**MVP definition of done:** On a long English article in Chrome, configure an
OpenAI-compatible key, click Translate, see stable bilingual paragraphs;
Restore works; keys never logged.

## Phase 3 — Quick translate tools

- [ ] Selection translation floating panel
- [ ] Hover translation (hotkey or delay)
- [ ] Input-box translation shortcut

## Phase 4 — Documents

- [ ] Upload page/side panel: PDF / EPUB / TXT / SRT|ASS
- [ ] PDF text-layer extraction (pdf.js); layout-preserved bilingual = stretch
- [ ] EPUB chapter walk + bilingual HTML export
- [ ] Bilingual SRT/ASS download

## Phase 5 — Video subtitles

- [ ] YouTube caption tracks → bilingual overlay (DOM-scrape fallback)
- [ ] Cue-level translation cache
- [ ] Additional platforms where feasible without brittle private APIs

## Phase 6 — Images

- [ ] Image OCR (Tesseract.wasm or user-configured cloud OCR) → translate → overlay
- [ ] Manga balloon detection (stretch)

## Phase 7 — Hardening

- [ ] Firefox build via WXT
- [ ] Custom glossary (term mappings forced into prompt)
- [ ] Inline-tag preservation (placeholder tokens)
- [ ] Per-site auto-translate rules
- [ ] Store listing assets, privacy policy page, Ollama/CORS docs
