"""Optional local speech recognition through the user's whisper.cpp installation."""
from dataclasses import dataclass
import json
import io
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave

from .agent import BridgeError, MAX_RESPONSE
from .agy import terminate

MAX_AUDIO_BODY = 8 * 1024 * 1024 + 65536


@dataclass
class WhisperSpeech:
    executable: str
    model_path: str
    timeout: float = 60

    def __post_init__(self):
        path = shutil.which(os.path.expanduser(self.executable))
        model = Path(self.model_path).expanduser().resolve()
        if not path:
            raise ValueError('whisper.cpp executable not found; install whisper-cpp or set --speech-command')
        if not model.is_file():
            raise ValueError('Set --speech-model to an existing local whisper.cpp GGML model file')
        if not math.isfinite(self.timeout) or self.timeout <= 0:
            raise ValueError('Speech timeout must be positive')
        self.executable, self.model_path = path, str(model)

    def transcribe(self, audio, mime='audio/wav', model='local-whisper', language='auto'):
        if model not in ('', 'local-whisper'):
            raise BridgeError(400, 'invalid_speech_model', 'The bridge serves model local-whisper')
        if mime not in ('audio/wav', 'audio/x-wav', 'audio/wave'):
            raise BridgeError(415, 'unsupported_audio', 'Local speech requires PCM WAV audio')
        if language != 'auto' and (not language.isascii() or not language.isalpha() or len(language) not in (2, 3)):
            raise BridgeError(400, 'invalid_language', 'Speech language must be auto or a language code')
        try:
            with wave.open(io.BytesIO(audio), 'rb') as wav:
                if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 16000:
                    raise ValueError()
                frames = wav.getnframes()
                if not 0 < frames <= 16000 * 60 or len(wav.readframes(frames)) != frames * 2:
                    raise ValueError()
        except (ValueError, EOFError, wave.Error):
            raise BridgeError(400, 'invalid_audio', 'Use complete mono 16-bit 16 kHz PCM WAV, at most 60 seconds') from None
        with tempfile.TemporaryDirectory(prefix='open-translate-speech-') as directory:
            source, output = Path(directory) / 'audio.wav', Path(directory) / 'result'
            source.write_bytes(audio)
            command = [self.executable, '-m', self.model_path, '-f', str(source), '-oj', '-of', str(output), '-l', language, '-np']
            with tempfile.TemporaryFile() as diagnostics:
                try:
                    process = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL,
                        stdout=diagnostics, stderr=diagnostics, start_new_session=(os.name == 'posix'))
                    try:
                        process.wait(timeout=self.timeout)
                    except subprocess.TimeoutExpired:
                        terminate(process)
                        raise BridgeError(504, 'speech_timeout', 'Local speech recognition timed out') from None
                    finally:
                        terminate(process)
                except OSError:
                    raise BridgeError(502, 'speech_unavailable', 'Cannot start local speech recognition') from None
                if process.returncode:
                    raise BridgeError(502, 'speech_failed', 'Local speech recognition did not complete')
            try:
                with output.with_suffix('.json').open('rb') as result:
                    raw = result.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError()
                value = json.loads(raw)
                parts = value['transcription']
                if not isinstance(parts, list) or any(not isinstance(p, dict) or not isinstance(p.get('text'), str) for p in parts):
                    raise ValueError()
                return {'text': ''.join(p['text'] for p in parts).strip()}
            except (OSError, ValueError, KeyError, TypeError):
                raise BridgeError(502, 'invalid_speech_response', 'Local speech returned an invalid transcript') from None
