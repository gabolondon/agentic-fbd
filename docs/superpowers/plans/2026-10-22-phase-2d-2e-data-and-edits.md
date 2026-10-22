# Phase 2d + 2e: Data Box and Edits in the Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the data each block reads and writes, and where it lives, in a collapsed Data box
(phase 2d). Then let the user make small edits in the viewer, kept in a draft and saved as a
proposal the agent implements (phase 2e).

**Architecture:** The logic lives in `@logic-builder/core` as pure functions tested with vitest:
- `dataBox()` computes what a block reads and writes;
- `applyEdit()` applies one edit with Design-mode marks;
- `summarizeEdits()` and `copyReference()` build the text handed to the agent.

The CLI server stores the draft next to the diagram (`<subject>.draft.json`) and saves it with
the same same-origin rules as the layout file. The React viewer stays a thin layer over those
functions. Phase 2d ships on its own before 2e starts.

**Tech Stack:** TypeScript, React 19, `@xyflow/react` 12, elkjs, Node `http`, vitest, Playwright.
No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-logic-builder-design.md`: §6.8 (Phase 2d), §6.9
(Phase 2e) and §5 (format). §6.10 is out of scope.

## Global Constraints

- Everything built is in English: code, comments, UI text, docs, examples, commit messages.
- No client or company-internal code, data or names anywhere. Examples are generic and written from scratch.
- UI text says "agent", never "Claude" (§6.9 "Copy for agent"), so the viewer also works with Codex later.
- The UI stays clean. Everything about data starts collapsed, and each item shows at most two lines of description until opened (§6.8).
- The JSON stays simple. New fields are only `state.store`, `typeInfo`, `note`, plus `before.source` and `before.context` on nodes. Everything else in the Data box is computed.
- `SKILL.md` stays around 200 lines or less (today 152). Detail goes in `references/format.md`.
- Type checks: no false reds (§5.6).
- `dist/` is committed. Every task that changes the viewer or CLI ends with `npm run build`, and `npm run check:dist` must pass before the phase's last commit.
- Server writes are same-origin only, require a JSON content type, and are atomic (temp file + rename), like `PUT /api/layout` (§6.6).
- Saved diagrams are written as `JSON.stringify(doc, null, 2) + '\n'`, the format of the bundled examples.
- The agent never writes `.draft.json` or `.layout.json` files.
- Commits go on `main` with the `Co-Authored-By` line from the session.

## Review Focus

Failure modes the spec implies that no feature test below would hit by accident. The test that
pins each one is added to its owning task (marked **[RF1]**…**[RF5]**).

1. **[RF1]** Renaming a port of an `existing` block that has wires. The Before view must still draw those wires on the old port name, not lose them (Task 7).
2. **[RF2]** The diagram changes on disk while a draft is open. Save keeps the user's version and writes the disk version to `.review.json`. Nothing is lost, including when the disk version is invalid JSON (Task 9).
3. **[RF3]** A rename that collides or blanks something: a port renamed to a name already on that side, an empty label. Save must be blocked with a readable reason, and the file never ends up invalid (Tasks 7 and 10).
4. **[RF4]** Reloading the page, or restarting `logic-builder open`, while a draft exists. The viewer shows the draft and the bar, not the untouched original (Tasks 9 and 10).
5. **[RF5]** Removing a `new` block that a risk or `subject.focus` points to. The saved file must still validate (Task 7).

---

## File Structure

**Core (`packages/core/src/`)**
- `format.ts` (modify): `LogicNode.store`, `LogicNode.note`, `Wire.note`, `NodeBefore.source` / `.context`, `TypeInfo`, `LogicDoc.typeInfo`.
- `data/dataBox.ts` (create): `dataBox()` and the field table helper `typeFields()`.
- `edit/applyEdit.ts` (create): the `Edit` union and `applyEdit()`.
- `edit/summary.ts` (create): `summarizeEdits()` and `countEdits()`.
- `edit/reference.ts` (create): `copyReference()`.
- `draftFile.ts` (create): `draftFileName()`, `reviewFileName()`, `DraftFile`, `parseDraft()`.
- `validate/integrity.ts` (modify): `unknown-type-info`, `missing-store` and `similar-store`.
- `viewModel/index.ts` (modify): edges carrying a modified type get `mark: 'affected'`.
- `index.ts` (modify): exports.

**Schema and skill:** `skills/logic-builder/references/logic.schema.json`, `references/format.md`, `SKILL.md`, `examples/*.logic.json`.

**CLI (`packages/cli/src/`)**
- `api.ts` (modify): draft in `/api/doc`; `PUT`/`DELETE /api/draft`; `POST /api/save`; watching the draft and review files; `draft` flag in `/api/files`.
- `checkCode.ts` (modify): checks `typeInfo[*].code`.

**Viewer (`packages/viewer/src/`)**
- `components/DataBox.tsx` (create): the Data section.
- `components/Editable.tsx` (create): `EditableText` (pencil on hover) and `FieldTable` (struct editor).
- `components/EditBar.tsx` (create): the bottom bar (unsaved count, Save, Discard, Copy for agent, review notice).
- `components/SidePanel.tsx` (modify): Data box; editable fields; note; Remove and Restore; copy icon; `wire` and `selection` panels.
- `components/NavPanel.tsx` (modify): a dot on files with drafts.
- `state/useDocument.ts` (modify): draft state plus `edit` / `discard` / `save`.
- `App.tsx` (modify): wire selection, the multi-selection panel, mounting `EditBar`.
- `styles.css` (modify).

**Tests:** `packages/core/test/{dataBox,applyEdit,summary,draftFile}.test.ts`, `packages/core/test/validate.test.ts`, `packages/cli/test/server.test.ts`, `tests/e2e/open.spec.ts`.

---

# Phase 2d: seeing the data

### Task 1: Format, schema and validation for `store` and `typeInfo`

**Files:**
- Modify: `packages/core/src/format.ts`, `skills/logic-builder/references/logic.schema.json`, `packages/core/src/validate/integrity.ts`, `packages/cli/src/checkCode.ts`
- Create: `tests/fixtures/invalid/integrity-unknown-type-info.logic.json`
- Test: `packages/core/test/validate.test.ts`, `packages/cli/test/validate.test.ts`

**Interfaces:**
- Produces:
  - `LogicNode.store?: string`;
  - `interface TypeInfo { desc?: string; code?: CodeRef; change?: 'modified'; before?: TypeExpr }`;
  - `LogicDoc.typeInfo?: Record<string, TypeInfo>`.

  `change` and `before` on `TypeInfo` are added to both the type and the schema now, so Task 7 does not touch the schema again.
- Issue codes:
  - `unknown-type-info` (error): a `typeInfo` key that is not in `types`;
  - `missing-store` (notice): one issue listing every `state` without `store`, worded like `missing-desc`;
  - `similar-store` (notice): a state with `change: "new"` whose `valueType` equals (`typeToString(parseType(..))`) the `valueType` of a non-new state in the same scope. Path: the new state's id. Message: `new state "<id>" holds the same type as existing "<otherId>"; reuse it if it holds the same data`.

- [ ] **Step 1: Write the failing tests** in `packages/core/test/validate.test.ts`:
  - `accepts store and typeInfo`: a doc with a state `{ store: 'Zustand store · lost on reload' }` and `typeInfo: { Booking: { desc: 'd', code: { file: 'a.ts', symbol: 'Booking' } } }` (Booking defined in `types`). Expect `valid === true` and no `missing-store`.
  - `reports a state without store as a notice`: expect `{ level: 'notice', code: 'missing-store' }` and `valid === true`.
  - `flags a new state that copies an existing one`: an existing state and a `new` state, both with `valueType: 'Draft'`. Expect `similar-store` with `path === '<new id>'`.
  - The invalid-fixture loop picks up the new fixture `integrity-unknown-type-info.logic.json` (a `typeInfo` key `Nope` not in `types`) with no new code.
  - Add `missing-store` and `similar-store` to `explanationCodes` in the same file, so the examples test keeps ignoring notices of this kind.
  - In `packages/cli/test/validate.test.ts`: `--check-code warns on a stale typeInfo code`, with `stale-code` at path `typeInfo/<Name>`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/validate.test.ts packages/cli/test/validate.test.ts`. Expected: the new tests FAIL. The schema rejects `store` and `typeInfo` (`additionalProperties`).
- [ ] **Step 3: Implement.**
  - Add `store` (string) to `$defs/node`.
  - Add top-level `typeInfo`: an object of `{ desc: string, code: codeRef, change: const "modified", before: typeExpr }` with `additionalProperties: false`.
  - Add the `format.ts` types.
  - Add `checkTypeInfo` (`unknown-type-info`) and `checkStores` (`missing-store`, `similar-store`) to `checkIntegrity`, at the root scope and in each body.
  - In `checkCode`, push `{ at: 'typeInfo/<Name>', code }` for each `typeInfo` entry with `code`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including the examples, which only get notices.
- [ ] **Step 5: Commit.** `feat(core): state.store and typeInfo in the format, with validation`

### Task 2: `dataBox()`, the Data box model

**Files:**
- Create: `packages/core/src/data/dataBox.ts`
- Modify: `packages/core/src/index.ts` (export)
- Test: `packages/core/test/dataBox.test.ts`

**Interfaces:**
- Consumes: `effectiveScope(doc, scope, mode)` (it skips ghosts), `portsOf`, `parseEndpoint`, `parseType` / `typeToString`, `TypeInfo` (Task 1).
- Produces:
```ts
export interface DataField { name: string; type: string; fields?: DataField[] }
export interface DataItem {
  /** Port name, or the state's label for a state end. */
  name: string;
  type?: TypeExpr;
  /** Set when `type` is a bare named type. */
  typeName?: string;
  /** Badge: the state's `store`, else "from A, B" / "to A, B" (labels of the other ends). '' when unwired. */
  where: string;
  /** state.desc, else typeInfo[typeName].desc. */
  desc?: string;
  /** Fields when the type resolves to an object (through names, `?` and `[]`); max depth 4. */
  fields?: DataField[];
  /** typeInfo[typeName].code */
  code?: CodeRef;
  /** The state node behind this item, if any (clickable in the panel). */
  state?: { scope: string; id: string };
}
export interface DataUse { label: string; scope: string; id: string }
export type DataBox =
  | { kind: 'block'; reads: DataItem[]; writes: DataItem[]; responses: DataItem[] }
  | { kind: 'state'; readBy: DataUse[]; writtenBy: DataUse[] }
  | { kind: 'boundary'; reads: DataItem[]; writes: DataItem[]; inside: number };
