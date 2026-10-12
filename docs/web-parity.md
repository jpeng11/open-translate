# Paired webpage observations

`node scripts/reference-web.mjs /private/path/to/reference-extension` runs the
pinned original and Open Translate in separate clean Chromium profiles against
one deterministic local custom translation endpoint. It never uses a user's
browser profile or commercial provider account. The proprietary extension stays
outside the repository.

The original is Immersive Translate 1.33.3, release commit
`c470f0aca3c75b2785c9009a0ac48e78ead34126`; `content_main.js` must match SHA-256
`bfe7e3e640bf90bb6b1103b0fe2e097068a751ca182beadc0bba25a8e38cda4c`.
Both browser profiles disable proxies and block external hostname resolution,
while permitting localhost/127.0.0.1. This prevents live vendor configuration
from replacing the pinned packaged defaults; literal-IP traffic is not a
separate firewall boundary. The same declared policy is recorded in both the
base and extended reports.

The harness rejects another reference version/hash, stale implementation build,
changed bundle, or source edits during a run. Its report includes the full build
stamp, implementation/bundle/fixture hashes and the harness hash.

Evidence is written to `dist/parity/web/results.json`, alongside per-product
observations, fixture requests, DOM snapshots and screenshots. A successful
runtime observation and a parity match are distinct: differing observed values
remain `different`; a reference assertion that cannot be established remains
`reference-unresolved`. Either prevents an overall passing report.

## Compared workflows

The final build-bound run compared 17 cases: **12 matched, 3 differed and 2
reference cases remained unresolved**. The sanitized report is committed at
[parity/web-results.json](parity/web-results.json). The report deliberately does
not pass overall.

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
| Complete-sentence focused input | Exact replacement value and requested target language |
| Short focused input | Short-source detection/request remains separately observed |
| Input terminal punctuation | Exact replacement value, including a terminal period |
| Password/email exclusion | Sensitive values stay unchanged and are never submitted |
| SPA route replacement | A new route paragraph translates exactly once |

## Findings and limits

The final actual paired observations matched inline visible text/markers,
complete-sentence tables, same- and cross-origin frames, open shadow roots,
dynamic source edits, translation-only visible text, source restoration/events,
complete-sentence input, password/email exclusion and SPA route replacement.
The feature probes use complete English sentences to avoid conflating DOM
coverage with the original's short-text language detection.

Mixed leading/trailing prose matched in earlier runs but did not fully establish
in the final fixture: the original left the leading run at its loading spinner
and marked the container `data-imt_insert_failed_reason="already_translated"`.
The replacement translated both runs. This unstable original behavior remains
`reference-unresolved`, rather than being discarded or counted as a match.

Three observed implementation differences remain explicit. With the configured
custom service, the original emits plain translated text: its translated output
contains neither the source anchor nor the strong element. Open Translate keeps
a safe translated anchor and strong markup. In translation-only mode, the
original temporarily detaches source elements from the live DOM and restores the
same link/event afterward; Open Translate keeps source elements hidden in the
live DOM. These differences must not be silently counted as exact DOM parity.

The original's short focused-input command selected the textarea but did not
submit a translation request to the fixture endpoint during a 45-second probe,
even after a fresh page load and an explicit language prefix. A longer complete
English sentence did submit the expected request and translate. Its input path
performs source-language detection before reaching the custom service; a
length/detection boundary is an inference, not a verified universal rule. The
short case remains unresolved rather than being silently removed.

Another observed difference concerns input punctuation. The original removes a
terminal period before translating/writing the input, while Open Translate
preserves it. A bounded inspection of the shipped input-tail helper corroborated
that removal, and the complete-sentence runtime probe reproduced it. The harness
records no-terminal-period input separately from this punctuation difference.

No concrete replacement webpage regression was found by these particular
comparisons. They cover deterministic desktop fixture behavior, not arbitrary
websites, layout equality, other browsers or a full replacement claim. Public
site adapters and platform constraints are separately documented in
[browser-support.md](browser-support.md).

Actual reference email-field probing established that its raw value is masked.
Open Translate now excludes focused email inputs as well as password inputs;
a dedicated browser test verifies no raw email value reaches the endpoint.
