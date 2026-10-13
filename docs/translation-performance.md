# Translation performance

## Current result: DeepSeek below five seconds

On 2026-10-13, `opencode-go/deepseek-v4.1-flash` completed the same original-format 977-word English → Simplified Chinese page in **3.799 s, 4.327 s and 3.822 s** across three sequential fresh-profile runs. All 16 paragraphs, 70 links, formatting structure and exact source restoration passed. The median was **3.822 s**. This is a measured result for this sample and endpoint, not a five-second guarantee for every page or model. Full iteration history and request usage are in the [DeepSeek qualification record](acceptance/deepseek-five-second.json).

| Run | First translated paragraphs | Complete page | Upstream prompt-cache tokens |
| --- | ---: | ---: | ---: |
| Initial qualification | 3.516 s | 3.799 s | 0 |
| Repeat with request recording | 3.080 s | 4.327 s | 2,176 |
| Direct extension → Magpie | 3.274 s | 3.822 s | Not observed |

The two recorded runs each made six requests and reported zero reasoning tokens. Application translation caching was disabled in all three. The recording relay forwards request bodies unchanged; the third run removes that relay. A review of all 16 source/translation pairs found no whole-paragraph omissions, with some literal phrasing and inconsistent translation of proper names. Structural checks are not a linguistic quality guarantee.

