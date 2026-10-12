# Public reading acceptance

The current evidence is [acceptance/web.json](acceptance/web.json). It measures Open Translate's own reading contract. It does not require visual imitation or identical behavior to Immersive Translate, and does not replace the unresolved reference observations in [web-parity.md](web-parity.md).

Run against a stable build:

```sh
npm run build
node scripts/acceptance-web.mjs --output docs/acceptance/web.json
```

The harness uses a clean temporary Chromium profile, the actual packaged extension, its default reader rules and site adapters, and a local deterministic OpenAI-compatible endpoint. The endpoint prefixes source text and returns IDs in reverse order. This verifies transport, response ordering and rendering; it does **not** assess translation quality or a hosted provider's availability. No user profile, account or API key is used. TLS certificate errors are ignored only inside this credential-free acceptance browser.

The five public URLs cover an encyclopedia, browser API documentation, a repository README, accessibility standards and an HTML standards chapter:

| Public page | Sampling selector |
| --- | --- |
| [Wikipedia: Machine translation](https://en.wikipedia.org/wiki/Machine_translation) | `#mw-content-text p` |
| [MDN: Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) | `main article p,main p` |
| [GitHub: microsoft/TypeScript](https://github.com/microsoft/TypeScript) | `.markdown-body p,article p` |
| [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) | `body p` |
| [WHATWG: HTML introduction](https://html.spec.whatwg.org/multipage/introduction.html) | `body p` |

Up to eight visible leaf paragraphs, each between 80 and 1,800 characters, are sampled across each document. Sampling bounds evidence collection; the extension still uses its default rules and translates visible content surrounding those samples. Every sampled paragraph must receive the expected text exactly once, preserve its original source nodes, preserve safe links and supported inline formatting, and mark the target language. Inline `code`, `kbd` and `samp` remain protected text atoms. Up to four existing code blocks must remain excluded. Restoring must recover the exact sampled HTML and source node identities, including a source link's event listener where available.

An authored paragraph added to each live page must translate, survive 40 consecutive source updates with one final target, and disappear cleanly before restoration. The harness keeps it in the viewport while translation changes page height, respecting the reader's lazy translation behavior.

Two separate authored fixtures check a 5,105-paragraph document, including its final paragraph after scrolling, and a 300-paragraph insertion batch with same-origin and cross-origin frames. The long-page fixture exposed and now covers a bug where the first 5,000 candidates permanently excluded the document tail. Candidates now prioritize the viewport within that observation window, and scrolling schedules a throttled rescan.

The JSON records timestamps, final URLs, HTTP status, browser version, source/sample hashes, counts, source digest, full bundle evidence and harness digest. It stores no fetched page text, HTML or screenshots. Request failures and invariant failures remain explicit; blocked sites do not count as passing. A normal run rejects stale bundles or source changes during execution. `--exploratory` is for investigation and cannot produce a verified passing report.

This is bounded Chromium evidence at the recorded URLs and time. It does not certify every element on those sites, authenticated pages, all SPA applications, closed shadow roots, inaccessible frames, other browser runtimes, translation quality or pixel-level equivalence to another product.
