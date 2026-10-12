# Local speech recognition

Text translation continues to use your selected AGY or OpenAI-compatible agent. Optional speech recognition can now run on the same local bridge using [whisper.cpp](https://github.com/ggml-org/whisper.cpp), so live audio needs no hosted speech subscription.

On the Mac:

```bash
brew install whisper-cpp
python3 -m open_translate --backend agy --timeout 180 \
  --speech-command /opt/homebrew/bin/whisper-cli \
  --speech-model "$HOME/Library/Application Support/Open Translate/models/ggml-tiny.bin"
```

Acquire a GGML model from the [official whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp). The actual Mac acceptance used revision `5359861c739e955e79d9a303bcbc70fb988958b1`, `ggml-tiny.bin`, 77,691,713 bytes, SHA256 `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`. Models are not shipped in this repository. Larger models can improve recognition at the cost of memory and latency.

Choose Local bridge in the extension, retain the private token URL, and leave the separate speech endpoint empty. The extension derives `/v1/audio/transcriptions` and uses the same token. An explicit speech endpoint still takes priority. The bridge accepts authenticated multipart mono 16 kHz 16-bit PCM WAV, runs the configured executable/model with a deadline, and returns JSON text. Model selection cannot change the configured filesystem model. Requests are bounded; diagnostics and private paths are not exposed to clients.

Live capture uses independently decodable 2–5 second WAV chunks (3 seconds by default), speech pause detection, bounded pending work, explicit start/stop and track cleanup. These are short transcription calls, rather than a streaming recognition protocol. Agent inference/network time still adds latency. Local model quality and language coverage depend on your chosen model.

Actual Mac acceptance transcribed the official English JFK sample correctly with the installed whisper.cpp binary. This proves the local executable/model path, not recognition quality in noisy multilingual meetings. Browser capture → multipart route → real local recognition is tested separately from deterministic browser CI.