export function dataBox(doc: LogicDoc, scope: string, id: string, mode: ViewMode): DataBox | null;
export function typeFields(type: TypeExpr, types: TypeTable): DataField[] | undefined;
```
- Rules:
  - **block** (every kind except `state`, `group` and `pin`; instances use their blockType's ports): one `reads` item per input port and one `writes` item per output port, in declared order.
    - A port wired to a `state` takes `where = state.store ?? ''`, `desc = state.desc` and `state = {scope, id}`.
    - Outputs whose name matches `/^\d{3}$/` go to `responses` instead of `writes`.
    - `null` for an unknown id or a pin.
  - **state**: the blocks on `read` wires go in `readBy`, the blocks on `write` wires in `writtenBy`. Order: the order of the wires in the file (story order, §6.7). Deduplicated by id.
  - **boundary** (a `group`): wires with exactly one end inside the group's subtree.
    - Into the subtree → `reads`, out of it → `writes`.
    - One item per inner endpoint (`node.port`, or the state id). Its `name` is the port name, or the state label. Its `where` is the outside end.
    - `inside` = the number of descendant nodes, groups included.

- [ ] **Step 1: Write failing tests** on `skills/logic-builder/examples/other-free-text.logic.json`. Task 4 adds `store`; until then the tests set it in a cloned doc.
  - `lists a function's inputs as reads with where they come from`. Pick a function fed by another block and assert `where === 'from <that label>'`.
  - `a port fed by a state shows the store as where`. Set `store` on `answers` in the clone, then assert `where` and `state`.
  - `outputs named by status code go to responses`. Inline doc: function outputs `{ '200': 'Booking', '422': 'string', saved: 'boolean' }`. Expect `responses` names `['200','422']` and `writes` names `['saved']`.
  - `state shows readBy and writtenBy in wire order`.
  - `group shows only data crossing its edge`. Inline doc: group `g` with children `a → b` inside and `x → a` from outside. Expect `reads` to have one item and `inside === 2`.
  - `typeFields resolves names, optionals and arrays to object fields`. `types: { Traveler: { name: 'string', age: 'number?' }, Trip: { travelers: 'Traveler[]' } }`. Expect `typeFields('Trip')` to be `[{ name: 'travelers', type: 'Traveler[]', fields: [{name:'name',type:'string'},{name:'age',type:'number?'}] }]`.
  - `typeFields stops on recursive types` (`Node: { next: 'Node?' }`, no throw, depth ≤ 4).
  - `in Before mode a new wire is not listed`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/dataBox.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `packages/core/src/data/dataBox.ts` per the rules above. The subtree test reuses the parent walk with a `seen` guard, like `isInside` in `viewModel/index.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): dataBox computes what a block reads and writes`

