# Browser builds and compatibility

`npm run build` creates separate unpacked builds and archives for Chrome/Edge,
Firefox desktop/Android and Safari macOS/iOS. The same independently implemented
translation engine and Rare UI workspace are used in every build.

Chrome and Edge use an MV3 service worker with a dedicated offscreen worker for
long model requests. Firefox and Safari use an event background script and execute
translation, image loading and transcription there; neither references Chromium's
unsupported offscreen API. Firefox's declared minimum is 140 on desktop.
Android's minimum is 142, matching Mozilla's built-in consent support.
The Firefox manifest declares website-content transmission because the user's
chosen endpoint receives the text/images/audio submitted for translation.

On Chromium, storage access is restricted to trusted extension contexts. On
Firefox/Safari, settings instead live in extension-origin IndexedDB; credentials
are removed from legacy `storage.local` and later writes there are ignored.
Content scripts receive only public reading preferences through the background
message API. IndexedDB is a browser-profile vault, not operating-system keychain
encryption; someone with access to that profile can inspect its contents.

## Install and test

- Chrome/Edge: load `dist/chrome` or `dist/edge` using the browser's unpacked
  extension developer controls.
- Firefox desktop: `about:debugging` → This Firefox → Load Temporary Add-on →
  `dist/firefox/manifest.json`. Release installation needs Mozilla signing.
- Firefox Android: the manifest includes `gecko_android`; install a signed XPI
  through Firefox's supported add-on distribution. Desktop testing does not
  establish Android device acceptance.
- Safari: on a Mac with full Xcode run `bash scripts/safari-project.sh`.
  This creates `dist/safari-project` containing the macOS/iOS host applications.
  Build/run the appropriate Xcode scheme, then enable Open Translate and grant
  website access in Safari Settings. Distribution requires Apple's signing and
  app packaging. An unpacked browser folder cannot be installed directly on iOS.

`python3 scripts/test-firefox.py` launches a real temporary Firefox extension,
configures its endpoint, and checks workspace/page translation, mixed root text,
trusted storage, input translation, exact restore, content credential isolation, transcription and image handoff. Install the test browser with
`npx playwright install firefox`, or pass `--binary /path/to/firefox`.
The test never modifies the user's ordinary browser profile.

## Website coverage

The generic scanner translates both leaf paragraphs and direct text/inline links
around nested paragraphs, including table cells and body-level text. Temporary
inline segments preserve original nodes and listeners, and are unwrapped on
restore. Open shadow roots and allowed frames are scanned separately. Target
paragraphs use `dir=auto`, with logical CSS margins/borders and start alignment.
SPA URL changes reload site preferences and clear obsolete translations.

Independently authored adapters expand coverage for public post/reader containers
on X/Twitter, GitHub/Gist, Reddit, ChatGPT/Claude/Gemini, Wikipedia/Stack Exchange,
Medium/Substack and Notion. Code/math editors and editable fields are excluded.
These adapters are selector hints, not copied commercial rules. User-provided
include/exclude rules remain available for unusual layouts.

Browser-internal/store pages, closed shadow roots, inaccessible frames, canvas
text and websites that replace translated DOM continuously remain platform/site
constraints. Mobile browsers differ in microphone, tab capture and keyboard
support. Verify each target device before promising those capture workflows.

## Primary implementation references

- [Firefox MV3 event background pages](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- [Firefox data transmission consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox add-on signing IDs](https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/)
- [Mozilla content script isolation and API access](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [Apple Safari extension packaging](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Apple Safari extensions on macOS/iOS](https://developer.apple.com/safari/extensions/)
