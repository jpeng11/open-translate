# Optional Python bridge

Connect Immersive Translate to your own OpenAI-compatible endpoint or Google Antigravity (`agy`) CLI. The extension handles webpage selection and bilingual rendering; Open Translate adapts its Custom API requests to your chosen agent.

This is an independent implementation of the documented integration contract. It does not contain Immersive Translate's compiled bundles or source.

```text
Immersive Translate → local Open Translate bridge → your AI endpoint
                   ← translated text and markup ←
```

Python 3.10+ is the only runtime requirement. There are no third-party runtime dependencies.

## Quick start

Run these commands from the repository root. Your agent must expose an OpenAI-compatible Chat Completions API and accept the model name you supply.

For a local endpoint:

```bash
python3 -m open_translate \
  --base-url http://127.0.0.1:1234/v1 \
  --model YOUR_MODEL
```

Replace the URL and model with those served by your agent. The bridge prints a Custom API URL such as:

```text
http://127.0.0.1:8765/translate?token=GENERATED_PRIVATE_TOKEN
```

Keep this process running while you translate. It listens only on your computer's loopback address. Run it on the same computer as your browser; a bridge on a remote development machine is not reachable through your browser's `127.0.0.1`.

For a hosted endpoint, set its API key in the environment:

```bash
export OPEN_TRANSLATE_API_KEY='YOUR_AGENT_API_KEY'
python3 -m open_translate \
  --base-url https://your-agent.example/v1 \
  --model YOUR_MODEL
```

The upstream key stays in the bridge process. It is never included in the extension settings. If your endpoint does not need a key, leave the variable unset. HTTPS uses normal certificate verification.

An API base URL such as `/v1` or `/api/v1`, or the complete `/chat/completions` URL, is accepted. A bare host URL defaults to `/v1/chat/completions`. Query parameters on the supplied endpoint are preserved. Redirects are rejected; configure the final endpoint URL directly.

## Use Google Antigravity on your Mac

Run the bridge on the Mac where your browser and signed-in `agy` CLI are installed:

```bash
agy --version
python3 -m open_translate --backend agy --timeout 180 --check
python3 -m open_translate --backend agy --timeout 180
```

Then connect the extension using the URL printed by the server. No OpenAI API URL or API key is needed for this backend. If `agy` is outside your PATH, add `--agy-command /absolute/path/to/agy`.

