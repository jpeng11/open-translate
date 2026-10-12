# Architecture and protocol

Open Translate is a small independent adapter between Immersive Translate's Custom API and a user-configured OpenAI-compatible endpoint. It is based on the public interface, official API documentation and static inspection of extension version 1.33.3 at official release-repository commit `c470f0aca3c75b2785c9009a0ac48e78ead34126`.

No proprietary extension bundles are included in this repository.

## Request flow

1. The extension selects text, preserves inline DOM content using placeholders, and sends a JSON batch to `POST /translate`.
2. The local HTTP server checks its access token, browser origin, body size and request schema.
3. The adapter skips blank items and gives each remaining item its original zero-based index as an ID.
4. Numeric placeholders and inline tags are replaced with per-request opaque markers. The original-to-marker map remains in memory.
5. The bridge sends a nonstreaming Chat Completions request to the configured endpoint. The system prompt describes the translation contract; the user message carries source language, target language and items as JSON data.
6. The response must contain a JSON translation object in `choices[0].message.content`. The bridge validates count, IDs, language codes, nonempty output and preservation of protected tokens.
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

The bridge performs no automatic provider retries. The extension may retry its own request; provider billing and side effects remain the endpoint's responsibility.

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

## Scope of validation

Tests cover real local sockets between the bridge and a mock Chat Completions server. They verify protocol behavior, not model translation quality or the extension's entire browser pipeline. Source-text prompt instructions are treated as data in the prompt, but model adherence is probabilistic; callers should use an endpoint dedicated to translation.

The bridge binds to `127.0.0.1`, caps simultaneous provider calls and input/output sizes, and keeps endpoint credentials server-side. It is intended to run alongside a desktop browser.

## References

- [Immersive Translate Custom API contract and setup](https://immersivetranslate.com/en/docs/services/custom/)
- [Immersive Translate advanced configuration](https://immersivetranslate.com/en/docs/advanced/)
- [Official extension release repository at inspected commit](https://github.com/immersive-translate/immersive-translate/tree/c470f0aca3c75b2785c9009a0ac48e78ead34126/dist/chrome)
- [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI JSON mode and structured output guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)
