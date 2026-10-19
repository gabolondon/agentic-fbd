---
name: logic-builder
description: Explains or designs software logic as a PLC-style function block diagram (typed blocks and wires, in layers) shown in a live local viewer. Use it without asking when the user explicitly asks to explain, map, diagram or visualize how something works, to design a feature or change as a logic diagram, or to express their own idea as a diagram; also when they ask to explain a block of an existing logic diagram or paste a request copied from the viewer. For a feature or change with non-trivial logic that the user did not ask to diagram, offer this skill in one line and wait for a yes. Never use it for simple tasks, and never start it on your own.
---

# logic-builder

A two-way translation layer between logic and code. You describe how something works, or how it
is about to change, as a **function block diagram** (blocks with typed inputs and outputs, wired
together, in layers you open with a double-click). The user reads it in a live viewer, questions
it, and catches logic flaws **before** code is written. Diagrams are living documentation: they
are committed and kept up to date.

## When to use

- **Explicit request** ("explain X with a diagram", "map the logic of Y", "design this as a logic
  diagram", "Explain "…" (…) in logic/….logic.json"): use it, no need to ask.
- **Design work nobody asked to diagram:** if the feature or change has non-trivial logic (state,
  several triggers, branching, data crossing many places), offer it in one line, e.g. *"This
  touches several flows. Want me to map the logic as a diagram before planning?"*, then wait.
- **Simple tasks:** don't offer it.

## Tools

When this skill loads, Claude Code prints "Base directory for this skill: `<base>`". The CLI is
`<base>/../../dist/cli.mjs` (Node 20+, no install needed):

```bash
node "<base>/../../dist/cli.mjs" validate logic/<subject-id>.logic.json [--check-code .]
node "<base>/../../dist/cli.mjs" open logic/<subject-id>.logic.json
```

- `validate` exits 0 when valid (warnings and notices are allowed), 1 when invalid. Fix every
  error and rerun until it exits 0. Also resolve `missing-desc` / `missing-logic` notices.
- `--check-code <repo-root>` warns about `code` references that no longer exist. Run it before you
  reuse an existing diagram.
- `open` serves the viewer and reloads it live whenever the file changes. Start it **once per file,
  with the Bash tool's `run_in_background: true`**, read the printed URL from its output, and give
  the URL to the user. Never restart it after an edit; the viewer picks up changes by itself.

## Files

One file per subject at `logic/<subject-id>.logic.json` in the repo being worked on. A new change
to the same area updates that file. Old versions live in git history, not as copies.

A `logic/<subject-id>.layout.json` next to it holds positions the user set by dragging blocks in
the viewer. Never write or edit it, and leave it in place when you change the diagram; commit it
along with the diagram.

Before writing a file for the first time in a session, read `<base>/references/format.md` (the
full format) and one example: `<base>/examples/auth-gate.logic.json` (understand) or
`<base>/examples/other-free-text.logic.json` (design). The JSON Schema is
`<base>/references/logic.schema.json`.

## Method: Understand

Explain how an existing feature, section, flow, tool or pipeline works.

1. **Fix the subject and its boundary.** What is inside, and what stays outside as `external`
   (APIs, databases, other modules). Do not map the whole repo.
2. **Read only that code**, in one focused pass.
3. **Find the state and the triggers.** Every trigger gets its `source` and a `context` (where it
   comes from, which step or depth, create or edit mode).
4. **Draw the top level as a short story** (see "Structure" below): a few triggers and one group
   per system or stage. Each block is a real piece of code (a handler, function, component,
   store, endpoint, tool) with `code: { file, symbol }`.
5. **Explain every block** (see below).
6. **Leave sub-areas as unexplored groups**: `kind: "group"`, `explored: false`, a `desc`, and
   declared `inputs`/`outputs` so wires can reach them.
7. **Name the types** that travel on wires in `types`. Use names for things that mean something
   (`OptionId`, not just `number`).
8. **Note fragile spots** as `risks` pointing at the blocks and wires involved.
9. **Expand on request, one layer at a time.** To explore a group: add its children (`parent`),
   rewire the wires that ended on the group's ports to the real children, delete the group's ports,
   and drop `explored`. Read only that group's code.

## Method: Design

Propose a feature or change on top of an Understand diagram of the area. If there isn't one yet,
run Understand first or reuse the existing file.

1. Set `subject.mode` to `"design"`, and set `subject.focus` to the group where the change happens.
2. **Find repeated patterns** and model them as `blockTypes` with `instance` nodes. When a
   blockType changes, every instance shows as affected, even four levels down.
3. **Mark the change**: `change: "new" | "modified" | "removed"` on nodes, wires and blockTypes.
   Give modified items a `changeNote` and a `before` with the fields as they were (for example the
   old `inputs`). Removed wires may point at ports that exist only in `before`.
4. **Explain** new and modified blocks.
5. **Hunt for risks**, especially where a type changes: follow every wire it travels on. A bare
   `number` flowing into `OptionId` is the kind of bug this catches.
6. When the user approves the diagram, **ask** whether to continue to the implementation plan
   using the diagram as its basis.

## Structure: keep every level readable

A level is read at a glance, like one sheet of a schematic. Before you validate, check each one:

- **5–12 blocks per level.** The top level holds the triggers, one group per system or stage
  (web app, worker, scheduled job, pipeline step), and the final results. Push detail down.
- **Put each store or service where it is used.** A database, bucket or API used by one area is a
  child of that area's group. Only things shared by several areas stay on the shared level.
- **Leave wire drawing to the viewer.** It draws lines, and turns a wire into a pair of labeled
  flags (net labels) only where a line would be hard to follow: very long, looping far back, or
  crossing several other wires. Don't set `draw` unless the user asks for a specific wire to be a
  flag (`"label"`) or a line (`"line"`).
- **Write blocks in story order** (triggers, then each stage in the order the flow runs, then
  results). The viewer uses that order to decide which way loops run.
- **Split big subjects into linked diagrams.** Past about 40 blocks, or when the subject spans
  separately deployed systems, write one file per system (`logic/<subject>-<system>.logic.json`)
  plus an overview file. In the overview, each system is a block with
  `see: "<subject>-<system>.logic.json"`. In a system file, the block that stands for another
  system has a `see` pointing at it, using `#<node-id>` to land on a specific block. `validate`
  warns about broken links; one `open` serves every diagram in the folder.

## Explaining blocks

The user reads these when they click a block. Write them for a smart reader who has not read
the code:

- `desc`: **what it does**, in one or two plain sentences. Required on every block except pins.
- `logic`: **how it works**, as 2–5 short ordered steps (an array of strings). Required on every
  `function`, `decision` and blockType; welcome anywhere else.
- Describe behavior and decisions, not syntax. Mention edge cases that matter ("an empty cookie
  gives an empty token").

## The loop

1. Write or update the JSON → `validate` until it exits 0 → `open` (first time only) → share the URL.
2. Briefly say what the diagram shows and where to look (the risks, the focus level).
3. The user asks for changes in the chat, or pastes a request copied from the viewer. Edit the
   JSON, validate, and say what changed; the viewer reloads by itself.

## After implementation

When the designed change has been implemented, fold the diagram back into living documentation:

- set `mode: "understand"`;
- remove `change` (new and modified become existing);
- delete removed items;
- drop `before` and `changeNote`;
- drop resolved risks and keep open ones;
- update `code` references to the real files and symbols.

Then run `validate --check-code .` and commit the file with the implementation.

## Keep it cheap

- 5–12 blocks per level (the viewer opens nested groups up to about 25 visible blocks). Beyond
  that, split the level into groups, or the subject into linked diagrams.
- No `draw` on wires unless the user asks for it.
- No coordinates: the viewer lays everything out (and keeps what the user arranged by hand).
- No exploring beyond the subject. The goal is understanding one thing well, not a repo map.
