# Translation performance

## Long-article format recovery

The extension now keeps valid results and repairs each paragraph that fails native-format validation individually. The first repair includes the complete source paragraph, its failed draft and the exact marker inventory. The final attempt discards the draft and translates a structured tree with stable node IDs. A complete native-markup paragraph wrapped in the root string is also accepted if it independently passes the full original preservation checks. Complete sibling nodes may move for target grammar. Duplicate or missing references, changed parents, invented nodes and HTML text are rejected before decoding back to native markers. At most two repair attempts share the original batch deadline and engine concurrency slot. No markers are guessed or appended locally; every repaired result must pass the same token, nesting and parent checks before rendering. A completed model response with malformed translation JSON or invalid IDs is re-requested paragraph by paragraph without guessing partial matches. Refusals, transport failures and still-invalid repair responses remain errors.

On 2026-10-13, the eight failed cases in the baseline below were rerun with the same frozen article snapshot, selected paragraphs, model and settings. Seven passed on `c86833b`; Korean 15k then passed on `89a2982`, after adding strict compatibility for complete native-markup paragraphs returned inside a tree root. These are not eight measurements on the final build. Per-case hashes and the failed intermediate runs are retained in the record. A local recording relay forwarded request bodies unchanged to measure actual repair activity; timings include its overhead. The application cache was disabled, while provider load and upstream prompt caching remained uncontrolled.

| English words | Target | Before | After: complete page | Repair calls |
| --- | --- | --- | ---: | ---: |
| 15,031 | Japanese | Failed (13/167 paragraphs) | 240.67 s | 9 |
| 15,031 | Chinese | Failed (44/167 paragraphs) | 161.90 s | 6 |
| 15,031 | French | Failed (137/167 paragraphs) | 183.97 s | 2 |
| 15,031 | Korean | Failed (35/167 paragraphs) | 261.46 s | 6 |
| 9,983 | Japanese | Failed (13/115 paragraphs) | 149.53 s | 2 |
| 9,983 | Chinese | Failed (52/115 paragraphs) | 100.44 s | 2 |
| 9,983 | Korean | Failed (5/115 paragraphs) | 168.61 s | 6 |
| 4,970 | Chinese | Failed (7/55 paragraphs) | 59.06 s | 3 |

Request-level validation and repair counts are in the [format-recovery measurement record](acceptance/format-repair-performance.json). Passing means all selected paragraphs were rendered, original links and formatting were retained, and exact source DOM restoration passed. This does not certify every sentence against omissions or mistranslations.

Manual spot checks of recovered Chinese and Japanese paragraphs found all source sentences represented, with some literal or awkward Japanese phrasing. Formatting validation does not prove linked-phrase alignment or semantic accuracy.

The target language is now named explicitly in system instructions. For long English prose, Chinese, Japanese and Korean output receives a narrow writing-system check. Wrong-language drafts are discarded and regenerated from the source within the same two-attempt limit. Short names and unknown source languages are exempt; this is not general language identification. These changes address failed translation validation; long-page throughput remains limited. The original viewport scheduling and full-paragraph translation path remain in use.

The final-build 977-word Chinese regression passed in 3.66 seconds. This is a separate fresh-profile run; it is not a claim of sustained sub-five-second performance.

## Baseline before format recovery: 5,000 / 10,000 / 15,000 words

