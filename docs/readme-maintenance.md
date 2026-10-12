# README maintenance

The repository opens in Chinese at `README.md`. The other editions are `README.en.md`, `README.fr.md`, `README.es.md`, `README.ja.md` and `README.ko.md`. Every edition links to all six in that order. The extension popup and workspace also support these six languages; interface language is independent of translation source/target settings.

Use the project’s [humanizer skill](../.agents/skills/humanizer/SKILL.md) when editing README prose. It is vendored from [blader/humanizer](https://github.com/blader/humanizer), version 3.1.0 at commit `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`; the [provenance record](../.agents/skills/humanizer/provenance.json) includes file hashes and the [MIT license](../.agents/skills/humanizer/LICENSE) is retained. The skill is a writing aid and is not bundled into the extension.

Write for someone installing the extension. Keep instructions direct, preserve technical facts, and remove promotional claims. Translate prose naturally rather than copying sentence order. UI button and menu names must match the selected language in `extension/src/ui-messages.mjs`. Commands, URLs, filenames, API fields and option values keep their technical spelling. Browser-owned controls follow the browser’s language; describe the action when an exact translated label is uncertain.

Keep prerequisites, protocol requirements, privacy behavior, mobile status, limits, acceptance scope and license exceptions consistent across editions. Interface localization does not imply translated technical reference documents, provider errors or all browser-owned controls. Model/provider messages and user content must never be passed through the interface catalog. Update all six editions when a user-visible fact changes.

For a documentation-only edit, check relative links, the language switcher, Markdown structure, shared command blocks and labels against the UI catalog. A wording change does not require repeating the whole browser suite. Interface localization changes do require browser checks for language selection, persistence across popup/workspace, long labels, unchanged form values and unchanged source/translated text.
