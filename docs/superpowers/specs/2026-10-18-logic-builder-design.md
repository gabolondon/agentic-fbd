# logic-builder — Design

Date: 2026-10-18 · Author: Gabriel Londoño (with Claude) · Status: draft for review

Visual reference: `2026-10-18-logic-builder-prototype.html` (same folder). A throwaway prototype
Gabriel approved as the UI direction. Open it in a browser. Its on-screen text is in Spanish
because it was a brainstorming sketch; the real app is in English.

This document is meant to be handed to a fresh Claude Code session that will write the
implementation plan and build it. It should be readable without any other context.

---

## 1. Intent and why

### 1.1 What logic-builder is

logic-builder is a **logic visualizer for humans and coding agents**. It explains how something
works, or how it is about to change, as a **Function Block Diagram** (FBD, the IEC 61131-3 language
used to program PLCs): blocks with typed inputs and outputs, wired together, organized in layers
you can open with a double-click.

It is a **two-way translation layer between logic and code**:

- **Agent → human.** What Claude understands about existing code, or plans to build, is shown as a
  diagram the developer can read, question and correct in minutes, without reading every file.
- **Human → agent.** What the developer has in mind (flows, states, triggers, inputs, outputs) is
  expressed in the same diagram format, which Claude can then implement faithfully.

The goal is **engineering in partnership with the agent, not "vibe coding"**: each side leads the
other by the hand, and the developer stays conscious of what is being built and how it fits.

The subject of a diagram is usually code (a feature, a section of an app, an agent tool, a
pipeline), but the format is not tied to code: anything with inputs, outputs, state and layers —
a data pipeline, a processing workflow — can be explained the same way.

### 1.2 The problem

AI coding agents now write most of the code in many projects. That creates three recurring gaps:

1. **Plans ignore the existing logic.** When Claude Code writes a plan, it does not deeply account
   for the logic already in the code or for where the product is likely to go. The code works for
   today's request but is not ready for tomorrow's features, and every new feature brings
   integration bugs.
2. **The developer loses the mental model.** When an agent builds an app end to end, the developer
   approves plans and ships features but never forms a picture of how the internals actually work.
   The app runs, but extending it, debugging it or verifying it depends entirely on the agent.
3. **Review collapses to input/output.** Under time pressure (small teams that need to deliver),
   developers check that a new function returns the right output and move on, trusting the agent's
   explanation without understanding the logic in between.

Reading the code would solve all three, but it is slow and often not realistic. A diagram at the
right level of detail, opened layer by layer only where it matters, is the fast path to the same
understanding.

### 1.3 Why an FBD

The author is an electronics engineer who programmed PLCs with function block diagrams: logic
blocks with inputs and outputs, wired together, where double-clicking a block opens its internals.
That language makes data flow and types visible at a glance, scales by layers, and is something
engineers already read fluently. logic-builder brings it to software.

### 1.4 Motivating cases (anonymized)

**Case A — A change that broke in many places (Design).**
A multi-step intake questionnaire (a wizard) with back/forward navigation, a review screen and
editing. Later, an "Other" option with free text was added to selection questions.
- Selection options were identified by numeric IDs.
- When a user typed a number into "Other" (an age, a year, a count), the code took it as an option
  ID and saved the wrong selection instead of the text.
- "Other" appeared in many steps and at different depths of the question tree (vaccinations → add
  vaccine + year of the shot; known conditions → category → condition → Other, four levels down),
  so it was very hard to debug.

With the wizard's state, the types travelling on each connection and every instance of "Other"
drawn out, the conflict would have been visible before writing code.

**Case B — An app built entirely by the agent (Understand).**
An internal access-control app built end to end with Claude Code:
- It started as a Firebase authentication gate to publish one internal HTML document.
- Then it gained authorization and roles (admins, readers).
- Then it became the standard gate in front of small internal apps other teams build, such as data
  dashboards.