### Task 3: The Data box in the side panel

**Files:**
- Create: `packages/viewer/src/components/DataBox.tsx`
- Modify: `packages/viewer/src/components/SidePanel.tsx`, `packages/viewer/src/styles.css`, `packages/viewer/src/App.tsx` (pass `onSelect`)
- Test: `tests/e2e/open.spec.ts`

**Interfaces:**
- Consumes: `dataBox`, `DataBox`, `DataItem` (Task 2).
- Produces: `<DataBox doc={doc} scope={scope} id={id} mode={mode} onSelect={(scope, id) => void} />`. `onSelect` opens the level that shows that block and selects it. It reuses the tree-click logic in `App.tsx` (`onTreeOpen` with `{ path, select }` built via `locateNode`-style lookup). Add `selectNode(scope, id)` to `App` for this.
- Look (Claude's call, within §6.8):
  - a tinted box (`.lb-data`, a soft violet like the mockup Gabriel picked), collapsed by default, header `Data · Reads 3 · Writes 2`, with `· Responses 2` only when present;
  - sections `Reads`, `Writes`, `Responses` (or `Read by` / `Written by`, or `Comes in` / `Goes out` for a boundary), each collapsed;
  - each row: `name`, the type name in grey, the `where` badge, and `desc` clamped to 2 lines (`-webkit-line-clamp: 2`);
  - an opened row shows the field table (nested rows indent and expand) and `↗ file › symbol` when `code` is set;
  - nothing is remembered: the box re-mounts collapsed per selected node (`key={scope/id}`);
  - a boundary box ends with the muted line `+N more inside · double-click to open`.
- In `NodePanel`, the Data box replaces the `Inputs` / `Outputs` port lists and the state's `Holds` section (Claude's call: the box shows the same ports with more context, and two lists would clutter the panel). It sits between the explanation and `Code`. `UnexploredPanel` keeps its port lists.

- [ ] **Step 1: Write the failing e2e test** `shows a collapsed Data box with reads and where they live`.
  - Open `other-free-text.logic.json` with `store` set on `answers` (write the modified copy through `open(null, contents)`).
  - Click the block that reads `answers`. Expect `.lb-data` with text matching `/Reads \d+/`, and no `.lb-data-row` visible.
  - Click the header, then `Reads`. Expect a row containing the store text.
  - Click the row. Expect a field table (`.lb-data-fields`).
  - Click the `answers` state, then `Read by` → a block name. That block's panel opens.
