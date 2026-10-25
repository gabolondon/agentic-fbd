# Blocks, wires and types

This page explains everything you can put in a `*.logic.json` file: the nine kinds of blocks,
how blocks are wired, how types work, and how a design marks what changes. It ends with one
complete diagram you can copy.

You rarely write these files by hand. The agent writes them for you and the viewer draws them.
You read this page to understand what you see in the viewer, and to review what the agent wrote.

Two other files define the format, and this page does not replace them:

- [`format.md`](../skills/agentic-fbd/references/format.md) is the exact grammar, written for the
  agent.
- [`logic.schema.json`](../skills/agentic-fbd/references/logic.schema.json) is the JSON Schema that
  `validate` checks.

## The file at a glance

A diagram is one JSON object. One file explains one subject: a feature, a flow, a tool or a
pipeline.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `$schema` | string | No | An editor hint. Point it at `logic.schema.json` to get completion. |
| `version` | `"0.1"` | Yes | The format version. |
| `subject` | object | Yes | What the diagram is about (table below). |
| `types` | object | No | Named types that travel on wires. See [Types](#types-and-typeinfo). |
| `typeInfo` | object | No | What a named type means and where it lives in code. |
| `blockTypes` | object | No | Reusable blocks. See [Reusable blocks](#reusable-blocks-blocktypes). |
| `nodes` | array | Yes | The blocks. |
| `wires` | array | Yes | The connections between blocks. |
| `risks` | array | No | Things that can go wrong. See [Risks](#risks). |

The `subject` object:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | Yes | A short name for the subject. No `.`, `/` or spaces. |
| `title` | string | Yes | The heading shown in the viewer. |
| `intent` | string | Yes | One line on why this diagram exists. |
| `scope` | string | No | The part of the system the diagram covers. |
| `mode` | `"understand"` or `"design"` | Yes | `understand` explains code that exists. `design` proposes a change. |
| `focus` | string | No | The id of a root-level group or instance the viewer opens on. |

An `id` is any non-empty string without `.`, `/` or whitespace. Ids of nodes, wires, block types
and risks share one namespace per file, so two of them cannot have the same id. Each block type
`body` is its own namespace.

## Nodes

A node is one block in the diagram. Every node has an `id`, a `kind` and a `label`. The `kind`
decides what the block stands for and which other fields it uses.

Many fields are common to all kinds. They are listed once here, and each kind below only lists
what is specific to it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | Yes | Unique within its scope. |
| `kind` | string | Yes | One of `trigger`, `function`, `state`, `decision`, `external`, `result`, `group`, `instance`, `pin`. |
| `label` | string | Yes | The name shown on the block. |
| `desc` | string | Should | What the block does, in one or two sentences. `validate` gives a notice (`missing-desc`) when a block has none. Pins and instances are exempt. |
| `logic` | string or array of strings | Should on `function` and `decision` | How the block works: a paragraph, or ordered steps. `validate` gives a notice (`missing-logic`) when a `function` or `decision` has none. |
| `parent` | string | No | The id of the group that contains this block. It must be a `group` in the same scope. |
| `inputs` | object | No | Input ports: `{ "portName": "<type>" }`. |
| `outputs` | object | No | Output ports: `{ "portName": "<type>" }`. |
| `code` | object | No | The real code the block stands for: `file` (required) and `symbol` (optional). |
| `ref` | string | No | Free text pointing at what the block stands for when there is no code, for example a document section. |
| `see` | string | No | A link to another diagram. See [See links](#see-links). |
| `note` | string | No | A request left for the agent in the viewer. See [Notes](#notes-for-the-agent). |
| `change` | string | No | `existing` (default), `new`, `modified` or `removed`. See [Design marks](#design-marks). |
| `changeNote` | string | No | One line on what changes. |
| `before` | object | No | The fields as they were, on a `modified` block. |

The `code` object looks like this:

```json
"code": { "file": "src/subscribers.ts", "symbol": "saveSubscriber" }
```

For a block that does not exist yet, `code` holds the file and symbol you propose.

In the viewer, every block has an icon in its header. Clicking a block opens a side panel with
its description, logic, data, code and risks. A small dot on a block means an open risk touches
it. A `↗` badge means it has a `see` link, and a `✎` badge means it carries a `note`.

### trigger

A trigger is what starts a flow: a click, a schedule, an HTTP request, an agent call or a
system event. It has outputs and normally no inputs.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `source` | `user`, `schedule`, `http`, `agent` or `system` | Yes | Who or what starts the flow. |
| `context` | object | No | Free-form facts about the trigger, for example `{ "from": "Home page > Footer form" }`. |
| `outputs` | object | No | The data the trigger produces. |

```json
{
  "id": "t-submit",
  "kind": "trigger",
  "source": "user",
  "label": "Submit the form",
  "desc": "The visitor presses Subscribe.",
  "context": { "from": "Home page > Footer form" },
  "outputs": { "email": "Email" }
}
```

In the viewer, a trigger is a tinted block with a `⚡` icon. The side panel shows `source` and
the keys of `context` under a Context heading. In the After view you can edit them.

### function

A function is a unit of behavior: a function, a handler, a component or a tool. It is the most
common block. It takes typed inputs and produces typed outputs.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `inputs` | object | No | The data it takes. |
| `outputs` | object | No | The data it produces. |
| `logic` | string or array | Should | How it works. |
| `code` | object | No | The function in the code. |

```json
{
  "id": "save",
  "kind": "function",
  "parent": "signup",
  "label": "Save subscriber",
  "desc": "Builds the subscriber row and inserts it.",
  "logic": ["Adds the current time to the address.", "Inserts the row; an existing address is left as it is."],
  "code": { "file": "src/subscribers.ts", "symbol": "saveSubscriber" },
  "inputs": { "email": "Email" },
  "outputs": { "subscriber": "Subscriber" }
}
```

In the viewer, a function is a block with an `ƒ` icon. Input ports sit on the left and output
ports on the right, each with its name.

### state

A state is something that holds data between steps: a store, a variable, a cache or a table.

A state has no named ports. It has one implicit input and one implicit output, both of the
`valueType`. Wires reach it by its bare id, and say whether they read or write with `op`. See
[Wires](#wires).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `valueType` | type | No | The type of the value it holds. Wires to and from it are checked against it. |
| `store` | string | Should | Where the data lives and how long it lasts, in a few words of free text. `validate` gives a notice (`missing-store`) when it is missing. |

Write what the code actually uses, for example `"Zustand store · lost on reload"`,
`"localStorage · survives reload"` or `"Postgres table bookings"`. Do not guess a category.

```json
{
  "id": "subscribers",
  "kind": "state",
  "parent": "signup",
  "label": "subscribers (table)",
  "desc": "Every subscriber, one row per address.",
  "valueType": "Subscriber",
  "store": "Postgres table subscribers · kept forever"
}
```

In the viewer, a state is a compact block with a `▣` icon and no port names. The type it carries
is shown in the Data box of the blocks that read or write it. When a design adds a state that
holds the same type as an existing one, `validate` gives a `similar-store` notice, so you can
check whether the existing one should be reused.

### decision

A decision is an `if` or a `switch`. It has one output per branch, and each output carries what
flows down that branch.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `inputs` | object | No | What it looks at. |
| `outputs` | object | No | One port per branch, for example `yes` and `no`. |
| `logic` | string or array | Should | The rule that picks the branch. |

```json
{
  "id": "check",
  "kind": "decision",
  "parent": "signup",
  "label": "Valid address?",
  "desc": "Separates usable addresses from typos.",
  "logic": [
    "The text has one @ and a dot after it: yes, carry the address on.",
    "Anything else: no, carry a reason for the visitor."
  ],
  "inputs": { "email": "Email" },
  "outputs": { "yes": "Email", "no": "string" }
}
```

In the viewer, a decision is a block with a `◇` icon and one labeled output per branch.

### external

An external is anything the subject does not own: an API, a database, a third-party service, or
code outside the subject. It marks the boundary. The diagram does not open it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `inputs` | object | No | What the subject sends to it. |
| `outputs` | object | No | What comes back. |

```json
{
  "id": "mailer",
  "kind": "external",
  "label": "Email service",
  "desc": "Hosted service that sends the welcome email.",
  "inputs": { "subscriber": "Subscriber" },
  "outputs": { "sent": "boolean" }
}
```

In the viewer, an external has a `⇄` icon and a dashed border, so you can tell at a glance that
it is outside the subject. It stays a closed box.

HTTP responses are ordinary outputs named by status code, for example
`"outputs": { "200": "Booking", "422": "ValidationError" }`. The viewer lists them under
Responses in the Data box.

### result

A result is an end point: what the user sees, or what gets persisted. It has inputs and no
outputs.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `inputs` | object | No | What arrives at the end of the flow. |

```json
{
  "id": "done",
  "kind": "result",
  "label": "Thank-you page",
  "desc": "The visitor sees a confirmation once the email is sent.",
  "inputs": { "sent": "boolean" }
}
```

In the viewer, a result is a block with a `●` icon and ports on the left only.

### group

A group is a container: an area, a view, a step or a module. It does not compute anything. It
holds other blocks, which point at it with `parent`. Groups can nest.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `explored` | boolean | No | Set to `false` to mark an unexplored group. Leave it out otherwise. |
| `inputs` | object | No | Only on an unexplored group: the ports its wires use. |
| `outputs` | object | No | Only on an unexplored group. |

An explored group:

```json
{ "id": "signup", "kind": "group", "label": "Signup", "desc": "Checks the address and stores the subscriber." }
```

Its children are the nodes with `"parent": "signup"`. An unexplored group:

```json
{
  "id": "audit",
  "kind": "group",
  "label": "Audit trail",
  "desc": "Records who subscribed and when, for compliance.",
  "explored": false,
  "inputs": { "subscriber": "Subscriber" }
}
```

In the viewer, an explored group is a dashed frame around its children when everything fits on
screen (up to 25 blocks per level). If it would not fit, it is a closed box with the hint
`double-click ⤢` and you open it by double-clicking. An unexplored group is a hatched, dashed box
marked `unexplored`. See [Groups and unexplored groups](#groups-and-unexplored-groups) for the
rules.

### instance

An instance is one use of a reusable block. The block is defined once in `blockTypes` and used
as many times as needed. An instance takes its ports, description, logic and code from its type.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `of` | string | Yes | The name of the block type. It must exist in `blockTypes` (error `unknown-blocktype` otherwise). |

```json
{
  "id": "norm",
  "kind": "instance",
  "of": "Normalize",
  "parent": "signup",
  "label": "Normalize email"
}
```

In the viewer, an instance is a block with a `◆` icon, labeled Reusable block in the side panel.
If its type has a `body`, it shows `double-click ⤢` and opens to the inside. The side panel lists
every other instance of the same type. See
[Reusable blocks](#reusable-blocks-blocktypes).

### pin

A pin is the block's own input or output, seen from the inside. Pins only exist inside the `body`
of a block type, one per port of the type. A pin outside a body is an error
(`pin-outside-body`).

A pin has exactly one port:

- An input of the block is a pin with one **output**. It feeds the body.
- An output of the block is a pin with one **input**. It receives the body's result.

The port name and type must match the block type's port (error `pin-mismatch` otherwise). A pin
cannot have a `see` link (error `pin-see`).

```json
{ "id": "in", "kind": "pin", "label": "email", "outputs": { "email": "Email" } }
```

```json
{ "id": "out", "kind": "pin", "label": "email", "inputs": { "email": "Email" } }
```

In the viewer, a pin is an arrow-shaped flag at the edge of the level. The side panel calls it a
Block port.

## Ports and the type syntax

A port is a named connection point on a block. `inputs` and `outputs` are objects that map a port
name to its type:

```json
"inputs": { "selected": "OptionId?", "text": "string?" },
"outputs": { "answer": "Answer" }
```

A port name cannot contain a `.` or whitespace, because a wire writes the port after a dot. A
type is a string, or an object for unions and structures:

| Syntax | Meaning |
|---|---|
| `string` `number` `boolean` `null` | primitives |
| `OptionId` | a name defined in `types` |
| `T[]` | a list of `T` |
| `T?` | `T` or missing |
| `Record<K, V>` | a map from `K` to `V` |
| `'option'` | a string literal |
| `A \| B` or `{ "oneOf": [A, B] }` | a union |
| `{ "field": "<type>" }` | an object with fields |

In an object type, a field named `oneOf` is not possible, because `{ "oneOf": [...] }` means a
union.

Wires are checked by name first. A wire from a type to the same type is fine. A wire between
different names is a warning even if the shapes match, because the meaning may differ:

| From, to | Result |
|---|---|
| same name, or same primitive with no names | ok |
| the shape fits but the names differ (`number` to `OptionId`, `UserId` to `OptionId`, `T?` to `T`) | warning (`type-meaning`): same shape, different meaning |
| the shape does not fit (`string` to `number`) | error (`type-mismatch`) |
| an undefined name, or a type that cannot be parsed | unknown: never an error, reported as a notice (`undefined-type`) |

Errors fail validation. Warnings and notices do not. A warning is often exactly the risk worth
writing down. In the viewer, a warning wire shows a small `!` on the line.

## Wires

A wire carries data from an output port to an input port.

```json
{ "id": "w4", "from": "norm.email", "to": "save.email" }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | Yes | Unique in its scope. |
| `from` | string | Yes | An output port, written `node.port`. |
| `to` | string | Yes | An input port, written `node.port`. |
| `op` | `read` or `write` | No | For wires that touch a `state`: `write` stores into it, `read` takes from it. |
| `draw` | `line` or `label` | No | How the viewer draws the wire. See below. |
| `change` | string | No | A [design mark](#design-marks). |
| `before` | object | No | `from`, `to` and `op` as they were, on a `modified` wire. |
| `note` | string | No | A request for the agent. See [Notes](#notes-for-the-agent). |

Rules:

- `from` is an output and `to` is an input. The port must exist on the block, or `validate`
  reports `unknown-port`. Use `node.port` for every block except a state.
- A `state` is written by its bare id. `"to": "subscribers"` with `"op": "write"` stores a
  value. `"from": "subscribers"` with `"op": "read"` takes the value out. Using `node.port` on a
  state is an error (`state-port`), and so is using a bare id on any other kind (`missing-port`).
- Several wires may feed one input.
- A wire can join blocks in different groups. You do not draw the group edges: the viewer works
  out the boundary ports.
- A wire is checked against the types of its two ends. See
  [Ports and the type syntax](#ports-and-the-type-syntax).

### draw

`draw` is a presentation hint. Leave it out unless the person asked for it.

- Left out: the viewer draws a line. It turns the wire into a pair of labeled flags on its own when
  the route is very long, loops far back or crosses many other wires.
- `"draw": "label"`: always draw a pair of labeled flags instead of a line. One flag at the
  output says where the data goes, and one at the input says where it comes from. Clicking a
  flag shows the other end.
- `"draw": "line"`: always draw a line, even if the viewer would use flags.

## Groups and unexplored groups

A group is a way to give a diagram layers. Double-clicking a group opens it, and Esc goes back
up.

An explored group has children (blocks that point to it with `parent`) and no ports of its own.
Wires connect the children directly to whatever they talk to, even outside the group.

An unexplored group has no children yet. It stands for part of the subject that is not explained.
Because there is nothing inside to wire to, it declares `inputs` and `outputs`, and wires use
them: `"to": "audit.subscriber"`. Mark it with `"explored": false`.

To explore it, the agent:

1. adds the children, with `parent` set to the group;
2. rewires every wire that ended on `group.port` so it ends on the right child;
3. removes the group's `inputs` and `outputs`;
4. drops `explored`.

The rules `validate` enforces:

| Situation | Issue |
|---|---|
| `explored: false` on a group that has children | error `unexplored-with-children` |
| ports on a group that is not marked `explored: false` | error `ports-on-explored-group` |
| ports and children on the same group | error `group-ports-and-children` |
| `parent` names a missing block | error `unknown-parent` |
| `parent` names a block that is not a group | error `parent-not-group` |
| groups that contain each other | error `parent-cycle` |

In the viewer, clicking an unexplored group shows a request such as
`Explain "Audit trail" (audit) in newsletter-signup.logic.json` and a Copy for agent button.
Paste it into your session and the agent fills the group in.

## Reusable blocks (`blockTypes`)

Use a block type when the same pattern appears in several places. `blockTypes` is an object whose
keys are the type names. An `instance` node uses a type with `of`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `label` | string | Yes | The name shown on instances. |
| `inputs` | object | Yes | The input ports of every instance. |
| `outputs` | object | Yes | The output ports of every instance. |
| `desc` | string | Should | What it does. |
| `logic` | string or array | Should | How it works. |
| `code` | object | No | The component or function in the code. |
| `body` | object | No | The inside: `nodes` and `wires`, both required. |
| `change` | string | No | A [design mark](#design-marks). |
| `changeNote` | string | No | One line on what changes. |
| `before` | object | No | `label`, `desc`, `inputs`, `outputs` and `code` as they were. |

The `body` is what you see when you double-click an instance. It is its own scope: ids inside it
are separate from the file's ids, and it has its own wires. Its ports are `pin` nodes, one per
`inputs` and `outputs` entry of the type. The body can hold any kind of block, but a block type must not contain
itself, directly or through another type (error `body-cycle`).

```json
"blockTypes": {
  "Normalize": {
    "label": "Normalize email",
    "desc": "Trims and lowercases an email so the same address is never stored twice.",
    "logic": ["Trim the spaces around the address.", "Lowercase the whole address."],
    "inputs": { "email": "Email" },
    "outputs": { "email": "Email" },
    "code": { "file": "src/email.ts", "symbol": "normalizeEmail" },
    "body": {
      "nodes": [
        { "id": "in", "kind": "pin", "label": "email", "outputs": { "email": "Email" } },
        {
          "id": "clean",
          "kind": "function",
          "label": "Trim and lowercase",
          "desc": "Applies trim and toLowerCase to the address.",
          "logic": "Returns a new string; the input is not changed.",
          "inputs": { "email": "Email" },
          "outputs": { "email": "Email" }
        },
        { "id": "out", "kind": "pin", "label": "email", "inputs": { "email": "Email" } }
      ],
      "wires": [
        { "id": "b1", "from": "in.email", "to": "clean.email" },
        { "id": "b2", "from": "clean.email", "to": "out.email" }
      ]
    }
  }
}
```

Wires use an instance's ports the same way as any block's: `norm.email`. A block type with no
`body` is still valid. Its instances are closed boxes with nothing to open.

A block type that changes marks every instance of it as affected. A risk can point inside a body
with `Type/id`, for example `Normalize/clean`.

## See links

`see` links a block to another diagram in the same folder that explains it. Use it to split a
large subject into several files, one per layer of detail.

```json
"see": "mailer.logic.json"
```

```json
"see": "mailer.logic.json#retry"
```

The first form opens the other diagram. The second opens it on one block, which must be at that
file's root level. The file name has no folder part, and it must end in `.logic.json`.

In the viewer, a block with a `see` link shows a `↗` badge. The side panel has an Open button.
Double-clicking a block that cannot be opened inside the current diagram follows the link. A group
or an instance opens inside the current diagram on double-click, so use the panel button for
those.

`validate` checks the links against the files next to it and gives warnings: `link-missing-file`,
`link-missing-node` and `link-self` (a link to its own file). A pin cannot have `see`.

## Notes for the agent

`note` is a request someone left in the viewer, on a block or a wire. It is not a change and
marks nothing. The agent does what it says and then deletes the note.

```json
{ "id": "w7", "from": "save.subscriber", "to": "mailer.subscriber", "note": "Send this from a background job instead" }
```

You add notes from the side panel in the viewer, in the After view. See [`viewer.md`](viewer.md).

## Risks

A risk is something that can go wrong, tied to the blocks or wires it affects. The viewer marks
those blocks with a dot while the risk is open, and has a Risks panel that lists open risks first.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | Yes | Unique in the file. |
| `severity` | `high`, `medium` or `low` | Yes | How bad it is. |
| `status` | `open` or `resolved` | Yes | A resolved risk stays on record but no longer marks blocks. |
| `title` | string | Yes | One line. |
| `refs` | array of strings | Yes | What it is about. Can be empty. |
| `detail` | string | No | The explanation. |
| `resolution` | string | No | How it was or will be handled. |

`refs` hold node ids, wire ids or block type names. To point inside a block type body, write
`Type/id`. A ref that matches nothing is an error (`unknown-ref`).

```json
{
  "id": "r1",
  "severity": "medium",
  "status": "open",
  "title": "The thank-you page waits for the email service",
  "detail": "If the email service is slow, the visitor waits on the form even though the row is already saved.",
  "refs": ["mailer", "w8"]
}
```

A type warning on a wire (`type-meaning`) is often the first sign of a risk. If the mismatch is
real, write it down here.

## Types and typeInfo

`types` gives names to the types that travel on wires. A name makes a port read as a concept
(`Email`) instead of a shape (`string`), and it makes the type check nominal: two different names
are never silently interchangeable.

```json
"types": {
  "Email": "string",
  "Subscriber": { "email": "Email", "createdAt": "string" }
}
```

A name that is used in a port but is not defined in `types` is treated as opaque, and `validate`
gives an `undefined-type` notice.

`typeInfo` adds notes to the names that matter, so a reader knows what a type is and where it
comes from. Its keys must be names in `types` (error `unknown-type-info` otherwise).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `desc` | string | No | One or two lines: what the type is and where it comes from. |
| `code` | object | No | `file` and `symbol` of the definition in code. |
| `change` | `"modified"` | No | Marks a changed type. It is the only allowed value. |
| `before` | type | No | The old type expression, on a `modified` type. |

```json
"typeInfo": {
  "Subscriber": {
    "desc": "One row of the subscribers table.",
    "code": { "file": "src/subscribers.ts", "symbol": "Subscriber" }
  }
}
```

Give notes to the types that help understanding, such as request and response models, not to
every alias. The viewer shows them in the Data box of every block that reads or writes the type.

## Design marks

In `design` mode, the diagram shows what a change adds, edits and removes. Marks work on nodes,
wires and block types, except that `changeNote` is only available on nodes and block types.

| Field | On | Meaning |
|---|---|---|
| `change` | nodes, wires, block types | `existing` (the default), `new`, `modified` or `removed`. |
| `changeNote` | nodes, block types | One line on what changes. |
| `before` | `modified` nodes, wires, block types | The fields as they were. |
| `note` | nodes and wires | A request for the agent. It is not a mark. See [Notes](#notes-for-the-agent). |

What `before` may hold depends on what it is on:

| On | Fields in `before` |
|---|---|
| node | `label`, `desc`, `inputs`, `outputs`, `code`, `parent`, `valueType`, and on triggers `source` and `context` |
| block type | `label`, `desc`, `inputs`, `outputs`, `code` |
| wire | `from`, `to`, `op` |

An empty string or empty object in `before` means the field was not there before. A `before` on
an item that is not `modified` is ignored, and `validate` gives a `before-unused` notice for nodes.

A modified function that now takes one more input:

```json
{
  "id": "save",
  "kind": "function",
  "parent": "signup",
  "label": "Save subscriber",
  "desc": "Builds the subscriber row and inserts it.",
  "logic": ["Adds the current time to the address.", "Inserts the row; an existing address is left as it is."],
  "inputs": { "email": "Email", "source": "string" },
  "outputs": { "subscriber": "Subscriber" },
  "change": "modified",
  "changeNote": "Also stores where the signup came from",
  "before": { "inputs": { "email": "Email" } }
}
```

A new wire, and a wire that goes away:

```json
{ "id": "w9", "from": "t-submit.source", "to": "save.source", "change": "new" }
```

```json
{ "id": "w6", "from": "save.subscriber", "to": "audit.subscriber", "change": "removed" }
```

A `removed` wire may point at a port that only exists in `before`, so you can show a wire that
ended on a port the change deletes.

A block type that changes:

```json
"Normalize": {
  "label": "Normalize email",
  "desc": "Trims and lowercases an email, and strips +tags.",
  "change": "modified",
  "changeNote": "Also strips +tags from the address",
  "before": { "desc": "Trims and lowercases an email so the same address is never stored twice." }
}
```

(The excerpt shows only the marking fields. A real block type also has its `inputs`, `outputs`,
`logic` and `body`.)

A changed named type is marked in `typeInfo`, with the old expression in `before`:

```json
"types": { "Subscriber": { "email": "Email", "createdAt": "string", "source": "string" } },
"typeInfo": {
  "Subscriber": {
    "change": "modified",
    "before": { "email": "Email", "createdAt": "string" }
  }
}
```

Wires that carry the type show as affected.

Changing a block's `kind` is two marks, not one: a `removed` block of the old kind and a `new`
block of the new kind.

In the viewer, the **Before** view hides new items and applies each `before`, so you see the system
as it is. The **After** view colors new items green and modified items amber, and shows removed
items as red dashed ghosts. Instances whose block type changed, and wires that carry a changed
type, are marked as affected. A block that has changes inside it gets a small dot. The side panel
shows the `changeNote` under What changes.

## A complete example

This is a whole file. It uses every kind of block: a trigger, a decision, a function, a state, an
external, two results, an explored group, an unexplored group, a block type with a body and pins,
and an instance of it. It passes `validate` with no issues.

```json
{
  "version": "0.1",
  "subject": {
    "id": "newsletter-signup",
    "title": "Newsletter signup",
    "intent": "Show how a signup form turns an email address into a stored subscriber and a welcome email",
    "mode": "understand"
  },
  "types": {
    "Email": "string",
    "Subscriber": {
      "email": "Email",
      "createdAt": "string"
    }
  },
  "typeInfo": {
    "Subscriber": {
      "desc": "One row of the subscribers table.",
      "code": { "file": "src/subscribers.ts", "symbol": "Subscriber" }
    }
  },
  "blockTypes": {
    "Normalize": {
      "label": "Normalize email",
      "desc": "Trims and lowercases an email so the same address is never stored twice.",
      "logic": ["Trim the spaces around the address.", "Lowercase the whole address."],
      "inputs": { "email": "Email" },
      "outputs": { "email": "Email" },
      "code": { "file": "src/email.ts", "symbol": "normalizeEmail" },
      "body": {
        "nodes": [
          { "id": "in", "kind": "pin", "label": "email", "outputs": { "email": "Email" } },
          {
            "id": "clean",
            "kind": "function",
            "label": "Trim and lowercase",
            "desc": "Applies trim and toLowerCase to the address.",
            "logic": "Returns a new string; the input is not changed.",
            "inputs": { "email": "Email" },
            "outputs": { "email": "Email" }
          },
          { "id": "out", "kind": "pin", "label": "email", "inputs": { "email": "Email" } }
        ],
        "wires": [
          { "id": "b1", "from": "in.email", "to": "clean.email" },
          { "id": "b2", "from": "clean.email", "to": "out.email" }
        ]
      }
    }
  },
  "nodes": [
    {
      "id": "t-submit",
      "kind": "trigger",
      "source": "user",
      "label": "Submit the form",
      "desc": "The visitor presses Subscribe.",
      "context": { "from": "Home page > Footer form" },
      "outputs": { "email": "Email" }
    },
    {
      "id": "signup",
      "kind": "group",
      "label": "Signup",
      "desc": "Checks the address and stores the subscriber."
    },
    {
      "id": "check",
      "kind": "decision",
      "parent": "signup",
      "label": "Valid address?",
      "desc": "Separates usable addresses from typos.",
      "logic": [
        "The text has one @ and a dot after it: yes, carry the address on.",
        "Anything else: no, carry a reason for the visitor."
      ],
      "inputs": { "email": "Email" },
      "outputs": { "yes": "Email", "no": "string" }
    },
    {
      "id": "norm",
      "kind": "instance",
      "of": "Normalize",
      "parent": "signup",
      "label": "Normalize email"
    },
    {
      "id": "save",
      "kind": "function",
      "parent": "signup",
      "label": "Save subscriber",
      "desc": "Builds the subscriber row and inserts it.",
      "logic": ["Adds the current time to the address.", "Inserts the row; an existing address is left as it is."],
      "code": { "file": "src/subscribers.ts", "symbol": "saveSubscriber" },
      "inputs": { "email": "Email" },
      "outputs": { "subscriber": "Subscriber" }
    },
    {
      "id": "subscribers",
      "kind": "state",
      "parent": "signup",
      "label": "subscribers (table)",
      "desc": "Every subscriber, one row per address.",
      "valueType": "Subscriber",
      "store": "Postgres table subscribers · kept forever"
    },
    {
      "id": "audit",
      "kind": "group",
      "label": "Audit trail",
      "desc": "Records who subscribed and when, for compliance.",
      "explored": false,
      "inputs": { "subscriber": "Subscriber" }
    },
    {
      "id": "mailer",
      "kind": "external",
      "label": "Email service",
      "desc": "Hosted service that sends the welcome email.",
      "inputs": { "subscriber": "Subscriber" },
      "outputs": { "sent": "boolean" }
    },
    {
      "id": "done",
      "kind": "result",
      "label": "Thank-you page",
      "desc": "The visitor sees a confirmation once the email is sent.",
      "inputs": { "sent": "boolean" }
    },
    {
      "id": "rejected",
      "kind": "result",
      "label": "Form error",
      "desc": "The visitor sees why the address was refused.",
      "inputs": { "reason": "string" }
    }
  ],
  "wires": [
    { "id": "w1", "from": "t-submit.email", "to": "check.email" },
    { "id": "w2", "from": "check.yes", "to": "norm.email" },
    { "id": "w3", "from": "check.no", "to": "rejected.reason" },
    { "id": "w4", "from": "norm.email", "to": "save.email" },
    { "id": "w5", "from": "save.subscriber", "to": "subscribers", "op": "write" },
    { "id": "w6", "from": "save.subscriber", "to": "audit.subscriber" },
    { "id": "w7", "from": "save.subscriber", "to": "mailer.subscriber" },
    { "id": "w8", "from": "mailer.sent", "to": "done.sent" }
  ],
  "risks": [
    {
      "id": "r1",
      "severity": "medium",
      "status": "open",
      "title": "The thank-you page waits for the email service",
      "detail": "If the email service is slow, the visitor waits on the form even though the row is already saved.",
      "refs": ["mailer", "w8"]
    }
  ]
}
```

To try it, save the JSON as `newsletter-signup.logic.json`, then check it and open it:

```sh
node dist/cli.mjs validate newsletter-signup.logic.json
node dist/cli.mjs open newsletter-signup.logic.json
```

See [`cli.md`](cli.md) for the commands and for every issue code `validate` can report.
