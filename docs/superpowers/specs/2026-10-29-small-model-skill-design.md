# Skill and CLI for small models: design

Date: 2026-10-29. Status: approved for planning.

## Intent and why

agentic-fbd should work with smaller, less capable models, not only with Claude. The trigger was
a real run: Qwen 3.6 35B (A3B) in OpenCode, asked for a high-level overview of a repo.

What happened:

1. OpenCode installed the skill by cloning the repo to `/tmp/agentic-fbd` and copying only
   `skills/agentic-fbd/` into `~/.config/opencode/skills/`. The paths in `SKILL.md`
   (`<base>/../../dist/cli.mjs`, "Base directory for this skill" printed by Claude Code) did not
   exist there.
2. The model never read `format.md` or an example. It wrote the JSON from memory, in a format of
   its own (`title`, `description`, `layers`, `meta` at the top level, no `nodes` or `wires`):
   8 schema errors.
3. Trying to fix it, it reached 76 errors: wires referencing non-state nodes without a port,
   wires to nodes that don't exist.
4. Once the user pointed it at `format.md`, it fixed almost everything. What was left: blocks
   with no wires in or out, so the viewer placed everything badly.

So the main failure is instructions that are not found or not followed, more than raw model
ability. The fix has two halves: a skill that leads the model by the hand in small steps, and a
CLI that catches and explains what a weak model gets wrong.

## Goals

- `SKILL.md` as small as possible while still holding everything needed to start. It routes the
  model to one short workflow file per kind of request, and those link deeper only when needed
  (progressive disclosure).
- `SKILL.md` tells the model how to find the CLI when it is not at the expected path.
- A new request kind, **repo overview**: one block per system or module, all unexplored, wired
  together; at the end the model tells the user to ask for each block separately to go deeper.
- The CLI makes a valid start easy and a broken file easy to fix: a starter file, a fix hint on
  every issue, the root causes first when there are many errors, and a check for unwired blocks.
- Measured success with the real setup (see Testing).

## Non-goals

- A self-contained skill folder that carries the CLI and viewer. The user chose instructions to
  find the CLI instead.
- An automatic `--fix` that rewrites the file.
- A deep map of a whole repo. The overview stays one level; depth comes one block at a time, on
  request, as today.
- Changes to the format itself (no new fields, `version` stays `"0.1"`).

## Anti-goals (failure even if it technically works)

- `SKILL.md` grows, or Claude reads more context than today for the same task.
- Claude's diagrams get worse because the steps are written for a weaker model.
- Fix hints that are wrong or vague enough to send a model in circles.

## Constraints

- English only; generic examples written from scratch (no client or company names, nothing from
  the run above beyond its shape).
- Every new issue code is documented in `docs/cli.md` (`tests/docs.test.ts` enforces it), and
  the human docs (`docs/skill.md`, `docs/cli.md`, `docs/getting-started.md`) are updated to match.
- `dist/` is rebuilt and committed; `npm test`, `typecheck`, `test:e2e`, `check:dist` pass.
- The CLI stays dependency-free at runtime and works on Node 20+.

## The skill: three levels

### Level 1: `SKILL.md`

Target: at most about 60 lines and under 4 KB (today: 178 lines, 11 KB). It holds only:

- The frontmatter `description` (as today, plus the overview request; it decides when the skill
  loads).
- **Find the tools** (a few lines):
  - `<base>` is the folder that contains this `SKILL.md`.
  - The CLI is `<base>/../../dist/cli.mjs`. If that file does not exist, find it with one
    command, for example
    `find ~ /tmp -maxdepth 6 -path '*agentic-fbd*/dist/cli.mjs' 2>/dev/null | head -1` (the
    builder may narrow the folders searched to keep it fast and avoid macOS privacy prompts). If
    nothing is found, clone the repo to a fixed place and use the CLI from there
    (`git clone --depth 1 https://github.com/gabolondon/agentic-fbd.git ~/.agentic-fbd`, then
    `~/.agentic-fbd/dist/cli.mjs`; the search above should also look there first). Never write a
    diagram without a CLI to validate it.
- **Pick the request kind, then read its workflow file before writing anything.** A table with
  one row per kind: repo overview, understand one subject, design a change, apply edits from the
  viewer (which includes folding a design back after implementation). Each row names its file.
- **Hard rules**, a handful of one-liners: never write JSON before reading the workflow file;
  start a new diagram with `new`; validate after every step and fix errors before adding more;
  never write the layout, draft or review files; one subject per file.

Everything else in today's `SKILL.md` moves to level 2 or 3; nothing is lost.

### Level 2: one workflow file per request kind

`references/workflow-overview.md`, `workflow-understand.md`, `workflow-design.md`,
`workflow-edits.md`. Each is a numbered list of small steps. Every step says what to do, the
exact command when there is one, and when the step is done. Steps build the diagram in layers:

1. Create the file with `new`, validate.
2. Write the top level only (triggers, groups, externals, results, and their wires), validate,
   fix until it exits 0 and has no unwired-block warning.
3. Only then go one level down, one group at a time, validating after each.

