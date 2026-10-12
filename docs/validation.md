# Validation

Live acceptance run: 2026-10-12.

## Environments

- Linux development checkout: Python 3.12.3.
- Mac mini: macOS 27.0.1, Homebrew Python 3.12.15, Google Antigravity CLI 1.3.2.
- AGY model: `gemini-3.8-flash-low`, confirmed using the installed CLI's model list.

The 30 automated tests pass on both environments. The macOS run exposed an upload/connection-close race in the oversized-body test. The test now declares an oversized body and verifies immediate HTTP 413 before upload, independently of platform TCP buffering. Oversized uploads sent without waiting for the rejection can receive a connection reset.

## Live agent checks

The CLI connection check translated `Hello, world.` to `Bonjour le monde.` through the user's signed-in AGY CLI. No OpenAI endpoint or API key was required.

The running loopback bridge was tested through its actual extension-facing HTTP API:

- `GET /health`: HTTP 200, status `ok`.
- Unauthenticated `POST /translate`: HTTP 401.
- Extension-origin preflight with private-network request: HTTP 200 and matching CORS headers.
- Authenticated French-to-English batch: HTTP 200, completed in 6.42 seconds.

Input:

```json
{"source_lang":"fr","target_lang":"en","text_list":["Bonjour <b>monde</b> {0}","Merci {{1}}."," \n"]}
```

Actual output:

```json
{
  "translations": [
    {"text":"Hello <b>world</b> {0}","detected_source_lang":"fr"},
    {"text":"Thank you {{1}}.","detected_source_lang":"fr"},
    {"text":" \n","detected_source_lang":"fr"}
  ]
}
```

These checks exercised the installed CLI and provider, real HTTP sockets, token authentication, preflight headers, batch order, markup restoration, both numeric-placeholder forms and preservation of blank items. Credentials and bridge tokens are absent from this document and Git history.

## Remaining acceptance

The installed browser extension's configuration and bilingual DOM rendering have not been exercised. Import the generated configuration as described in the Mac setup guide, then translate a webpage. No claim of full browser acceptance is made by the API checks above. The model check is a small functional sample, not a translation-quality benchmark.