- [ ] **Step 2: Run** `npm run build && npx playwright test -g "Data box"`. Expected: FAIL.
- [ ] **Step 3: Implement** `DataBox.tsx`, mount it in `NodePanel`, add the styles.
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run build && npm run test:e2e`. Expected: PASS. Existing e2e tests that read `Inputs` in the panel are updated to open the Data box instead.
- [ ] **Step 5: Commit** (with `dist/`). `feat(viewer): Data box in the side panel`

### Task 4: Skill, format reference and examples for phase 2d

**Files:**
- Modify: `skills/logic-builder/SKILL.md`, `skills/logic-builder/references/format.md`, `skills/logic-builder/examples/other-free-text.logic.json`, `skills/logic-builder/examples/auth-gate.logic.json`
- Test: `packages/core/test/validate.test.ts` (examples loop), `packages/core/test/dataBox.test.ts`

- [ ] **Step 1: Write a failing test** `bundled examples give every state a store` in `validate.test.ts`: no `missing-store` issue for any example.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Write the docs.**
  - Examples: a `store` on every state, plus `typeInfo` with `desc` (and `code` where the example has a code file) for the types that matter, e.g. `Answer` and `Decision`. Then switch the Task 2 tests that cloned `store` in to read it from the example.
  - `format.md`: `store` in the `state` row; a `typeInfo` section; status-code outputs.
  - `SKILL.md` (Understand step 3 and Design): these three rules, worded from §6.8 "Skill rules":
    - every `state` gets a `store` with what the code actually uses, never a guessed category;
    - `typeInfo` only for the types that matter;
    - reuse before creating a store, and a new store needs a reason in `changeNote`.

    Mention the `similar-store` notice.
- [ ] **Step 4: Run** `npm test && wc -l skills/logic-builder/SKILL.md`. Expected: PASS and ≤ 200 lines.
- [ ] **Step 5: Run** `npm run check:dist` (passes; nothing in the viewer changed) and **commit**. `docs(skill): store, typeInfo and reuse-before-create`

---

# Phase 2e: small edits in the viewer

### Task 5: Format for edits (`note`, `before.source` and `before.context`) and draft file names

**Files:**
- Modify: `packages/core/src/format.ts`, `skills/logic-builder/references/logic.schema.json`, `packages/core/src/index.ts`
- Create: `packages/core/src/draftFile.ts`
- Test: `packages/core/test/validate.test.ts`, `packages/core/test/draftFile.test.ts`

**Interfaces:**
- Produces:
  - `LogicNode.note?: string`, `Wire.note?: string`, `NodeBefore.source?: TriggerSource`, `NodeBefore.context?: Record<string, unknown>`;
  - `draftFileName(diagram: string): string` (`booking.logic.json` → `booking.draft.json`);
  - `reviewFileName(diagram: string): string` (→ `booking.review.json`);
  - `interface DraftFile { original: string; doc: LogicDoc }`. `original` is the diagram's text when editing started;
  - `parseDraft(value: unknown): DraftFile | null`. It checks the shape only (string `original`, object `doc` with `subject` and `nodes`).
- [ ] **Step 1: Failing tests.**
  - `accepts notes on nodes and wires and trigger fields in before` (valid).
  - `draftFileName/reviewFileName strip .logic.json`. Also: a name without `.logic.json` gets the suffix appended to the whole name, the same as `layoutFileName`.
  - `parseDraft rejects missing original or doc`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `layoutFile.ts` for the names.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): notes, trigger before-fields and draft file names`

### Task 6: `applyEdit()`, part 1: text fields, notes and the marking rules

**Files:**
- Create: `packages/core/src/edit/applyEdit.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/applyEdit.test.ts`

**Interfaces:**
- Produces:
```ts
export type ItemRef = { scope: string; id: string }; // scope '' = file root, else blockType name
export type Edit =
  | { op: 'setLabel'; at: ItemRef; value: string }
  | { op: 'setDesc'; at: ItemRef; value: string }
  | { op: 'setSymbol'; at: ItemRef; value: string }
  | { op: 'setTrigger'; at: ItemRef; source: TriggerSource; context: Record<string, unknown> }
  | { op: 'setNote'; at: ItemRef; value: string }            // node or wire; '' removes the note
  | { op: 'renamePort'; at: ItemRef; side: Side; from: string; to: string }     // Task 7
  | { op: 'setPortType'; at: ItemRef; side: Side; port: string; type: TypeExpr } // Task 7
  | { op: 'setType'; name: string; type: TypeExpr }                             // Task 7
  | { op: 'remove'; at: ItemRef }                                              // node or wire, Task 7
  | { op: 'restore'; at: ItemRef };                                            // node or wire, Task 7
export type EditResult = { ok: true; doc: LogicDoc } | { ok: false; reason: string };
/** Pure: never mutates `doc`. `original` (the file when editing started) is needed by 'restore'. */
export function applyEdit(doc: LogicDoc, edit: Edit, original?: LogicDoc): EditResult;
```
- Marking rules (§6.9, one helper `markNodeField(node, field, newValue)` used by every node edit):
  - If `node.change === 'new'`, set the field and stop.
  - If `node.change === 'removed'`, return `{ ok: false, reason: 'Restore it before editing.' }`.
  - Otherwise, if `before` has no `field`, store the current value in `before[field]`. For `setSymbol` the field is `code`: copy the whole `CodeRef`. For `setTrigger` the fields are `source` and `context`.
  - Then set the new value.
  - If the new value deep-equals `before[field]`, delete `before[field]`. If `before` is then empty, delete `before` and `change`. Otherwise set `change: 'modified'`.
  - Every edit except `setNote` sets `subject.mode = 'design'`. `setNote` never touches `change`, `before` or the mode.
