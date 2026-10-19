# logic-builder format reference (v0.1)

One JSON file per subject. Keys are English; labels and explanations use the user's language.
Validate with `node "<base>/../../dist/cli.mjs" validate <file>`. Schema: `logic.schema.json`.

## Top level

```jsonc
{
  "version": "0.1",
  "subject": {
    "id": "auth-gate",                 // no "." or "/" in any id
    "title": "Access gate: how a request is authorized",
    "intent": "One line: why this diagram exists",
    "scope": "Access gate service",    // optional
    "mode": "understand",              // or "design"
    "focus": "some-group"              // optional: group or instance the viewer opens on
  },
  "types": { "Name": "<type>" },       // named types that travel on wires
  "blockTypes": { "Name": { } },       // reusable blocks (see below)
  "nodes": [ ],
  "wires": [ ],
  "risks": [ ]
}
```

## Nodes

Common fields: `id`, `kind`, `label`, `desc`, `logic`, `parent`, `inputs`, `outputs`, `code`,
`ref`, `see`, `change`, `changeNote`, `before`.

| kind | Use for | Extra fields |
|---|---|---|
| `trigger` | What starts a flow | `source`: `user` \| `schedule` \| `http` \| `agent` \| `system` (required). `context`: free object, e.g. `{ "from": "Vaccinations › List", "modes": ["create", "edit"] }` |
| `function` | A function, handler, component, tool | typed `inputs` / `outputs` |
| `state` | A store, variable, cache, table | `valueType`. No ports: wires reference it by bare id, with `op` |
| `decision` | if / switch | one output per branch |
| `external` | API, database, third-party service, code outside the subject | the boundary; stays a closed box |
| `result` | What the user sees or what gets persisted | |
| `group` | A container: area, view, step, module | children point to it with `parent`. `explored: false` marks an unexplored group, which may declare `inputs` / `outputs` |
| `instance` | An instance of a blockType | `of: "TypeName"` (required). Ports and code come from the type |
| `pin` | Only inside a blockType `body`: the block's own input or output | exactly one port, same name and type as the blockType port |

- `inputs` / `outputs`: `{ "portName": "<type>" }`. Port names have no dots.
- `code`: `{ "file": "src/x.ts", "symbol": "doThing" }`, the real code the block represents
  (proposed file and symbol for new blocks). For non-code subjects, use `ref` (free text).
- `desc` (**what it does**, 1–2 sentences) on every block except pins.
- `logic` (**how it works**): a string, or an array of ordered steps. Required on `function`,
  `decision` and blockTypes.
- `see`: another diagram in the same folder that explains this block, `"other.logic.json"` or
  `"other.logic.json#node-id"` (a block at that file's root level). The viewer shows a ↗ badge and
  opens the other diagram on double-click. Not allowed on pins.

### Groups and layers

- Wires connect nodes directly, even across groups. The viewer computes group boundary ports.
- Only an unexplored group (`explored: false`, no children) declares ports. To explore it, add
  its children, rewire the wires that ended on `group.port` to the children, remove the group's
  ports, and drop `explored`. A group must never have both children and ports.

## Wires

```json
{ "id": "w1", "from": "node.port", "to": "node.port", "change": "new", "op": "write" }
```

- `from` is an output port, `to` is an input port. A `state` node is referenced by its id alone
  (`"to": "answers"`, `"op": "write"`; `"from": "answers"`, `"op": "read"`).
- Several wires may feed one input.
- `draw`: `"label"` draws the wire as a pair of labeled flags (a net label: "goes to X" at the
  output, "comes from Y" at the input) instead of a line; `"line"` forces a line. Leave it out:
  the viewer draws lines and turns a wire into flags only when its route is very long, loops far
  back, or crosses several other wires. Set it only when the user asks.

## Reusable blocks (`blockTypes`)

```json
"OtherOption": {
  "label": "Other option",
  "desc": "…", "logic": ["…", "…"],
  "inputs": { "selected": "OptionId?", "text": "string?" },
  "outputs": { "answer": "Answer" },
  "code": { "file": "src/OtherOption.tsx", "symbol": "OtherOption" },
  "change": "new",
  "body": { "nodes": [ ], "wires": [ ] }
}
```

Use one when the same pattern appears in several places. `body` is the inside, shown on
double-click; it is its own id scope and uses `pin` nodes for the block's ports. A blockType that
changes marks all its instances as affected.

## Design mode: marking a change

- `change`: `existing` (default) | `new` | `modified` | `removed`, on nodes, wires and blockTypes.
- `changeNote`: one line on what changes.
- `before` (only on `modified` items): the fields as they were. Nodes: `label`, `desc`, `inputs`,
  `outputs`, `code`, `parent`, `valueType`. BlockTypes: `label`, `desc`, `inputs`, `outputs`,
  `code`. Wires: `from`, `to`, `op`.
- A `removed` wire may point at a port that only exists in `before`.
- Changing a node's `kind` = one `removed` node + one `new` node.

The viewer's **Before** hides new items and applies `before`. **After** colors new (green) and
modified (amber), and shows removed items as red dashed ghosts.

## Risks

```json
{ "id": "r1", "severity": "high", "status": "open",
  "title": "Numeric text taken as an ID",
  "detail": "…", "resolution": "…",
  "refs": ["save", "w3", "OtherOption", "OtherOption/dec"] }
```

`refs` name nodes, wires or blockTypes. Use `Type/id` for something inside a blockType body.
`severity`: `high` | `medium` | `low`. `status`: `open` | `resolved`.

## Types

| Syntax | Meaning |
|---|---|
| `string` `number` `boolean` `null` | primitives |
| `OptionId` | a name defined in `types` |
| `T[]` | list |
| `T?` | optional |
| `Record<K, V>` | map |
| `'option'` | string literal |
| `A \| B` or `{ "oneOf": [A, B] }` | union |
| `{ "field": "<type>" }` | object |

Wires are checked by **name first** (nominal):

| Source → target | Result |
|---|---|
| same name, or same primitive with no names | ok |
| shape fits but names differ (`number` → `OptionId`, `UserId` → `OptionId`, `T?` → `T`) | warning: same shape, different meaning |
| shape does not fit (`string` → `number`) | error |
| undefined name, unparseable type | unknown: never an error, reported as a notice |

Errors fail validation; warnings and notices don't. A warning is often exactly the risk worth
writing down.

## Layout file

`<subject>.layout.json`, next to the diagram, holds the positions a person set by dragging blocks
in the viewer. The viewer writes it; never edit it. Commit it with the diagram. Blocks it doesn't
mention are laid out automatically, so editing the diagram needs no change to it.

## IDs

- Node, wire, blockType and risk ids share one namespace per file.
- Each blockType body is its own scope.
- Ids contain no `.` and no `/`.
