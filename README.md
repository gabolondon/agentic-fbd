# logic-builder

**Logic diagrams for humans and coding agents.** logic-builder lets Claude Code explain how
your code works, or how it is about to change, as a **function block diagram**: the block
language used to program PLCs, with typed inputs and outputs, wires, and layers you open with a
double-click. You read the diagram in a live local viewer, catch logic flaws **before** code is
written, and keep the diagram as living documentation.

![A design diagram: an "Other" option with free text added to a questionnaire wizard](docs/images/viewer-design.png)

## Why

Coding agents now write much of our code. That opens three gaps:

1. **Plans ignore the existing logic.** The code works for today's request, and then the next
   feature brings integration bugs.
2. **You lose the mental model.** The app runs, but extending, debugging or verifying it depends
   on the agent.
3. **Review collapses to input/output.** Under time pressure you check the output and move on
   without understanding the logic in between.

Reading all the code would fix this, but it's slow. A diagram at the right level, opened layer by
layer only where it matters, is the fast path to the same understanding. It also works the other
way: you can express your own idea as a diagram, and Claude implements it.

### A real example

A multi-step questionnaire stored selected options by numeric id. Later an "Other" option with
free text was added. When someone typed a number (an age, a year), the code read it as an
option id and saved the wrong answer. The same pattern appeared in many steps and at different
depths of the question tree, so the bug was hard to find.

In logic-builder, "Other" is one **reusable block** with several instances. The wire that carries
a bare `number` into an `OptionId` port is flagged, because it fits by shape but means something
else. The **Before / After** view shows exactly what the change touches.

## Two modes

| Mode | Use it to | What you get |
|---|---|---|
| **Understand** | Explain an existing feature, flow, tool or pipeline | A top-level diagram. Unexplored areas stay closed until you ask Claude to go one layer deeper |
| **Design** | Propose a feature or change on top of that understanding | New, modified and removed blocks marked, a Before/After toggle, and the risks Claude found |

They chain: understand an area first, then design on the same diagram. After the change is
implemented, the diagram is folded back into an Understand diagram and committed next to the
code.

![An understand diagram with an unexplored group and a ready-to-copy request for the agent](docs/images/viewer-understand.png)

## Install

