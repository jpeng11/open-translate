"""Exercise the AGY subprocess protocol without an account or network calls."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from open_translate.agent import BridgeError, MAX_RESPONSE, validate_job
from open_translate.agy import AgyAgent
from open_translate.server import BridgeServer
from tests.test_bridge import JOB, request, running


class AgyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.executable = Path(self.directory.name) / "fake-agy"
        self.record = Path(self.directory.name) / "record.json"

    def script(self, body):
        self.executable.write_text("#!" + sys.executable + "\n" + body)
        self.executable.chmod(0o700)
        return str(self.executable)

    def success(self):
        return self.script("""
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
event = json.loads(sys.stdin.readline())
job = json.loads(event['message']['content'].rsplit('\\n\\n', 1)[-1])
Path(RECORD).write_text(json.dumps({'args': args, 'event': event, 'cwd': os.getcwd(), 'files': os.listdir('.')}))
items = [{'id': i['id'], 'text': i['text'].replace('Bonjour', 'Hello').replace('monde', 'world'), 'detected_source_lang': 'fr'} for i in reversed(job['items'])]
print(json.dumps({'event': 'init', 'session_id': 'fake'}))
print(json.dumps({'event': 'result', 'result': {'status': 'SUCCESS', 'structured_output': {'translations': items}}}))
""".replace('RECORD', repr(str(self.record))))

    def test_real_subprocess_stdin_schema_markup_and_temporary_workspace(self):
        agent = AgyAgent(self.success(), model='selected-model', timeout=3)
        result = agent.translate(validate_job({**JOB, 'text_list': ['Bonjour <b>{0}</b>', ' ', 'Bonjour monde']}))
        self.assertEqual([i['text'] for i in result['translations']], ['Hello <b>{0}</b>', ' ', 'Hello world'])
        record = json.loads(self.record.read_text())
        self.assertEqual(record['files'], [])
        self.assertFalse(Path(record['cwd']).exists())
        args = record['args']
        for flag, value in (('--input-format', 'stream-json'), ('--output-format', 'stream-json'),
                            ('--model', 'selected-model'), ('--mode', 'default'), ('--print-timeout', '3s')):
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertIn('--sandbox', args)
        self.assertNotIn('Bonjour', ' '.join(args))
        self.assertNotIn('--continue', args)
        self.assertNotIn('--dangerously-skip-permissions', args)
        self.assertEqual(json.loads(args[args.index('--json-schema') + 1])['type'], 'object')
        self.assertEqual(record['event']['event'], 'user')

    def test_http_bridge_with_agy_backend(self):
        agent = AgyAgent(self.success(), timeout=3)
        with running(BridgeServer(('127.0.0.1', 0), agent, 'test-secret', concurrency=1)) as url:
            status, body, _ = request(url + '/translate?token=test-secret', JOB)
        self.assertEqual(status, 200)
        self.assertEqual([i['text'] for i in body['translations']], ['Hello {0}', 'Hello world'])
        self.assertNotIn('--model', json.loads(self.record.read_text())['args'])

    def test_cli_check_needs_no_endpoint_and_prints_validated_result(self):
        command = self.success()
        env = {k: v for k, v in os.environ.items() if not k.startswith('OPEN_TRANSLATE_')}
        result = subprocess.run([sys.executable, '-m', 'open_translate', '--backend', 'agy',
                                 '--agy-command', command, '--check'], env=env, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['translations'][0]['text'], 'Hello, world.')

    def test_failures_are_classified_and_diagnostics_are_redacted(self):
        for diagnostic, status, code in [('authentication required', 502, 'agy_auth_required'),
                                        ('quota exhausted', 503, 'agy_rate_limited'),
                                        ('other failure', 502, 'agy_failed')]:
            with self.subTest(code=code):
                path = self.script('import sys\nprint(' + repr(diagnostic + ' PRIVATE_SOURCE_OR_KEY') + ', file=sys.stderr)\nsys.exit(1)\n')
                with self.assertRaises(BridgeError) as caught:
                    AgyAgent(path, timeout=3).translate(validate_job(JOB))
                self.assertEqual((caught.exception.status, caught.exception.code), (status, code))
                self.assertNotIn('PRIVATE_SOURCE_OR_KEY', str(caught.exception))

    def test_timeout_terminates_subprocess(self):
        path = self.script('import os,time\nfrom pathlib import Path\nPath(' + repr(str(self.record)) + ').write_text(str(os.getpid()))\ntime.sleep(30)\n')
        start = time.monotonic()
        with self.assertRaises(BridgeError) as caught:
            AgyAgent(path, timeout=0.25).translate(validate_job(JOB))
        self.assertEqual(caught.exception.code, 'agy_timeout')
        self.assertLess(time.monotonic() - start, 3)
        if os.name == 'posix':
            with self.assertRaises(ProcessLookupError):
                os.kill(int(self.record.read_text()), 0)

    def test_stream_validation_rejects_partial_multiple_and_tool_results(self):
        success = {'event': 'result', 'result': {'status': 'SUCCESS', 'structured_output': {'translations': []}}}
        cases = [([{'event': 'init'}], 'agy_failed'), ([success, success], 'invalid_agy_response'),
                 ([{'event': 'step_update', 'step_update': {'step_type': 'tool'}}, success], 'agy_tool_use'),
                 ([{'event': 'result', 'result': {'status': 'SUCCESS', 'response': 'not json'}}], 'invalid_agy_response')]
        for events, code in cases:
            with self.subTest(code=code):
                raw = '\n'.join(json.dumps(e) for e in events).encode()
                with self.assertRaises(BridgeError) as caught:
                    AgyAgent.parse_result(raw, 0, '')
                self.assertEqual(caught.exception.code, code)
        response = {'event': 'result', 'result': {'status': 'SUCCESS', 'response': json.dumps({'translations': []})}}
        self.assertEqual(AgyAgent.parse_result(json.dumps(response).encode(), 0, ''), {'translations': []})

    def test_excess_output_is_rejected(self):
        path = self.script('print("x" * ' + str(MAX_RESPONSE + 1) + ')')
        with self.assertRaises(BridgeError) as caught:
            AgyAgent(path, timeout=3).translate(validate_job(JOB))
        self.assertEqual(caught.exception.code, 'agy_response_too_large')

    def test_missing_executable_fails_before_server_starts(self):
        with self.assertRaises(ValueError):
            AgyAgent(str(Path(self.directory.name) / 'missing-agy'))


if __name__ == '__main__':
    unittest.main()
