# Acceptance record

Acceptance date: 2026-10-12. The current product follows the [accepted behavior contract](accepted-behavior.md), with an independent [visual identity](visual-identity.md). Recommended differences and unresolved reference observations are retained explicitly. Matching the commercial product's UI or defects is not the release requirement.

The full functional acceptance at commit `775d87e` used implementation SHA-256 `959eda573d5da737ad0daa5926ca4631e011958af8310004a12033ee92b2b2df`. The Linux Chromium bundle is `2e9f0a1031df4b235bcc5be95cfe7d46058c01132d5d95118871b7f716a90452`; the Mac bundle is `176e45849b428105e5b7ec09e54d9f012c9b9129639dcb6d6d9ee8b5b38f0b7d`. They contain the same implementation inputs; platform-produced bundle bytes differ and are separately recorded.

## AGY rich-text fix (2026-10-13)

The active Mac bridge uses AGY CLI 1.3.2 with `--model gemini-3.8-flash-low`. The previous 977-word Wikipedia benchmark failed when the model changed formatting markers. AGY now translates context-linked text fragments and reconstructs formatting locally; strict item validation still rejects incomplete results. The 66 Node and 46 Python tests pass, including seven new fragment regressions.

Two uncached actual Chromium → bridge → AGY runs translated all 16 paragraphs of the same 977-word sample, retaining all 70 links and supported formatting, and restoring the exact source DOM. The isolated bridge finished in 57.952 seconds (first result 6.386 seconds); after restarting the actual bridge with its existing model, token and speech settings, it finished in 45.419 seconds (first result 5.259 seconds). These remain far above the requested 1–2 second full-page target. [Source-bound reports](acceptance/agy-formatting.json) record the Python bridge hash separately from the unchanged extension build hash. Earlier broad regression reports remain historical.

## Logo update

The subsequent logo-only update replaces the original bracket mark with an open globe, adds tab favicons, and updates the README images and sharing artwork. All four browser packages built successfully. All five existing UI/localization tests passed, covering light/dark themes, narrow layouts and six languages. Manifest PNG dimensions and bytes match the source artwork in every package; both favicon formats and the in-page mark decode successfully. Updated screenshots were visually reviewed. See the [current UI evidence](acceptance/ui.json) and [artwork source and export instructions](visual-identity.md).

This update uses implementation SHA-256 `3bb0aa1c4750d9c65c81cf6b1cfed3768b06339b127e2980eb8dd63510e3de2f` and Linux Chrome bundle `b314a12e66433323a153b9f6381271d392964b608be03d53033d07354df50f82`. Translation and bridge code did not change. Full regression, public-site, document, media and Mac live-provider reports below remain bound to `775d87e`; those suites were not rerun for the artwork change. Their old hashes are preserved, so `acceptance:verify` will require fresh broad evidence before qualifying this new asset build as a full acceptance release.

## Full functional results at 775d87e

| Acceptance | Result | Evidence |
| --- | --- | --- |
| Node tests | 66 passed, zero failures | [Full regression](acceptance/regression.json) |
| Python bridge tests | 39 passed, zero failures | Full regression |
| Chromium browser tests | 51 passed in one complete final run | Full regression; real unpacked MV3 workflows and browser module corpora |
| Firefox desktop | Actual temporary extension passed | Trusted settings, workspace/page/input translation, restoration, credential isolation, transcription and image fallback |
| Public websites | Five sites plus two stress fixtures passed | [Web report](acceptance/web.json), [scope](web-acceptance.md) |
| Documents | 19 passing browser cases, included in the 51 above | [Document report](acceptance/documents.json), [scope and limits](document-acceptance.md) |
| Media/OCR/live | 24 Node + 9 browser cases, included above | [Media report](acceptance/media.json), [scope and limits](media-acceptance.md) |
| Independent UI | All eight routes in light/dark and desktop/narrow layouts; six UI languages; keyboard navigation, labels, contrast, overflow and cross-window language persistence | [UI report and screenshot hashes](acceptance/ui.json), refreshed for the logo update above |
| Mac live AGY integration | Final build passed actual extension → bridge → AGY translation | [Provider report](acceptance/mac-agent.json) |
| Chrome/Edge/Firefox/Safari packaging | Four final archives built, about 29 MiB each | Build stamps in `dist/<browser>/build-evidence.json` |