The working profile is **batch size 3, concurrency 6, JSON mode on, reasoning effort none**. For known DeepSeek V4/Flash model names, an explicit request for no reasoning now sends `thinking: {type: "disabled"}` with `temperature: 0` and omits `reasoning_effort`. These are supported DeepSeek request controls, and this OpenCode Go route was also tested live; other compatible endpoints can have different behavior. See [DeepSeek API documentation](https://api-docs.deepseek.com/api/create-chat-completion/).

Set **Your engine → Concurrent requests** to **6** and **Reasoning effort** to **Request no reasoning**, then set **Reading preferences → Paragraphs per request** to **3**. Keep your own Magpie URL, key and the model identifier above. Defaults remain conservative for bridge users; selecting a model alone does not apply this benchmark profile.

The implementation retains numeric citation trees locally, uses paired tags for translatable inline phrases, and balances small page batches by length. Legitimate target-language phrase reordering is accepted while missing, duplicated, crossed or reparented markers are rejected. This fixes a false failure where a correct Chinese translation moved a linked verb after a linked noun. Link checks now compare per-paragraph multisets; they no longer require English word order. The original contract of preserving translated links and formatting remains in force.

A six-connection dispatch pattern was observed on the tested local HTTP endpoint: with eight planned requests, the final two began only after earlier requests finished. Six balanced requests removed that second wave. This observation is specific to this browser/transport; HTTP/2 endpoints can behave differently.

[REA investigation](rev-translation-latency.md) explains the reference product mechanisms and separates static configuration, local fixture observations and real model timings. Other-model validation begins only after the three DeepSeek qualification runs above; it does not delay the focused optimization loop.

### Reproduce the qualified profile

Keep credentials in a private connection JSON with `model: "opencode-go/deepseek-v4.1-flash"`, `reasoningEffort: "none"` and `jsonMode: true`, alongside your own `apiUrl` and `apiKey`. Then run:

```bash
npm run build
node scripts/benchmark-page.mjs /private/deepseek.json 3 formatted 6 dist/benchmarks/deepseek-check 45
```

### Other-model validation after the five-second gate

The final frozen implementation was screened against all **57 model/route IDs** advertised by the configured Magpie catalogue, including six routing groups. **25 completed** within the 45-second test deadline and passed structural checks; **32 failed or timed out**. Only DeepSeek V4.1 Flash completed within five seconds in that screening run. These are endpoint-route observations with differing model capabilities, load and requested reasoning levels, not a controlled ranking of the underlying models.

| Route | Complete page | First translated paragraphs |
| --- | ---: | ---: |
| `opencode-go/deepseek-v4.1-flash` | 4.519 s | 3.121 s |
| `opencode-go/glm-5.3-flash` | 5.275 s | 2.150 s |
| `opencode-go/gpt-6-luna` | 5.319 s | 3.612 s |
| `opencode-go/gpt-5.6-luna` | 5.424 s | 3.893 s |
| `qoder/performance` | 6.767 s | 4.058 s |

Every result, including HTTP errors, format failures and deadline failures, is in the [catalogue measurement record](acceptance/translation-latency-catalog.json). A failed run has no successful complete-page latency. The earlier two rounds each completed 57 attempts; the third stopped after 47 completed attempts when the user requested DeepSeek-only iteration. Other models resumed only after the three qualifying DeepSeek runs.

To reproduce catalogue validation, add `batchSize: 3`, `concurrency: 6` and `benchmarkTargetMs: 5000` to the private DeepSeek connection file, then run:

```bash
node scripts/benchmark-catalog.mjs /private/deepseek.json dist/benchmarks/catalog-check
```

The selected DeepSeek route retains the explicitly tested `none` override. Other routes use their lowest catalogue-advertised reasoning level supported by the UI; their settings are recorded individually. Two distinct provider routes may be tested simultaneously, and routing groups run alone. The final validation therefore is not an isolated latency study.

The frozen build also passes 78 JavaScript tests, 46 Python tests, 58 Chromium browser cases, actual Firefox extension checks, five public-page samples, and the document/media acceptance suites. Safari and mobile-device acceptance remain separate.

## Historical measurements before these changes

On 2026-10-13, the tested Magpie routes did not meet the requested 1–2 second **complete first translation** target. The sample is 977 English words in 16 complete paragraphs from [Wikipedia’s Machine translation article](https://en.wikipedia.org/wiki/Machine_translation), translated into Simplified Chinese. Source hashes, settings, token usage, failures and build bindings are in the [measurement record](acceptance/translation-performance.json).

### Whole plain-text API requests

Each request contains the same complete sample. These times include Magpie routing and model generation, without browser rendering or inline-format markers. Requests are nonstreaming, with `max_tokens=6000`. Each configuration was measured once; provider load and prompt caching are uncontrolled. These are route/configuration observations, not a controlled ranking of the underlying models.

| Magpie model identifier | Requested reasoning / JSON mode | Complete response | Validation |
| --- | --- | ---: | --- |
| `codex/gpt-6-luna` | low / on | 13.404 s | 16 Chinese paragraphs, correct IDs |
| `qoder/dfmodel` | low / off | 18.597 s | 16 Chinese paragraphs, correct IDs |
| `qoder/gfmodel` | none / on | 26.153 s | 16 Chinese paragraphs, correct IDs |
| `qoder/dfmodel` | none / on | 26.269 s | 16 Chinese paragraphs, correct IDs |
| `grok/grok-4.7-build-fast` | none / on | 39.024 s | 16 Chinese paragraphs, correct IDs |
| `qoder/qmodel` | model default / off | 51.905 s | 16 Chinese paragraphs, correct IDs |
| `qoder/qfmodel` | low / off; none / on | 28.688 s; 24.628 s | Both invalid JSON; excluded from successful timings |
| `zcode/GLM-5.3-Flash` | low / off | HTTP 502 after 7.527 s | Failed; excluded |

The configured catalogue labels `dfmodel` as DeepSeek Flash, `gfmodel` as GLM-5.3-Flash, `qmodel` as Qwen3.7-Plus and `qfmodel` as Qwen3.8-Flash. Some routes returned reasoning tokens even when `none` was requested. Requesting less reasoning is not a guarantee that the upstream disables it. JSON mode also did not guarantee valid JSON from Qwen Flash; unescaped quotes inside translated strings were rejected.

### Actual original-format webpage

A clean Chromium extension profile on the Mac translated the same public page, with its original markup. Timing starts immediately before translation and includes paragraph scheduling, model calls and rendering. The harness scrolls to unfinished paragraphs; viewport-prioritized loading creates multiple request waves. Application cache is disabled. Magpie is reached through a temporary private SSH loopback tunnel; the AGY bridge runs on the Mac.

| Provider/configuration | First translated paragraph | All 16 paragraphs | Formatting |
| --- | ---: | ---: | --- |
| AGY `gemini-3.8-flash-low`, concurrency 1 | 5.259 s | 45.419 s | Passed |
| AGY same model, extension and isolated bridge concurrency 4 | 9.155 s | 31.502 s | Passed |
| Magpie `qoder/dfmodel`, default reasoning, concurrency 4 | 32.285 s | 136.227 s | Passed |
| Magpie `codex/gpt-6-luna`, low reasoning, concurrency 4 | 9.919 s | 92.661 s | Passed |

Every passing webpage run retained all 70 links and supported formatting, then restored the exact original DOM. The counts establish structural completeness; they are not an exhaustive linguistic review. Plain-text API timings must not be presented as full webpage timings. AGY's explicit model is `gemini-3.8-flash-low`, using CLI 1.3.2.

### OpenCode Go follow-up

The Mac and Linux Magpie OpenCode Go provider records already matched exactly when checked, so no settings overwrite was needed. The following runs use the same 977-word sample and unchanged product implementation. Credentials are excluded from the [OpenCode Go report](acceptance/opencode-go-performance.json).

| OpenCode Go model | Whole plain-text request | Original-format webpage |
| --- | ---: | --- |
| `claude-haiku-5-5`, low reasoning | 12.832 s, 16 Chinese items | Failed after 14.508 s; 1/16 paragraphs rendered; changed formatting marker order |
| `gpt-6-luna`, low reasoning | 16.486 s, 16 Chinese items | Failed after 11.355 s; 0/16 paragraphs; invalid JSON |
| `glm-5.3-flash`, low reasoning | 18.396 s, 16 Chinese items | Failed after 4.411 s; 0/16 paragraphs; changed formatting marker order |
| `mimo-v2.6-flash`, default reasoning | 50.382 s, 16 Chinese items | Failed after 22.333 s; 0/16 paragraphs; changed formatting marker order |
| `deepseek-v4.1-flash`, low reasoning, after Global update | 54.235 s with a 12,000-token budget, 16 Chinese items; 6,000-token run truncated | 241.634 s complete, 58.354 s first output, structural checks passed with 210 s request timeout; 90 s timeout run failed at 13/16 |

All requests ask for JSON mode. Plain-text requests use `max_tokens=6000` except the expanded DeepSeek run, which uses 12,000. Browser jobs use batch size four and concurrency four, without an explicit token budget. Each configuration has one measurement. MiMo returned 2,011 reasoning tokens; the first three models returned 0–35. DeepSeek returned 7,125 reasoning tokens in its successful plain-text run despite requesting low reasoning. That run reported 1,664 cached prompt tokens; other API runs reported zero. Its latency is not a cold-prompt measurement or evidence that a larger budget makes the model faster.

The user confirmed saving **Global regions** in the OpenCode workspace's Privacy settings. Subsequent `deepseek-v4.1-flash` requests returned HTTP 200, confirming that its earlier region gate was cleared; the setting was not independently read back from the console. The `deepseek-flash` alias was not retested. The first post-update request exhausted its 6,000-token budget after 77.055 s (`finish_reason=length`, 4,969 reasoning tokens) and failed completeness checks. A temporary copy of `scripts/benchmark-models.mjs` changed the request budget and method description to 12,000 and used a private connection timeout of 180 s instead of 90 s. It returned all 16 Chinese items with the expected IDs and `finish_reason=stop` in 54.235 s. These structural checks do not establish sentence-by-sentence semantic completeness.

The first DeepSeek page run failed after 167.819 s with 13/16 paragraphs rendered because a request exceeded 90 s. A fresh-profile retry using the product default 210 s request timeout completed in 241.634 s (about four minutes), with first output at 58.354 s. It preserved all 70 links and supported formatting and restored the exact original DOM. Neither page run uses an application translation cache; upstream caching remains uncontrolled. Production settings were not changed. A qualitative review of all 16 source/translation pairs found awkward phrasing and mismatched parentheses in paragraph 5, and ambiguous date attachment in paragraph 10. The structural pass therefore does not mean translation quality is accepted.

At the time of that historical OpenCode follow-up, the product implementation was unchanged and the existing broad acceptance bindings verified. These live-provider failures establish a remaining compatibility limit in direct rich-text translation, even when the same models return valid plain-text batches.

### Changes retained

Page scans fill batches before dispatch and run independent requests up to the configured concurrency. Documents and subtitles also respect concurrency while preserving order and cancellation. The default remains one. The bridge's own concurrency must allow the chosen browser limit.

Under **Your engine → OpenAI-compatible endpoint**, **Reasoning effort** can use the model default or request none, low, medium or high. It defaults to sending no override. Use overrides only with an endpoint that supports them; they do not affect AGY or the Python bridge. Changing the setting separates cached results. The control is translated into all six UI languages.

A shorter-marker experiment reduced protected text from 20,673 to 11,985 characters (42.03%), but both Luna webpage runs changed marker order and failed validation. The change was reverted. No partial result or failed run is counted as a speed improvement.

### Reproduce

Keep the endpoint URL, model and key in a private JSON connection file using the extension's `apiUrl`, `model`, `apiKey`, `jsonMode`, `reasoningEffort` and `timeout` fields. Use the Magpie address reachable from the machine running the test. A loopback URL always refers to that same machine.

```bash
npm run build
node scripts/benchmark-page.mjs /private/connection.json 4 formatted 4
node scripts/benchmark-models.mjs /private/connection.json \
  dist/benchmarks/page-speed-translations.json /tmp/model-comparison.json \
  codex/gpt-6-luna qoder/dfmodel
```

These commands make live provider calls. The page benchmark writes its report, translated sample and screenshot under ignored `dist/benchmarks/`; the model comparison writes counts and hashes without credentials or source text. Reports are overwritten at their selected paths, so preserve each run before starting another. A successful structural check cannot establish a 1–2 second service guarantee; repeated runs and semantic review would be needed before publishing a performance claim.
