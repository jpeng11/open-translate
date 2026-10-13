# Open Translate product decisions

Approved direction on 2026-10-12: preserve the recommended behavior differences and unresolved reference behavior; use an independent, internally consistent interface. Acceptance measures this product contract. It does not require reproducing the reference product's styling or observed defects.

## Deliberately retained differences

| Observation in the historical reference run | Open Translate contract |
| --- | --- |
| Translated text dropped inline links and bold formatting | Retain safe links, formatting and protected tokens |
| Translation-only rendering temporarily detached original DOM | Hide original nodes while preserving identity and event handlers; restore on request |
| Input translation dropped a terminal period | Preserve punctuation unless the requested translation requires a language-specific change |
| Turning captions off left the native track hidden | Restore the selected native track's prior mode |
| Turning DOM captions off left translated text behind | Remove extension output and restore the source |

## Reference uncertainties retained as uncertainties

| Unresolved observation | Open Translate contract |
| --- | --- |
| Leading prose in a mixed paragraph intermittently remained untranslated | Translate both leading and trailing prose without duplicating inline content |
| Very short input was skipped before the reference custom API | Explicitly requested short input is eligible for translation |
| Changed DOM captions sometimes repeated the original language | Translate changed cues, retire stale results, clear on stop |

These are three incomplete reference observations, not confirmed vendor bugs or a claim of matching behavior. The historical 36-checkpoint comparison remains 28 matched, 5 different, 3 reference-unresolved. Its source/bundle hashes describe the historical build only. Later source changes must not inherit that evidence as current parity.

Translated sibling phrases may change order to follow the target language's grammar. Each original link and formatting token must still occur exactly once, with its original attributes, pair and parent relationship. Crossed tags, omitted or duplicated markers, and moving a child outside its original formatting parent are rejected. Checks compare per-paragraph link and formatting multisets rather than requiring translated words to retain source-language order. This clarifies preservation; it does not permit dropping formatting to obtain faster timings.

For OpenAI-compatible endpoints, a paragraph that fails native-format validation or a supported target-writing-system check can receive up to two automatic repair attempts. Repairs retain the full source paragraph and failed draft as context, reuse valid results from other paragraphs, and share the original batch timeout and concurrency slot. On the final attempt, the failed draft is discarded. The model translates the entire paragraph as a formatting tree with stable node IDs. Complete sibling nodes may move for target grammar; duplicate or missing references, changed parents, invented nodes and HTML text are rejected before decoding. A response that instead contains one complete native-markup paragraph in its root string is accepted only if it independently passes the original full-tree and token checks. This preserves structure, not a guarantee of semantic accuracy or exact linked-phrase alignment. Repaired output must pass the same preservation checks. If a completed model response has malformed translation JSON or invalid item IDs, its items are re-requested individually without guessing partial matches. Provider refusals, transport errors and repairs that still fail validation remain explicit errors; unverified text is not rendered as a successful translation.

The target language is named explicitly in model instructions. For English prose of at least twelve words, Chinese, Japanese and Korean output must contain the expected writing system before acceptance. This narrow check does not identify every wrong language or prove semantic completeness; short names and unknown source languages are not rejected by it. Wrong-language drafts are discarded so they cannot anchor a repair to the wrong language.

Long-page scheduling prioritizes the current viewport and prefetches a bounded reading window per document or open shadow root: two configured batch/concurrency waves, capped at 64 paragraphs and 48,000 source characters. Currently visible paragraphs remain eligible even when they exceed that prefetch budget. One oversized first paragraph is still submitted to the existing size validator rather than silently skipped. Short articles (at most 32 paragraphs and 12,000 source characters) remain eager. A scroll jump removes unsent work outside the new window; active requests retain concurrency limits and stale-result checks. Restoring stops new submissions and prevents late results from modifying the page. This can submit nearby offscreen text before the reader scrolls to it; it does not eagerly submit an entire long page.

## Independent visual identity

The interface uses our original open-globe mark, ink sidebar, teal actions, warm paper surfaces, numbered workspace tools and linear popup task list. Light/dark palettes share spacing, typography, controls, focus states and status handling. The reference popup's pink palette, proportions, control arrangement and imitation-specific CSS have been removed. Product copy is our own; there are no vendor logos, copied interface assets or proprietary runtime bundles.

Rare UI navigation, progress and orb components retain their separate attribution and license. Research references remain in technical documentation for transparent provenance. These concrete design choices establish our own identity; they are not a legal opinion about similarity or trademark clearance.

## Acceptance scope

The current target is desktop Chrome/Chromium, with independent Firefox checks and a compatible Edge package. Branded Edge runtime, Safari runtime and mobile devices have separate acceptance status. Safari testing belongs to the user-designated Codex session. A package build is not a device/runtime pass.

Deterministic endpoints verify transport, layout, restoration and lifecycle behavior; they do not evaluate translation quality. Actual AGY and local speech tests provide separate provider evidence. Complex PDF typography, unusual OCR backgrounds, protected video and private site adapters retain their documented limits.