- Instances: `setLabel`, `setDesc` and `setNote` write to the instance. `setSymbol` on an instance writes to the blockType's `code`, marked on the blockType with the same rules.
- Rejections (`ok: false`, readable reason):
  - an empty or whitespace `setLabel` (**[RF3]**);
  - an unknown `at`;
  - `setSymbol` on a node with neither `code` nor a blockType `code` (there is no file to attach a symbol to).

- [ ] **Step 1: Write failing tests** (inline docs built with a small `doc()` helper in the test file):
  - `renaming an existing block marks it modified and keeps the old label in before`;
  - `renaming it back clears the mark`;
  - `editing a new block changes it in place with no before`;
  - `the first edit switches an understand file to design`;
  - `a note marks nothing and keeps the mode` (understand stays understand);
  - `setNote '' removes the note`;
  - `setSymbol keeps the whole original code ref in before`;
  - `setTrigger stores source and context in before`;
  - `rejects an empty label` **[RF3]**;
  - `rejects editing a removed block`;
  - `does not mutate the input doc` (deep-freeze the input with a recursive `Object.freeze`).
- [ ] **Step 2: Run** `npx vitest run packages/core/test/applyEdit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the ops above with `structuredClone(doc)` and the marking helper. Deep equality is `JSON.stringify` with sorted keys (a small `sameValue(a, b)` helper in the file).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): applyEdit for labels, descriptions, symbols, triggers and notes`

### Task 7: `applyEdit()`, part 2: ports, types, remove and restore

**Files:**
- Modify: `packages/core/src/edit/applyEdit.ts`, `packages/core/src/viewModel/index.ts`
- Test: `packages/core/test/applyEdit.test.ts`, `packages/core/test/viewModel.test.ts`

**Interfaces:**
- Consumes: the Task 6 helpers, and `validate` (only in the tests).
- Rules:
  - **`renamePort`** on a non-instance node:
    - Rename the key in `inputs`/`outputs`, keeping key order. Ports are a marked field: `before.inputs`/`before.outputs` hold the whole original map.
    - Rewrite every wire in the same scope whose endpoint is `<id>.<from>` on that side (`to` for inputs, `from` for outputs).
    - A rewritten wire that is not `new` gets `change: 'modified'` and `before.to` / `before.from` set to the old endpoint, unless `before` already holds it. **[RF1]**
    - Reject when `to` already exists on that side, is empty, or contains `.` (**[RF3]**).
  - **`renamePort`** on an instance renames the blockType port (the blockType is marked like a node) and then:
    - every body `pin` whose single port is `from` (an input pin's output, an output pin's input), plus body wires on `<pinId>.<from>`;
    - wires on `<instanceId>.<from>` for every instance of that type, in the root and in every body. Rewritten wires are marked as above.
  - **`setPortType`**: same shape and marking. On an instance it edits the blockType. The type is validated with `parseType` beforehand; a parse failure is rejected with the parser's message.
  - **`setType`**: replace `types[name]`.
    - Unless the type is marked already, set `typeInfo[name].change = 'modified'` and `typeInfo[name].before = <old expr>`.
    - If the new expr equals `before`, drop `change` and `before`, and drop the `typeInfo` entry when it is empty.
    - Sets the mode to design.
  - **`remove`**:
    - A node: the node and every descendant (by `parent`).
    - A wire: that wire.
    - For each affected item, plus every wire touching an affected node: `existing`/`modified` → `change: 'removed'`; `new` → deleted from the array.
    - Deleted ids are stripped from `risks[*].refs`, and a risk left with no refs is dropped. `subject.focus` is dropped when its node is deleted. **[RF5]**
  - **`restore`** (needs `original`): for the item, and when it is a node, for its descendants and every wire touching them that is `removed` now but was not `removed` in `original`, copy back `change` and `before` from `original`. Rejected when the item is not removed, or was already removed in `original`.
  - **Affected wires**: in `buildView`, an edge with no mark whose `type` mentions (via `parseType`) a name with `typeInfo[name].change === 'modified'` gets `mark: 'affected'`.

