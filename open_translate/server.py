"""Loopback HTTP adapter for Immersive Translate's Custom API."""

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import socket
import threading
from urllib.parse import parse_qs, urlsplit

from .agent import BridgeError, MAX_BODY, validate_job


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, agent, token, *, allowed_origins=(), concurrency=2):
        if not token:
            raise ValueError("A bridge access token is required")
        if concurrency < 1:
            raise ValueError("Concurrency must be positive")
        self.agent, self.token = agent, token
        self.allowed_origins = frozenset(allowed_origins)
        self.slots = threading.BoundedSemaphore(concurrency)
        super().__init__(address, BridgeHandler)


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "OpenTranslate/0.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_):
        pass  # Request paths can contain the bridge token. Never log text or keys.

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        try:
            parsed = urlsplit(origin)
        except ValueError:
            return False
        return (origin in self.server.allowed_origins or
                (parsed.scheme in ("chrome-extension", "moz-extension") and
                 bool(parsed.netloc) and not parsed.path and not parsed.query and not parsed.fragment))

    def reply(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.close_connection = True
        origin = self.headers.get("Origin")
        if origin and self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        if status == 503:
            self.send_header("Retry-After", "2")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def error(self, status, code, message):
        self.reply(status, {"error": {"code": code, "message": message}})

    def do_GET(self):
        if urlsplit(self.path).path == "/health":
            self.reply(200, {"status": "ok", "service": "open-translate"})
        else:
            self.error(404, "not_found", "Use POST /translate or GET /health")

    def do_OPTIONS(self):
        if urlsplit(self.path).path != "/translate":
            self.error(404, "not_found", "Unknown route")
        elif not self.origin_allowed():
            self.error(403, "origin_denied", "Browser origin is not allowed")
        else:
            self.reply(200, {})

    def do_POST(self):
        parsed = urlsplit(self.path)
        if parsed.path != "/translate":
            self.error(404, "not_found", "Unknown route")
            return
        if not self.origin_allowed():
            self.error(403, "origin_denied", "Browser origin is not allowed")
            return
        bearer = self.headers.get("Authorization", "")
        supplied = bearer[7:] if bearer.startswith("Bearer ") else parse_qs(parsed.query).get("token", [""])[0]
        if not hmac.compare_digest(supplied.encode(), self.server.token.encode()):
            self.error(401, "unauthorized", "A valid bridge token is required")
            return
        if self.headers.get_content_type() != "application/json":
            self.error(415, "unsupported_media_type", "Use Content-Type: application/json")
            return
        try:
            if self.headers.get("Transfer-Encoding"):
                raise BridgeError(400, "invalid_request", "Chunked requests are not supported")
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise BridgeError(413, "body_too_large", "JSON body must be between 1 byte and 1 MiB")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise BridgeError(400, "invalid_request", "Incomplete request body")
            job = validate_job(json.loads(raw))
            if not self.server.slots.acquire(blocking=False):
                raise BridgeError(503, "busy", "Bridge is busy; retry shortly")
            try:
                result = self.server.agent.translate(job)
            finally:
                self.server.slots.release()
            self.reply(200, result)
        except BridgeError as error:
            self.error(error.status, error.code, str(error))
        except (ValueError, UnicodeError):
            self.error(400, "invalid_json", "Request body must be valid UTF-8 JSON")
        except (socket.timeout, TimeoutError):
            self.error(408, "request_timeout", "Request body timed out")
        except Exception:
            logging.error("Unexpected translation failure; request and response contents omitted")
            self.error(500, "internal_error", "Unexpected bridge error")
