import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from open_translate.agent import BridgeError, validate_job
from open_translate.agy import AgyAgent
from open_translate.server import BridgeServer
from open_translate.speech import WhisperSpeech, MAX_AUDIO_BODY
from tests.test_bridge import running, JOB


def audio():
    output=io.BytesIO()
    with wave.open(output,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0\0'*1600)
    return output.getvalue()


def upload(url, payload=None, token='test-secret'):
    boundary='open-translate-test-boundary'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+(audio() if payload is None else payload)+(f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nlocal-whisper\r\n--{boundary}--\r\n').encode()
    req=Request(url+'/v1/audio/transcriptions?token='+token,data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with urlopen(req,timeout=4) as response:return response.status,json.load(response)
    except HTTPError as error:return error.code,json.load(error)


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.root=Path(self.directory.name);self.command=self.root/'whisper';self.model=self.root/'model.bin';self.model.write_bytes(b'model fixture')

    def backend(self, script=None, timeout=3):
        self.command.write_text('#!'+sys.executable+'\n'+(script or '''import sys,json,wave
from pathlib import Path
args=sys.argv[1:]
with wave.open(args[args.index('-f')+1]) as wav:assert wav.getframerate()==16000
Path(args[args.index('-of')+1]+'.json').write_text(json.dumps({'transcription':[{'text':' Hello'},{'text':' world.'}]}))
'''));self.command.chmod(0o700)
        return WhisperSpeech(str(self.command),str(self.model),timeout)

    def test_real_cli_wav_protocol_and_temporary_cleanup(self):
        self.assertEqual(self.backend().transcribe(audio()),{'text':'Hello world.'})

    def test_real_authenticated_multipart_roundtrip(self):
        with running(BridgeServer(('127.0.0.1',0),None,'test-secret',speech=self.backend())) as url:
            self.assertEqual(upload(url),(200,{'text':'Hello world.'}))
            self.assertEqual(upload(url,token='wrong')[0],401)
            self.assertEqual(upload(url,payload=b'not audio')[0],400)

    def test_disabled_speech_does_not_call_translation(self):
        with running(BridgeServer(('127.0.0.1',0),None,'test-secret')) as url:self.assertEqual(upload(url)[0],503)

    def test_audio_and_model_validation_precede_process(self):
        backend=self.backend()
        for payload,mime,model,language in [(b'bad','audio/wav','local-whisper','auto'),(audio(),'audio/webm','local-whisper','auto'),(audio(),'audio/wav','/private/model','auto'),(audio(),'audio/wav','local-whisper','../../')]:
            with self.subTest(mime=mime,model=model,language=language),patch('subprocess.Popen') as process:
                with self.assertRaises(BridgeError):backend.transcribe(payload,mime,model,language)
                process.assert_not_called()

    def test_timeout_and_failure_diagnostics_are_redacted(self):
        for script,timeout,code in [('import time;time.sleep(10)',.1,'speech_timeout'),('import sys;print("PRIVATE_AUDIO_OR_KEY",file=sys.stderr);sys.exit(1)',3,'speech_failed'),('pass',3,'invalid_speech_response')]:
            with self.subTest(code=code):
                with self.assertRaises(BridgeError) as caught:self.backend(script,timeout).transcribe(audio())
                self.assertEqual(caught.exception.code,code);self.assertNotIn('PRIVATE_AUDIO',str(caught.exception))

    def test_agy_recovers_once_without_accepting_tool_output(self):
        agent=AgyAgent(sys.executable,timeout=3)
        calls=[]
        def recover(payload):
            calls.append(payload)
            if len(calls)==1:raise BridgeError(502,'agy_tool_use','rejected')
            job=json.loads(payload['messages'][-1]['content'])
            return {'translations':[dict(item,detected_source_lang='fr') for item in job['items']]}
        with patch.object(AgyAgent,'complete',side_effect=recover) as complete:
            self.assertEqual(len(agent.translate(validate_job(JOB))['translations']),2);self.assertEqual(complete.call_count,2)
        for code in ['agy_tool_use','agy_auth_required','agy_rate_limited']:
            with self.subTest(code=code),patch.object(AgyAgent,'complete',side_effect=BridgeError(502,code,'PRIVATE_DIAGNOSTIC')) as complete:
                with self.assertRaises(BridgeError):agent.translate(validate_job(JOB))
                self.assertEqual(complete.call_count,2 if code=='agy_tool_use' else 1)
