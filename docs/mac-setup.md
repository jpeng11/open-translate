# Mac setup and current runtime

The repository is checked out at `~/projects/open-translate` on the Mac mini, with its local commit history and the GitHub origin `git@github.com:jpeng11/open-translate.git`.

The current bridge uses Homebrew Python 3.12 and the installed `~/.local/bin/agy`, with model `gemini-3.8-flash-low`. It listens at `http://127.0.0.1:8765`. Its configuration and runtime files are in:

```text
~/Library/Application Support/Open Translate/
  bridge.token
  bridge.pid
  bridge.log
  extension-config.json
  live-check.json
  standalone-connection.json
```

The directory and token-bearing files are private to your macOS account. The startup log and extension configuration contain the bridge access URL; keep them private. These runtime files are outside the Git repository.

## Connect the extension

Open the generated settings on the Mac:

```bash
open -a TextEdit "$HOME/Library/Application Support/Open Translate/extension-config.json"
```

For the standalone extension, build with `npm ci && npm run build` and load `dist/chrome` through Chrome/Edge’s extensions page in Developer mode. In **Workspace → Connection**, choose **Local bridge** and import `standalone-connection.json` (the older `extension-config.json` is also accepted) using the file picker, or paste its full translation URL. Immersive Translate is not required.

Use concurrency one, a 210-second timeout and batch size one to start, matching the bridge’s 180-second agent timeout. Select your target language and translate a webpage.

The bridge runs in the background for the current setup; it is not installed as a login service. Check it with:

```bash
curl http://127.0.0.1:8765/health
```

## Restart manually

If the bridge is no longer running, start it from Terminal with its saved token so the extension URL continues to work:

```bash
cd "$HOME/projects/open-translate"
export OPEN_TRANSLATE_TOKEN="$(cat "$HOME/Library/Application Support/Open Translate/bridge.token")"
/opt/homebrew/bin/python3.12 -m open_translate \
  --backend agy \
  --agy-command "$HOME/.local/bin/agy" \
  --model gemini-3.8-flash-low \
  --timeout 180
```

Leave that Terminal process running; Ctrl+C stops it. Use Homebrew Python 3.12 or newer here: the Mac's `/usr/bin/python3` is 3.9 and is below the supported minimum.

To stop the original background process, inspect the saved PID and confirm it still belongs to Open Translate before terminating it:

```bash
bridge_pid=$(cat "$HOME/Library/Application Support/Open Translate/bridge.pid")
ps -p "$bridge_pid" -o pid=,command=
```

If that output shows this bridge's `python ... -m open_translate` command, run `kill "$bridge_pid"`. The saved PID applies to the managed background process, not later manual restarts.
