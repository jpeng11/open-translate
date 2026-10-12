import argparse
import json
import math
import os
import secrets
from urllib.parse import quote

from .agent import Agent, BridgeError, validate_job
from .agy import AgyAgent
from .server import BridgeServer


def extension_config(url, concurrency=2, timeout=120000):
    return {"translationService": "custom", "translationServices": {"custom": {
        "name": "Open Translate", "url": url,
        "langs": "en,zh-CN,zh-TW,ja,ko,fr,de,es,pt,it,ru,ar,hi,vi",
        "placeholderDelimiters": ["{", "}"],
        "requestTimeout": timeout, "maxTextLengthPerRequest": 3000,
        "maxTextGroupLengthPerRequest": 8, "limit": 1, "concurrencyLimit": concurrency,
    }}}


def main():
    parser = argparse.ArgumentParser(description="Connect Immersive Translate to your own AI endpoint or AGY CLI")
    parser.add_argument("--backend", choices=["openai", "agy"], default=os.getenv("OPEN_TRANSLATE_BACKEND", "openai"))
    parser.add_argument("--agy-command", default=os.getenv("OPEN_TRANSLATE_AGY_COMMAND", "agy"), help="AGY executable path (backend=agy)")
    parser.add_argument("--base-url", default=os.getenv("OPEN_TRANSLATE_BASE_URL"),
                        help="Agent API base URL or full /chat/completions URL")
    parser.add_argument("--model", default=os.getenv("OPEN_TRANSLATE_MODEL"), help="Endpoint model identifier; optional AGY model slug")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--timeout", type=float, default=90, help="Agent timeout in seconds (default: 90)")
    parser.add_argument("--concurrency", type=int, help="Maximum simultaneous agent calls (default: 2 for openai, 1 for agy)")
    parser.add_argument("--no-json-mode", action="store_true", help="Omit response_format for endpoints without JSON mode")
    parser.add_argument("--allow-origin", action="append", default=[], help="Additional exact browser origin; repeatable")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--print-extension-config", action="store_true", help="Print extension settings instead of starting")
    actions.add_argument("--check", action="store_true", help="Send a small English-to-French translation to verify your endpoint")
    args = parser.parse_args()
    if args.backend == "openai" and (not args.base_url or not args.model):
        parser.error("Set --base-url and --model, or OPEN_TRANSLATE_BASE_URL and OPEN_TRANSLATE_MODEL")
    if args.concurrency is None:
        args.concurrency = 1 if args.backend == "agy" else 2
    if not 1 <= args.port <= 65535 or args.concurrency < 1 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Port, concurrency and timeout must be valid positive values")
    token = os.getenv("OPEN_TRANSLATE_TOKEN") or secrets.token_urlsafe(32)
    try:
        agent = (AgyAgent(args.agy_command, args.model or "", args.timeout) if args.backend == "agy" else
                 Agent(args.base_url, args.model, os.getenv("OPEN_TRANSLATE_API_KEY", ""), args.timeout, not args.no_json_mode))
        if args.check:
            try:
                result = agent.translate(validate_job({"source_lang": "en", "target_lang": "fr",
                                                       "text_list": ["Hello, world."]}))
            except BridgeError as error:
                parser.exit(1, f"{error.code}: {error}\n")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return
        url = f"http://127.0.0.1:{args.port}/translate?token={quote(token, safe='')}"
        config = extension_config(url, args.concurrency, max(120000, math.ceil((args.timeout + 30) * 1000)))
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
