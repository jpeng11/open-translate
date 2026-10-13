"""Regression: AGY must not copy opaque markup tokens to translate rich text."""
import json
import re
import sys
import unittest
from unittest.mock import patch

from open_translate.agent import BridgeError, validate_job
from open_translate.agy import AgyAgent
from open_translate.fragments import PROTECTED


class FormattedTranslationTests(unittest.TestCase):
    def setUp(self):
        self.agent = AgyAgent(sys.executable, model="test-model", timeout=30)
        self.calls = []

    def job(self, texts):
        return validate_job({"source_lang": "en", "target_lang": "zh-CN", "text_list": texts})

    def complete(self, agent, payload):
        data = json.loads(payload["messages"][1]["content"])
        self.calls.append(data)
        # Simulates an endpoint that always loses markup if asked to copy it.
        # Fragment mode should never send any markup in a translatable item.
        return {"translations": [{"id": item["id"], "text": "译" + PROTECTED.sub("", item["text"]),
            "detected_source_lang": "en"} for item in reversed(data["items"])]}

    def test_nested_repeated_links_glossary_and_placeholders_stay_local(self):
        source = '\tHello <a href="https://example.org"><b>world</b></a> {0} {{1}} ⟦OTabc_0⟧, 2026.\n'
        with patch.object(AgyAgent, "complete", new=lambda agent, payload: self.complete(agent, payload)):
            result = self.agent.translate(self.job([source, "  ", "<b>{3}</b>"]))
        self.assertEqual(result["translations"][0]["text"], '\t译Hello <a href="https://example.org"><b>译world</b></a> {0} {{1}} ⟦OTabc_0⟧, 2026.\n')
        self.assertEqual([x["text"] for x in result["translations"][1:]], ["  ", "<b>{3}</b>"])
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(all(not PROTECTED.search(item["text"]) for item in self.calls[0]["items"]))
        self.assertIn("Hello world", self.calls[0]["contexts"][0]["text"])

    def test_marker_only_and_numeric_content_need_no_model_call(self):
        texts = ["<b>{0}</b> 2026, {{4}}", "\n", "⟦OTabc_1⟧"]
        with patch.object(AgyAgent, "complete", side_effect=AssertionError("provider called")):
            self.assertEqual([x["text"] for x in self.agent.translate(self.job(texts))["translations"]], texts)

    def test_reordered_ids_rebuild_each_original_paragraph(self):
        with patch.object(AgyAgent, "complete", new=lambda agent, payload: self.complete(agent, payload)):
            result = self.agent.translate(self.job(["Before <i>inside</i> after.", "你好<b>世界</b>。", "plain"] ))
        self.assertEqual([x["text"] for x in result["translations"]], ["译Before <i>译inside</i> 译after.", "译你好<b>译世界</b>。", "译plain"])

    def test_invalid_fragment_batches_never_become_partial_success(self):
        for kind in ("missing", "duplicate", "unknown", "boolean", "empty", "markup", "language"):
            calls = []
            def bad(agent, payload):
                data = json.loads(payload["messages"][1]["content"])
                calls.append(data)
                entries = [{"id": i["id"], "text": "译文", "detected_source_lang": "en"} for i in data["items"]]
                if kind == "missing": entries.pop()
                if kind == "duplicate": entries[1]["id"] = entries[0]["id"]
                if kind == "unknown": entries[0]["id"] = 999
                if kind == "boolean": entries[0]["id"] = False
                if kind == "empty": entries[0]["text"] = " "
                if kind == "markup": entries[0]["text"] = "<b>译文</b>"
                if kind == "language": entries[0]["detected_source_lang"] = "bad language"
                return {"translations": entries}
            with self.subTest(kind=kind), patch.object(AgyAgent, "complete", new=bad):
                with self.assertRaises(BridgeError):
                    self.agent.translate(self.job(["Hello <b>world</b>"]))
                self.assertEqual(len(calls), 2)

    def test_many_fragments_are_bounded_and_retry_only_the_failed_chunk(self):
        sizes = []
        def complete(agent, payload):
            data = json.loads(payload["messages"][1]["content"])
            sizes.append(len(data["items"]))
            if len(sizes) == 2:
                return {"translations": []}
            return self.complete(agent, payload)
        source = " ".join(f"<b>word{i}</b>" for i in range(40))
        with patch.object(AgyAgent, "complete", new=complete):
            result = self.agent.translate(self.job([source]))
        self.assertEqual(sizes, [32, 8, 8])
        self.assertEqual(result["translations"][0]["text"], source.replace("word", "译word"))

    def test_chunks_share_one_deadline_and_do_not_reset_it(self):
        now = [0]
        def complete(agent, payload):
            result = self.complete(agent, payload)
            now[0] = 31
            return result
        source = " ".join("<b>word</b>" for _ in range(40))
        with patch("open_translate.agy.time.monotonic", side_effect=lambda: now[0]), patch.object(AgyAgent, "complete", new=complete):
            with self.assertRaises(BridgeError) as caught:
                self.agent.translate(self.job([source]))
        self.assertEqual(caught.exception.code, "agy_timeout")
        self.assertEqual(len(self.calls), 1)

    def test_authentication_failure_is_not_retried(self):
        with patch.object(AgyAgent, "complete", side_effect=BridgeError(502, "agy_auth_required", "Sign in")) as complete:
            with self.assertRaises(BridgeError):
                self.agent.translate(self.job(["Hello <b>world</b>"]))
            self.assertEqual(complete.call_count, 1)


if __name__ == "__main__":
    unittest.main()
