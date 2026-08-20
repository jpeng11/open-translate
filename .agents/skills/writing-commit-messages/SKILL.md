---
name: writing-commit-messages
description: >-
  Writes Git commit messages for Open Translate. Activates when asked to
  write, draft, or improve a commit message.
---

# Writing Commit Messages

## Format

```
<Imperative summary, max ~65 chars>

<optional body: why the change was needed, not what it does>
```

## Rules

- **Imperative mood, capitalized, no trailing period**: "Add glossary support",
  not "added glossary support." or "adds glossary".
- **Small commits get subject-only messages.** Add a body only when the diff
  can't explain itself — e.g. a bug's root cause, a protocol constraint, or a
  decision between alternatives.
- **Phase completions** use the exact form `Complete Phase N: <short summary>`
  and are followed by a lightweight `phase-N` tag (push tags explicitly:
  `git push origin main phase-N`).
- **Name the user-visible behavior, not the files.** "Fix stale subtitle
  overlay on cue change", not "Update subtitles.ts".
- Mention test counts or verification only when they are the point of the
  commit (e.g. "Add Vitest unit suite (48 tests)").

## Before committing

Run `pnpm compile` and `pnpm test`; both must pass. Never commit secrets,
`.env` files, or lockfiles other than `pnpm-lock.yaml`.