The CLI uses its cached login; sign in through an interactive `agy` session first if needed. The adapter uses [Google's documented headless stdin and structured-output protocol](https://antigravity.google/docs/cli/headless/). Each batch starts a fresh process in a fresh temporary workspace containing its translation profile and sends source text over stdin. AGY uses its existing account and settings; translations consume your account's AI credits and may be recorded by the CLI or provider.

AGY's current default model is used unless you supply `--model`. Use `agy models` to find an available model slug. Start with one text group per extension request and concurrency one. A 180-second bridge timeout needs an extension timeout of at least 210,000 milliseconds; generate the matching settings with:

```bash
export OPEN_TRANSLATE_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
python3 -m open_translate --backend agy --timeout 180 --print-extension-config
python3 -m open_translate --backend agy --timeout 180
```

The adapter requests translation only, selects the default approval mode and enables AGY's terminal sandbox. It selects a declarative translation profile requesting only structured completion and opting out of inherited customizations. AGY 1.3.2 still advertises its default tools at startup; existing account settings, permissions and hooks can remain applicable. A tool event makes the translation fail validation; that check happens after the CLI run and does not prevent tool execution. Use a translation-only account/profile if your existing CLI setup grants tools access you do not want webpage text to influence.

## Connect Immersive Translate

1. Install Immersive Translate in your browser.
2. In **Options → Developer settings**, enable **Beta Testing Features** if Custom API is hidden.
3. In **Options → General**, select **Custom API** as the translation service.
4. Give it a name such as **Open Translate**, and paste the complete URL printed by the bridge into **API URL**. Include the `token` query parameter.
5. Set the language list to the source/target codes you need, for example `en,fr,zh-CN,ja`. Keep the placeholder delimiters as `["{", "}"]`.
6. Set the request limits to eight text groups and about 3,000 characters per request. For a slow local model, start with one text group.
7. On a webpage, choose a target language and translate through the extension.

These menu names follow the [official Custom API setup documentation](https://immersivetranslate.com/en/docs/services/custom/). The integration uses the extension's existing bilingual rendering.

For complete settings, including the request timeout, generate a configuration snippet:

```bash
export OPEN_TRANSLATE_BASE_URL='http://127.0.0.1:1234/v1'
export OPEN_TRANSLATE_MODEL='YOUR_MODEL'
export OPEN_TRANSLATE_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"

python3 -m open_translate --print-extension-config
python3 -m open_translate
```

Merge the printed `translationService` and `translationServices.custom` settings into **Developer settings → Edit Full User Config**. Preserve your other settings. The snippet sets an extension timeout of at least 120 seconds and at least 30 seconds longer than the configured bridge timeout. It includes common languages; add other language codes to `langs` as needed.

`OPEN_TRANSLATE_TOKEN` makes the extension URL stable while this environment is kept. Store it in your preferred local environment configuration if you want to reuse it after restarting your terminal. Without it, each bridge start generates a fresh token and the extension URL must be updated. Open Translate does not automatically load `.env` files.

## Check your endpoint

Before configuring the extension, run:

```bash
python3 -m open_translate \
  --base-url http://127.0.0.1:1234/v1 \
  --model YOUR_MODEL \
  --check
```

This sends a small English-to-French translation through your actual endpoint and prints the validated result. A hosted provider may charge for this request. It exits nonzero on connection, authentication or response-format errors.

If your endpoint rejects `response_format`, add `--no-json-mode` both to the check and to the server command. The translation prompt still requests JSON and the bridge still validates the response.

The bridge's process health is available at:

```bash
curl http://127.0.0.1:8765/health
```

Health confirms that the bridge is running; it does not contact the agent. To test translation over the actual extension-facing route:

```bash
curl 'http://127.0.0.1:8765/translate?token=YOUR_BRIDGE_TOKEN' \
  -H 'Content-Type: application/json' \
  --data-binary @examples/translate-request.json
```

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `--backend` / `OPEN_TRANSLATE_BACKEND` | `openai` endpoint or `agy` CLI | `openai` |
| `--agy-command` / `OPEN_TRANSLATE_AGY_COMMAND` | AGY executable name or absolute path | `agy` |
| `--base-url` / `OPEN_TRANSLATE_BASE_URL` | Your agent API base or full Chat Completions URL | Required for `openai` |
| `--model` / `OPEN_TRANSLATE_MODEL` | Endpoint model identifier or optional AGY model slug | Required for `openai` |
| `OPEN_TRANSLATE_API_KEY` | Optional upstream bearer key | Unset |
| `OPEN_TRANSLATE_TOKEN` | Access token for the local bridge | Generated at startup |
| `--port` | Local HTTP port | `8765` |
| `--timeout` | Agent timeout in seconds | `90` |
| `--concurrency` | Maximum simultaneous agent calls | `2` for `openai`; `1` for `agy` |
| `--no-json-mode` | Omit `response_format` from upstream requests | JSON mode enabled |
| `--allow-origin` | Additional exact browser origin; repeatable | Extension origins only |
| `--print-extension-config` | Print settings without starting a server; requires a stable token | Off |
| `--check` | Send a small endpoint verification request | Off |

For example, if the online settings page sends requests with its own origin, explicitly allow it:

```bash
python3 -m open_translate --allow-origin https://dash.immersivetranslate.com
```

That command assumes URL/model environment variables are already set. Arbitrary webpage origins are rejected. Extension background requests without an Origin header work with the access token.

## Behavior and limits

- One agent call per nonempty batch, with up to 32 input items and 20,000 input characters. Empty/whitespace-only strings are preserved locally.
- Each item has a stable integer ID. Returned items can be reordered; missing, duplicate and unknown IDs are rejected.
- Inline HTML tags and numeric placeholders are masked before sending text to the agent. Lost, duplicated or malformed protected tokens fail the batch instead of rendering damaged markup.
- No additional translation cache is written to disk. The extension may use its own cache.
- Bridge access requires a query token or `Authorization: Bearer` header. The query form works with the extension's Custom API URL field.
- Access logs are disabled, and upstream error bodies are not echoed to clients. The startup URL contains the bridge token; keep it private.
- Only the text selected for translation is sent upstream. Your chosen endpoint or AGY CLI determines its storage and processing behavior.
- The OpenAI backend requests final text and does not execute tool calls. An agent endpoint must return a completed text response in the Chat Completions format. The AGY backend invokes the installed CLI and validates its structured result.

The Python component is an optional local bridge. The standalone browser extension is described in the repository README. The bridge implements nonstreaming text batches. Client disconnects do not reliably cancel an in-flight synchronous provider call; configured timeouts bound socket waits.

## Troubleshooting

| Error | Action |
| --- | --- |
| `agy_auth_required` | Sign into `agy` interactively on this machine. |
| `agy_timeout` | Reduce batch size or increase both bridge and extension timeouts. |
| `agy_failed` | Check `agy --version`, account access and the selected model. |
| `agy_rate_limited` | Check the AGY account quota and reduce request rate. |
| `agy_tool_use` | Use a translation-only CLI configuration that answers directly. |
| `unauthorized` | Update the extension's URL with the current bridge token. |
| `upstream_http_401` / `403` | Check `OPEN_TRANSLATE_API_KEY` and your endpoint's access permissions. |
| `upstream_http_404` | Check the final Chat Completions URL and model name. |
| `upstream_http_400` | Check model compatibility; try `--no-json-mode` if `response_format` is unsupported. |
| `upstream_timeout` | Reduce extension batch size or increase both bridge and extension timeouts. |
| `invalid_agent_response` | The agent must return JSON translations, not prose, a tool call, or a truncated result. |
| `placeholder_mismatch` | Try a smaller batch or a model that preserves the opaque tokens reliably. |
| `busy` / `upstream_http_429` | Reduce extension request concurrency/rate or check provider quota. |
| `origin_denied` | Add the precise trusted settings-page origin with `--allow-origin`. |

## Development

```bash
python3 -m unittest discover -v
python3 -m compileall -q open_translate tests
```

The test suite exercises a real local HTTP round trip against a deterministic mock agent, including auth, ordering, markup, malformed responses, limits, timeouts and concurrency. AGY tests launch a fake CLI subprocess to verify stdin, structured output, timeout cleanup and the HTTP route. The test suite makes no external or paid API calls.

Optional editable installation provides an `open-translate` command:

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -e .
open-translate --help
```

Automated tests use mocks. A live macOS run with AGY 1.3.2 also passed the connection check and the authenticated HTTP translation route, preserving markup and placeholders. See [validation results](validation.md) and [the Mac setup guide](mac-setup.md). See the validation document for standalone extension acceptance.

See [architecture and protocol notes](docs/architecture.md). Licensed under [MIT](LICENSE).
