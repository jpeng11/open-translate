# Open Translate

Open-source bilingual web translation — like Immersive Translate, but you
connect **your own AI model**. Any OpenAI-compatible endpoint works: OpenAI,
OpenRouter, DeepSeek, Groq, local Ollama, or anything custom.

## Features

- Bilingual webpage translation: translations injected under the original
  paragraphs, with one-click restore; SPA-aware via MutationObserver
- Bring-your-own model: base URL + API key + model name, stored locally —
  or sign in with a coding-agent subscription instead of a key:
  **Grok (X)**, **GitHub Copilot**, **Claude Pro/Max**, and **ChatGPT
  Plus/Pro** OAuth (ChatGPT needs "Device code authorization" enabled under
  Settings → Security)
- Quick tools: selection translate, hover translate, input-box translate
- Document translation: PDF, EPUB, TXT, Markdown, SRT, ASS → bilingual output
- YouTube bilingual subtitles (translates the native captions live)
- Right-click **Translate this image** using your vision-capable model
- Custom glossary, per-site auto-translate, excluded sites
- Translation-only display mode, per-page cost guard, session translation cache

## Install (development)

```bash
pnpm install
pnpm build           # outputs to .output/chrome-mv3
pnpm build:firefox   # outputs to .output/firefox-mv2
pnpm zip             # store-ready zip in .output/
```

Then in Chrome/Edge: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `.output/chrome-mv3`.

For live-reload development:

```bash
pnpm dev
```

## Configure your model

1. Right-click the extension icon → **Options** (or click the gear in the popup).
2. Pick a preset (OpenAI, OpenRouter, DeepSeek, Groq, Ollama, Custom) — presets
   only fill the base URL and a suggested model; the API key is always yours.
3. Paste your API key, adjust the model if needed, click **Test connection**,
   then **Save**.

**Ollama / local models (CORS):** the browser sends requests from an extension
origin, so you must allow it — start Ollama with
`OLLAMA_ORIGINS=chrome-extension://*` (or `OLLAMA_ORIGINS=*`), otherwise
requests fail with 403. Same idea applies to LM Studio and other local servers:
enable CORS for extension origins. Local endpoints need no API key.

## Privacy

No backend, no telemetry, no analytics. Your keys stay in `chrome.storage.local`;
page text is sent **only** to the endpoint you configure. Full policy:
[PRIVACY.md](PRIVACY.md).

## Roadmap

See [plan.md](plan.md) for the full phase history and remaining stretch goals
(layout-preserved PDF, more subtitle platforms, manga mode).

## License

MIT
