# Translation performance

On 2026-10-13, the tested Magpie routes did not meet the requested 1–2 second **complete first translation** target. The sample is 977 English words in 16 complete paragraphs from [Wikipedia’s Machine translation article](https://en.wikipedia.org/wiki/Machine_translation), translated into Simplified Chinese. Source hashes, settings, token usage, failures and build bindings are in the [measurement record](acceptance/translation-performance.json).

## Whole plain-text API requests

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

## Actual original-format webpage

A clean Chromium extension profile on the Mac translated the same public page, with its original markup. Timing starts immediately before translation and includes paragraph scheduling, model calls and rendering. The harness scrolls to unfinished paragraphs; viewport-prioritized loading creates multiple request waves. Application cache is disabled. Magpie is reached through a temporary private SSH loopback tunnel; the AGY bridge runs on the Mac.

| Provider/configuration | First translated paragraph | All 16 paragraphs | Formatting |
| --- | ---: | ---: | --- |
| AGY `gemini-3.8-flash-low`, concurrency 1 | 5.259 s | 45.419 s | Passed |
| AGY same model, extension and isolated bridge concurrency 4 | 9.155 s | 31.502 s | Passed |
| Magpie `qoder/dfmodel`, default reasoning, concurrency 4 | 32.285 s | 136.227 s | Passed |
| Magpie `codex/gpt-6-luna`, low reasoning, concurrency 4 | 9.919 s | 92.661 s | Passed |

Every passing webpage run retained all 70 links and supported formatting, then restored the exact original DOM. The counts establish structural completeness; they are not an exhaustive linguistic review. Plain-text API timings must not be presented as full webpage timings. AGY's explicit model is `gemini-3.8-flash-low`, using CLI 1.3.2.

## OpenCode Go follow-up

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

The product implementation remains unchanged and the existing broad acceptance bindings still verify. These live-provider failures establish a remaining compatibility limit in direct rich-text translation, even when the same models return valid plain-text batches.

## Changes retained

Page scans fill batches before dispatch and run independent requests up to the configured concurrency. Documents and subtitles also respect concurrency while preserving order and cancellation. The default remains one. The bridge's own concurrency must allow the chosen browser limit.

Under **Your engine → OpenAI-compatible endpoint**, **Reasoning effort** can use the model default or request none, low, medium or high. It defaults to sending no override. Use overrides only with an endpoint that supports them; they do not affect AGY or the Python bridge. Changing the setting separates cached results. The control is translated into all six UI languages.

A shorter-marker experiment reduced protected text from 20,673 to 11,985 characters (42.03%), but both Luna webpage runs changed marker order and failed validation. The change was reverted. No partial result or failed run is counted as a speed improvement.

## Reproduce

Keep the endpoint URL, model and key in a private JSON connection file using the extension's `apiUrl`, `model`, `apiKey`, `jsonMode`, `reasoningEffort` and `timeout` fields. Use the Magpie address reachable from the machine running the test. A loopback URL always refers to that same machine.

```bash
npm run build
node scripts/benchmark-page.mjs /private/connection.json 4 formatted 4
node scripts/benchmark-models.mjs /private/connection.json \
  dist/benchmarks/page-speed-translations.json /tmp/model-comparison.json \
  codex/gpt-6-luna qoder/dfmodel
```

These commands make live provider calls. The page benchmark writes its report, translated sample and screenshot under ignored `dist/benchmarks/`; the model comparison writes counts and hashes without credentials or source text. Reports are overwritten at their selected paths, so preserve each run before starting another. A successful structural check cannot establish a 1–2 second service guarantee; repeated runs and semantic review would be needed before publishing a performance claim.