On 2026-10-13, the same DeepSeek profile was tested on a different article: [History of the United States](https://en.wikipedia.org/wiki/History_of_the_United_States). A fixed HTML snapshot of [revision 1379968084](https://en.wikipedia.org/w/index.php?title=History_of_the_United_States&oldid=1379968084) supplied nested prefixes of complete body paragraphs. Each size/language combination ran once, sequentially, in a fresh Linux Chromium extension profile with the application translation cache disabled. These are not Mac, Safari or mobile-device timings. Upstream prompt caching and service load were not controlled.

The settings remain batch size **3**, concurrency **6**, reasoning **none** (`thinking: disabled`, temperature `0`), JSON mode on, per-request timeout **45 seconds**, and whole-run deadline **600 seconds**. Long pages retain viewport scheduling; the harness scrolls to the first unfinished paragraph every 250 ms. These are whole-page workflow measurements, including scroll-triggered scheduling, rather than isolated model throughput.

| Requested size | Actual English words / paragraphs | Chinese | French | Spanish | Japanese | Korean |
| --- | --- | --- | --- | --- | --- | --- |
| 5,000 | 4,970 / 55 | Failed (7/55 paragraphs) | 65.99 s | 64.96 s | 88.67 s | 85.74 s |
| 10,000 | 9,983 / 115 | Failed (52/115 paragraphs) | 131.44 s | 129.51 s | Failed (13/115 paragraphs) | Failed (5/115 paragraphs) |
| 15,000 | 15,031 / 167 | Failed (44/167 paragraphs) | Failed (137/167 paragraphs) | 193.01 s | Failed (13/167 paragraphs) | Failed (35/167 paragraphs) |

**7 of 15 cases passed; 8 stopped after a protected-formatting-marker error.** Only fully completed, structurally valid runs receive a complete-page time. The paragraph counts beside failures show rendered progress when the run stopped, not a translation speed.

| Requested words | Target | First translated paragraphs | Full result / failure time |
| --- | --- | ---: | --- |
| 5,000 | Chinese | 11.96 s | Stopped at 21.87 s: Translation failed: Agent changed protected markup or terminology. |
| 5,000 | French | 10.31 s | Passed in 65.99 s |
| 5,000 | Spanish | 14.23 s | Passed in 64.96 s |
| 5,000 | Japanese | 18.31 s | Passed in 88.67 s |
| 5,000 | Korean | 18.27 s | Passed in 85.74 s |
| 10,000 | Chinese | 10.82 s | Stopped at 56.59 s: Translation failed: Agent changed protected markup or terminology. |
| 10,000 | French | 10.18 s | Passed in 131.44 s |
| 10,000 | Spanish | 14.17 s | Passed in 129.51 s |
| 10,000 | Japanese | 17.41 s | Stopped at 41.76 s: Translation failed: Agent changed protected markup or terminology. |
| 10,000 | Korean | 20.91 s | Stopped at 29.10 s: Translation failed: Agent changed protected markup or terminology. |
| 15,000 | Chinese | 14.29 s | Stopped at 50.89 s: Translation failed: Agent changed protected markup or terminology. |
| 15,000 | French | 9.76 s | Stopped at 167.26 s: Translation failed: Agent changed protected markup or terminology. |
| 15,000 | Spanish | 13.86 s | Passed in 193.01 s |
| 15,000 | Japanese | 18.42 s | Stopped at 44.35 s: Translation failed: Agent changed protected markup or terminology. |
| 15,000 | Korean | 19.12 s | Stopped at 73.30 s: Translation failed: Agent changed protected markup or terminology. |

Passing runs require every selected paragraph to contain changed, nonempty output, exact per-paragraph link and formatting multisets, and exact source DOM restoration. Chinese, Japanese and Korean also require the expected script in every paragraph. These checks do not establish sentence-level semantic completeness. The raw source/translation pairs and screenshots stay in ignored local benchmark artifacts; the public [measurement record](acceptance/long-multilingual-performance.json) contains counts, hashes, settings, progress events and failures.

The earlier sub-five-second result applies to the 977-word sample below. It is not a result for these longer pages.

### Plain-text Chinese diagnostic

After all 15 original-format cases, the failed Chinese sizes were rerun with inline HTML removed before translation. The source text hashes remain identical. This is a diagnostic reading view, **not** an original-format acceptance pass: links and inline formatting are absent. It retains the same viewport scheduling and model settings.

| Actual English words | First translated paragraphs | Complete plain reading view |
| --- | ---: | ---: |
| 4,970 | 9.05 s | 49.61 s |
| 9,983 | 8.83 s | 95.90 s |
| 15,031 | 8.85 s | 145.33 s |

These runs isolate removal of inline formatting; they do not isolate pure model latency because scrolling, browser layout and request batching also remain part of the workflow.

### Reproduce a long-article case

Supply an optional final scenario argument to the existing page benchmark. The scenario JSON selects the URL, approximate word count, target language and optional local HTML snapshot. All cases should use the same snapshot to keep the source stable.

```json
{"url":"https://en.wikipedia.org/wiki/History_of_the_United_States","title":"History of the United States","words":5000,"target":"fr","snapshot":"/private/source.html","attribution":"Wikipedia contributors, History of the United States, CC BY-SA 4.0"}
```

```bash
node scripts/benchmark-page.mjs /private/deepseek.json 3 formatted 6 dist/benchmarks/5000-fr 600 /private/scenario.json
```

## 977-word baseline: DeepSeek below five seconds

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
