# Open Translate

Open-source bilingual web translation — like Immersive Translate, but you
connect **your own AI model**. Any OpenAI-compatible endpoint works: OpenAI,
OpenRouter, DeepSeek, Groq, local Ollama, or anything custom.

## Features (MVP)

- Bilingual webpage translation: translations injected under the original
  paragraphs, with one-click restore
- Bring-your-own model: base URL + API key + model name, stored locally
- Translation-only display mode
- Per-page cost guard and session translation cache

## Install (development)

```bash
npm install
npm run build        # outputs to .output/chrome-mv3
```

Then in Chrome/Edge: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `.output/chrome-mv3`.

For live-reload development:

```bash
npm run dev
```

## Configure your model

1. Right-click the extension icon → **Options** (or click the gear in the popup).
2. Pick a preset (OpenAI, OpenRouter, DeepSeek, Groq, Ollama, Custom) — presets
   only fill the base URL and a suggested model; the API key is always yours.
3. Paste your API key, adjust the model if needed, click **Test connection**,
   then **Save**.

**Ollama note:** the browser sends requests from an extension origin, so you
must allow it: start Ollama with `OLLAMA_ORIGINS=*` (or set it to the
extension origin) or requests will fail with 403.

## Privacy

- Your API key is stored in `chrome.storage.local` on your machine only.
- Page text is sent **only** to the endpoint you configure — no other servers,
  no telemetry, no content retention by this extension.

## Roadmap

See [plan.md](plan.md) — documents (PDF/EPUB/subtitles), video bilingual
subtitles, image OCR, glossaries, and Firefox support are planned phases.

## License

MIT
