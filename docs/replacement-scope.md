# Standalone replacement scope

Open Translate now targets a standalone browser extension: Immersive Translate is not a runtime dependency. The original Python bridge remains an optional backend for AGY or OpenAI-compatible agents.

The reverse-engineering reference is the official 1.33.3 compiled distribution at commit `c470f0aca3c75b2785c9009a0ac48e78ead34126`, inspected on 2026-10-12. Its content walker, viewport scheduling, DOM-change observation, per-site rules, protected inline content, background transport and bilingual rendering inform independent implementations here. No proprietary bundle is copied into the extension.

The current public product also advertises document/PDF/EPUB, image/OCR, subtitles, input/selection/hover translation and live audio translation. These are separate acceptance areas, rather than an assumption that a functioning AI adapter provides product parity.

| Area | Replacement acceptance |
| --- | --- |
| Browser | Own installable Chrome/Edge build; Firefox deferred; original code under MIT; Rare UI components have separate terms |
| Webpages | Bilingual and translated views, dynamic content, viewport scheduling, inline links/formatting, editable/code exclusions, restoration, site rules |
| Quick translation | Selection popup, hover shortcut, input translation, context menus, keyboard shortcuts, pronunciation |
| Engines | User-owned OpenAI-compatible endpoint, local AGY bridge, models and credentials configured by user |
| Reliability | Strict batch ordering, protected markup, concurrency, cancellation/stale-response checks, visible errors, cache controls |
| Documents | TXT, Markdown, HTML, DOCX, EPUB translation and downloadable bilingual/translated output |
| PDF | Local parsing, rendered pages, translated layout preview, searchable text extraction, scanned-page OCR, PDF export |
| Images | Local image/area OCR, text translation, region overlay, downloadable image |
| Subtitles | SRT/VTT/ASS parsing, preserved timing, bilingual/translated export, local-video preview and native text-track translation |
| Live audio | Explicit tab/microphone capture, user-configured OpenAI-compatible transcription endpoint, translated transcript |
| Privacy | User-selected endpoint, no vendor account, local document/OCR processing, no telemetry, credentials kept out of page messages, cache opt-in |

A complete commercial-product parity claim additionally needs device/browser acceptance, layout/translation-quality evaluation, supported-site coverage and reliable live meeting/media integrations. Platform restrictions, inaccessible DRM captions, closed shadow roots and scanned/complex documents must be recorded honestly when they affect an implementation.

References: [official product surface](https://immersivetranslate.com/en/), [advanced configuration](https://immersivetranslate.com/en/docs/advanced/), [Custom API](https://immersivetranslate.com/en/docs/services/custom/).