It works and the developer can deploy it, but they do not know its internal logic. Adding features
means trusting the agent blindly. The need: explore the logic of a specific area ("how does
authorization decide access?") as a diagram, layer by layer.

**Case C — An agent's tools and its benchmark (Understand, then Design).**
An LLM email agent with a root agent and several subagents and tools, plus a benchmark that
categorizes responses to verify changes:
- The developer knows the codebase overall.
- When Claude adds a tool, the developer checks only input and output, not the Python logic.
- They do not know how the benchmark works inside, nor how they would extend it by hand.

The need: see how a tool or the benchmark works, where the data comes from at each layer, and then
design the next change on top of that understanding.

## 2. Goals, non-goals, anti-goals

### Goals
1. **A JSON format** that describes logic as an FBD: blocks, typed ports, wires, state, triggers
   with context, layers, reusable block types with instances, change marks and risks.
2. **A visual app** (React + React Flow) that renders that JSON in a clean, informative and
   interactive way.
3. **A skill with two modes**, sharing the format and the app:
   - **Understand:** explain how an existing feature, section, flow, tool or pipeline works.
   - **Design:** propose a new feature or a change, showing what is added, modified and affected,
     and where it can break.
4. **Layered, on-demand depth.** Diagrams start high-level and grow one layer at a time where the
   user asks, keeping cost proportional to what the user actually wants to understand.
5. **Sequential use.** Understand the area first, then design on top of that same diagram.

### Non-goals
- **Mapping a whole repository in one go.** logic-builder explains specific things on request. It
  is not a repo-indexing or whole-codebase mapping tool.
- Generating code from the diagram. The diagram feeds the plan, and code is written through the
  normal workflow.
- A full visual editor in phase 1 (see §6.4).

### Anti-goals (failure even if it technically works)
- **A cluttered UI.** If the first view shows lots of types, text and colors, it failed. Clean by
  default; detail is one hover, click or double-click away.
- **Diagrams that don't map to the code.** If blocks are abstract ideas you cannot point to in the
  code, the developer still doesn't understand what is being built, and the purpose is lost.
- **Ceremony that costs more than it saves.** If producing a diagram burns so many tokens or so much
  time that it isn't worth it for a medium feature, it failed. Reference targets:
  - `SKILL.md` around 200 lines or less. Format reference, schema and examples are loaded only
    when needed.
  - A medium subject fits in about 25 nodes per level or fewer. More than that means splitting
    into groups.
  - A first diagram comes from one focused pass over the relevant code, not from exploring the repo.

## 3. How it is used

### 3.1 Understand mode
1. The user asks Claude to explain something specific ("how does authorization work here?",
   "explain this tool with a diagram"), or Claude offers to diagram it (see §8.1 for when it offers).
2. Claude reads only the code for that subject and writes a **top-level diagram**:
   - a few blocks;
   - all marked as existing;
   - sub-areas not yet explained shown as **unexplored groups**.
3. Claude validates the file and opens the app.
4. The user explores. Double-clicking an unexplored group shows a ready-to-copy request ("Explain
   `<group>` in `<file>`"). The user can also just ask in the chat ("go deeper into the token
   check").
5. Claude reads only that block's code, fills that layer in the same JSON, and the app reloads live.
6. The user can ask Claude to walk through it layer by layer ("where does this data come from?").

### 3.2 Design mode
1. The user asks for a feature or a change with non-trivial logic. Claude **asks** whether to design
   the logic diagram first (see §8.1). If yes:
2. If the area is not understood yet, Claude runs **Understand** on it first, or reuses an
   existing diagram of it.
3. On top of that diagram, Claude marks the proposal:
   - new blocks and wires;
   - modified blocks, keeping their previous shape in `before`;
   - removed blocks and wires;
   - risks, each pointing at the blocks and wires involved.
4. The user reviews: toggles Before / After, hovers wires, opens blocks, reads risks.
5. **Phase 1:** the user asks for changes in the chat; Claude edits the JSON; the app reloads live.
   **Phase 2:** some edits are also possible directly in the UI (§6.4).
6. When the user approves the diagram, Claude asks whether to continue to the implementation plan,
   using the JSON as its basis.
7. After implementation, the diagram is folded back into an Understand diagram and committed as
   living documentation (§8.6).

## 4. Components

| Component | What it is |
|---|---|
| JSON format + JSON Schema | The diagram "language" (§5). |
| Visual app | React + React Flow, served locally (§6). |
| CLI | `open <file>` serves the app on a file with live reload; `validate <file>` checks the schema and references (§7). |
| Skill | Teaches Claude the format, both modes, the method and the workflow (§8). |
| Packaging | A Claude Code plugin built in this folder, open source (§9). |

## 5. JSON format

One file per subject (a feature, flow, tool, pipeline…). Example in Appendix A.

### 5.1 Top level

```
version     string                 format version, "0.1"
subject     { id, title, intent, scope, mode: "understand" | "design" }
types       { Name: Type }         named types that travel on wires
typeInfo?   { Name: TypeInfo }     notes on named types: desc, code (added in phase 2d, §6.8)
blockTypes  { Name: BlockType }    reusable blocks (FB types)
nodes       Node[]
wires       Wire[]
risks       Risk[]
```

`mode` tells the app whether to offer Before/After (design) or not (understand). A file can move
from `understand` to `design` when the user starts designing on top of it.

### 5.2 Nodes

Common fields: `id`, `kind`, `label`, `desc?`, `logic?`, `parent?`, `inputs?`, `outputs?`, `code?`,
`change?`, `changeNote?`, `before?`, `note?` (a request left for the agent, added in phase 2e,
§6.9).

**Explanations (added after the M6 review).** Every block carries a short explanation for the
reader, shown when the block is clicked:
- `desc`: **what it does**, in one or two sentences.
- `logic`: **how it works**, as a basic guide: one paragraph, or an array of ordered steps.

The skill writes `desc` for every block (pins excepted) and `logic` for every `function`,
`decision` and blockType. `validate` reports missing ones as notices (`missing-desc`,
`missing-logic`). BlockTypes accept `desc` and `logic` too; instances show their blockType's.

**Id scope:** node, wire, blockType and risk ids share **one namespace per file** and are unique
across it. Each blockType `body` is its own scope. A risk refers to something inside a body as
`"BlockTypeName/id"` (e.g. `"OtherOption/dec"`).

`kind`, a small fixed catalog:

| kind | Represents | Notes |
|---|---|---|
| `trigger` | What starts a flow | `source`: `user` \| `schedule` \| `http` \| `agent` \| `system`. `context?`: `{ from, modes, ... }` — where it comes from (step, depth) and in which mode (create/edit). |
| `function` | A function, handler or component | Typed inputs and outputs. |
| `state` | A store, variable or persisted state | `valueType`. `store` (added in phase 2d, §6.8): where it lives, e.g. `"Zustand store · lost on reload"`. Read and written through wires with `op`. |
| `decision` | if / switch | One output per branch. |
| `external` | API, database, third-party service, or code outside the subject | The boundary with the rest of the repo, kept as a closed box. |
| `result` | What the user sees or what gets persisted | |
| `group` | A container: a subject area, view, step, module | Children point to it with `parent`. This is how layers are built. `explored: false` marks an unexplored group (see "Group ports" below). |
| `instance` | An instance of a `blockType` | `of: "TypeName"`. Inherits its ports and code. |

- `inputs` / `outputs`: `{ portName: Type }`.
- `code?`: `{ file, symbol }`. The real piece of code the block represents. For `new` blocks, the
  proposed file and symbol. Optional when the subject isn't code (e.g. a data pipeline step
  described by a query or a job name; free-form `ref?: string` is allowed then).
- `change?` (design mode): `existing` (default) \| `new` \| `modified` \| `removed`.
- `changeNote?`: one line on what changes.
- `before?`: only on `modified` items (nodes, wires, blockTypes). Holds the fields as they were.
  - On nodes it may hold `label`, `desc`, `inputs`, `outputs`, `code`, `parent`, `valueType`,
    e.g. `{ "inputs": { "optionId": "OptionId" } }`.
  - On blockTypes it may hold `label`, `desc`, `inputs`, `outputs`, `code`.
  - On wires it may hold `from`, `to`, `op`.
  - A change of `kind` is modeled as one `removed` node plus one `new` node.
  - The Before view uses these fields, and `removed` wires may point to ports that exist only in
    `before` (on the node or on its blockType).
- `see?` (added in phase 2a): another diagram in the same folder that explains this block, as
  `"<file>.logic.json"` or `"<file>.logic.json#<node-id>"`. Used to link diagrams of several
  systems (an off-page connector, see §6.5). Not allowed on pins.

**Group ports.** Wires connect nodes directly, even across group boundaries. Group ports are not
declared; the app computes a group's boundary ports from the wires that cross it. The one exception
is an **unexplored** group (`explored: false`): it has no children yet, so it may declare `inputs` /
`outputs`, and wires may target `group.port`. When Claude explores it, Claude adds the children,
rewires those wires to them, removes the group's declared ports and drops `explored`. The validator
rejects a group that has both children and declared ports.

**Granularity rule (taught by the skill):** a block is a real piece of the code — a button or its
handler, a function, a state, an endpoint, a tool. Groups exist to organize without losing that
mapping.

### 5.3 Reusable blocks (`blockTypes`)

`{ label, desc?, inputs, outputs, code?, change?, before?, body? }`. `body` has the same
`{ nodes, wires }` shape and describes the internal logic seen on double-click. Inside a `body`,
the block's own inputs and outputs are `kind: "pin"` nodes; `pin` exists only inside a `body`.
An input pin has exactly one output port, and an output pin has exactly one input port. That
port's **name and type must match** the blockType port it stands for.

When a `blockType` changes (`change: modified`), all its instances are marked as affected.

### 5.4 Wires

`{ id, from: "node.port", to: "node.port", change?, op?, note? }`.
- A `state` node is referenced by its id alone, without a port.
- `op`: `read` \| `write`, for wires touching a `state`.
- `draw?` (added in phase 2a): `line` \| `label`. How the viewer draws the wire: as a line, or as
  a pair of labeled connectors (§6.5). Omitted means automatic.

### 5.5 Risks

`{ id, severity: high|medium|low, status: open|resolved, title, detail?, resolution?, refs: [ids] }`.
`refs` points to nodes, wires or blockTypes. In understand mode, risks are used for fragile spots
found while explaining.

### 5.6 Type language

Small and readable:
- primitives: `string`, `number`, `boolean`, `null`;
- names defined in `types`;
- `T[]`, `T?`, `Record<K, V>`;
- string literals (`"'option'"`);
- objects `{ field: Type }`;
- unions `{ "oneOf": [ ... ] }`.

**Compatibility check.** The app compares each wire's source type to its target type:
- **OK (grey):** same type name, or same primitive when neither side is named.
- **Warning (amber, with tooltip):** the shape is compatible but the names differ — e.g. a bare
  `number` entering an `OptionId` port. This is exactly the shape of Case A's bug: the value fits
  but means something else. Names are nominal; they are not hidden behind their primitive.
- **Error (red):** incompatible shape (`string` → `number`, object → primitive).
- **Unknown:** if a type can't be evaluated (including a name never defined in `types`, which
  is treated as opaque and reported by `validate` as a notice), the wire stays neutral, never red. How deep the
  structural check goes is the builder's call; the rule is **no false reds**.

