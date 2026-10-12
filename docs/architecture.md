# Architecture and protocol

Open Translate contains an independently implemented Manifest V3 extension and an optional Python bridge for a user-configured OpenAI-compatible endpoint or the installed AGY CLI. It is based on the public interface, official API documentation and static inspection of extension version 1.33.3 at official release-repository commit `c470f0aca3c75b2785c9009a0ac48e78ead34126`.

No proprietary extension bundles are included in this repository.

## Standalone browser pipeline

The content script discovers visible leaf paragraphs, preserves inline markup using numeric DOM markers, schedules viewport work and observes dynamic text changes. It retains the original DOM nodes for restoration. Model output is rendered through text nodes and a whitelist of original inline elements; returned HTML is never evaluated. Responses are discarded after restoration or when the source changes.

The service worker owns credentials and validates sender contexts. Content scripts receive only reading preferences. A Chrome offscreen document owns an actual dedicated engine worker; the worker performs long provider and speech requests, with heartbeat messages keeping reply channels available. A bounded queue, in-flight deduplication, memory cache and optional IndexedDB cache are shared across tabs. Changing settings clears the cache. Site rules select content and translation languages; the configured endpoint cannot be overridden by webpage messages.

The workspace parses documents with local DOM/ZIP libraries. PDF.js extracts text and renders one page on demand; scanned pages use Tesseract. PDF-lib exports rasterized originals and translated overlays. OCR workers, WebAssembly and three language models ship inside the package. SRT/VTT/ASS import/export retains timing; preview uses native text tracks. Live capture uses explicit browser permissions, independent 15-second MediaRecorder chunks and the configured transcription endpoint.

## Optional bridge request flow

1. The extension selects text, preserves inline DOM content using placeholders, and sends a JSON batch to `POST /translate`.
2. The local HTTP server checks its access token, browser origin, body size and request schema.
3. The adapter skips blank items and gives each remaining item its original zero-based index as an ID.
4. Numeric placeholders and inline tags are replaced with per-request opaque markers. The original-to-marker map remains in memory.
5. The OpenAI backend sends a nonstreaming Chat Completions request to the configured endpoint. The AGY backend sends the same translation instructions and job JSON through the CLI stdin protocol. The system prompt describes the translation contract; the user message carries source language, target language and items as JSON data.
6. The endpoint response must contain a JSON translation object in `choices[0].message.content`; AGY returns it in the terminal event's `structured_output`. The bridge validates count, IDs, language codes, nonempty output and preservation of protected tokens.
7. It restores protected markup, orders results by the original request, and returns the extension's response schema. The extension handles final rendering.

## Extension-facing API

```http
POST /translate?token=PRIVATE_BRIDGE_TOKEN
Content-Type: application/json
```

```json
{
  "source_lang": "fr",
  "target_lang": "en",
  "text_list": ["Bonjour {0}", "Bonjour monde"]
}
```

```json
{
  "translations": [
    {"text": "Hello {0}", "detected_source_lang": "fr"},
    {"text": "Hello world", "detected_source_lang": "fr"}
  ]
}
```

The authorization header is an alternative to the query token. `source_lang` accepts `auto`; `target_lang` must be explicit. If the agent omits detected language, the request's source code is used; that can be `auto`, which does not claim a detected language.

Malformed requests return 400/413/415. Auth failures return 401/403. Upstream protocol failures return 502, temporary capacity/provider limits return 503, and upstream socket timeouts return 504. Errors have this shape and never masquerade as translated text:

```json
{"error":{"code":"placeholder_mismatch","message":"Agent changed protected markup; retry with a more reliable model"}}
```

The OpenAI-compatible backend performs no automatic provider retries. AGY allows one fresh-session recovery for malformed output or operational-tool events, sharing the original deadline; authentication and quota failures are not retried. Provider billing remains the endpoint's responsibility.

## Agent-facing API

The upstream request uses `model`, `messages`, `stream: false`, and, unless disabled, `response_format: {"type":"json_object"}`. It does not assume vendor-specific fields or default a model name.

The user message is a JSON string containing:

```json
{
  "source_lang": "fr",
  "target_lang": "en",
  "items": [
    {"id": 0, "text": "Bonjour ⟦OTnonce_0_0⟧"},
    {"id": 1, "text": "Bonjour monde"}
  ]
}
```

The marker above is illustrative; the bridge creates a fresh random prefix for each batch. The expected model output in `message.content` is JSON text:

```json
{
  "translations": [
    {"id": 1, "text": "Hello world", "detected_source_lang": "fr"},
    {"id": 0, "text": "Hello ⟦OTnonce_0_0⟧", "detected_source_lang": "fr"}
  ]
}
```

Response order may differ from request order. Each supplied integer ID and each protected marker must occur exactly once in its own item. JSON mode improves formatting reliability but does not replace application-level validation. A response fully enclosed in a JSON Markdown fence is tolerated; arbitrary prose is not extracted or guessed.

## AGY backend

A batch launches the configured `agy` executable with stdin/output `stream-json`, a translation JSON schema, default approval mode, terminal sandbox and an explicit timeout. It sends one user event, closes stdin and waits for completion. [Google documents this single-turn stdin lifecycle and result envelope](https://antigravity.google/docs/cli/headless/).

The bridge accepts exactly one successful terminal result, permits only its built-in final-output `finish` tool event, rejects other/unknown tool events, and applies the shared ID/markup validation. Authentication, quota and timeout failures become bridge errors without forwarding CLI diagnostics. A timeout kills the process group on macOS/Linux. The bridge reads at most 2 MiB of captured stdout after the run; temporary output files may grow until the process exits or times out.

Each process runs in a fresh temporary directory containing only our declarative translation profile. The profile selects `finish` for structured completion, opts out of inherited customizations and disables subagent invocation and automatic command execution. It is selected explicitly with `--agent`; slash command expansion is disabled. In AGY 1.3.2, the startup envelope still advertises the default tool list, so these settings are not treated as an execution barrier. It does not resume a conversation. User-level AGY settings, credentials, permissions, MCP tools and hooks remain applicable. Rejecting a reported tool event is output validation, not a tool-execution barrier. The bridge does not change global CLI configuration or persist a translation cache; the CLI and provider may keep their own history.

## Scope of validation

Tests cover real local sockets between the bridge and a mock Chat Completions server. The standalone extension also has actual Chromium Manifest V3 acceptance tests; see [validation](validation.md). These verify behavior, rather than model translation quality. Source-text prompt instructions are treated as data in the prompt, but model adherence is probabilistic; callers should use an endpoint dedicated to translation.

The bridge binds to `127.0.0.1`, caps simultaneous provider calls and input/output sizes, and keeps endpoint credentials server-side. It is intended to run alongside a desktop browser.

## References

- [Immersive Translate Custom API contract and setup](https://immersivetranslate.com/en/docs/services/custom/)
- [Immersive Translate advanced configuration](https://immersivetranslate.com/en/docs/advanced/)
- [Official extension release repository at inspected commit](https://github.com/immersive-translate/immersive-translate/tree/c470f0aca3c75b2785c9009a0ac48e78ead34126/dist/chrome)
- [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI JSON mode and structured output guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)

- [Google Antigravity CLI headless protocol](https://antigravity.google/docs/cli/headless/)
