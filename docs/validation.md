# Validation

Acceptance date: 2026-10-12. Standalone runtime tested at commit `cedf0d1`; subsequent changes update this report, Mac instructions and live-check configuration validation.

## Environments and automated results

| Environment | Runtime | Result |
| --- | --- | --- |
| Linux development checkout | Python 3.12.3, Chromium 156.0.8078.4 | 17 Node, 15 Chromium, 30 Python checks passed |
| User's Mac mini | macOS 27.0.1, Homebrew Python 3.12.15, Node 26.10.0, Chromium 156.0.8078.4 | Same 62 checks passed |

Commands: `npm run check` and `python3 -m unittest discover -q`. Chromium acceptance loads the actual unpacked Manifest V3 extension in a fresh profile. Routine tests use a local deterministic mock translation/transcription endpoint; OCR, PDF parsing, browser extension messaging, audio encoding and file exports execute their real implementations.

Covered behavior:

- Bilingual and translated webpage rendering; original DOM/event-handler restoration; inline links and formatting; editable/code exclusions; dynamic updates and accessible open shadow roots.
- Changing display preferences on an already translated page; stale-response rejection; provider errors and input/selection translation.
- User endpoint configuration, batch ordering, blank items, marker validation, error-body redaction, concurrency, deduplication and credential-isolated cache entries.
- HTML, Markdown, DOCX and EPUB bilingual exports; PDF text extraction, lazy previews and exported page count; SRT timing and native video preview cues.
- Real bundled image OCR and PNG export; screenshot capture/cropping; bounded one-time context-menu image handoff.
- Actual microphone capture APIs, MediaRecorder encoding, transcription request, translated transcript, stop and SRT export. Capture input and provider responses are fixtures; this is not a speech-recognition quality test.
- Accessible website captions; isolated webpage contexts cannot retrieve credentials or mutate trusted settings.
- A 32-second HTTP request completes through the offscreen worker, exceeding the usual MV3 service-worker fetch deadline.
- Rare UI components mount in the built package; keyboard navigation, active-link accessibility, progress counters, reduced-motion preferences, 390-pixel workspace layout and 350-pixel popup layout.

The standalone build produces `dist/chrome` and `dist/open-translate-chrome.zip`. npm's dependency audit reported no known vulnerabilities at build time. No claim is made about store review or Firefox/Safari compatibility.

## Live AGY acceptance

Backend: the user's installed Google Antigravity CLI 1.3.2, cached login and model `gemini-3.8-flash-low`. The updated bridge is reachable on the Mac at `127.0.0.1:8765`. Private token/configuration files remain outside the repository.

The actual standalone extension in Chromium on the Mac translated this local French fixture through the Python bridge and signed-in AGY CLI:

| Source | Rendered translation |
| --- | --- |
| `Bonjour <b>monde</b> {0}.` | `Hello <b>world</b> {0}.` |
| `Merci pour votre aide.` | `Thank you for your help.` |

The live check asserted both translations, preserved bold markup and numeric placeholder, then restored the original DOM. Screenshot: `dist/acceptance/live-agent-page.png`, generated locally rather than committed. An earlier Linux Chromium check through an SSH tunnel to the Mac also passed.

The earlier bridge/API acceptance additionally verified health, HTTP 401 without authentication, extension-origin private-network preflight, ordered batches, both numeric-placeholder forms and blank-item preservation.

Reproduce on the Mac, using the private connection settings:

```bash
node scripts/live-check.mjs "$HOME/Library/Application Support/Open Translate/standalone-connection.json"
```

This consumes the selected provider's usage. Never commit or share the connection file.

During investigation, some AGY runs emitted a `manage_task` tool event and were rejected. The translation profile and explicit direct-answer instructions passed the final CLI and browser checks, but one successful acceptance sample does not establish long-run reliability. All reported tool events still fail validation. The CLI startup envelope continues advertising default tools even when the profile requests only structured completion; profile settings and output rejection are not treated as a tool-execution barrier. Provider behavior, account settings and global hooks remain relevant.

## Acceptance limits

These checks establish functioning desktop workflows, not exhaustive commercial-product parity or translation-quality equivalence. No broad evaluation of the original extension's 781 site rules was performed. Automated browser acceptance uses Chromium; branded Chrome and Edge, multiple OS/browser versions, arbitrary production sites, RTL/complex PDF layouts, inaccessible/DRM captions and real meeting audio still need broader device/site evaluation.

PDF export rasterizes pages; translated DOCX runs flatten some formatting. OCR has three bundled language packs and plain overlays. Live audio uses 15-second chunks plus provider latency. See the README's [known limits](../README.md#practical-limits) and [replacement scope](replacement-scope.md).
