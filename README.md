# Open Translate

Connect Immersive Translate to your own OpenAI-compatible local or hosted AI endpoint. The extension handles webpage selection and bilingual rendering; Open Translate adapts its Custom API requests into Chat Completions requests to your agent.

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

Merge the printed `translationService` and `translationServices.custom` settings into **Developer settings → Edit Full User Config**. Preserve your other settings. The snippet sets a 120-second extension timeout, compared with the bridge's default 90-second agent socket timeout. It includes common languages; add other language codes to `langs` as needed.

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
| `--base-url` / `OPEN_TRANSLATE_BASE_URL` | Your agent API base or full Chat Completions URL | Required |
| `--model` / `OPEN_TRANSLATE_MODEL` | Model identifier accepted by that endpoint | Required |
| `OPEN_TRANSLATE_API_KEY` | Optional upstream bearer key | Unset |
| `OPEN_TRANSLATE_TOKEN` | Access token for the local bridge | Generated at startup |
| `--port` | Local HTTP port | `8765` |
| `--timeout` | Agent socket timeout in seconds | `90` |
| `--concurrency` | Maximum simultaneous agent calls | `2` |
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
- Only the text selected for translation is sent upstream. Your chosen endpoint determines its storage and processing behavior.
- This bridge requests final text and does not execute tool calls. An agent endpoint must return a completed text response in the Chat Completions format.

This version is a local bridge to your endpoint, not a hosted multiuser service. It implements nonstreaming text batches. It does not recreate the browser extension, OCR, PDF layout recovery, video capture or premium services. Client disconnects do not reliably cancel an in-flight synchronous provider call; configured timeouts bound socket waits.

## Troubleshooting

| Error | Action |
| --- | --- |
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

The test suite exercises a real local HTTP round trip against a deterministic mock agent, including auth, ordering, markup, malformed responses, limits, timeouts and concurrency. It makes no external or paid API calls.

Optional editable installation provides an `open-translate` command:

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -e .
open-translate --help
```

The implementation and connection checks are tested against mocks. An actual user endpoint and an installed browser extension still need a live acceptance run using the steps above.

See [architecture and protocol notes](docs/architecture.md). Licensed under [MIT](LICENSE).
