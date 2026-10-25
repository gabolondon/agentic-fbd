# agentic-fbd

Website: https://afbd.gabocodes.com

**Logic diagrams for humans and coding agents.** agentic-fbd lets Claude Code explain how
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

In agentic-fbd, "Other" is one **reusable block** with several instances. The wire that carries
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

agentic-fbd is a [Claude Code](https://claude.com/claude-code) plugin. It needs Node.js 20 or
later. Nothing is installed into your projects: the viewer and the CLI ship prebuilt.

```text
/plugin marketplace add gabolondon/agentic-fbd
/plugin install agentic-fbd@agentic-fbd
```

If you installed the plugin under its old name, remove it first with
`/plugin uninstall logic-builder@logic-builder` and `/plugin marketplace remove logic-builder`,
then install it again as above.

To work on the plugin itself, load it straight from a checkout:

```bash
claude --plugin-dir /path/to/agentic-fbd
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

## Documentation

- [Getting started](docs/getting-started.md): install, a first Understand diagram, a first
  Design, committing the diagram, troubleshooting.
- [How the skill behaves](docs/skill.md): when Claude uses it, both modes, the files it writes,
  the edit loop with the viewer.
- [The viewer](docs/viewer.md): every panel and control, editing, Copy for agent, arranging by
  hand.
- [Blocks, wires and types](docs/blocks.md): every block kind and field, with a complete example.
- [CLI](docs/cli.md): `validate` and `open`, exit codes, and every issue code.

The format is one JSON file per subject, with no coordinates; the viewer lays everything out.
The exact grammar is in [`format.md`](skills/agentic-fbd/references/format.md), the JSON Schema
in [`logic.schema.json`](skills/agentic-fbd/references/logic.schema.json), and two complete
diagrams in [`skills/agentic-fbd/examples/`](skills/agentic-fbd/examples/). The design document
is [`docs/superpowers/specs/2026-10-18-logic-builder-design.md`](docs/superpowers/specs/2026-10-18-logic-builder-design.md).

## Contributing

Setup, the checks a pull request must pass and the project rules are in
[CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Gabriel Londoño

The viewer bundles the Inter typeface by Rasmus Andersson (SIL Open Font License 1.1).
