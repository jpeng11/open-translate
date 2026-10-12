# Validation

Acceptance date: 2026-10-12. Latest product changes include PDF navigation/form retention (`8089c49`), caption lifecycle fixes (`7698f05`), reference-based email exclusion (`ef03122`), popup/region controls, and AGY final-output compatibility (`99009f9`). Earlier checks remain separately identified below.

| Environment | Actual runtime | Result |
| --- | --- | --- |
| Linux development checkout | Python 3.12.3, Chromium 156.0.8078.4 | 53 Node + 39 Python passed; 31 Chromium passed in the complete run, final drag-selection case passed after correcting test scrolling (32 cases covered) |
| User's Mac mini | macOS 27.0.1, Python 3.12.15, Node 26.10.0, Chromium 156.0.8078.4 | Earlier 100-case full run passed; current browser build and actual Chrome→AGY/whisper.cpp routes passed |
| Linux Firefox | Firefox 157, real temporary MV3 extension through Marionette | Workspace/page/input, mixed root text, exact restoration, trusted settings, credential isolation, transcription/image fallback passed |
| Pinned original vs replacement | Actual Immersive Translate 1.33.3 and actual unpacked Open Translate, separate Chromium profiles | 9 base webpage checks passed; extended 17 cases: 12 matched, 3 differences, 2 original unresolved. media 10 cases: 7 matched, 2 differences, 1 original unresolved. Total 28 matches; full parity unverified |
| User's Mac mini, Safari packaging | Full Xcode, macOS and iOS Simulator host schemes, signing disabled | Both host builds previously succeeded. SafariDriver session blocked by disabled Allow remote automation; current runtime testing handed to user-designated Codex session |
| User's Mac mini, local speech | Homebrew whisper.cpp and hash-verified multilingual tiny GGML model | Actual English WAV recognition and authenticated multipart HTTP route passed; unauthenticated access rejected |

The user-designated Codex session independently pulled and tested an isolated clean snapshot at `663381b`: all 100 cases, actual Firefox, nine paired original cases, and stale-evidence rejection passed. The final OCR preference change at `498cd3d` additionally passed targeted PDF/OCR browser acceptance and an actual browser save/reload check synchronizing image and scanned-PDF languages.

Commands: `npm run check`, `python3 -m unittest discover -q`, `python3 scripts/test-firefox.py`, and `npm run parity:reference -- /private/path/to/reference-extension`. A first Linux browser run exposed an ambiguous video locator after adding screen OCR; the test was scoped to its intended subtitle preview, then passed. The complete subsequent Mac run passed all 100 cases.

## Meaningful runtime coverage

- Bilingual and translated webpage rendering, exact original node/event restoration, inline links/formatting, exclusions, mixed body/table text, RTL, frames, dynamic content, open shadow roots and SPA navigation.
- Batch/ID/placeholder validation, malformed responses, redacted errors, concurrency, cache invalidation, cancellation and stale response handling. One bounded AGY recovery keeps a shared deadline and never retries authentication/quota failures.
- Actual isolated content contexts cannot read API credentials or change trusted settings. Firefox also probes inaccessible extension-origin IndexedDB and legacy credential migration.
- DOCX formatted runs, links/relationships, tables, paragraph styles, headers/footers; HTML safe styles/links/code; EPUB packaged resources and spine order.
- PDF vector originals, searchable Chinese/Arabic/Hebrew/English text, bidi ordering and complete overflow continuation. Accessible HTML attachment/export is included; tests extract text from the actual exported PDF.
- Actual bundled English OCR plus integrity-verified French initialization/download/offline reuse, local masked-region repair and RTL wrapping. 124 model packs are listed; testing two packs does not establish all-language recognition quality.
- SRT/VTT/ASS timing, native preview cues, dynamic/open-shadow captions, sidecar cues and screen-capture OCR with changed-caption recognition and track release.
- Actual AudioWorklet PCM capture, 16-kHz mono WAV encoding, automatic 2-second chunk submission, pause/queue/cancellation handling, transcription/translation and SRT export. Browser CI uses deterministic speech/translation responses; local speech acceptance separately invokes real whisper.cpp.
- Long HTTP inference completes through Chromium's offscreen worker after 32 seconds; Firefox executes its supported background fallback.
- Rare UI navigation/counters/orbs, keyboard operation, active-link accessibility, reduced motion, 390-pixel workspace layout and compact popup rendering.

## Original comparison and REA

