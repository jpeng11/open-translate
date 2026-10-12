from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

from open_translate.agent import Agent, BridgeError, MAX_BODY, endpoint_url, validate_job
from open_translate.cli import extension_config
from open_translate.server import BridgeServer


@contextmanager
def running(server):
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


class FakeAgentHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append((self.path, dict(self.headers), data))
        status, body = self.server.respond(data)
        encoded = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        if status == 302 and hasattr(self.server, "redirect_url"):
            self.send_header("Location", self.server.redirect_url)
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            pass


def envelope(value, finish="stop"):
    return {"choices": [{"finish_reason": finish, "message": {"content": json.dumps(value, ensure_ascii=False)}}]}


def translations(data):
    job = json.loads(data["messages"][1]["content"])
    # A deterministic test double; this is not a language model.
    return [{"id": item["id"], "text": item["text"].replace("Bonjour", "Hello").replace("monde", "world"),
             "detected_source_lang": "fr"} for item in job["items"]]


@contextmanager
def fake_agent(respond=None):
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAgentHandler)
    server.daemon_threads = True
    server.requests = []
    server.respond = respond or (lambda data: (200, envelope({"translations": list(reversed(translations(data)))})))
    with running(server) as url:
        yield server, url


OPENER = build_opener(ProxyHandler({}))


def request(url, payload=None, headers=None, method=None):
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    headers = {"Content-Type": "application/json", **(headers or {})}
    req = Request(url, data=data, headers=headers, method=method)
    try:
        response = OPENER.open(req, timeout=3)
    except HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read()), response.headers


JOB = {"source_lang": "fr", "target_lang": "en", "text_list": ["Bonjour {0}", "Bonjour monde"]}


class BridgeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.agent_context = fake_agent()
        self.upstream, self.upstream_url = self.agent_context.__enter__()
        self.addCleanup(self.agent_context.__exit__, None, None, None)
        self.agent = Agent(self.upstream_url + "/v1", "user-agent", "upstream-secret")
        self.bridge = BridgeServer(("127.0.0.1", 0), self.agent, "bridge-secret")
        self.bridge_context = running(self.bridge)
        self.url = self.bridge_context.__enter__()
        self.addCleanup(self.bridge_context.__exit__, None, None, None)
        self.translate_url = self.url + "/translate?token=bridge-secret"

    def test_real_http_batch_order_and_placeholder_restoration(self):
        job = {**JOB, "text_list": ["Bonjour <b>{0}</b>", " \n", "Bonjour monde", "Bonjour {{1}}", ""]}
        status, body, _ = request(self.translate_url, job)
        self.assertEqual(status, 200)
        self.assertEqual([t["text"] for t in body["translations"]], ["Hello <b>{0}</b>", " \n", "Hello world", "Hello {{1}}", ""])
        path, headers, data = self.upstream.requests[0]
        self.assertEqual(path, "/v1/chat/completions")
        self.assertEqual(headers["Authorization"], "Bearer upstream-secret")
        self.assertEqual(data["model"], "user-agent")
        self.assertEqual(data["response_format"], {"type": "json_object"})
        self.assertFalse(data["stream"])
        self.assertNotIn("tools", data)
        self.assertNotIn("bridge-secret", json.dumps(data))
        self.assertNotIn("{0}", data["messages"][1]["content"])

    def test_blank_batch_does_not_call_provider(self):
        for texts in ([], ["", " \n"]):
            with self.subTest(texts=texts):
                status, body, _ = request(self.translate_url, {**JOB, "text_list": texts})
                self.assertEqual(status, 200)
                self.assertEqual([t["text"] for t in body["translations"]], texts)
        self.assertEqual(self.upstream.requests, [])

    def test_auth_rejects_requests_before_calling_provider(self):
        for suffix in ("", "?token=wrong"):
            status, body, _ = request(self.url + "/translate" + suffix, JOB)
            self.assertEqual(status, 401)
            self.assertEqual(body["error"]["code"], "unauthorized")
        self.assertEqual(self.upstream.requests, [])
        status, _, _ = request(self.url + "/translate", JOB, {"Authorization": "Bearer bridge-secret"})
        self.assertEqual(status, 200)

    def test_origin_policy_and_extension_preflight(self):
        status, _, headers = request(self.translate_url, JOB, {"Origin": "https://unrelated.example"})
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        origin = "chrome-extension://test-extension"
        status, _, headers = request(self.url + "/translate", headers={"Origin": origin,
            "Access-Control-Request-Private-Network": "true"}, method="OPTIONS")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")
        self.assertEqual(self.upstream.requests, [])

    def test_extra_origin_must_be_explicitly_allowed(self):
        self.bridge.allowed_origins = frozenset(["https://dash.immersivetranslate.com"])
        status, _, headers = request(self.translate_url, JOB, {"Origin": "https://dash.immersivetranslate.com"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://dash.immersivetranslate.com")

    def test_invalid_input_and_content_type(self):
        for payload in ([], {}, {**JOB, "target_lang": "auto"}, {**JOB, "text_list": [4]}, {**JOB, "text_list": ["x"] * 33}):
            with self.subTest(payload=payload):
                status, _, _ = request(self.translate_url, payload)
                self.assertEqual(status, 400)
        status, _, _ = request(self.translate_url, JOB, {"Content-Type": "text/plain"})
        self.assertEqual(status, 415)
        self.assertEqual(self.upstream.requests, [])

    def test_limits_on_body_and_text(self):
        status, _, _ = request(self.translate_url, {**JOB, "text_list": ["a" * 20001]})
        self.assertEqual(status, 413)
        # An oversized declared body is rejected before upload. Sending the whole
        # body first can race the response and cause a TCP reset on macOS.
        connection = HTTPConnection("127.0.0.1", self.bridge.server_port, timeout=3)
        try:
            connection.putrequest("POST", "/translate?token=bridge-secret")
            connection.putheader("Content-Type", "application/json")
            connection.putheader("Content-Length", str(MAX_BODY + 1))
            connection.endheaders()
            response = connection.getresponse()
            self.assertEqual(response.status, 413)
            self.assertEqual(json.loads(response.read())["error"]["code"], "body_too_large")
        finally:
            connection.close()
        self.assertEqual(self.upstream.requests, [])

    def test_no_json_mode_for_compatible_endpoints(self):
        self.agent.json_mode = False
        status, _, _ = request(self.translate_url, JOB)
        self.assertEqual(status, 200)
        self.assertNotIn("response_format", self.upstream.requests[0][2])

    def test_provider_failure_is_redacted_and_never_reported_as_success(self):
        for upstream_status, expected in ((401, 502), (429, 503), (500, 502), (302, 502)):
            with self.subTest(status=upstream_status):
                self.upstream.respond = lambda _, s=upstream_status: (s, {"error": "upstream-secret private webpage"})
                status, body, _ = request(self.translate_url, JOB)
                self.assertEqual(status, expected)
                self.assertNotIn("translations", body)
                self.assertNotIn("upstream-secret", json.dumps(body))
                self.assertNotIn("private webpage", json.dumps(body))

    def test_timeout_releases_capacity_and_next_request_succeeds(self):
        def slow(data):
            time.sleep(0.15)
            return 200, envelope({"translations": translations(data)})
        self.agent.timeout = 0.03
        self.upstream.respond = slow
        status, body, _ = request(self.translate_url, JOB)
        self.assertEqual((status, body["error"]["code"]), (504, "upstream_timeout"))
        self.agent.timeout = 1
        self.upstream.respond = lambda data: (200, envelope({"translations": translations(data)}))
        self.assertEqual(request(self.translate_url, JOB)[0], 200)

    def test_provider_redirect_is_not_followed(self):
        with fake_agent() as (destination, destination_url):
            self.upstream.redirect_url = destination_url + "/v1/chat/completions"
            self.upstream.respond = lambda _: (302, {})
            status, body, _ = request(self.translate_url, JOB)
            self.assertEqual((status, body["error"]["code"]), (502, "upstream_http_302"))
            self.assertEqual(destination.requests, [])

    def test_busy_response_does_not_call_provider(self):
        self.bridge.slots.acquire()
        self.bridge.slots.acquire()
        try:
            status, body, headers = request(self.translate_url, JOB)
            self.assertEqual((status, body["error"]["code"]), (503, "busy"))
            self.assertEqual(headers["Retry-After"], "2")
            self.assertEqual(self.upstream.requests, [])
        finally:
            self.bridge.slots.release()
            self.bridge.slots.release()

    def test_health_is_reachable_without_agent_or_auth(self):
        self.assertEqual(request(self.url + "/health")[0], 200)
        self.assertEqual(request(self.url + "/missing")[0], 404)
        self.assertEqual(self.upstream.requests, [])

    def test_bad_batches_never_render_as_translations(self):
        def mutate(data, kind):
            items = translations(data)
            if kind == "duplicate": items[1]["id"] = items[0]["id"]
            if kind == "missing": items.pop()
            if kind == "unknown": items[0]["id"] = 99
            if kind == "boolean": items[0]["id"] = True
            if kind == "empty": items[0]["text"] = ""
            if kind == "broken-placeholder": items[0]["text"] = "Hello"
            if kind == "duplicate-placeholder": items[0]["text"] *= 2
            return 200, envelope({"translations": items})
        for kind in ("duplicate", "missing", "unknown", "boolean", "empty", "broken-placeholder", "duplicate-placeholder"):
            with self.subTest(kind=kind):
                self.upstream.respond = lambda data, k=kind: mutate(data, k)
                status, body, _ = request(self.translate_url, JOB)
                self.assertEqual(status, 502)
                self.assertIn("error", body)
                self.assertNotIn("translations", body)

    def test_malformed_and_truncated_agent_responses(self):
        malformed = [None, {}, {"choices": []}, {"choices": [{"message": {"content": "not json"}}]},
                     envelope({"translations": []}, finish="length"),
                     {"choices": [{"message": {"content": None, "tool_calls": []}}]}]
        for value in malformed:
            with self.subTest(response=value):
                self.upstream.respond = lambda _, v=value: (200, v)
                self.assertEqual(request(self.translate_url, JOB)[0], 502)

    def test_cli_connection_check_over_real_http(self):
        env = {k: v for k, v in os.environ.items() if not k.startswith("OPEN_TRANSLATE_")}
        result = subprocess.run([sys.executable, "-m", "open_translate", "--base-url", self.upstream_url,
            "--model", "user-agent", "--check"], cwd=Path(__file__).resolve().parents[1], env=env,
            capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)["translations"]), 1)

    def test_documented_cli_starts_a_working_bridge(self):
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        env = {k: v for k, v in os.environ.items() if not k.startswith("OPEN_TRANSLATE_")}
        env["OPEN_TRANSLATE_TOKEN"] = "cli-test-token"
        process = subprocess.Popen([sys.executable, "-m", "open_translate", "--base-url", self.upstream_url,
            "--model", "user-agent", "--port", str(port)], cwd=Path(__file__).resolve().parents[1], env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(100):
                if process.poll() is not None:
                    self.fail(process.communicate(timeout=2))
                try:
                    if request(base + "/health")[0] == 200:
                        break
                except (URLError, OSError):
                    time.sleep(0.01)
            else:
                self.fail("CLI server did not become ready")
            status, body, _ = request(base + "/translate?token=cli-test-token", JOB)
            self.assertEqual(status, 200)
            self.assertEqual(body["translations"][0]["text"], "Hello {0}")
        finally:
            process.terminate()
            stdout, _ = process.communicate(timeout=3)
        self.assertIn(f"Custom API URL: {base}/translate?token=cli-test-token", stdout)


class ConfigurationTests(unittest.TestCase):
    def test_endpoint_normalization_preserves_custom_prefix_and_query(self):
        for base, path in (("http://localhost:1234", "/v1/chat/completions"),
                           ("http://localhost:1234/v1/", "/v1/chat/completions"),
                           ("https://agent.example/api/v1?version=1", "/api/v1/chat/completions?version=1"),
                           ("https://agent.example/v1/chat/completions", "/v1/chat/completions")):
            self.assertTrue(endpoint_url(base).endswith(path))
        for base in ("file:///tmp/agent", "https://user:secret@agent.example/v1", "https://agent.example/#fragment"):
            with self.assertRaises(ValueError):
                endpoint_url(base)

    def test_extension_config_includes_timeout_and_batching(self):
        config = extension_config("http://127.0.0.1:8765/translate?token=test")
        self.assertEqual(config["translationService"], "custom")
        self.assertEqual(config["translationServices"]["custom"]["requestTimeout"], 120000)

    def test_client_fields_cannot_override_agent_settings(self):
        job = validate_job({**JOB, "model": "other", "api_key": "untrusted", "messages": []})
        self.assertEqual(job, JOB)

    def test_wrapped_connection_timeout_is_a_gateway_timeout(self):
        agent = Agent("http://127.0.0.1:1/v1", "test")
        with patch.object(agent.opener, "open", side_effect=URLError(socket.timeout())):
            with self.assertRaises(BridgeError) as context:
                agent.translate(JOB)
        self.assertEqual(context.exception.status, 504)

    def test_no_tokens_or_webpage_content_are_written_to_request_logs(self):
        # The actual handler intentionally suppresses BaseHTTPRequestHandler access logs.
        with fake_agent() as (_, url):
            with running(BridgeServer(("127.0.0.1", 0), Agent(url, "test"), "private-token")) as bridge:
                with patch("sys.stderr", new_callable=io.StringIO) as stderr:
                    request(bridge + "/translate?token=private-token", JOB)
                    self.assertEqual(stderr.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
