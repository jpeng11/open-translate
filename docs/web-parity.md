# Paired webpage observations

`node scripts/reference-web.mjs /private/path/to/reference-extension` runs the
pinned original and Open Translate in separate clean Chromium profiles against
one deterministic local custom translation endpoint. It never uses a user's
browser profile or commercial provider account. The proprietary extension stays
outside the repository.

The original is Immersive Translate 1.33.3, release commit
`c470f0aca3c75b2785c9009a0ac48e78ead34126`; `content_main.js` must match SHA-256
`bfe7e3e640bf90bb6b1103b0fe2e097068a751ca182beadc0bba25a8e38cda4c`.
The harness rejects another reference version/hash, stale implementation build,
changed bundle, or source edits during a run. Its report includes the full build
stamp, implementation/bundle/fixture hashes and the harness hash.

Evidence is written to `dist/parity/web/results.json`, alongside per-product
observations, fixture requests, DOM snapshots and screenshots. A successful
runtime observation and a parity match are distinct: differing observed values
remain `different`; a reference assertion that cannot be established remains
`reference-unresolved`. Either prevents an overall passing report.

## Compared workflows

The extended fixture covers these independent cases:

| Case | Acceptance or observation |
| --- | --- |
| Inline text and numeric markers | Exact translated visible text, preserving `{0}` |
| Inline translated markup | Link count/href and strong-text count/content |
| Table heading and cell | Exact translated text in `th` and `td` |
| Mixed block text | Both direct prose runs around a nested paragraph translate |
| Same-origin frame | Exact iframe paragraph translation |
| Cross-origin frame | Exact paragraph translation in a different hostname |
| Open shadow root | Exact shadow paragraph translation |
| Reused source text node | Updated translation appears once after a source edit |
| Translation-only view | Exact target text remains visible without the source |
| Translation-only source DOM | Whether the source link remains in the live DOM |
| Restoration and events | Original text and original link listener survive restore |
| Focused input | Exact replacement value and requested target language |
| Password exclusion | Password stays unchanged and its value is never submitted |
| SPA route replacement | A new route paragraph translates exactly once |

## Findings and limits

The initial actual paired observations established equal table, mixed-text,
iframe, open-shadow, dynamic-text, restoration/event, password-exclusion and SPA
behavior. Inline visible text/markers and translation-only visible text also
matched. The latest machine-readable report is authoritative for the current
build, particularly the subsequently added cross-origin frame probe.

Two observed implementation differences remain explicit. With the configured
custom service, the original emits plain translated text: its translated output
contains neither the source anchor nor the strong element. Open Translate keeps
a safe translated anchor and strong markup. In translation-only mode, the
original temporarily detaches source elements from the live DOM and restores the
same link/event afterward; Open Translate keeps source elements hidden in the
live DOM. These differences must not be silently counted as exact DOM parity.

The original's focused-input command selected the textarea but did not submit a
translation request to the fixture endpoint, even after a fresh page load and
an explicit language-prefix probe. Open Translate submitted the expected request
and replaced the value. The original input invocation/service-context boundary
therefore remains unresolved; it is not evidence that the original lacks input
translation or that the replacement matches it.

No concrete replacement webpage regression was found by these particular
comparisons. They cover deterministic desktop fixture behavior, not arbitrary
websites, layout equality, other browsers or a full replacement claim. Public
site adapters and platform constraints are separately documented in
[browser-support.md](browser-support.md).
