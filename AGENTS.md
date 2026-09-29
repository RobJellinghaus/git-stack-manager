# AGENTS.md

Repository rules for coding agents. They apply to a human contributor too;
[CONTRIBUTING.md](CONTRIBUTING.md) covers the same rules in more detail.

## Always follow WRITING.md

[WRITING.md](WRITING.md) holds the prose rules, and they apply to every word this repository ships:
comments, commit messages, CHANGELOG entries, UI text, and Markdown. Follow them on every change,
without exception. Before finishing, reread every comment and commit message you wrote against them.

Do not edit [WRITING.md](WRITING.md).

Additionally:
- Hard-wrap Markdown, comments, and code at 100 columns; wrap no commit message. Leave code blocks,
  ASCII diagrams, and aligned tables unwrapped, because wrapping inside them hurts readability.
  Prettier reflows no prose inside a comment and skips Markdown altogether, so wrap both by hand.
- Pad table cells so the pipe separators line up.

## Every change bumps the version

Before finishing, raise `version` in `package.json` and add the change under a new heading in
[CHANGELOG.md](CHANGELOG.md):

- Patch for a fix a user would not describe as new behaviour.
- Minor for a new action, badge, setting, or recipe.
- Major when an existing setting or command stops working.

The version is not decoration. The top bar prints it, and `just package` names the `.vsix` after it.
The snapshot baselines print a fixed `v0.0.0` instead, so a bump re-records no picture.

## Tag once the commit is on main

One annotated tag per released version, named `v<version>`:

```bash
git tag -a v0.2.0 -m "Release 0.2.0"
git push origin v0.2.0
```

Leave the tag to the maintainer while the commit is still on a branch. A tag on a branch that later
gets rewritten points at a commit nothing reaches.

## What a change has to pass

`just check` covers formatting, types, lint, and both suites. CI runs `just check-ci`, which
compares no pictures, so run `just check` locally.

`just test-e2e-update` rewrites every failing snapshot. Check each changed PNG and validate it
before committing. `test/e2e/fixtures/snapshot.mjs` documents the traps that
make a blind re-record dangerous.

## Read before editing

- [STYLE_GUIDE.md](STYLE_GUIDE.md)
- [DESIGN_NOTES.md](DESIGN_NOTES.md)
- [LEARNINGS.md](LEARNINGS.md)