Each workflow ends with what to tell the user. The overview workflow ends with: what the systems
are, and that they should ask for each block by name to go one level deeper, one at a time.

The overview diagram is an ordinary `understand` diagram: top level = triggers, one unexplored
group per system or module (with declared ports, so wires reach them), externals and results,
all wired.

Content that today lives in `SKILL.md` (method steps, structure rules, explaining blocks, viewer
edits, after implementation) goes into the workflow files where it is used; shared rules go to
level 3 so they are written once.

### Level 3: reference

- `format.md` (exists): the grammar. Its first lines point at `checklist.md`.
- `checklist.md` (new, short): the self-check before each `validate`, written as yes/no lines.
  At least: every wire is `node.port` except to or from a `state`; every node a wire names
  exists; every trigger has an output wire, every result an input wire, every other block at
  least one wire; ids have no `.` or `/`; top-level keys are only the ones in the format.
- Examples (exist), plus a small overview example if the builder finds it helps the model more
  than it costs in context.

## The CLI

### `new`

`node cli.mjs new <file.logic.json>` writes a starter diagram that already validates: `version`,
a `subject` and a few wired blocks whose texts are placeholders. A flag picks the overview shape
(a trigger, two unexplored groups with ports, a result). It refuses to overwrite an existing
file (usage error).

`validate` reports every placeholder text left in the file as an error with its own code, so a
model can't stop at the starter. The exact placeholder marker is the builder's call.

### Fix hints

Every issue may carry a `hint`: one line saying what to change. Text output prints it under the
issue (`fix: ...`); `--json` adds a `hint` field. Hints come with the validators, not from a
lookup elsewhere. Priority cases, from the run above:

- unknown top-level field: say where it belongs if it has an obvious home (`title`,
  `description` → `subject.title`, `subject.intent`; `layers` → `nodes` with `kind: "group"`),
  otherwise "remove it";
- `version` wrong: `set "version": "0.1"`;
- `subject` not an object: show the shape with its required keys;
- missing `nodes` or `wires`: add them as arrays;
- a wire end without a port: name the node's ports (`use "x.<port>"; outputs of x: a, b`);
- a wire to a node that does not exist: say so, and list ids that look close when there are any.

### Root causes first

When there are many errors, the text output groups them by code, worst cascades first (schema
before structure, a missing node before the wires that point at it), shows a few examples per
group with their hints, and states how many were left out. The goal is that a model fixes the
cause, not 76 lines one by one. `--json` keeps the full list.

### Unwired blocks

A new check, level `warning`, own code: a block with no wire at all, a trigger with no outgoing
wire, a result with no incoming wire. Wires that reach a block's children count for a group.
The workflows treat this warning as something to fix before moving on.

## Testing

- Unit tests for `new`, each hint above, the grouping, the unwired check; e2e where output
  format matters.
- **Context budget.** Measure the bytes a model must read before its first write, per workflow.
  Today that is `SKILL.md` + `format.md` + one example, about 27-30 KB. The new total must not
  exceed it, and `SKILL.md` must be under 4 KB.
- **Claude regression.** Before changing the skill, record a baseline: diagrams made with the
  current skill for one understand and one design request on this repo. After the change, repeat
  the same requests. Gabriel judges whether they are at least as good.
- **Small-model run (the success measure), deferred.** Qwen 3.6 35B through OpenCode, asked for a
  high-level overview of a public repo (this one). Success: the file validates with no errors and
  no unwired-block warnings, and the viewer opens, with no human pointing the model at a file.
  Gabriel is using that model for other tests, so this run is **not** part of the plan's
  execution: it happens later, when he says so. The plan ends ready for it.

## Decided by the user

- Support the repo overview request as described.
- Change the CLI as well as the instructions.
- `SKILL.md` as small as possible, with instructions to find the CLI; no self-contained bundle.
- Unwired blocks are a problem worth catching.
- If the CLI is not found anywhere, the model clones the repo to a fixed place and uses it.
- The Qwen run is deferred until Gabriel asks for it.

## My calls (open to change)

- Unwired is a `warning` (does not fail validation), but the workflows require fixing it.
- Placeholders left from `new` are an `error`.
- Hints live in the issue (`hint` field), not in a separate errors document in the skill.
- The overview is an ordinary `understand` diagram, not a new mode.
- `new` writes a file the viewer can show (it passes the format checks), but `validate` reports
  placeholder texts as errors, so the first validate after `new` is expected to fail on them
  only. The placeholder check runs in the CLI's `validate`, not in the viewer's load, so the
  viewer can show a file in progress.
- Unwired check exemptions: blocks marked `change: "removed"`, and nodes inside a blockType
  `body`. A `state` counts as wired when any wire names it. The existing examples and the
  repo's own `logic/` diagrams must not trigger it.
- The frontmatter `description` gains a few words so a "high-level overview of this repo"
  request loads the skill; the rest of it stays as today.

## Left to the builder

Exact flag names, code names, hint wording, the placeholder marker, how many examples per group,
the file names of the workflow files, and whether an overview example is worth its size.
