# How the skill behaves

The plugin ships one skill, `agentic-fbd`. It teaches Claude to explain or design software logic
as a function block diagram, and to show it in the local viewer. This page describes what you can
expect from it. The instructions Claude itself follows are in
[`skills/agentic-fbd/SKILL.md`](../skills/agentic-fbd/SKILL.md).

Two modes, one file format, one viewer:

- **Understand:** explain how something that exists works. A high-level **overview** of a repo is
  a special case of it.
- **Design:** propose a change on top of that understanding.

## When it runs, when it offers, when it stays out

### It runs without asking

When you explicitly ask for a diagram, Claude uses the skill right away. Explicit requests are:

- to explain, map, diagram or visualize how something works;
- to give a high-level overview of a repo;
- to design a feature or a change as a logic diagram;
- to express your own idea as a diagram;
- to explain one block of an existing diagram;
- a request pasted from the viewer, such as the text **Copy for agent** gives you.

```text
Map the logic of the nightly export job.
```

```text
Explain how a request is authorized, with a diagram.
```

```text
Give me a high-level overview of this repo as a logic diagram.
```

```text
Design a retry step after the payment call as a logic diagram.
```

```text
Explain "Forward or deny" (proxy) in logic/auth-gate.logic.json
```

The last one is the kind of text the viewer copies when you ask about a block.

### It offers, and waits

If you ask for design work, or for a feature or change, and did not mention a diagram, Claude
may offer the skill in one line. It does this only when the work has non-trivial logic: state,
several triggers, branching, or data that crosses many places. The offer looks like this:

> This touches several flows. Want me to map the logic as a diagram before planning?

Claude then waits. Nothing is written until you say yes.

### It stays out

- Simple tasks. Claude does not offer the skill for them.
- Anything you did not ask for or agree to. The skill never starts on its own.

## How the skill is organized

The skill is split into three levels, so a model reads only what the request needs:

1. [`SKILL.md`](../skills/agentic-fbd/SKILL.md) is a short page, under 4 KB. It tells Claude how
   to find the CLI, how to pick the kind of request, and a few hard rules.
2. One workflow file per kind of request, in
   [`skills/agentic-fbd/references/`](../skills/agentic-fbd/references/): `workflow-overview.md`,
   `workflow-understand.md`, `workflow-design.md` and `workflow-edits.md`. Each is a numbered list
   of small steps. Every step names the command to run when there is one, and says when the step
   is done.
3. The reference: [`format.md`](../skills/agentic-fbd/references/format.md) (the grammar),
   [`checklist.md`](../skills/agentic-fbd/references/checklist.md) (yes or no checks before each
   `validate`) and the examples.

Why: a small model that gets one long page tends to skip it and write the JSON from memory. In a
real run, a model that never read the format wrote a file of its own invention and got worse as
it tried to fix it. With three levels, each file is short enough to be read in full, the first
line of a workflow lists the files to read next, and `validate` backs every step with a `fix:`
line. The same steps work for larger models too, and they do not read more than they need: a
workflow, the files it names, and `SKILL.md` stay under 30 KB together.

### Finding the CLI

Claude needs the CLI to create and check a diagram, and it never writes a diagram without one.
The CLI is at `<base>/../../dist/cli.mjs`, where `<base>` is the folder of `SKILL.md`. Some tools
copy only the skill folder, so that path may not exist. Then Claude:

1. searches a few likely folders (`~/.agentic-fbd`, `~/.claude`, `~/.config`, `/tmp`) for a copy
   of `dist/cli.mjs` inside an `agentic-fbd` folder;
2. if there is none, runs `git clone --depth 1 https://github.com/gabolondon/agentic-fbd.git ~/.agentic-fbd`
   and uses `~/.agentic-fbd/dist/cli.mjs`.

Both steps need a shell. The clone needs `git` and network access.

### How a diagram is built

Whatever the request, Claude builds the file in layers and checks each one:

