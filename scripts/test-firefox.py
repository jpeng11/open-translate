#!/usr/bin/env python3
"""Actual Firefox MV3 acceptance via its built-in Marionette protocol.

Run after npm run build. FIREFOX_BINARY can select a locally installed Firefox;
Playwright's installed Firefox is discovered automatically. No signing is needed
for a temporary add-on. The profile and fixture endpoint are private and removed.
"""
import argparse
import glob
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT=Path(__file__).resolve().parents[1]

class Marionette:
    def __init__(self, port):
        self.socket=socket.create_connection(('127.0.0.1',port),timeout=30)
        self.counter=0
        self.receive()
    def receive(self):
        length=b''
        while not length.endswith(b':'):
            value=self.socket.recv(1)
            if not value: raise RuntimeError('Firefox closed Marionette')
            length+=value
        remaining=int(length[:-1]); chunks=[]
        while remaining:
            value=self.socket.recv(remaining)
            if not value: raise RuntimeError('Firefox closed Marionette payload')
            chunks.append(value); remaining-=len(value)
        return json.loads(b''.join(chunks))
    def call(self, command, **params):
        self.counter+=1
        value=json.dumps([0,self.counter,command,params]).encode()
        self.socket.sendall(str(len(value)).encode()+b':'+value)
        while True:
            response=self.receive()
            if isinstance(response,list) and response[0]==1 and response[1]==self.counter:
                if response[2]: raise RuntimeError(f'{command}: {response[2]}')
                return response[3]
    def js(self, script, *args):
        result=self.call('WebDriver:ExecuteScript',script=script,args=list(args),newSandbox=False,sandbox='default',line=0,filename='firefox-acceptance')
        return result.get('value',result) if isinstance(result,dict) else result
    def async_js(self, script, *args):
        result=self.call('WebDriver:ExecuteAsyncScript',script=script,args=list(args),newSandbox=False,sandbox='default',line=0,filename='firefox-acceptance')
        return result.get('value',result) if isinstance(result,dict) else result
    def wait(self, script, timeout=20):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            if self.js(script): return
            time.sleep(.15)
        raise AssertionError('Firefox condition timed out: '+script)