logic-builder is a [Claude Code](https://claude.com/claude-code) plugin. It needs Node.js 20 or
later. Nothing is installed into your projects: the viewer and the CLI ship prebuilt.

```text
/plugin marketplace add <this repository's git URL or a local path>
/plugin install logic-builder@logic-builder
```

To work on the plugin itself, load it straight from a checkout:

```bash
claude --plugin-dir /path/to/logic-builder
```

Installed plugins run from a cached copy, so reinstall after pulling a new version.

## Use

Ask Claude Code in plain words:

- "Explain how authorization works here, with a logic diagram."
- "Design adding an 'Other' option to the questionnaire as a logic diagram before we plan it."
- "Go one layer deeper into the token check."

Claude writes `logic/<subject>.logic.json` in your repo, validates it, and opens the viewer.
Ask for changes in the chat and the viewer updates live. For a design with non-trivial logic that
you didn't ask to diagram, Claude offers the diagram in one line and waits for your yes. For
simple tasks it doesn't offer it at all.

### The viewer

- **Structure panel:** the subject, a tree of levels and blocks with change and risk marks, and a
  legend.
- **Hover a wire:** see its type, its full shape, and where it comes from and goes.
- **Click a block:** see *What it does*, *How it works* (step by step), the code it maps to, what
  changes, and where a reusable block is used.
- **Data box:** under each block, what it reads and writes, with types, fields and where the data
  lives ("Zustand store · lost on reload", "Postgres table bookings"). A state lists who reads and
  writes it, and a group lists only the data that crosses its edge. Everything starts collapsed.
- **Edit in the viewer:** rename blocks, ports and functions, change types, fields and triggers,
  remove blocks or wires, and leave notes for the agent. Edits stay in a draft until you save;
  then **Copy for agent** gives you the request to paste into Claude Code.
- **Copy reference for agent:** the icon in a block's or wire's panel (or the button when several
  blocks are selected) copies the file and the blocks' ids and code, to point at them in a prompt.
- **Double-click** a group or reusable block to go inside it. **Esc** goes back up.
- **Click a wire:** its panel shows what it carries, with a note and remove.
- **Unexplored groups** offer a *Copy for agent* button to expand them.
- **Labeled connectors:** wires are lines, but as in a schematic, a wire that would be hard to
  follow (very long, looping far back, or crossing several others) is drawn as a pair of arrow
  flags ("goes to X", "comes from Y"). Click a flag to see the other end. `draw` on a wire
  forces a line or flags.
- **Linked diagrams:** a big subject can be split into one diagram per system, linked with
  `see`. The structure panel lists every diagram in the folder, and a ↗ block opens the one
  that explains it.
- **Arrange by hand:** drag blocks (and frames by their label) to tidy a level. A block snaps
  level with the other end of its wire, so wires can be made straight. Positions are saved in
  `<subject>.layout.json` next to the diagram; commit it with the diagram. **Auto layout** goes
  back to the automatic arrangement.
- **Before / After** and **Risks:** clicking a risk navigates to it and highlights what it
  touches.

### The CLI

The plugin bundles a dependency-free CLI that Claude uses. You can run it too:

```bash
node dist/cli.mjs validate logic/auth-gate.logic.json [--check-code .] [--json]
node dist/cli.mjs open logic/auth-gate.logic.json [--port 0] [--no-open]
```

- `validate` checks the schema, the references and the wire types. It exits 1 on errors.
  `--check-code` also warns about code references that no longer exist.
- `open` serves the viewer on `127.0.0.1` and reloads it live when the file changes. Other
  `*.logic.json` files in the same folder are served too, so links between diagrams work.
- `validate` also warns about `see` links to diagrams or blocks that don't exist.

## The format

One JSON file per subject. The pieces are:

- **Blocks:** `trigger`, `function`, `state`, `decision`, `external`, `result`, `group`, and
  `instance` of a reusable block type.
- **Typed ports**, and **wires** written as `"node.port"`.
- **Explanations:** `desc` (what a block does) and `logic` (how it works).
- **Links:** `see` on a block points at another diagram, and `draw` on a wire picks a line or
  labeled connectors.
- **Data:** `store` on a state (where it lives), and `typeInfo` notes on named types.
- **Change marks**, with `before` for modified items, and `note` for requests left in the viewer.
- **Risks** that point at blocks and wires.

There are no coordinates; the viewer lays everything out. Positions you set by dragging live in
a separate `<subject>.layout.json` that only the viewer writes.

- Full reference: [`skills/logic-builder/references/format.md`](skills/logic-builder/references/format.md)
- JSON Schema: [`skills/logic-builder/references/logic.schema.json`](skills/logic-builder/references/logic.schema.json)
- Examples: [`skills/logic-builder/examples/`](skills/logic-builder/examples/)
- Design document: [`docs/superpowers/specs/2026-10-18-logic-builder-design.md`](docs/superpowers/specs/2026-10-18-logic-builder-design.md)

## Development

```bash
npm install
npm test              # unit tests: types, validator, view model, layout, CLI, server
npm run typecheck
npm run dev           # viewer dev server; LB_FILE=path/to/file.logic.json picks the file
npm run build         # builds dist/viewer and dist/cli.mjs (both are committed)
npm run test:e2e      # Playwright against the built CLI (run npm run build first)
npm run check:dist    # rebuilds and fails if committed dist/ is out of date
```

Layout:

| Path | What it is |
|---|---|
| `packages/core` | Format types, schema validation, type checking and the view model. Browser-safe TypeScript |
| `packages/viewer` | React + React Flow + elkjs app |
| `packages/cli` | Node CLI and local server, bundled with esbuild into `dist/cli.mjs` |
| `skills/logic-builder` | The skill, format reference, schema and examples |
| `logic` | Diagrams of logic-builder itself, made with logic-builder (`node dist/cli.mjs open logic/phase-2d-2e.logic.json`) |
| `.claude-plugin` | Plugin and marketplace manifests |

The format, CLI and viewer don't depend on Claude Code; only `skills/` and `.claude-plugin/` are
agent-specific.

## License

[MIT](LICENSE) © 2026 Gabriel Londoño