1. It creates the file with `new`, which writes a valid starter (see [cli.md](cli.md#new)).
2. It replaces the starter's `TODO` text and writes the top level only: triggers, groups,
   externals, results and their wires. Then it runs `validate` until it exits 0 with no
   `unwired-block` warning. Each issue has a `fix:` line that says what to change.
3. Only then does it go one level down, one group at a time, and validates after each one.

## Overview of a repo

Use it when you want to see the shape of a repo before you pick a part to study:

```text
Give me a high-level overview of this repo as a logic diagram.
```

Claude reads the README and the manifest files, not the source. It then writes one diagram with
one level only:

- the things that start work (a user, an HTTP call, a schedule, an agent) as triggers;
- one **unexplored group** per system or module, such as a web app, an API, a worker or a CLI,
  each with its folder as `ref` and with ports so the wires reach it;
- what lives outside the repo, such as a database or a third-party API, as `external` blocks;
- what comes out, as results.

Every block is wired. Claude then tells you the systems in one line each, gives you the URL, and
says that every block is unexplored. It stops there. It does not open any group on its own.

To go deeper, ask for each block by name, one at a time:

```text
Explain "Billing API" (billing-api) in logic/shop-overview.logic.json
```

That is a normal Understand request on one group, described in the next section. The viewer's
**Copy for agent** button on an unexplored group gives you this exact text.

## Understand

Use it to explain a specific feature, section, flow, tool or pipeline. For a whole repository,
use the overview above and then open one group at a time.

Claude follows these steps:

1. Fixes the subject and its boundary. What is inside, and what stays outside as `external`.
2. Reads only that code, in one focused pass.
3. Finds the state and the triggers. Each trigger records where it comes from. Each state records
   where its data really lives and whether it survives a reload, for example
   `"Zustand store · lost on reload"` or `"Postgres table bookings"`. This is read from the
   code, not guessed.
4. Draws the top level as a short story: a few triggers, one group per system or stage, and the
   results. Each block is a real piece of code and points at it.
5. Explains every block with a short description and the steps of how it works.
6. Leaves sub-areas as unexplored groups.
7. Names the types that travel on wires, and describes the ones that matter.
8. Notes fragile spots as risks that point at the blocks and wires involved.

Then you ask for more, one layer at a time:

```text
Go one layer deeper into the token check.
```

To open a group, Claude reads only that group's code and adds its children. It rewires the
connections that ended on the group to the real blocks inside. The group stops being marked as
unexplored.

### How big a level gets

A level should be readable at a glance, like one sheet of a schematic:

- 5 to 12 blocks per level. Detail goes down a layer.
- A store or service sits inside the group that uses it. Only things shared by several areas stay
  on the shared level.
- Claude writes blocks in story order, and the viewer uses that order to decide which way loops
  run.
- Claude does not set how wires are drawn. The viewer draws lines, and uses pairs of labeled flags
  only where a line would be hard to follow. If you want a specific wire to be a line or a flag,
  say so.
- Claude does not write coordinates. The viewer lays everything out.
- A subject past about 40 blocks, or one that spans separately deployed systems, is split into
  one diagram per system plus an overview. The overview links to each system, and the systems
  link to each other. One `open` serves every diagram in the folder.

## Design

Use it to propose a feature or a change. It builds on an Understand diagram of the area. If there
is none yet, Claude runs Understand first or reuses the existing file.

```text
Design adding an "Other" option with free text to the questionnaire as a logic diagram.
```

If you already have the design in mind, say it. Claude writes it down in the same format:

```text
I want a cache in front of the price lookup, cleared when a price changes. Draw it so I can
check it before you build anything.
```

Claude then:

1. Sets the mode to `design` and sets the focus to the group where the change happens.
2. Finds repeated patterns and models them as reusable block types with instances. When a block
   type changes, every instance shows as affected, even several levels down.
3. Marks what changes: `new`, `modified` or `removed`, on blocks, wires and block types. A
   modified item gets a note about why, and a record of what it was before.
4. Reuses before creating. Before it adds a new state, it looks for an existing store in the area
   that already holds that data. A new store needs a reason, and `validate` flags a new state of
   the same type as an existing one (`similar-store`).
5. Explains the new and modified blocks.
6. Hunts for risks, especially where a type changes, by following every wire the type travels on.
   A bare `number` flowing into an `OptionId` port is the kind of bug this catches.
7. When you approve the diagram, asks whether to continue to the implementation plan, using the
   diagram as its basis.

In the viewer, **Before / After** shows what the change touches, and **Risks** lists what Claude
found.

## Files

| File | Written by | Commit it |
|---|---|---|
| `logic/<subject-id>.logic.json` | Claude | Yes |
| `logic/<subject-id>.layout.json` | The viewer only | Yes, with the diagram |
| `logic/<subject-id>.draft.json` | The viewer only | No |
| `logic/<subject-id>.review.json` | The viewer only | No |

- There is one diagram file per subject, in the `logic/` folder of the repo being worked on. A
  later change to the same area updates that file. Old versions live in git history, not as
  copies.
- The **layout** file holds the positions you set by dragging blocks. Claude never writes or
  edits it, and leaves it in place when it changes the diagram. Blocks it does not mention are
  laid out automatically.
- The **draft** file holds your unsaved edits from the viewer. The **review** file is created
  when a save sets Claude's own edits aside (see the next section). Claude never writes either.
- Linked diagrams for a large subject are named `logic/<subject>-<system>.logic.json`.

Before it writes a diagram, Claude reads the workflow file for the request and the files that
workflow lists on its first line: the checklist, the format reference
([`format.md`](../skills/agentic-fbd/references/format.md)) and one example. Every field and
block kind is explained in [blocks.md](blocks.md).

## The loop

1. Claude writes or updates the JSON (a new file starts from `new`), runs `validate` until it
   exits with 0, starts `open` the first time only, and gives you the URL.
2. Claude says briefly what the diagram shows and where to look: the risks, or the focus level.
3. You ask for changes in the chat, or paste a request copied from the viewer. Claude edits the
   JSON, validates, and says what changed. The viewer reloads by itself, so it is never
   restarted after an edit.

`open` runs once per file, in the background. See [cli.md](cli.md) for its options.

## The edit loop with the viewer

You can make small edits in the viewer instead of describing them in the chat:

- rename a block, a port or a function;
- change a type or a trigger;
- remove a block or a wire;
- leave a note on a block or wire.

Your edits are not written to the diagram right away. They stay in
`<subject>.draft.json` until you press **Save**. Saved edits are written with the usual Design
marks. The
viewer describes the controls in [viewer.md](viewer.md). To Claude, your edits are requests.

The loop:

1. You edit in the viewer. The edits form a draft.
2. You press **Save**. The diagram on disk now has your edits.
3. You press **Copy for agent** and paste the text into Claude Code.
4. Claude makes the matching change in the code:
   - A renamed block, port or function means renaming it in the code.
   - An added field means adding it to the model.
   - A removed block means removing it from the design.
   - A note is a request. Claude implements it, then deletes the note.

If you only say that you edited the diagram, Claude reads the file's `git diff` to see what
changed.

### Two rules Claude follows

- **A draft blocks Claude's edits.** Before it edits a diagram, Claude checks for
  `<subject>.draft.json`. If it exists, you have unsaved edits. Claude does not edit the diagram.
  It tells you, and waits or works on something else. Save or discard your draft first.
- **A review file means a collision.** If the diagram changed on disk while you were editing,
  **Save** keeps your version and puts the other one in `<subject>.review.json`. Claude compares
  that file with the saved diagram, re-applies what still makes sense on top of your version,
  and then deletes the review file.

## After implementation

When the designed change has been implemented, the diagram is folded back into living
documentation. Tell Claude:

```text
The change is implemented. Fold the diagram back into documentation.
```

Claude then:

- sets the mode back to `understand`;
- removes the `change` marks, so new and modified items become existing ones;
- deletes the items that were removed;
- drops the `before` and `changeNote` fields, any remaining notes, and the change marks on
  type notes;
- drops resolved risks and keeps the open ones;
- updates the `code` references to the real files and symbols.

Then it runs `validate --check-code .`, and the diagram file is committed together with the
implementation.

Next time someone changes the area, the diagram is already an up-to-date Understand diagram to
design on top of.

## Related pages

- [Getting started](getting-started.md)
- [Blocks and the format](blocks.md)
- [The CLI](cli.md)
- [The viewer](viewer.md)
