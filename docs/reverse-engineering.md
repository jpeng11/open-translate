# Reverse-engineering reference

Inspected on 2026-10-12: the public Immersive Translate website and the official Chrome distribution version 1.33.3, pinned to release-repository commit `c470f0aca3c75b2785c9009a0ac48e78ead34126`. The parent `rev` workspace contains the reproducible analyzer and hash manifest. Its offline run verifies 12 artifacts and 20 source anchors. Those compiled proprietary artifacts are not included in Open Translate.

The inventory contains 86 service configuration entries, including aliases and free/pro/custom variants, 781 site rules and 32 declared network header rules. These counts describe the inspected configuration, not independent engines, tested websites or observed requests.

| Observed client behavior | Independent replacement |
| --- | --- |
| Content container discovery and inline-node placeholders | `extension/src/dom.mjs` discovers leaf blocks and reconstructs allowed inline markup while retaining original DOM nodes |
| Visibility scheduling and page-change tracking | `extension/src/content.mjs` uses intersection and mutation observation, including accessible open shadow roots |
| Background provider transport | `extension/src/background.mjs` validates senders and holds credentials; the offscreen host delegates long requests to a worker |
| Bilingual/translated rendering and restoration | Source nodes remain available for translation-only mode and exact restoration, including existing event handlers |
| Batched IDs, protected content and caching | `extension/src/core.mjs` and `engine.mjs` validate IDs/counts/tokens and schedule bounded cached work |
| Custom API request/response boundary | The optional Python bridge accepts `source_lang`, `target_lang`, `text_list` and returns ordered `translations` |
| Auxiliary OCR/model workers | Bundled local Tesseract workers and models; PDF.js parsing/rendering and pdf-lib export |

The original client exposes direct provider adapters as well as authenticated hosted gateways. Open Translate uses the user's own OpenAI-compatible endpoint or local AGY bridge. It does not replay Immersive account tokens, depend on its hosted gateways, or reproduce its private server implementation. The 781 proprietary rules were not copied; replacement site settings support host matching and include/exclude selectors.

Static client analysis establishes observable architecture and integration contracts. It does not establish the original server routing, billing, retention, translation quality or complete document/media algorithms. The independently implemented document, image, subtitle and live-audio features are validated separately; their limits are listed in the README and [validation report](validation.md).

References: [pinned official distribution](https://github.com/immersive-translate/immersive-translate/tree/c470f0aca3c75b2785c9009a0ac48e78ead34126/dist/chrome), [public Custom API contract](https://immersivetranslate.com/en/docs/services/custom/), [advanced configuration](https://immersivetranslate.com/en/docs/advanced/), [product surface](https://immersivetranslate.com/en/).
