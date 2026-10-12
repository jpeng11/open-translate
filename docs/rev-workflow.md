# Evidence-driven REA workflow

This implements the useful parts of the [requested REA tutorial](https://x.com/0xlangeai/status/2109544824135467312): observe the real target in an isolated browser, inspect its runtime scripts and interfaces, build an independent implementation, then reproduce the same checkpoints. REA is pinned to `rea-agents@6.4.0`; it is actually executed, rather than used as a name for a screenshot recreation. [Upstream REA](https://github.com/morluto/rea), [browser guide](https://rea.tools/guides/browser/).

## Capture

```bash
npm ci
npx playwright install chromium
npm run rev -- capture https://immersivetranslate.com/en/ /private/path/to/reference-extension
```

The script creates a fresh Chromium profile, binds CDP to loopback on a random port, then calls `list-browser-targets`, `inspect-web-page --include-script-sources --include-accessibility-text`, and `capture-web-screenshot`. It closes the browser and deletes the profile afterward. Private artifacts remain in ignored `dist/rev/`. Do not commit raw vendor scripts or capture authenticated personal sessions. Query-token URLs are rejected. An error envelope is treated as failure even when the upstream CLI exits zero.

Actual capture on 2026-10-12: original public website, Chromium 156, evidence ID `ev_00d1ed028ecdfa86b27caf78e9d6cc03bfa4be779e330f36e86400b5d19ffdbc`. The separate original extension baseline is 1.33.3 at `c470f0aca3c75b2785c9009a0ac48e78ead34126`: 89 downloaded files, every Git blob verified, kept outside this repository. Public webpage capture does not prove extension feature parity.

A bulk static REA attempt hit its provider deadline. It is recorded as incomplete, not as successful analysis. The existing independent static analyzer verifies 12 selected artifacts and 20 source anchors; [architecture observations](reverse-engineering.md) distinguish observed client behavior from unknown private server behavior.

## Compare the original and replacement

```bash
npm run build
npm run rev -- compare /private/path/to/reference-extension
# Equivalent: npm run parity:reference -- /private/path/to/reference-extension
npm run parity
npm run parity -- --strict
```

The reference runner loads the actual original and replacement in separate clean profiles. Both use the same local page, English→French settings, and deterministic Custom API response. It asserts target text, source-node identity, `{0}`, target language and restored source content. It captures both popup/page screenshots in `dist/parity/`. Reference version and content hash are recorded. The reference result includes a digest of implementation/build inputs and the gate rejects stale evidence after code changes. Only sanitized results are committed in [reference-results.json](parity/reference-results.json).

Observed difference: the original leaves discovery attributes on the paragraph after restoration; Open Translate restores the entire fixture DOM exactly. The paired semantic checks agree. Translation output is deterministic here; this is not an evaluation of either product's commercial model quality.

## Release gate

[baseline.json](parity/baseline.json) tracks each product area. `verified` requires paired original evidence and no outstanding acceptance. Replacement-only tests, a manifest or screenshots cannot promote an area to full parity. `npm run parity -- --strict` deliberately fails while any area is partial/unverified. This is a truthful release gate, not a disabled test to be removed.

For each remaining area: freeze representative inputs; record the original interactions/output/errors/network boundary; run the same fixture through the replacement; compare semantic output and screenshots; document tolerated differences; fix regressions; only then update the baseline. For exports, compare extracted text, links/styles, pagination, language order and overflow, as well as rendering. For media, compare cue timing, stop/cancellation, recognition quality and measured latency. For devices, load and exercise the actual extension on that browser/device.

UI follows the original's compact language → service → translate → quick tools → settings flow and white/pink styling, using the requested Rare UI components. Open Translate retains its own branding and user-agent connection settings. Account/billing screens and private hosted backends are not replacement dependencies. No claim of pixel-identical UI or complete commercial-product parity is made while the gate is incomplete.
