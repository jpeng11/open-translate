#!/usr/bin/env python3
"""Safari 26+ actual temporary-extension acceptance through SafariDriver.

Requires Safari Settings > Developer > Allow remote automation, enabled by its
owner. Does not change Safari preferences or kill existing Safari processes.
The temporary extension and driver session are removed on every exit.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
OPENER = build_opener(ProxyHandler({}))


class Fixture(BaseHTTPRequestHandler):
    workspace = None
    requests = 0

    def log_message(self, *_):
        pass

    def do_GET(self):
        body = b'<html><body><p id="paragraph">Safari paragraph</p></body></html>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path == '/ready':
            type(self).workspace = data['workspace']
            value = {}
        else:
            type(self).requests += 1
            job = json.loads(data['messages'][-1]['content'])
            value = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(
                {'translations': [{'id': item['id'], 'text': 'Translated ' + item['text']}
                                  for item in job['items']]})}}]}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(value).encode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', default='/usr/bin/safaridriver')
    parser.add_argument('--extension', default=str(ROOT / 'dist/safari'))
    args = parser.parse_args()
    manifest_path = Path(args.extension).resolve() / 'manifest.json'
    if not manifest_path.is_file():
        raise SystemExit('Run npm run build first, or pass --extension.')
    if not Path(args.binary).is_file():
        raise SystemExit('Run this acceptance script on a Mac with Safari 26 or later.')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    session = extension_id = None
    process = None

    def call(method, path, body=None):
        request = Request(f'http://127.0.0.1:{port}' + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={'Content-Type': 'application/json'}, method=method)
        try:
            with OPENER.open(request, timeout=45) as response:
                value = json.load(response).get('value')
        except HTTPError as error:
            value = json.load(error).get('value', {})
            raise RuntimeError(value.get('message', 'SafariDriver command failed')) from None
        if isinstance(value, dict) and value.get('error'):
            raise RuntimeError(value.get('message', value['error']))
        return value

    def js(source, *values, asynchronous=False):
        return call('POST', f'/session/{session}/execute/' + ('async' if asynchronous else 'sync'),
                    {'script': source, 'args': list(values)})

    def wait(predicate, timeout=25):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if predicate():
                return
            time.sleep(.2)
        raise AssertionError('Safari acceptance condition timed out')

    try:
        with tempfile.TemporaryDirectory(prefix='open-translate-safari-') as directory:
            extension = Path(directory) / 'extension'
            shutil.copytree(manifest_path.parent, extension)
            # Add an isolated acceptance observer to a copy of our own build.
            # Production engine/UI/content scripts run unchanged.
            worker = extension / 'background.js'
            with worker.open('a') as stream:
                stream.write('\nfetch(' + json.dumps(origin + '/ready') + ',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace:chrome.runtime.getURL("app.html")})}).catch(()=>{});\n')
            with (Path(directory) / 'driver.log').open('w+') as log:
                process = subprocess.Popen([args.binary, '--port', str(port)], stdout=log, stderr=log)
                for _ in range(100):
                    try:
                        call('GET', '/status')
                        break
                    except URLError:
                        if process.poll() is not None:
                            raise RuntimeError('Owned SafariDriver exited before readiness')
                        time.sleep(.1)
                result = call('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})
                session = result['sessionId']
                call('POST', f'/session/{session}/timeouts', {'script': 30000, 'pageLoad': 30000})
                extension_id = call('POST', f'/session/{session}/webextension', {'type': 'path', 'path': str(extension)})
                wait(lambda: Fixture.workspace is not None)
                call('POST', f'/session/{session}/url', {'url': Fixture.workspace + '#text'})
                wait(lambda: js('return !!document.querySelector("#connection-form");'))
                config = {'provider': 'openai', 'apiUrl': origin + '/v1', 'model': 'safari-fixture',
                          'apiKey': 'safari-test-key', 'source': 'en', 'target': 'fr', 'timeout': 15}
                saved = js('const done=arguments[arguments.length-1];(globalThis.browser||chrome).runtime.sendMessage({type:"settings.save",settings:arguments[0]}).then(done);', config, asynchronous=True)
                assert saved.get('ok'), 'Trusted extension settings save failed'
                call('POST', f'/session/{session}/url', {'url': Fixture.workspace + '#text'})
                wait(lambda: js('return document.querySelector("#engine-summary").textContent.includes("safari-fixture");'))
                js('document.querySelector("#text-source").value="Safari workspace";document.querySelector("#text-translate").click();')
                wait(lambda: js('return document.querySelector("#text-result").textContent==="Translated Safari workspace";'))
                local = js('const done=arguments[arguments.length-1];(globalThis.browser||chrome).storage.local.get(null).then(value=>done({hasSettings:"settings" in value}));', asynchronous=True)
                assert not local['hasSettings'], 'Private settings leaked into shared local storage'
                assert Fixture.requests > 0, 'Translation did not reach the configured endpoint'
                print('Safari actual MV3 acceptance passed: temporary installation, service worker, trusted settings, workspace translation and private storage.')
    finally:
        if session:
            if extension_id:
                try:
                    call('DELETE', f'/session/{session}/webextension/{extension_id}')
                except Exception:
                    pass
            try:
                call('DELETE', f'/session/{session}')
            except Exception:
                pass
        if process:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, AssertionError) as error:
        raise SystemExit(str(error)) from None
