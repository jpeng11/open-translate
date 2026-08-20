# Privacy Policy — Open Translate

Last updated: 2026-08-20

Open Translate is designed so that **your data never passes through us — because
there is no "us"**. The extension has no backend, no analytics, and no telemetry.

## What the extension stores

- Your settings (endpoint URL, API key or OAuth tokens, model name, target
  language, glossary, site rules) are stored in `chrome.storage.local` on your
  device only. They sync nowhere.
- Translations are cached in `chrome.storage.session`, which the browser wipes
  when it closes.

## What leaves your device

- The text you translate (page snippets, subtitles, document contents, or images
  you right-click) is sent **only** to the AI endpoint you configured — e.g.
  OpenAI, OpenRouter, xAI, or your own local Ollama server. No other destination
  ever receives your content.
- If you sign in with X (Grok OAuth), authentication happens directly between
  your browser and `accounts.x.ai`; tokens are stored locally.

## What we collect

Nothing. There are no servers, no crash reporting, no usage metrics, and no
third-party trackers.

## Your provider's policies

Text sent to your configured AI endpoint is governed by that provider's privacy
policy. If you want translations to stay entirely on your machine, point the
extension at a local model (e.g. Ollama at `http://localhost:11434/v1`).

## Contact

Open an issue at <https://github.com/jpeng11/open-translate/issues>.
