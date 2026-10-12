# Open Translate

An independent translation extension for Chrome, Edge and Firefox with an open-source translation engine. Read bilingual webpages, translate documents, images and subtitles, and connect your own AI agent. It has its own visual identity and needs no vendor extension.

Use any local or hosted **OpenAI-compatible Chat Completions endpoint**, or the optional Python bridge for your signed-in **Google Antigravity CLI**. No Open Translate account, subscription or telemetry.

## Install in Chrome or Edge

Node.js 22+ and npm are required to build; they are not required after installing the extension.

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository’s `dist/chrome` directory.
3. Open the extension’s **Preferences → Your engine**.
4. Choose **OpenAI-compatible endpoint**, enter your API base URL, model and optional API key, then **Save & test**.
5. Choose your target language in **Preferences** or the extension popup. Open a webpage and click **Translate this page**.

The build creates Chrome, Edge, Firefox and Safari manifests/archives in `dist/`. Actual desktop Chromium and Firefox acceptance passed; see [browser support](docs/browser-support.md) for Firefox temporary loading, Safari Xcode packaging, and mobile device limits. The Chrome archive is `dist/open-translate-chrome.zip`. Unzip it before using Load unpacked. This is a developer installation; the extension has not been submitted to a browser store.

Examples of API base URLs: `http://127.0.0.1:1234/v1` and `https://your-agent.example/v1`. Supply the model actually served by your endpoint. The complete `/chat/completions` URL is also accepted. If your endpoint rejects `response_format`, turn off **Request JSON mode**. It must still return completed JSON translations in its Chat Completions response; tool calls are rejected.

## Use your Google AGY CLI

On the Mac running your browser and authenticated `agy` CLI (Python 3.10+):

```bash
python3 -m open_translate --backend agy --timeout 180 --check
python3 -m open_translate --backend agy --timeout 180
```

In **Preferences → Your engine**, choose **Local bridge** and paste the full printed translation URL, including its private token. Set request timeout to at least 210 seconds. Choose batch size one for slow CLI agents. You can import an existing `extension-config.json` instead.

The bridge must run on the same computer as the browser, or be reachable through an explicitly configured tunnel. CLI authentication and usage charges belong to your account. The CLI’s existing tool permissions remain active; use an agent profile intended for translation. See the [Mac setup](docs/mac-setup.md) and [bridge reference](docs/bridge.md).

## What you can do

| Workflow | Included |
| --- | --- |
| Web reading | Bilingual or translation-only view; inline links/formatting; dynamic paragraphs; viewport scheduling; open shadow roots; restore originals; site include/exclude rules |
| Quick translation | Selection popup; hover shortcut; editable input translation; context menus; copy and browser text-to-speech |
| Documents | TXT, Markdown, HTML, DOCX and EPUB import; bilingual or translated downloads |
| PDF | Text extraction, scanned-page OCR, page preview and PDF export; original/translated page pairs in bilingual mode |
| Images | 124 OCR language packs; screenshot area selection; local background repair; RTL text overlay; PNG download |
| Video | SRT, VTT and ASS translation with timing; bilingual subtitle downloads; local-video preview; native text tracks and common website caption containers |
| Live audio | Explicit tab/microphone capture; local whisper.cpp or your speech endpoint; 2–5 second PCM/VAD segments; translated transcript and SRT download |
| Controls | Glossary, language codes, per-host rules, styles, concurrency, timeouts, optional seven-day device cache |

Keyboard shortcuts: **Alt Shift T** page, **Alt Shift S** selection, **Alt Shift I** input, **Alt Shift H** hovered paragraph. Change browser commands at `chrome://extensions/shortcuts`.

OCR runs locally with three bundled models and 121 additional pinned, integrity-verified language packs downloaded on demand and cached offline. Speech recognition can use a hosted `/audio/transcriptions` endpoint or local whisper.cpp on the Python bridge; see [local speech setup](docs/local-speech.md). Recording starts only after an explicit click and browser permission.