- [ ] **Step 1: Write failing tests:**
  - `renaming a port rewrites its wires and keeps Before drawable` **[RF1]**. After renaming `save.answer`→`save.reply`:
    - `validate(result.doc).valid` is true;
    - `buildView(result.doc, [], 'before').edges` still contains the wire into `save`, on handle `answer`;
    - in `'after'` it is on `reply`.
  - `rejects a port rename onto an existing name` **[RF3]**.
  - `renaming an instance port renames the blockType, its pin and every instance wire`. On `other-free-text.logic.json`, rename an `OtherOption` input, then expect `validate(...).valid` and `checkIntegrity` with no `pin` errors.
  - `setPortType rejects an unparseable type`.
  - `setType marks typeInfo and setting it back clears it`.
  - `an edge carrying a modified type is marked affected` (`viewModel.test.ts`).
  - `removing an existing group marks the group, its children and their wires removed`.
  - `removing a new block deletes it and its wires`.
  - `removing a new block referenced by a risk and by focus keeps the file valid` **[RF5]**.
  - `restore brings back a removed block and the wires removed with it, as they were`.
  - `restore refuses an item removed in the original`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `applyEdit.ts`, plus the affected-edge mark in `viewModel/index.ts` (where `edges.set(...)` builds each edge).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): applyEdit for ports, types, remove and restore`

### Task 8: `summarizeEdits()` and `copyReference()`, the text for the agent

**Files:**
- Create: `packages/core/src/edit/summary.ts`, `packages/core/src/edit/reference.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/summary.test.ts`

**Interfaces:**
```ts
/** One line per user change, diffing draft against original (not the marks). */
export function editLines(original: LogicDoc, draft: LogicDoc): string[];
export function countEdits(original: LogicDoc, draft: LogicDoc): number; // editLines(...).length
/** The "Copy for agent" request after a save. */
export function summarizeEdits(original: LogicDoc, draft: LogicDoc, filePath: string): string;
/** "Copy reference for agent": the file, then one line per node or wire. */
/** `ItemRef` comes from Task 6. */
export function copyReference(doc: LogicDoc, filePath: string, targets: ItemRef[]): string;
```
- The exact copy:
  - `summarizeEdits`:
    - header `I edited <filePath> in the viewer. Please review and implement:`, then `- <line>` per line;
    - a doc with no changes returns `''`.
  - Lines. Items are compared by id per scope. `<L>` is the label in the draft, or in the original when removed:
    - `Renamed "<old>" → "<new>" (<id>)`
    - `Renamed function <oldSymbol> → <newSymbol> in "<L>" (<id>)`
    - `"<L>" (<id>): renamed input <a> → <b>`. A rename is a port key that disappeared plus one that appeared at the same position; anything else becomes `added input <b>: <type>` / `removed input <a>`. Same wording with `output`.
    - `"<L>" (<id>): input <p> is now <type>`
    - `<TypeName>: added field <f>: <type>` / `removed field <f>` / `field <f> is now <type>` (struct-to-struct diff); any other change is `<TypeName> is now <typeToString>`
    - `"<L>" (<id>): trigger is now <source>` (+ ` · <k>: <v>` per changed context key)
    - `"<L>" (<id>): edited description`
    - `Removed "<L>" (<id>)` / `Removed wire <from> → <to> (<id>)`
    - `Note on "<L>" (<id>): <note>` / `Note on wire <from> → <to> (<id>): <note>`
  - Body-scope ids are written `<BlockType>/<id>`.
  - `copyReference`: line 1 is `filePath`. Then:
    - a node: `- "<label>" (id: <id>, <kind>)`, with ` → <file> · <symbol>` when it or its blockType has `code` (` → <file>` without a symbol);
    - a wire: `- wire <id>: <from> → <to>`, with ` (<type>)` when known.
- [ ] **Step 1: Failing tests:**
  - one test per line form above (inline docs);
  - `the summary lists only the user's edits on a design file`: the original already has `new` and `modified` items, the draft renames one `new` block, so the only line is that rename;
  - `copyReference for two blocks and a wire`: the exact multi-line string;
  - `copyReference writes body ids with their blockType`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): edit summary and block references for the agent`

### Task 9: The draft on the server

**Files:**
- Modify: `packages/cli/src/api.ts`
- Test: `packages/cli/test/server.test.ts`

**Interfaces:**
- Consumes: `draftFileName`, `reviewFileName`, `parseDraft`, `DraftFile` (Task 5); `validate`.
- Produces:
  - `DocPayload.draft: { doc: LogicDoc; original: LogicDoc | null; changedOnDisk: boolean } | null`.
    - `original` is the parse of `DraftFile.original` (null if it does not parse).
    - `changedOnDisk` is true when the current file text differs from `DraftFile.original`.
  - `DocPayload.review: string | null`: the review file name, when it exists.
  - `FileEntry.draft: boolean`.
  - `PUT /api/draft?file=<diagram>`, body = a `LogicDoc`:
    - writes `{ original, doc }` atomically. `original` is kept from the existing draft, or else read from the diagram now;
    - `200 { ok: true }`; checks a 5 MB limit.
  - `DELETE /api/draft?file=` removes the draft: `200 { ok: true }`, even when there was none.
  - `POST /api/save?file=`:
    - 404 when there is no draft;
    - runs `validate(draft.doc)` and returns `400 { error, issues }` when it is invalid;
    - when the current diagram text ≠ `draft.original`, writes the current text to `reviewFileName` first;
    - writes `JSON.stringify(doc, null, 2) + '\n'` to the diagram atomically and deletes the draft;
    - returns `200 { ok: true, review: string | null }`.
  - Every write and delete (`PUT`, `DELETE`, `POST`) follows the `sameOrigin` and JSON content-type rules of `/api/layout`. `DELETE` also needs a JSON content type, so it goes through the CORS preflight.
  - The watcher also reacts to `*.draft.json` and `*.review.json`, and reports them as their diagram's name, so the viewer refetches.
- [ ] **Step 1: Failing tests** in `server.test.ts`, each on a temp dir:
  - `PUT draft keeps the original text from when editing started`: PUT twice, rewrite the diagram in between, then check the draft file's `original` equals the first text;
  - `/api/doc returns the draft and flags a change on disk` **[RF4]**;
  - `save writes the draft and removes it`;
  - `save keeps the disk version for review when it changed` **[RF2]**: the review file text equals what was on disk, and the diagram equals the draft;
  - `save keeps an invalid disk version for review too` **[RF2]**: the disk text is `{ broken`;
  - `save refuses an invalid draft with its issues` **[RF3]**: a draft with an empty label → 400, and the diagram is unchanged;
  - `draft endpoints refuse other origins and non-JSON requests` → 403;
  - `/api/files flags files with a draft`.
- [ ] **Step 2: Run** `npx vitest run packages/cli/test/server.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Factor the atomic write already in `saveLayout` into `writeAtomic(target, text)`, and the body reader into `readJsonBody(req, limit)`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(cli): keep viewer edits in a draft and save them with a review copy`

### Task 10: Draft state in the viewer and the edit bar

**Files:**
- Modify: `packages/viewer/src/state/useDocument.ts`, `packages/viewer/src/App.tsx`, `packages/viewer/src/components/NavPanel.tsx`, `packages/viewer/src/styles.css`
- Create: `packages/viewer/src/components/EditBar.tsx`
- Test: `tests/e2e/open.spec.ts`

**Interfaces:**
- Consumes: `applyEdit`, `countEdits`, `summarizeEdits`, `validate` (core); the `/api/draft` and `/api/save` endpoints (Task 9).
- Produces:
  - `DocHandle` gains:
    - `draft: { original: LogicDoc; changedOnDisk: boolean } | null`;
    - `edit(e: Edit): string | null` (returns the rejection reason, or null);
    - `discard(): void`;
    - `save(): Promise<{ ok: true; summary: string; review: string | null } | { ok: false; message: string }>`.
  - While there is a draft, `doc` is the draft's doc, and `issues` / `valid` come from `validate(draft doc)`.
  - The first `edit()` takes `original` from the current `doc`. Later edits apply to the draft locally and `PUT` it, debounced 300 ms.
  - A `change` event refetches. The server's `draft` wins over the local one only when no PUT is pending.
  - `DiagramFile.draft: boolean`.
  - `<EditBar draft doc issues filePath onSave onDiscard />`, at the bottom of the canvas, shown only while there is a draft or a just-saved summary:
    - `N unsaved changes · Save · Discard`, where N = `countEdits(original, doc)`;
    - Save is disabled while there are errors, and the bar shows the first error message;
    - when `changedOnDisk`: `The diagram changed on disk while you edited. Saving keeps your version; the other one is kept for review.`;
    - after a save: `Saved · Copy for agent`, which copies `summarizeEdits(...)`. When the save returned a review file, it adds `The other version is in <review> for the agent to review.`. The bar hides on the next edit or after 20 s.
  - `NavPanel` shows a dot (`.lb-draft-dot`, title `Unsaved edits`) on files with `draft`.
  - `filePath` for any file is the opened file's directory plus the file name, so references name the right file when a linked diagram is on screen. Add `pathOf(file)` to `useDocument`.
- [ ] **Step 1: Failing e2e test** `keeps edits in a draft until Save` **[RF4]**. Until Task 11 ships the UI, it drives the edit through `page.evaluate` on a test hook `window.__lbEdit(edit)`, exposed only when `import.meta.env.DEV` or `?test` is in the URL. Task 11 replaces the hook in this test with real clicks, and then the hook is deleted.
  - Make one `setLabel` edit. Expect the bar to say `1 unsaved change`, the diagram file on disk to be unchanged, and `subject.draft.json` to exist.
  - Reload the page. The bar is still there and the new label shows.
  - Click Save. The file on disk has the new label, the draft is gone, and `Copy for agent` is visible.
- [ ] **Step 2: Run** `npm run build && npx playwright test -g "draft"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run build && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** (with `dist/`). `feat(viewer): draft state and the edit bar`

### Task 11: Editing in the side panel

**Files:**
- Create: `packages/viewer/src/components/Editable.tsx`
- Modify: `packages/viewer/src/components/SidePanel.tsx`, `packages/viewer/src/components/DataBox.tsx`, `packages/viewer/src/App.tsx` (pass `edit`, remove the test hook), `packages/viewer/src/styles.css`
- Test: `tests/e2e/open.spec.ts`

**Interfaces:**
- Consumes: `DocHandle.edit` (Task 10), `typeFields` (Task 2), `parseType`.
- Produces:
  - `<EditableText value onCommit={(v) => string | null} multiline? mono? />`:
    - shows the value plus a pencil (`✎`, `aria-label="Edit"`) on hover;
    - a click opens an input; Enter (Cmd/Ctrl+Enter when multiline) commits, Esc cancels;
    - a non-null return is shown under the input as the error, and the input stays open.
  - `<FieldTable type onCommit={(next: TypeExpr) => string | null} />`: a row per field (name, type) with rename, retype and remove, plus an `+ field` row. Used only when the type is a plain object (§6.9 "Types").
- Where each edit lives (all disabled in the Before view, on `removed` items, on pins and on boundary pins):
  - Header label → `setLabel`.
  - `What it does` → `setDesc`.
  - `Code` symbol → `setSymbol`.
  - Trigger `Context`: `source` as a `<select>` of the five sources; `from` and `modes` (comma-separated) as text → `setTrigger`.
  - Data box rows for ports:
    - the name → `renamePort`;
    - the type → `setPortType`;
    - an opened row whose type is a named plain object shows `FieldTable` → `setType`; an inline plain object → `setPortType`.
  - On an instance, port edits first show the inline confirm `Changes all N uses of <Type>` (N from `instancesOf`), with Apply / Cancel.
  - A `Note for agent` section at the end of the panel: an empty state `Add a note`, and a multiline `EditableText` → `setNote`.
  - Footer: `Remove`. On a group it confirms inline: `Removes this block and N inside it`. On a block removed by an edit (removed now, not in `original`) the footer shows `Restore` instead.
- The note badge on blocks: `nodes.tsx` shows a small `✎` dot (`.lb-note-badge`, title = the note) when `note` is set.
- [ ] **Step 1: Failing e2e tests:**
  - `renames a block and a port from the panel and saves` (replaces the hook in the Task 10 test): rename the label, then rename an input port in the Data box, then Save. The file on disk has both, plus the `modified` mark and `before`;
  - `adds a field to a named type` with `FieldTable`: after Save, the file's `types` has the field and `typeInfo` has `change: 'modified'`;
  - `blocks a duplicate port name with a message` **[RF3]**: the error text is visible and Save stays enabled only for valid drafts;
  - `leaves a note and shows the badge`;
  - `removes and restores a block`;
  - `no pencils in the Before view`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run build && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** (with `dist/`). `feat(viewer): edit labels, ports, types, triggers and notes in the panel`

### Task 12: Wire panel, copy references and "agent" wording

**Files:**
- Modify: `packages/viewer/src/App.tsx`, `packages/viewer/src/components/SidePanel.tsx`, `packages/viewer/src/styles.css`
- Test: `tests/e2e/open.spec.ts`

**Interfaces:**
- Consumes: `copyReference` (Task 8), `DocHandle.edit`, `pathOf` (Task 10).
- Produces:
  - `Panel` gains `{ type: 'wire'; edge: ViewEdge }` and `{ type: 'selection'; refs: ItemRef[] }`.
  - `onEdgeClick` opens the wire panel. Hover keeps showing the tooltip; the tooltip hides on click. The selected edge is drawn highlighted. Edges of connector stubs open the panel for their underlying wire (`wireIds[0]`).
  - Wire panel: kind line `Wire`, title `<from> → <to>`, the type with its fields (reusing the Data box row), `op`, the mark, plus `Note for agent`, `Remove` / `Restore` and the copy icon.
  - A copy icon button (`aria-label="Copy reference for agent"`, `title` the same) in the header of the node and wire panels. It copies `copyReference(doc, pathOf(file), [target])`, and the icon shows `Copied` for 1.6 s.
  - When more than one block is selected on the canvas (`flow.nodes` with `selected`, taking the `ref` of each), the side panel shows the `selection` panel: `N blocks selected` with a `Copy for agent` button (all refs). Selecting one block goes back to the node panel.
  - Wording: `Copy request for Claude` → `Copy for agent`; `Request for Claude` → `Request for the agent`; `Ask Claude…` hints → `Ask the agent…`. After this task, `grep -rn "Claude" packages/viewer/src` returns nothing.
- [ ] **Step 1: Failing e2e tests:**
  - `clicking a wire opens its panel and copies its reference`. Grant clipboard permissions in the test context (`context.grantPermissions(['clipboard-read','clipboard-write'])`), then read `navigator.clipboard.readText()`: it equals the expected `copyReference` text;
  - `copies a reference for several selected blocks`: Shift-click two blocks, click `Copy for agent`, and the clipboard has the file line plus two block lines;
  - `removes a wire and leaves a note on it`;
  - `the viewer never says Claude`: `page.getByText(/Claude/)` has count 0 on the unexplored-group panel of `auth-gate.logic.json`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run build && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** (with `dist/`). `feat(viewer): wire panel, copy for agent and agent wording`

### Task 13: Skill and format reference for phase 2e, final checks

**Files:**
- Modify: `skills/logic-builder/SKILL.md`, `skills/logic-builder/references/format.md`, `README.md` (features list)
- Test: `npm test`, `npm run test:e2e`, `npm run check:dist`

- [ ] **Step 1: Write the docs.**
  - `SKILL.md` gets a short "When the user edits in the viewer" section, worded from §6.9 "Skill rules":
    - check for `<subject>.draft.json` before editing, and if it exists, don't edit and say so;
    - read the pasted Copy-for-agent text, or `git diff` on the file;
    - a rename means renaming in code, an added field means adding it to the model, a removal means removing it from the design;
    - a `note` is a request: implement it, then delete it;
    - with `<subject>.review.json`, re-apply what still makes sense on top of the user's version, then delete it.

    The fold-back steps (§8.6) also drop `note` and the `typeInfo` marks (`change`, `before`).
  - `format.md`: `note`, `before.source` / `before.context`, `typeInfo.change` / `before`, and the draft and review files (written by the viewer, never by the agent).
  - `README.md`: one bullet each for the Data box and editing in the viewer.
- [ ] **Step 2: Run** `wc -l skills/logic-builder/SKILL.md`. Expected: ≤ 200.
- [ ] **Step 3: Run** `npm run typecheck && npm test && npm run build && npm run test:e2e && npm run check:dist`. Expected: all PASS, and `check:dist` reports no diff.
- [ ] **Step 4: Commit.** `docs(skill): edits in the viewer, drafts, notes and review copies`
- [ ] **Step 5: Acceptance with Gabriel.** On one of his real repos (scenarios in the git-ignored `local/`):
  - open a wizard-like flow and check that the Data box answers "where does this step's data live";
  - then rename a block, add a field and leave a note, save, and paste Copy for agent into a new session.

  New findings go to §6.10.