The [REA workflow](rev-workflow.md) executed the actual REA 6.4.0 CLI against an isolated browser and captured the original website's runtime scripts/page/screenshot. Original extension files remain private, pinned to official commit `c470f0aca3c75b2785c9009a0ac48e78ead34126` and blob verified.

[Reference results](parity/reference-results.json) compare both extensions with the same English→French Custom API fixture. The final corpus uses complete sentences because a short inline fragment was intermittently skipped by the original before API submission. That heuristic is not considered resolved. Nine checks cover output, original source identity, placeholder, target language, source-content restoration, code/`translate=no`/input exclusions and dynamic content. The original leaves discovery attributes; the replacement restores the fixture DOM exactly. Popup screenshots support review but no pixel-equality assertion. Evidence binds to the implementation source digest, so later code changes require a new reference run.

`npm run parity` reports outstanding areas. `npm run parity -- --strict` currently exits 1 by design: all product areas still need broader paired original acceptance. Passing independent replacement tests cannot silently turn into a full-parity claim.

## Real agents and local speech

AGY acceptance uses the user's Google Antigravity CLI 1.3.2, cached login and model `gemini-3.8-flash-low`. The updated implementation also passed a real standalone Chromium→Python bridge→AGY check translated `Bonjour <b>monde</b> {0}.` to `Hello <b>world</b> {0}.` and `Merci pour votre aide.` to `Thank you for your help.`, then restored source DOM. The latest live check passed at `99009f9` after fixing an observed AGY final-output compatibility error, with inline formatting, placeholders and restoration intact. Reproduce:

```bash
node scripts/live-check.mjs "$HOME/Library/Application Support/Open Translate/standalone-connection.json"
```

This consumes the selected provider's usage. Private token/configuration files remain outside Git. AGY uses its built-in `finish` tool to submit final structured output; that exact operation is accepted. Other or unknown tool events still fail validation. Recovery is not a tool-execution barrier or long-run reliability guarantee.

Local speech acceptance used the actual installed whisper.cpp executable and pinned tiny model described in [local speech](local-speech.md). The official English sample was correctly transcribed through `/v1/audio/transcriptions`. HTTP 401 without authentication and Chromium/Safari extension preflights were verified. The existing loopback bridge was restarted with optional local speech enabled, retaining its private token.

## Remaining acceptance

Browser manifests/builds do not establish Safari/mobile runtime acceptance, signing or store distribution. Edge branded, Safari runtime, Android/iOS devices and broad production-site evaluation remain pending. PDFs retain native form/bookmark/navigation graphs, but translated-page backgrounds remain rasterized and accessible tag trees are not rebuilt. Artwork reconstruction, arbitrary OCR languages, private/DRM captions, noisy meetings, latency and model-quality equivalence require paired evaluation. See [browser support](browser-support.md), [document fidelity](document-fidelity.md), [media coverage](media-translation.md), and the [parity baseline](parity/baseline.json).


## Current reconstruction increment

The first combined 32-case Chromium run passed 31 cases; the screen-region drag
fixture attempted mouse coordinates outside the visible viewport. Adding
`scrollIntoViewIfNeeded()` fixed the test without product changes; the targeted
preset/drag/OCR/persistence case passed. The 53 Node and 39 Python tests passed,
as did actual Firefox acceptance. The named Codex session is independently testing
Safari; delivery and acknowledgement were received, with no runtime pass inferred.

The replacement build now carries a source/bundle hash stamp. Paired reports
reject stale builds and verify them again after testing. Original configuration
is constrained to the pinned packaged defaults plus explicit local fixtures,
blocking external hostname resolution. The old short dynamic probe stopped
translating under this configuration; its failure is retained privately and the
base dynamic test now uses a complete English paragraph. Extended reports retain
short-input detection and intermittent original mixed-text uncertainty.

AGY live validation initially failed; diagnostic stream inspection found that its
legitimate built-in `finish` submission was rejected as an operational tool. The
narrow fix permits only that exact name, with regression cases rejecting file,
command, subagent and unnamed tools even before a later valid finish. The bridge
was restarted preserving its token and local speech configuration; real inline
translation and authenticated whisper.cpp checks passed afterward.

The final paired ledger contains 36 checkpoints: 28 matched, five observed
differences, and three unresolved original-reference cases. Native VTT comparisons
use an original VP8 timeline fixture and configured localhost adapters. Passing
base/extended/media cases does not establish production-site or document-export
equivalence. `npm run parity` validates this ledger; strict mode exits 1 because
required whole-product acceptance remains outstanding.