`npm run acceptance` completed successfully after the final source freeze. `npm run acceptance:verify` validated all four regression/web/documents/media report bindings against that implementation and complete Chrome bundle. The regression additionally binds tests, scripts and Python backend inputs. Focused reports are subsets of the full run, not additional test counts.

The public site run used actual Wikipedia, MDN, GitHub, W3C and WHATWG pages with default reader rules. It checked 35 sampled paragraphs, 65 safe links, code exclusions, dynamic changes, preserved events and exact restoration. Stress fixtures covered the tail of a 5,105-paragraph page, 300 inserted nodes, and frames. A local deterministic provider isolates extension mechanics; it does not establish linguistic translation quality or unrestricted website compatibility.

## Six-language documentation and controls

Chinese, English, French, Spanish, Japanese and Korean READMEs share the same installation, protocol, privacy, platform and license facts. Button/menu names match the actual localized workspace and popup catalog. The language picker persists across windows and reloads without changing endpoint fields, model names, translation languages or source/output content. Progress widgets use the underlying status data so localized status text does not break them. Humanizer 3.1.0 is pinned with its MIT license under `.agents/skills/humanizer/`.

## Defects found and corrected during this expansion

- Paragraphs beyond the first candidate window were unreachable after scrolling; viewport priority and scroll rescanning now reach them.
- Cancelled or browser-ended capture could retain streams; capture cleanup now covers pending permission, stop and ended events.
- Screen OCR did not retry a failed translation, and region dragging ignored letterboxing; retry and video-content coordinates are corrected.
- Native caption reselection could duplicate visible originals; track visibility and restoration are corrected.
- CJK OCR inserted artificial spaces and left source strokes behind; script-aware text normalization and line-based masking address the tested cases.
- The broader OCR mask initially changed PDF pixels outside the intended region. Full regression caught this cross-feature failure; PDF and OCR now use separate padding, with the original PDF preservation assertion retained.
- PDF disposal used a removed PDF.js API, rotated/cropped text placement was wrong, and Japanese CFF subsets could expose searchable characters without rendering their glyphs. Loading-task cleanup, transformed geometry and a provenance-recorded padded TrueType font fix these cases.
- Document upload lacked an accessible label. The new route-level UI checks found it and a label was added.

Final multilingual PDF, rotated PDF and Chinese/Japanese/mixed OCR image exports were visually inspected in addition to parser/pixel assertions. The new workbench and popup screenshots were also reviewed in rendered light/dark and narrow layouts.

## Actual user endpoint

On the user's Mac mini, Chromium 156.0.8078.4 loaded the final extension and reached the existing authenticated AGY bridge. It translated `Bonjour <b>monde</b> {0}.` and `Merci pour votre aide.` into English, retained bold markup and `{0}`, then restored the original DOM. Private token/configuration files remain outside Git. Reproduce with:

```sh
node scripts/live-check.mjs "$HOME/Library/Application Support/Open Translate/standalone-connection.json"
```

This consumes the user's provider allowance. It is a small live integration check, not a broad translation-quality score. The Python bridge did not change in this expansion. Its previously verified local whisper.cpp route, authentication rejection and extension preflights remain historical speech evidence; the current live-media suite uses deterministic transcription responses.

## Remaining boundaries

Safari runtime testing remains assigned to the user-designated Codex session. Its last completed runtime attempt was blocked at SafariDriver session creation because **Allow remote automation** was disabled; no Safari extension-runtime pass is claimed. macOS/iOS host compilation was previously successful. Final source/build details were handed off for that session to continue. Branded Edge runtime and Android/iOS devices remain unqualified.

Complex PDF typography, RTL/Indic copy order in particular viewers, Office/EPUB reader layout, detailed background reconstruction, physical capture devices, noisy meetings, DRM/private player APIs and arbitrary model translation quality retain the specific limits in the document/media reports. Focused UI accessibility checks are not a complete WCAG audit.

The historical original comparison remains **28 matched, 5 deliberately different, 3 reference-unresolved** across 36 checkpoints. It is retained with its original build hashes under `docs/parity/`; it is not relabeled as evidence for the new UI or current source. See [accepted behavior](accepted-behavior.md) for the chosen behavior of those eight cases.
