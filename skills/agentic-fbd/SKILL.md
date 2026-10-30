---
name: agentic-fbd
description: Explains or designs software logic as a PLC-style function block diagram (typed blocks and wires, in layers) shown in a live local viewer. Use it without asking when the user explicitly asks to explain, map, diagram or visualize how something works, for a high-level overview of a repo, to design a feature or change as a logic diagram, or to express their own idea as a diagram; also when they ask to explain a block of an existing logic diagram or paste a request copied from the viewer. For a feature or change with non-trivial logic that the user did not ask to diagram, offer this skill in one line and wait for a yes. Never use it for simple tasks, and never start it on your own.
---

# agentic-fbd

Logic as a function block diagram: one JSON file, shown in a live viewer. The user reads it and
catches flaws before code is written. Diagrams are living documentation: commit them. Do the
steps in order. Do not skip any.

## 1. Find the tools

1. `<base>` = the folder that contains this SKILL.md.
2. The CLI is `<base>/../../dist/cli.mjs`. Check that the file exists.
3. If it does not, run:
   `find ~/.agentic-fbd ~/.claude ~/.config /tmp -maxdepth 6 -path '*agentic-fbd*/dist/cli.mjs' 2>/dev/null | head -1`
4. If that prints nothing, run
   `git clone --depth 1 https://github.com/gabolondon/agentic-fbd.git ~/.agentic-fbd`
   and use `~/.agentic-fbd/dist/cli.mjs`.
5. Never write a diagram without a CLI.

Below, `$CLI` means `node <path to cli.mjs>` (Node 20+). Commands: `new`, `validate`, `open`.

## 2. Pick the request, read its file

| The user asks for | Read this now |
|---|---|
| a high-level overview of a repo, or a map of its systems | `references/workflow-overview.md` |
| how one feature, flow, tool or pipeline works; or to explain a block of a diagram that exists | `references/workflow-understand.md` |
| a design of a feature or change; or their own idea as a diagram | `references/workflow-design.md` |
| edits made in the viewer (pasted "Copy for agent" text, notes); or folding a diagram back after the change is implemented | `references/workflow-edits.md` |

Paths are relative to `<base>`. The first line of that file says `Read first:` and lists more
files. Read them too. Then do the steps.

## 3. Hard rules

1. Read the workflow file and its `Read first` files before you write any JSON.
2. Start a new diagram with `$CLI new logic/<id>.logic.json`. Never write one from memory.
3. After every step run `$CLI validate <file>`. Fix every error and every `unwired-block`
   warning before you add more. Each issue has a `fix:` line. Do what it says.
4. Never write or edit `*.layout.json`, `*.draft.json` or `*.review.json`.
5. One subject per file in `logic/`. A change to the same area updates the same file.
6. Run `$CLI open <file>` once per file, in the background (Claude Code: Bash with
   `run_in_background: true`). Read the URL it prints and give it to the user. Never restart it.
   The viewer reloads by itself.
