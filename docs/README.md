# agentic-fbd documentation

Read these pages in order the first time. After that, use them as a reference.

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Requirements, install, your first Understand diagram, going one layer deeper, your first Design, committing the diagram, troubleshooting |
| [How the skill behaves](skill.md) | When Claude uses the skill, offers it or stays out, both modes, the files it writes, the edit loop with the viewer, folding a design back after implementation |
| [The viewer](viewer.md) | Every panel and control: reading levels, wires and data, Before / After, risks, linked diagrams, editing, the draft, Copy for agent, arranging by hand |
| [Blocks, wires and types](blocks.md) | Every block kind and field, ports and types, wires, groups, reusable blocks, risks, `typeInfo` and the Design marks, with a complete example |
| [CLI](cli.md) | `validate` and `open`: flags, exit codes, the `--json` output, and every issue code with how to fix it |

Reference for the format itself:

- [`format.md`](../skills/agentic-fbd/references/format.md): the exact grammar, written for the
  agent.
- [`logic.schema.json`](../skills/agentic-fbd/references/logic.schema.json): the JSON Schema.
- [Examples](../skills/agentic-fbd/examples/): one Understand and one Design diagram.

Working on agentic-fbd itself: [CONTRIBUTING.md](../CONTRIBUTING.md). Reporting a
vulnerability: [SECURITY.md](../SECURITY.md).
