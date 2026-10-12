import argparse
import json
import math
import os
import secrets
from urllib.parse import quote

from .agent import Agent
from .server import BridgeServer


def extension_config(url):
    return {"translationService": "custom", "translationServices": {"custom": {
        "name": "Open Translate", "url": url,
        "langs": "en,zh-CN,zh-TW,ja,ko,fr,de,es,pt,it,ru,ar,hi,vi",
        "placeholderDelimiters": ["{", "}"],
        "requestTimeout": 120000, "maxTextLengthPerRequest": 3000,
        "maxTextGroupLengthPerRequest": 8, "limit": 1, "concurrencyLimit": 2,
    }}}


def main():
    parser = argparse.ArgumentParser(description="Connect Immersive Translate to your own AI endpoint")
    parser.add_argument("--base-url", default=os.getenv("OPEN_TRANSLATE_BASE_URL"),
                        help="Agent API base URL or full /chat/completions URL")
    parser.add_argument("--model", default=os.getenv("OPEN_TRANSLATE_MODEL"), help="Exact model identifier served by your endpoint")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--timeout", type=float, default=90, help="Agent socket timeout in seconds (default: 90)")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--no-json-mode", action="store_true", help="Omit response_format for endpoints without JSON mode")
    parser.add_argument("--allow-origin", action="append", default=[], help="Additional exact browser origin; repeatable")
    parser.add_argument("--print-extension-config", action="store_true", help="Print extension settings instead of starting")
    args = parser.parse_args()
    if not args.base_url or not args.model:
        parser.error("Set --base-url and --model, or OPEN_TRANSLATE_BASE_URL and OPEN_TRANSLATE_MODEL")
    if not 1 <= args.port <= 65535 or args.concurrency < 1 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Port, concurrency and timeout must be valid positive values")
    token = os.getenv("OPEN_TRANSLATE_TOKEN") or secrets.token_urlsafe(32)
    try:
        agent = Agent(args.base_url, args.model, os.getenv("OPEN_TRANSLATE_API_KEY", ""), args.timeout, not args.no_json_mode)
        url = f"http://127.0.0.1:{args.port}/translate?token={quote(token, safe='')}"
        config = extension_config(url)
        if args.print_extension_config:
            if not os.getenv("OPEN_TRANSLATE_TOKEN"):
                parser.error("Set OPEN_TRANSLATE_TOKEN so the printed configuration matches the server")
            print(json.dumps(config, indent=2))
            return
        server = BridgeServer(("127.0.0.1", args.port), agent, token,
                              allowed_origins=args.allow_origin, concurrency=args.concurrency)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(f"Open Translate is listening on 127.0.0.1:{args.port}", flush=True)
    print(f"Custom API URL: {url}", flush=True)
    print("Copy this URL into Immersive Translate's Custom API settings.", flush=True)
    print("The URL grants access to this bridge. Keep it private. Ctrl+C stops the server.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
