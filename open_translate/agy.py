"""Google Antigravity CLI backend, using its official headless stdin protocol."""

from dataclasses import dataclass, replace
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

from .agent import BatchTranslator, BridgeError, MAX_RESPONSE, INSTRUCTIONS


SCHEMA = {
    "type": "object",
    "properties": {"translations": {"type": "array", "items": {
        "type": "object", "properties": {
            "id": {"type": "integer"}, "text": {"type": "string"},
            "detected_source_lang": {"type": "string"},
        }, "required": ["id", "text", "detected_source_lang"], "additionalProperties": False,
    }}}, "required": ["translations"], "additionalProperties": False,
}


def terminate(process):
    if process.poll() is None:
        try:
            if os.name == "posix":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except ProcessLookupError:
            pass
        process.wait()


@dataclass
class AgyAgent(BatchTranslator):
    executable: str = "agy"
    model: str = ""
    timeout: float = 90
    json_mode: bool = False

    def __post_init__(self):
        path = shutil.which(os.path.expanduser(self.executable))
        if not path:
            raise ValueError("AGY CLI not found; install Google's agy CLI or set --agy-command to its executable")
        self.executable = path
        if not math.isfinite(self.timeout) or self.timeout <= 0:
            raise ValueError("Agent timeout must be positive")

    def translate(self, job):
        # One bounded fresh-session recovery for malformed text or accidental tools.
        # Never retry authentication/quota failures, and never accept a tool result.
        deadline = time.monotonic() + self.timeout
        for attempt in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise BridgeError(504, "agy_timeout", "AGY translation timed out")
            try:
                agent = replace(self, timeout=remaining)
                return BatchTranslator.translate(agent, job)
            except BridgeError as error:
                if attempt or error.code not in {"agy_tool_use", "placeholder_mismatch", "invalid_agy_response", "invalid_translation_batch", "invalid_agent_response"}:
                    raise

    def complete(self, payload):
        # Text travels over stdin, rather than appearing in a process command line.
        prompt = "\n\n".join(message["content"] for message in payload["messages"])
        event = {"event": "user", "message": {"content": prompt}}
        command = [self.executable, "--input-format", "stream-json", "--output-format", "stream-json",
                   "--json-schema", json.dumps(SCHEMA), "--mode", "default", "--sandbox",
                   "--agent", "open-translate-translator", "--disable-slash-commands",
                   "--print-timeout", f"{max(1, math.ceil(self.timeout))}s"]
        if self.model:
            command += ["--model", self.model]
        # A fresh workspace supplies only our declarative translation profile.
        # Auth and account settings remain with the installed official CLI.
        with tempfile.TemporaryDirectory(prefix="open-translate-agy-") as workspace:
            profile = Path(workspace) / ".agents" / "agents" / "open-translate-translator" / "agent.md"
            profile.parent.mkdir(parents=True)
            profile.write_text("---\nname: open-translate-translator\n"
                "description: Translate supplied text and return structured JSON without tools.\n"
                "tools: [finish]\nmainAgent: true\nsubagent: false\ninheritCustomizations: false\n"
                "mcpServers: []\nskills: []\nplugins: []\ncommandExecutionPolicy: 'off'\n---\n\n"
                + INSTRUCTIONS, encoding="utf-8")
            with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as diagnostics:
                try:
                    process = subprocess.Popen(command, cwd=workspace, stdin=subprocess.PIPE,
                        stdout=output, stderr=diagnostics, start_new_session=(os.name == "posix"))
                    try:
                        process.communicate((json.dumps(event, ensure_ascii=False) + "\n").encode(), timeout=self.timeout)
                    except subprocess.TimeoutExpired:
                        terminate(process)
                        raise BridgeError(504, "agy_timeout", "AGY translation timed out") from None
                    finally:
                        terminate(process)
                except OSError:
                    raise BridgeError(502, "agy_unavailable", "Cannot start the AGY CLI executable") from None
                output.seek(0)
                raw = output.read(MAX_RESPONSE + 1)
                diagnostics.seek(0)
                diagnostic = diagnostics.read(65536).decode(errors="replace")
                if len(raw) > MAX_RESPONSE:
                    raise BridgeError(502, "agy_response_too_large", "AGY response exceeds 2 MiB")
                return self.parse_result(raw, process.returncode, diagnostic)

    @staticmethod
    def parse_result(raw, returncode, diagnostic):
        try:
            events = [json.loads(line) for line in raw.splitlines() if line.strip()]
            results = [event["result"] for event in events if isinstance(event, dict) and event.get("event") == "result"]
        except (ValueError, KeyError, TypeError):
            results, events = [], []
        last = results[-1] if results and isinstance(results[-1], dict) else {}
        if returncode != 0 or last.get("status") != "SUCCESS":
            failure = (diagnostic + " " + str(last.get("error", ""))).lower()
            if any(word in failure for word in ("authentication required", "not authenticated", "sign in", "login")):
                raise BridgeError(502, "agy_auth_required", "Sign into the AGY CLI interactively on this machine first")
            if any(word in failure for word in ("quota", "rate limit", "resource_exhausted")):
                raise BridgeError(503, "agy_rate_limited", "AGY account quota or rate limit was reached")
            raise BridgeError(502, "agy_failed", "AGY did not complete a translation; check CLI auth, version and model")
        if len(results) != 1:
            raise BridgeError(502, "invalid_agy_response", "AGY must return exactly one completed result")
        # AGY reports its built-in final-output submission as a finish tool.
        # The dedicated profile permits only that terminal operation. All other
        # (including unknown/unnamed) tool events still invalidate the batch.
        if any(isinstance(event, dict) and isinstance(event.get("step_update"), dict)
               and event["step_update"].get("step_type") == "tool"
               and event["step_update"].get("tool_name") != "finish" for event in events):
            raise BridgeError(502, "agy_tool_use", "AGY attempted a tool operation instead of translating directly")
        structured = last.get("structured_output")
        if isinstance(structured, dict):
            return structured
        try:
            return json.loads(last["response"])
        except (ValueError, KeyError, TypeError):
            raise BridgeError(502, "invalid_agy_response", "AGY must return structured JSON translations") from None