class Fixture(BaseHTTPRequestHandler):
    requests=[]
    def log_message(self,*args): pass
    def do_GET(self):
        data=b'<html><body>Root prose<p id="paragraph">Firefox paragraph</p><textarea id="input">Firefox input</textarea></body></html>'
        self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data)
    def do_POST(self):
        raw=self.rfile.read(int(self.headers.get('Content-Length','0')))
        if self.path.endswith('/audio/transcriptions'):
            value={'text':'Firefox audio'}
        else:
            request=json.loads(raw);self.requests.append(request)
            items=json.loads(request['messages'][-1]['content'])['items']
            value={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'translations':[{'id':item['id'],'text':'Translated '+item['text']} for item in items]})}}]}
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(value).encode())

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));return sock.getsockname()[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--binary',default=os.environ.get('FIREFOX_BINARY'));parser.add_argument('--extension',default=str(ROOT/'dist/firefox'));args=parser.parse_args()
    choices=sorted(glob.glob(str(Path.home()/'.cache/ms-playwright/firefox-*/firefox/firefox')))
    binary=args.binary or shutil.which('firefox') or (choices[-1] if choices else None)
    if not binary: raise SystemExit('Install Firefox or run npx playwright install firefox.')
    server=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
    with tempfile.TemporaryDirectory(prefix='open-translate-firefox-') as directory:
        profile=Path(directory)/'profile';profile.mkdir();port=free_port()
        prefs={'marionette.port':port,'browser.shell.checkDefaultBrowser':False,'browser.aboutwelcome.enabled':False,'browser.startup.homepage':'about:blank','datareporting.policy.dataSubmissionPolicyBypassNotification':True,'extensions.autoDisableScopes':0,'extensions.webextensions.dataCollectionPermissions.enabled':False}
        (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(key)}, {json.dumps(value)});' for key,value in prefs.items()))
        extension=Path(directory)/'extension';shutil.copytree(Path(args.extension).resolve(),extension)
        manifest=json.loads((extension/'manifest.json').read_text());manifest['content_scripts'][0]['js'].append('acceptance-probe.js');(extension/'manifest.json').write_text(json.dumps(manifest))
        (extension/'acceptance-probe.js').write_text("""
(async()=>{
 const denied=await browser.runtime.sendMessage({type:'settings.get'});
 const publicConfig=await browser.runtime.sendMessage({type:'settings.public'});
 const local=await browser.storage.local.get(null);
 const privateOriginVisible=await new Promise(resolve=>{
  const request=indexedDB.open('open-translate-private',1);
  request.onsuccess=()=>{const names=Array.from(request.result.objectStoreNames);request.result.close();resolve(names.includes('settings'));};
  request.onerror=()=>resolve(false);
 });
 const result=document.createElement('meta');result.id='credential-isolation-probe';
 result.dataset.denied=String(!denied.ok);result.dataset.publicSecret=String('apiKey' in (publicConfig.result || {}));
 result.dataset.localSecret=String('settings' in local);result.dataset.privateOriginVisible=String(privateOriginVisible);document.head.append(result);
})();
""")
        with open(Path(directory)/'firefox.log','w+') as log:
            process=subprocess.Popen([binary,'--headless','--no-remote','--marionette','--remote-allow-system-access','--profile',str(profile)],stdout=log,stderr=log,env={**os.environ,'MOZ_DISABLE_CONTENT_SANDBOX':'1'})
            client=None
            try:
                end=time.monotonic()+30
                while time.monotonic()<end:
                    try: client=Marionette(port);break
                    except (ConnectionRefusedError,TimeoutError):time.sleep(.2)
                if not client:raise RuntimeError('Firefox Marionette did not start')
                client.call('WebDriver:NewSession',capabilities={'alwaysMatch':{'acceptInsecureCerts':True}})
                client.call('Addon:Install',path=str(extension),temporary=True)
                client.call('Marionette:SetContext',value='chrome')
                uuid=client.js('return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[arguments[0]];','open-translate@open-translate.local')
                client.call('Marionette:SetContext',value='content')
                client.call('WebDriver:Navigate',url=f'moz-extension://{uuid}/app.html#connection')
                client.wait('return !!document.querySelector("#connection-form") ;')
                config={'provider':'openai','apiUrl':origin+'/v1','model':'firefox-fixture','apiKey':'firefox-private-key','source':'auto','target':'fr','inputTarget':'es','speechUrl':origin+'/v1','speechModel':'speech-fixture'}
                saved=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.runtime.sendMessage({type:"settings.save",settings:arguments[0]}).then(done,error=>done({error:error.message}));',config)
                assert saved.get('ok'),saved
                # Exercise the actual trusted UI and event-background engine.
                client.js('location.hash="#text";document.querySelector("#text-source").value="Firefox workspace";document.querySelector("#text-translate").click();')
                client.wait('return document.querySelector("#text-result").textContent==="Translated Firefox workspace";')
                # Use the UI's active tab command while creating the site in a new
                # active tab. The command traverses the same background API as popup.
                opened=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.tabs.create({url:arguments[0],active:false}).then(tab=>done(tab.id));',origin+'/page')
                client.js('globalThis.acceptanceTab=arguments[0];',opened)
                ready=False
                for _ in range(100):
                    status=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.tabs.sendMessage(globalThis.acceptanceTab,{type:"page.status"}).then(done,error=>done({error:error.message}));')
                    if status.get('ok'):
                        ready=True;break
                    time.sleep(.1)
                assert ready,status
                started=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.tabs.sendMessage(globalThis.acceptanceTab,{type:"page.start"}).then(done,error=>done({error:error.message}));')
                assert started.get('ok'),started
                handles=client.call('WebDriver:GetWindowHandles')
                handles=handles.get('value',handles) if isinstance(handles,dict) else handles
                client.call('WebDriver:SwitchToWindow',handle=handles[-1])
                client.wait('return document.querySelector("#paragraph [data-ot-target]")?.textContent==="Translated Firefox paragraph";')
                assert client.js('return document.querySelector("body > [data-ot-segment] > [data-ot-target]")?.textContent;')=='Translated Root prose'
                client.wait('return !!document.querySelector("#credential-isolation-probe");')
                isolated=client.js('return {...document.querySelector("#credential-isolation-probe").dataset};')
                assert isolated=={'denied':'true','publicSecret':'false','localSecret':'false','privateOriginVisible':'false'},isolated
                # Firefox exposes storage.local to content scripts. Verify there
                # are no stored credentials, using a real content-script context.
                client.call('WebDriver:SwitchToWindow',handle=handles[0])
                local=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.storage.local.get(null).then(done);')
                assert 'settings' not in local,local
                audio=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.runtime.sendMessage({type:"transcribe",audio:"AA==",mime:"audio/webm"}).then(done);')
                assert audio.get('ok'),audio
                assert audio['result']['text']=='Firefox audio',audio
                image=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.storage.session.set({pendingImage:{url:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGYQAAAAASUVORK5CYII=",time:Date.now()}}).then(()=>window.wrappedJSObject.browser.runtime.sendMessage({type:"image.pending"})).then(done);')
                assert image.get('ok') and image['result'].get('image','').startswith('data:image/png'),image
                client.call('WebDriver:SwitchToWindow',handle=handles[-1])
                client.js('document.querySelector("#input").focus();')
                client.call('WebDriver:SwitchToWindow',handle=handles[0])
                translated_input=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.tabs.sendMessage(globalThis.acceptanceTab,{type:"translate-input"}).then(done);')
                assert translated_input.get('ok'),translated_input
                restored=client.async_js('const done=arguments[arguments.length-1];window.wrappedJSObject.browser.tabs.sendMessage(globalThis.acceptanceTab,{type:"page.restore"}).then(done);')
                assert restored.get('ok'),restored
                client.call('WebDriver:SwitchToWindow',handle=handles[-1])
                assert client.js('return document.querySelector("#input").value;')=='Translated Firefox input'
                assert client.js('return document.querySelectorAll("[data-ot-target],[data-ot-segment]").length;')==0
                assert client.js('return document.querySelector("#paragraph").textContent;')=='Firefox paragraph'
                print('Firefox actual MV3 acceptance passed: trusted settings, workspace/page/input translation, exact restore, content credential isolation, transcription and image fallback.')
            except Exception:
                log.flush();log.seek(0);print(log.read()[-6000:]);raise
            finally:
                if client:
                    try:client.call('Marionette:Quit',flags=['eForceQuit'])
                    except Exception:pass
                    client.socket.close()
                process.terminate()
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait()
    server.shutdown();server.server_close()
if __name__=='__main__':main()
