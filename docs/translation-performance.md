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
| `deepseek-v4.1-flash` / `deepseek-flash` | HTTP 400: workspace region requirement | Not run while access is rejected |

All requests ask for JSON mode. The plain-text requests use `max_tokens=6000`; browser jobs use the extension defaults with batch size four and concurrency four. Each configuration has one measurement, and none establishes a successful complete-webpage time. MiMo returned 2,011 reasoning tokens; the other successful API runs returned 0–35. The API responses report zero cached prompt tokens.

DeepSeek requires **Global regions** in the OpenCode workspace's Privacy settings. The user requested that change, but it has not been verified: the console request returned HTTP 403 and Mac browser automation timed out. A logged-in console update is needed before retesting. The upstream project has [reports of the Privacy page being absent from navigation or failing to save](https://github.com/anomalyco/opencode/issues/50155); this account's setting has not been claimed as changed.

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