## Privacy and permissions

Only requested text is sent to your configured translation engine. Documents and OCR are processed locally; live audio goes to your configured speech engine. Your provider may retain requests. API credentials stay in trusted extension storage (Chromium access controls or a private extension-origin IndexedDB vault); they are absent from content-script settings. Stored credentials are not encrypted against someone with access to your browser profile.

The `<all_urls>` host permission enables page translation, arbitrary user-selected HTTP(S) API endpoints, and screenshot capture when you choose it. File permission is requested for local pages; Chrome/Edge require you to enable **Allow access to file URLs** separately. The extension cannot translate browser settings, store pages or protected browser viewers. The offscreen worker supports long local-agent requests. No remotely hosted scripts are loaded.

Persistent translation caching is off by default. Enabling it stores translated/source batch results locally for up to seven days; **Clear translation cache** removes them. A bounded memory cache also exists while the engine runs. Cache clearing prevents unfinished requests from repopulating it.

## Practical limits

Open Translate follows its own [accepted behavior](docs/accepted-behavior.md) and [visual system](docs/visual-identity.md). The recommended differences from the reference product are intentional, including preserving markup, punctuation and source restoration. Three unresolved reference observations remain documented rather than guessed. Historical REA comparisons are research evidence, not a requirement to copy the original UI or defects.

Run `npm run acceptance` for current-source regression evidence, and `npm run acceptance:verify` to check that the broad suite reports match the current implementation. See [validation](docs/validation.md) for measured coverage and remaining platform limits.

PDF originals retain vector/searchable content; translated pages use page images with searchable Unicode text, RTL shaping, overflow continuation and accessible HTML. DOCX runs, links, tables, styles, headers and footers are retained; HTML/EPUB retain safe inline formatting and packaged resources. PDF bookmarks, named destinations, page labels, links and editable form values are retained. Complex layouts and accessible tag-tree reconstruction still need work. See [document fidelity](docs/document-fidelity.md).

OCR includes local masked-region background repair; detailed artwork and unusual lettering can still differ from the original. Captions support dynamic tracks, open shadow roots, sidecar subtitles and explicit screen OCR fallback. DRM and inaccessible private pipelines remain platform limits. Live audio uses 2–5 second PCM chunks with pause detection and queue bounds, plus model/network latency. See [media coverage](docs/media-translation.md).

Chromium and Firefox have actual desktop acceptance. Safari host packaging needs macOS/Xcode; Safari runtime, Android/iOS and branded Edge device acceptance remain separate requirements. Native mobile apps are not included. Documents remain capped at 30 MiB, expanded archives at 100 MiB, PDFs at 200 pages, and request batches at 20,000 characters. Cancellation prevents subsequent requests; an in-flight provider call may finish.

See [replacement scope and evidence](docs/replacement-scope.md), [architecture](docs/architecture.md), and [validation](docs/validation.md).

## Development

```bash
npm ci
npx playwright install chromium
npm run check
# Optional real Firefox acceptance after npx playwright install firefox
python3 scripts/test-firefox.py
npm run acceptance
npm run acceptance:verify
python3 -m unittest discover -v
```

Node tests exercise engine contracts and subtitle formats. Chromium tests load the real Manifest V3 package and exercise page rendering/restoration, input translation, dynamic content, documents, PDF, timed subtitles and bundled OCR against a local mock provider. They make no external AI calls. Live AGY acceptance is separate and consumes the configured provider’s usage.

The build pins npm dependencies and includes bundled OCR/PDF workers, models and third-party notices. No proprietary Immersive Translate bundle is distributed. [Reverse-engineering observations](docs/reverse-engineering.md) informed an independent implementation. Original code is [MIT](LICENSE). The interface uses [Rare UI](https://rareui.com) React components under its separate [MIT + Commons Clause + Attribution license](extension/ui/rare/LICENSE); those components are not covered by our MIT grant. See [UI provenance](extension/ui/rare/provenance.json).