`validate` reports errors as failures and warnings as notices; warnings don't fail validation.

### 5.7 No coordinates

The JSON has no positions; the app lays out automatically, so the agent spends no tokens on layout.
People can still arrange a level by dragging blocks; the viewer saves those positions in a side
file, `<subject>.layout.json`, that the agent never writes (§6.6).

### 5.8 Language

Keys are English. Labels and descriptions are written in the language the user works in. The
bundled examples are in English.

## 6. Visual app

**Stack (Gabriel's call):** React + React Flow. **Claude's call:** TypeScript + Vite,
`@xyflow/react`, and `elkjs` for automatic layout (handles ports and compound nodes). All UI text,
code and comments are in English.

### 6.1 Principle
Clean, informative and interactive. Show little at first; detail appears as you interact. This is
the direction of the approved prototype.

### 6.2 At a glance
- **Structure panel on the left** (replaces the breadcrumb, after the M6 review):
  - Subject title, intent, scope, and a Design / Understand chip.
  - A collapsible tree of the diagram. Groups and instances are levels: clicking one opens it.
    Other blocks are leaves: clicking one opens its level, selects it and centers it.
  - Change and risk dots on the tree items.
  - A legend of block kinds and wire colors at the bottom.
  - The panel can be hidden from the top bar.
- Top bar: the current level's name, an "↑ parent" button (Esc does the same), Before/After and
  Risks.
- White blocks with soft shadows, a colored icon badge per `kind`, the label, inputs as dots on
  the left with their names in grey, outputs on the right.
- Triggers rounded and light blue. Groups as dashed frames with their name.
- Thin grey wires.
- In **After** view, a colored bar on the block's edge or the wire: green for `new`, amber for
  `modified`. A dot in the corner marks an open risk.
- Wires with incompatible types in red; nominal mismatches in amber (§5.6).
- Unexplored groups as closed boxes with a subtle "unexplored" style.

### 6.3 Interactions
- **Hover a wire:** tooltip with the type, its expanded shape, and `source → target`.
- **Click a block:** side panel led by **What it does** (`desc`) and **How it works** (`logic`), then
  context (triggers), typed inputs and outputs, code (`file › symbol`), what changes, instances
  ("used in N places"), and risks.
- **Double-click a `group` or `instance`:** enter it (its children or `body`). The structure panel
  and the "↑ parent" button show where you are. Esc goes up one level.
- **Double-click an unexplored group:** a panel explains it hasn't been explored yet and offers a
  "Copy request for Claude" button with a ready prompt (`Explain "<label>" (<id>) in <file>`).
- **Layers:**
  - A view is rooted at one level (the file root, or the group or instance you entered). The
    view opens child groups breadth-first, as dashed frames with their nodes inside, as long as the
    view stays within a node budget (about 25 visible nodes). Groups that don't fit, and every
    unexplored group, are **closed boxes** with their boundary ports until entered.
  - `subject.focus?` (a group id) lets Claude choose the view the app opens on, so the change
    under review is the first thing the user sees.
  - Inside a group or instance, wires to outside nodes appear as **boundary pins** on the left
    (inputs) and right (outputs) edges, each labeled with the outside node and port — like the
    I/O of a PLC block.
  - Layout is computed **per level**: one elkjs layout per view, with open groups as single-level
    compound nodes.
- **Affected instances propagate:** if a `blockType` changes, all instances are marked at every
  level, and a closed box containing affected instances shows the mark too, so nothing stays
  hidden four levels down.
- **Before / After** (design mode only):
  - **Before** hides `new` items, shows `removed` items normally and applies `before` fields, with
    no change colors.
  - **After** shows the proposal: green for `new`, amber for `modified`, and `removed` items as
    faded, dashed ghosts in red, so you can see what goes away.
  - A wire is hidden in a view whenever either end is hidden in that view.
- **Risks:** a button with the number of open risks lists them; clicking one highlights its `refs`.
- **Live reload:** when the file changes on disk, the app updates and keeps the user on the same
  level.
- **Invalid JSON:** a clear message with the validation errors, never a blank screen.

### 6.4 Phase 2 (not in the first delivery)
- Editing directly in the UI, saved back to the JSON: rename blocks and ports, change a port's type,
  edit descriptions (done in phase 2e, §6.9, which leaves creating wires to the agent).
- Dragging blocks and saving positions (done in phase 2b, §6.6).

Claude sees UI edits by reading the file.

### 6.5 Phase 2a: readability and connectors

The first real Understand run (a 33-block ingestion pipeline across a web app, a worker and
cloud services) was valid but hard to read. The causes, and what this phase does about each:

| Cause | Fix |
|---|---|
| A closed box got one port per inner port that crossed its edge (about 25 per side) | **Bundled box ports:** one port per box side and outside endpoint. The label is the inner port name when there is one, otherwise `first +N` |
| Shared stores and services (a database read and written by ten blocks) pulled long wires across the whole diagram | **Labeled connectors**, as in schematics and FBD |
| The top level had 20 blocks, so nothing could open within the budget | **Structure rules in the skill** |
| Free curves crossed each other | **Orthogonal routes** from ELK, drawn with rounded corners |

**Labeled connectors (net labels / off-page connectors).** Gabriel's call, from electronics
schematics and FBD:
- Instead of a long line, a wire can be drawn as a short stub to a **flag** with the name of the
  other end. The flag is an arrow pointing in the direction of the flow:
  - at an output, it points away ("goes to");
  - at an input, it points into the block ("comes from").
- Clicking a flag highlights the other end and brings it into view.
- Hover shows the same tooltip as a wire.
- A wire is drawn with connectors when it says `draw: "label"`, or when the layout finds it hard
  to follow (§6.7). The first version also flagged every wire of a **hub** (a `state` or `external`
  block connected to 3 or more blocks); §6.7 dropped that rule.
- A hub keeps its block, with one flag per port listing how many blocks it connects to. Each
  block on the other side gets its own flag with the hub's name.
- `draw: "line"` forces a line.
- Boundary pins inside a group use the same flag look, since they are off-page connectors to the
  level above.

**Links between diagrams.** One subject can be split into several files, one per system, linked
with `see` (§5.2):
- The viewer serves every `*.logic.json` in the folder of the opened file.
- The structure panel lists them.
- A block with `see` shows a link badge, and its side panel has an "Open diagram" button.
  Double-clicking a block that has `see` and cannot be entered opens the linked diagram, on the
  linked block when one is named.
- The hash carries the file.
- `validate` warns when a linked file or block does not exist.

**Skill structure rules:**
- About 5–12 blocks per level.
- The top level tells the story in a few groups, one per system or stage.
- A store or service used by one area lives inside that area's group.
- Wire drawing is left to the viewer: no `draw` unless the user asks (§6.7).
- A subject with more than about 40 blocks, or with several separately deployed systems, is split
  into one file per system, linked with `see`.

### 6.6 Phase 2b: arranging blocks by hand

Automatic layout stays the default; dragging only refines it. Calls made by Claude:

- **Dragging.** Every block, flag and boundary pin can be dragged. An open frame is dragged by its
  label; the rest of the frame lets clicks and pans through, so big frames don't get in the way.
  Children move with their frame, and a frame grows while a child is dragged past its edge.
- **Snap to wires.** A dragged block snaps level with the other end of one of its wires when it
  comes within 10 px, so wires can be made straight by hand.
- **Saving.** On drop, the level is saved in `<subject>.layout.json`, next to the diagram:
  - `levels` maps a level (its path joined with `/`, `""` for the top) to view node ids and their
    positions relative to their frame;
  - the whole level is saved, so a later automatic layout can't move blocks that weren't dragged;
  - keys are sorted and each position is on one line, so diffs stay small. The file is meant to
    be committed with the diagram.
- **Changes to the diagram.** Saved blocks keep their place. Blocks the save doesn't know yet go
  where the automatic layout puts them, shifted as much as their saved neighbors moved and pushed
  down until they cover nothing. Entries for blocks that no longer exist are ignored.
- **Wires.** ELK's route is kept while both ends are where ELK put them. Otherwise the wire is a
  plain orthogonal step between its ports.
- **Auto layout.** A button on a level that has saved positions drops them and lays it out again;
  the file is removed once no level has positions.
- **Server.** `PUT /api/layout?file=<diagram>` writes the file atomically. It needs a JSON
  content type and a same-origin request, so other web pages can't write it. If saving fails,
  the viewer keeps the arrangement until reload and says it wasn't saved.
- The agent never writes the layout file. Before and After share one arrangement per level.
- **Selecting several blocks** (added after Gabriel tried it): click selects, Shift/Cmd/Ctrl-click
  adds, Shift-drag draws a selection box, Cmd/Ctrl+A selects the level, Esc clears it. Dragging
  any selected block moves them all; a block dragged alone still snaps to its wires.

### 6.7 Phase 2c: lines first, connectors as the last resort

Gabriel's feedback on phase 2a: on a software diagram, flags where a plain line would do make the
flow harder to read, not easier. Flags are for real tangles: wires that overlap or cross several
others, and wires that run from blocks far to the right back to blocks far to the left. The rules
now:

- **Lines by default.** No wire becomes flags because of what it connects (the hub rule is gone),
  and the skill no longer sets `draw`.
- **After a layout, a wire becomes flags when:**
  - it crosses or runs on top of 3 or more other wires (wires sharing a block don't count). The
    worst wire goes first, since flagging it also clears the crossings of the others;
  - it is longer than 1400 px and crosses another wire, or longer than 2400 px;
  - it runs backwards (a loop) and is longer than 900 px and crosses another wire, or is longer
    than 1800 px.
  Then the level is laid out again, up to three layouts in all.
- **Cycle breaking is chosen per level.** Which wire of a loop runs backwards decides most of the
  picture, and no single ELK strategy wins on every diagram. Each layout tries depth-first,
  greedy, greedy by model order and model order (the order blocks are written in), and keeps
  the cheapest. The cost is the length of the wires left as lines, with backward wires counted
  double, plus 800 px for each wire that would become flags. The skill writes blocks in story
  order so that model order means something.
- **Triggers** at the top of a level are pinned to the first column.
- **Flags sit next to their block** in the node order, so model-order layouts keep stubs short.
- **One flag per pair of blocks**: several wires between the same two blocks share one flag at
  each end.

On the first real diagram (an ingestion pipeline in four linked files), the overview, web and
stg diagrams went from 26 flags to 4 (two wires: the store reads that looped around everything).
The stg diagram is all lines, in the order the flow runs. The worker level, which is very wide,
went from 22 flags to 13, on its longest wires.

### 6.8 Phase 2d: seeing the data

**Why.** On Case A (the multi-step wizard), Gabriel kept getting lost in the wizard's state: what
each step showed, where the answers lived in the browser (component state, a global store, Redux,
Zustand, browser storage?), and what went to the database. On a backend block (a FastAPI
endpoint, say) the same question is: what is the request body's model, how do its fields travel
through the queries, and what comes out (200, 422). Building frontend, knowing the shape of the
data and where it lives is what keeps you from getting lost. In Design mode it is also what stops
a new step from creating a second store when an existing one already holds the data it needs.

The format already had most of this (`state` blocks with `valueType`, `read`/`write` wires, named
types). What was missing: where a state lives, and a clear place in the viewer to see the data.

**Principles (Gabriel's call):**
- The UI stays clean: everything about data starts collapsed, and each item gets at most two
  lines of description until it is opened.
- The JSON stays simple, so Claude has little to get wrong. Almost everything shown is computed
  from what the file already has.

**Format additions** (§5):
- `state.store` (string, new): where the state lives and how long it lasts, in a few words of free
  text, e.g. `"Zustand store · lost on reload"`, `"localStorage · survives reload"`,
  `"Postgres table bookings"`, `"Redux slice booking"`. Free text, not a catalog, so Claude does
  not have to fit reality into categories. `validate` reports a missing `store` as a notice
  (`missing-store`), like `missing-desc`.
- `typeInfo` (new top-level map, `{ Name: { desc?, code? } }`): optional notes on a named type:
  `desc` (one or two lines: what it is, where it comes from) and `code` (`{ file, symbol }`, e.g.
  the Pydantic class or TypeScript interface). `types` itself does not change. A separate map, not a
  long form of the type entry, because type expressions are already objects (`{ field: Type }`)
  and a reserved key could clash with a real field name. `validate` errors on a `typeInfo` entry
  whose name is not in `types`; `--check-code` checks its `code` like any other.
- HTTP responses are ordinary outputs named by status code (`"200"`, `"422"`). No new field.

**The Data box.** When a block is clicked, the side panel shows a **Data** section, visually
distinct from the rest of the panel (its own tinted box, so it is clearly "the data part"),
between the explanation and the code reference. Collapsed by default, it shows one summary line
("Reads 3 · Writes 2"). Opened, it has:

- **Reads:** what the block takes in: every input port and every `read` wire from a `state`.
- **Writes:** what it puts out: every output port and every `write` wire to a `state`.
- **Responses** (only when present): outputs whose name is a 3-digit HTTP status code.

Each item is one collapsed row:
- the port or state name and its type name;
- where it lives, as a small badge: the state's `store`, or for a port the block on the other end
  of its wires ("from Step 1: Trip", "to Save answers");
- up to two lines of description: the state's `desc`, else the type's `typeInfo.desc`;
- opened, the row shows the type's fields as a small table (field, type), nested objects as
  expandable rows, and a link to the type's `code` when `typeInfo` has one.

Rows and sections remember nothing between clicks; everything opens collapsed again.

**On a `state` block**, the Data box shows **Read by** and **Written by** instead: the blocks on
its wires, in flow order, each clickable. That answers "who already uses this store?".

**On a group or closed box**, the Data box shows only the data that crosses its edge: the
boundary ports the viewer already computes and the states inside read or written from outside
(or the other way round). This is how one section relates to another. What happens inside is not
listed: a muted line ("+5 more inside · double-click to open") says there is more.

**Skill rules (Gabriel's call, wording Claude's):**
- Every `state` gets a `store`. Write what the code actually uses (the library and, when it
  matters, whether it survives a reload); never guess a category.
- Give `typeInfo.desc` and `code` to the types that matter for understanding (request and
  response models, the wizard's draft object), not to every primitive alias.
- **Reuse before creating.** In Design mode, before proposing a new `state`, look for an existing
  store in the area that already holds that data, and wire the new blocks to it. A new store needs
  a reason in its `changeNote`.
- `validate` helps: a notice (`similar-store`) when a `new` state has the same `valueType` as an
  existing one in the file.

**Not in this phase** (see §6.10): showing shared data for several selected blocks, a canvas
strip grouping states by where they live, and a canvas mode that follows one piece of data.

### 6.9 Phase 2e: small edits in the viewer, as proposals for the agent

**Why.** When Claude proposes a diagram, many corrections are small and faster to make by hand
than to describe in chat: add a field Claude missed to the data on an input, rename a block, a
variable or a function so it reads in the team's own words, change how a trigger behaves, drop a
block, or leave a note on a block saying what should change. Bigger changes (a function's
internals, the architecture, new blocks and wires) stay in the chat with the agent.

**What an edit means (Gabriel's call).** An edit in the viewer is a **proposal for the agent to
implement**, not just a nicer drawing. Renaming a block, port or function means "use this name in
the code". So edits are written into the diagram with the Design-mode marks the format already
has, and the agent reads them from the file.

**What can be edited** (in the side panel; each editable field shows a pencil on hover, there is no
separate edit mode):
- a block's `label`, `desc` and `code.symbol`;
- port names (wires that use the port are updated; on a blockType, its body's pins too);
- a port's type, as a type expression (checked as you type);
- the fields of a named type: add, remove or rename a field, change a field's type;
- a trigger's `source` and its `context` (`from`, `modes`);
- remove a block or a wire;
- a **note** on a block or a wire.

Edge cases (Claude's calls):
- **Instances.** An instance's ports come from its blockType, so renaming or retyping a port on
  an instance edits the blockType, and the field says so before the edit applies ("Changes all N
  uses of OtherOption"). The same code is used in every place, so one rename is one rename in the
  code. `label`, `desc` and `note` edited on an instance stay on the instance. BlockTypes have no
  block of their own on the canvas, so they are edited through any of their instances.
- **Types.** Only plain object types (`{ field: Type }`), named or written inline on a port, get
  the field table editor. Unions, records, arrays and aliases are edited as one type expression.
- **Groups.** Removing a group marks it and everything inside it removed, and the panel says how
  many blocks that is before applying it.
- **Restore.** A block or wire marked `removed` by an edit shows **Restore** in its panel, which
  takes the mark back. Undoing other single edits stays in §6.10.
- **Wires can be selected.** Today a wire click only shows the tooltip. A click now selects the
  wire and opens a small wire panel (type, `from → to`, note, remove, copy).
- **Linked files.** A draft belongs to one file. Several files can have drafts at once; the
  structure panel shows a dot on each file with unsaved edits, and the bar covers the file on
  screen.

Not editable in this phase: adding blocks or wires, changing a block's `kind` or `parent`, risks,
blockType bodies beyond their port names. These are asked of the agent, in a note or in chat.

**How edits are marked** (Claude's call, following §5.2):
- Editing an `existing` node, wire or blockType sets `change: "modified"` and stores the field's
  original value in `before` (only the first time; `before` always holds the value before any
  edit). Setting a field back to its original value removes it from `before`, and the mark goes
  when `before` is empty.
- Editing a `new` item changes it in place, with no `before`.
- Removing an `existing` block or wire sets `change: "removed"` (its wires are removed with it).
  Removing a `new` one deletes it.
- Editing a named type's fields marks it in `typeInfo` (`change: "modified"`, `before`: the old
  type expression), and the wires carrying that type show as affected.
- The first edit on a file in `understand` mode switches it to `design`.
- A **note** is not a change: it adds `note` (string, new, on nodes and wires) without marking
  anything or switching the mode. A block with a note shows a small note badge.
- Edits happen in the After view. Before is read-only.

**The draft (Gabriel's idea, details Claude's call).** The file in the repo is not touched while
the user edits:
- The first edit creates `<subject>.draft.json` next to the diagram, holding the edited document
  and a copy of the original file as it was when editing started. The copy is used to detect
  changes on disk and to list what the user changed. Every edit rewrites it
  (debounced). A reload of the viewer picks the draft up, so nothing is lost.
- The draft file is also how the agent knows someone is editing (see the skill rules below).
- A bar at the bottom of the viewer shows "N unsaved changes · Save · Discard". Discard deletes the
  draft.
- **Save** validates the draft first. If it has errors (two ports with the same name, a type that
  doesn't parse), Save is disabled and the bar says what is wrong. Otherwise the server writes the
  draft over the diagram atomically and deletes the draft.
- **If the diagram changed on disk while the user was editing** (the agent edited it), the user's
  version wins: the save goes through, and the other version is kept as `<subject>.review.json`
  for the agent to review. The bar says so before saving ("The diagram changed on disk while you
  edited. Saving keeps your version; the other one is kept for review."). Until then, the viewer
  keeps showing the draft.
- The names end in `.draft.json` and `.review.json`, not `.logic.json`, so neither shows up as a
  diagram in the structure panel or in links. The server watches them too.
- Server: the endpoints follow the layout file's rules (§6.6): JSON content type, same-origin
  only, atomic writes.

**Copy for agent.** Every way of handing something to the agent says "agent", not "Claude", in
the UI, so the same viewer works with Codex later. The existing "Copy request for Claude" button
and the "Ask Claude…" hints are renamed accordingly.
- **After a save**, the bar offers **Copy for agent**: a short request listing what the user
  changed. It is built from a diff of the draft against the original copy, not from the marks, so
  on a file already in Design mode it lists only the user's edits, including edits to the agent's
  own `new` items, which carry no mark. Example:
  ```
  I edited logic/booking.logic.json in the viewer. Please review and implement:
  - Renamed "Step 2" → "Travelers step" (step2)
  - TravelersIn: added field leadPhone: string
  - Removed "Legacy check" (legacyCheck)
  - Note on "Save answers" (saveAnswers): save the draft before calling the API
  ```
- **One block:** a small copy icon in the side panel header, tooltip "Copy reference for agent".
  It copies a reference, not the JSON:
  ```
  logic/booking.logic.json
  - "Step 2: Travelers" (id: step2Travelers, function) → src/steps/Travelers.tsx · Travelers
  ```
  The file path comes first because a subject can be split into several linked files.
- **Several blocks:** when more than one block is selected (§6.6), the side panel shows
  "N blocks selected" with a **Copy for agent** button: the same reference, one line per block,
  under the file.
- **A wire:** the wire's tooltip has the same copy icon (`from → to`, its id and type).

**Skill rules** (the agent's side of the deal):
- Before editing a diagram, check for `<subject>.draft.json`. If it exists, the user has unsaved
  edits in the viewer: don't edit the diagram; say so and wait (or work on something else).
- The user's request arrives as the pasted "Copy for agent" text; when the user only says "I
  edited the diagram", read `git diff` on the file. Treat what changed as requests: a renamed
  block, port or symbol means rename it in the code;
  an added field means add it to the model; a removed block means remove it from the design.
- A `note` is a request. Implement it, then delete the note.
- If `<subject>.review.json` exists, the agent's own edits were set aside by a save. Compare it
  with the diagram, re-apply what still makes sense on top of the user's version, then delete it.
- §8.6 (fold back after implementing) also drops any remaining `note` and the `typeInfo` marks.

### 6.10 Open improvements

Ideas kept for later, to be picked up as real use shows which matter. Gabriel adds to this list
as he tries the skill.

- Shared data when several blocks are selected.
- A canvas strip that groups states by where they live (component, store, browser, server,
  database).
- A canvas Data mode that follows one piece of data through every block that reads or writes it.
- Adding blocks and wires from the UI.
- Undo for single edits (today: Discard drops the whole draft).
- An audit trail of edits beyond what git history and the change marks already give.

## 7. CLI

- `logic-builder open <file.json>`: validates, starts a local server that serves the prebuilt app,
  watches the file and notifies the app on change. Opens the browser and prints the URL.
- `logic-builder validate <file.json>`: validates against the JSON Schema and checks integrity:
  - `node.port` references exist (including ports in `before` for `removed` wires);
  - `parent`, `of` and `refs` resolve;
  - ids are unique.

  It also checks:
  - ids are unique per the scope rules in §5.2;
  - pins match their blockType ports;
  - no group has both children and declared ports.

  It prints readable errors so Claude can fix them on its own.
- `validate --check-code <repo-root>` (optional) also warns when a `code.file` doesn't exist, or
  when a `code.symbol` doesn't appear in its file (plain text search). This catches stale diagrams
  before they are reused. Items marked `new` are skipped.

The CLI is Node. The app ships prebuilt inside the plugin, so nothing is installed in the user's
repo.

## 8. Skill

Name: `logic-builder`. One skill, two modes.

### 8.1 When it is used (Gabriel's call: ask first)
- **Explicit request** — "explain X with a diagram", "map the logic of Y", "design this as a logic
  diagram", or the user wants to express their own idea as a diagram: use it without asking.
- **Design, not requested:** for a feature or change with non-trivial logic, Claude **offers** the
  skill in one line and waits. Using it means launching the app, and simple tasks don't warrant it.
- **Simple tasks:** don't even offer.

The skill's description must make these rules clear so it never triggers on its own.

### 8.2 Method
**Understand:**
1. Fix the subject and its boundary: what is inside, and what is `external`.
2. Read only that code.
3. Identify the state and the triggers, with their context.
4. Draw the top level with blocks mapped 1:1 to code.
5. Explain every block: `desc` (what it does) and, for functions, decisions and blockTypes, `logic`
   (how it works, as short ordered steps in plain language).
6. Leave sub-areas as unexplored groups.
7. Name the types on the wires.
8. Note fragile spots as risks.
9. Expand one layer at a time when asked.

**Design:**
1. Start from an Understand diagram of the area.
2. Detect repeated patterns and turn them into `blockTypes` with instances.
3. Mark new, modified (with `before`) and removed blocks and wires.
4. Explain new and modified blocks (`desc`, `logic`), and say what changes in `changeNote`.
5. Look for risks, especially where a type changes and every wire it travels on.

### 8.3 Contents
- `SKILL.md`: when to use, both methods, the workflow.
- A format reference (§5), loaded on demand.
- The JSON Schema.
- Two complete examples, loaded on demand:
  - the questionnaire with "Other" (design);
  - an auth/roles gate (understand, with unexplored groups).

### 8.4 Workflow
validate → open the app → wait for the user → iterate by editing the JSON → (design) on approval,
ask whether to continue to the implementation plan with the JSON as its basis → after
implementation, fold the diagram back into Understand (§8.6).

### 8.5 Where files go
`logic/<subject-id>.logic.json` at the root of the repo being worked on.

### 8.6 Diagrams are living documentation (Gabriel's call)
`logic/*.logic.json` files are **committed** in the user's repo and kept up to date. Old versions
are not kept as separate files; git history holds them.

- **After a design is implemented,** the skill turns the file back into an Understand diagram:
  - set `mode: "understand"`;
  - `new` and `modified` become `existing`;
  - `removed` items are deleted;
  - `before` and `changeNote` are dropped;
  - resolved risks are dropped, open ones stay;
  - `code` references are updated to the real files and symbols.

  It then runs `validate --check-code` and commits the file along with the implementation.
- **Before reusing a diagram** (Understand or Design on an area that already has one), the skill
  runs `validate --check-code` and updates whatever is stale before building on it.
- **One file per subject.** A new change to the same area updates that file instead of creating a
  new one.

## 9. Packaging and distribution

A Claude Code plugin built in this folder, containing the skill, the CLI, the prebuilt app, the
schema and the examples. Internal structure is the builder's call, following Claude Code plugin
conventions.

**Distribution (Gabriel's call), in stages:**
1. **Local use.** Gabriel installs it locally and refines it on real work.
2. **Public open-source GitHub repo**, with Gabriel as author.
3. **Claude Code plugin marketplace.** The repo includes what's needed to install from a
   marketplace.
4. **Later, a Codex plugin.** So that this needs no rewrite, the format, schema, CLI and app don't
   depend on Claude Code; only the skill/plugin layer is agent-specific.

Consequences:
- The folder becomes a git repo.
- The prebuilt app is committed inside the plugin, since marketplace users won't build anything.
- The skill calls the CLI through the skill's base directory, which Claude Code prints when a skill
  loads ("Base directory for this skill: …"): `node "<base>/../../dist/cli.mjs" …`.
  `${CLAUDE_PLUGIN_ROOT}` is not expanded inside SKILL.md text. Putting the CLI on the user's PATH
  is optional.
- License: **MIT** (Claude's call, easy to change).
- README written for an external audience.
- **Everything in English:** code, comments, UI text, docs, examples. Conversation with Gabriel is in
  Spanish; nothing built is.
- **No client or company-internal code, data or names in the repo.** Examples are written from
  scratch and generic.

## 10. Success criteria

1. **Works on real work.** The plan ends with an acceptance phase run together with Gabriel on
   real repos of his. Scenarios and resulting diagrams live in a git-ignored `local/` folder and are
   never published. For example:
   - **Understand:** explain one area of an existing app (like Case B's authorization) top-down,
     expanding two layers on request, and Gabriel can explain that logic back afterwards.
   - **Design:** propose a change on an existing flow (like Case A), and the diagram shows the
     state, the instances of repeated patterns at their different depths, and the integration risks
     that would have caused bugs.
2. Gabriel, opening the app, understands the flow and the change within a few minutes without
   reading the JSON.
3. An invalid JSON is caught by `validate`, and Claude fixes it unaided.
4. Editing the JSON on disk shows up in the app without a manual reload.
5. The bundled examples validate and render (automated test).

## 11. Calls made by Claude (to review)

- **Format:** English keys; labels in the user's language.
- **App:** TypeScript + Vite + `@xyflow/react` + `elkjs`; light background with white blocks.
- **Files:** `logic/<subject-id>.logic.json`.
- **Pins:** `pin` nodes exist only inside `body`.
- **Before view:** a `before` field on modified nodes.
- **Types:** nominal, with three wire results — OK, amber warning, red error (§5.6).
- **Layers:**
  - one level per view;
  - deeper groups closed;
  - boundary pins inside a group;
  - affected marks propagate upward.
- **Understand mode:** `explored: false` for unexplored groups, plus a "Copy request for Claude"
  button.
- **Phase 2:** dragging and saved positions move here.
- **Ids:** one id namespace per file; each `body` is its own scope (`"Type/id"` in risk refs).
- **Group ports:** computed from crossing wires. Only unexplored groups declare ports, and
  exploring a group rewires them.
- **`before`:** allowed on nodes, wires and blockTypes. A change of `kind` is modeled as
  removed + new.
- **Removed items:** shown as red dashed ghosts in After.
- **First view:** breadth-first opening within a node budget, plus `subject.focus`.
- **Stale references:** `validate --check-code` warns about code references that no longer exist.
- **Real-repo testing:** acceptance phase with Gabriel; private scenarios in a git-ignored
  `local/` folder.
- **Skill cost targets:** see §2.
- **After design approval:** Claude asks before moving to the plan.
- **Distribution:**
  - MIT license;
  - prebuilt app committed;
  - CLI called via the skill's base directory (`<base>/../../dist/cli.mjs`).

## 12. Left to the builder

- Internal structure of the plugin and app code.
- Depth of the structural type check (no false reds).
- Fine visual details (icons, spacing, animation) within §6.1.
- Live-reload mechanism (SSE, WebSocket, polling).
- Tests: at minimum, the validator with valid and invalid cases, and that both examples render.

---

## Appendix A — Full example (design mode)

The canonical, up-to-date version of this example (including `desc` and `logic` on every block)
is `skills/logic-builder/examples/other-free-text.logic.json`. The JSON below shows the structure.

```json
{
  "version": "0.1",
  "subject": {
    "id": "other-free-text",
    "title": "'Other' option with free text",
    "intent": "Accept answers outside the list on selection questions",
    "scope": "Intake questionnaire (wizard)",
    "mode": "design",
    "focus": "vaccines"
  },
  "types": {
    "QuestionId": "string",
    "OptionId": "number",
    "Answer": { "oneOf": [
      { "kind": "'option'", "optionId": "OptionId" },
      { "kind": "'text'", "text": "string" }
    ]},
    "Answers": "Record<QuestionId, Answer>"
  },
  "blockTypes": {
    "OtherOption": {
      "label": "Other option",
      "inputs": { "selected": "OptionId?", "text": "string?" },
      "outputs": { "answer": "Answer" },
      "code": { "file": "src/questionnaire/OtherOption.tsx", "symbol": "OtherOption" },
      "change": "new",
      "body": {
        "nodes": [
          { "id": "in-sel", "kind": "pin", "label": "selected", "outputs": { "selected": "OptionId?" } },
          { "id": "in-txt", "kind": "pin", "label": "text", "outputs": { "text": "string?" } },
          { "id": "dec", "kind": "decision", "label": "Has text?",
            "inputs": { "selected": "OptionId?", "text": "string?" },
            "outputs": { "yes": "string", "no": "OptionId" } },
          { "id": "mkText", "kind": "function", "label": "Build text answer",
            "inputs": { "text": "string" }, "outputs": { "answer": "Answer" },
            "code": { "file": "src/questionnaire/OtherOption.tsx", "symbol": "toTextAnswer" } },
          { "id": "mkOpt", "kind": "function", "label": "Build option answer",
            "inputs": { "optionId": "OptionId" }, "outputs": { "answer": "Answer" },
            "code": { "file": "src/questionnaire/OtherOption.tsx", "symbol": "toOptionAnswer" } },
          { "id": "out", "kind": "pin", "label": "answer", "inputs": { "answer": "Answer" } }
        ],
        "wires": [
          { "id": "b1", "from": "in-sel.selected", "to": "dec.selected" },
          { "id": "b2", "from": "in-txt.text", "to": "dec.text" },
          { "id": "b3", "from": "dec.yes", "to": "mkText.text" },
          { "id": "b4", "from": "dec.no", "to": "mkOpt.optionId" },
          { "id": "b5", "from": "mkText.answer", "to": "out.answer" },
          { "id": "b6", "from": "mkOpt.answer", "to": "out.answer" }
        ]
      }
    }
  },
  "nodes": [
    { "id": "wizard", "kind": "group", "label": "Wizard" },
    { "id": "vaccines", "kind": "group", "parent": "wizard", "label": "Step: Vaccinations" },
    { "id": "conditions", "kind": "group", "parent": "wizard", "label": "Step: Known conditions",
      "explored": false, "desc": "Category → condition → Other, four levels deep" },
    { "id": "t-select", "kind": "trigger", "source": "user", "parent": "vaccines",
      "label": "Click option",
      "context": { "from": "Vaccinations › List", "modes": ["create", "edit"] },
      "outputs": { "optionId": "OptionId" } },
    { "id": "t-other", "kind": "trigger", "source": "user", "parent": "vaccines",
      "label": "Type in 'Other'",
      "context": { "from": "Vaccinations › List › Other", "modes": ["create", "edit"] },
      "outputs": { "text": "string" }, "change": "new" },
    { "id": "other-vaccines", "kind": "instance", "of": "OtherOption", "parent": "vaccines",
      "label": "Other: add vaccine", "change": "new" },
    { "id": "save", "kind": "function", "label": "Save answer",
      "code": { "file": "src/questionnaire/useAnswers.ts", "symbol": "saveAnswer" },
      "inputs": { "answer": "Answer" }, "outputs": { "answers": "Answers" },
      "change": "modified", "changeNote": "Used to take optionId: number; now takes Answer",
      "before": { "inputs": { "optionId": "OptionId" } } },
    { "id": "answers", "kind": "state", "label": "answers (store)", "valueType": "Answers",
      "change": "modified" },
    { "id": "review", "kind": "function", "label": "Review",
      "code": { "file": "src/questionnaire/Review.tsx", "symbol": "Review" },
      "inputs": { "answers": "Answers" }, "outputs": { "payload": "Answers" },
      "change": "modified", "changeNote": "Must show the free text" },
    { "id": "api", "kind": "external", "label": "POST /questionnaire",
      "inputs": { "payload": "Answers" }, "outputs": { "ok": "boolean" } },
    { "id": "done", "kind": "result", "label": "Answer saved", "inputs": { "ok": "boolean" } }
  ],
  "wires": [
    { "id": "w0", "from": "t-select.optionId", "to": "save.optionId", "change": "removed" },
    { "id": "w1", "from": "t-select.optionId", "to": "other-vaccines.selected", "change": "new" },
    { "id": "w2", "from": "t-other.text", "to": "other-vaccines.text", "change": "new" },
    { "id": "w3", "from": "other-vaccines.answer", "to": "save.answer", "change": "new" },
    { "id": "w4", "from": "save.answers", "to": "answers", "op": "write" },
    { "id": "w5", "from": "answers", "to": "review.answers", "op": "read" },
    { "id": "w6", "from": "review.payload", "to": "api.payload" },
    { "id": "w7", "from": "api.ok", "to": "done.ok" }
  ],
  "risks": [
    { "id": "r1", "severity": "high", "status": "resolved",
      "title": "Numeric text taken as an ID",
      "detail": "If saveAnswer receives a bare number, '25' is read as optionId 25.",
      "resolution": "Answer carries kind: 'option' | 'text'",
      "refs": ["save", "w3", "OtherOption"] },
    { "id": "r2", "severity": "medium", "status": "open",
      "title": "Editing must reopen 'Other' with its text",
      "refs": ["review", "other-vaccines"] }
  ]
}
```
