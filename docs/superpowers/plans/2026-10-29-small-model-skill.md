# Skill and CLI for Small Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make agentic-fbd usable by small models: a tiny `SKILL.md` that routes to short
workflow files, and a CLI that starts a valid file, explains every issue with a fix hint, shows
root causes first, and catches unwired blocks.

**Architecture:** core validator issues gain an optional `hint`; a new `unwired-block` check
lives in the integrity pass. The CLI gains `new` (starter file), a placeholder check (CLI-only)
and a grouped text report. The skill splits into three levels: `SKILL.md` → `workflow-*.md` →
`format.md` / `checklist.md` / examples.

**Tech Stack:** TypeScript, vitest, Playwright, esbuild (bundles `dist/cli.mjs`), Ajv.

**Spec:** `docs/superpowers/specs/2026-10-29-small-model-skill-design.md`

## Global Constraints

- English only; examples generic and written from scratch; no client or company names.
- The format does not change: no new fields, `version` stays `"0.1"`.
- CLI stays dependency-free at runtime, Node 20+.
- Every issue code is in `docs/cli.md` (`tests/docs.test.ts` enforces it).
- `SKILL.md` under 4096 bytes. Bytes a model must read before its first write, per workflow,
  at most 30000.
- After any change under `packages/`, run `npm run build` and commit `dist/` in the same commit.
- Every task ends with `npm test` and `npm run typecheck` passing. Commits are conventional,
  end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- The Qwen/OpenCode run is out of scope for this plan (deferred by Gabriel).

## Review Focus

1. Input that is valid JSON but not an object (`[]`, `"x"`, `null`): `validate` must report
   schema errors with hints and not crash. Test in Task 1.
2. An explored group (has children, no ports) is wired only through its children: it must not
   be reported as `unwired-block`. Test in Task 3.
3. `unknown-node` inside a blockType body suggests ids from that body, not from the root. Test
   in Task 2.
4. `new logic/x.logic.json` when `logic/` does not exist: create the folder. Test in Task 5.
5. `--json` output: issues without a hint have no `hint` key (not `null`, not `""`). Test in
   Task 1.

---

### Task 0: Record the Claude baseline

**Files:**
- Create: `local/skill-baseline/` (gitignored; nothing committed)

- [ ] **Step 1:** Dispatch a Claude subagent (default model) with the **current**
  `skills/agentic-fbd/SKILL.md` as its instructions, working on this repo, with the request:
  "Explain how `validate` checks a diagram, as a logic diagram." Save the file it writes to
  `local/skill-baseline/understand.logic.json`, and record which skill files it read and their
  total bytes in `local/skill-baseline/notes.md`.
- [ ] **Step 2:** Same, with "Design adding a `--quiet` flag to `validate` that prints only
  errors, as a logic diagram." Save to `local/skill-baseline/design.logic.json`.
- [ ] **Step 3:** Run `node dist/cli.mjs validate local/skill-baseline/*.logic.json`; note the
  result in `notes.md`. No commit.

### Task 1: Issue hints, and schema hints

**Files:**
- Modify: `packages/core/src/validate/issues.ts` (add `hint?: string`)
- Modify: `packages/core/src/validate/schema.ts`
- Modify: `packages/cli/src/main.ts` (`printReport`: print `    fix: <hint>` under an issue)
- Test: `packages/core/test/validate.test.ts`, `packages/cli/test/validate.test.ts`

**Interfaces:**
- Produces: `Issue.hint?: string` (one line, imperative). Text output line format:
  `  <level> [<code>] <message>` then, when there is a hint, `           fix: <hint>`.

- [ ] **Step 1: Failing tests** in `packages/core/test/validate.test.ts`, `describe('schema hints')`:
  - `{ version: '0.1', subject: {...valid}, nodes: [], wires: [], title: 'x' }` → the
    `unknown field "title"` issue has hint `move it to "subject.title"`.
  - `description` → `move it to "subject.intent"`; `layers` → `replace it with "nodes" entries of kind "group"`;
    `meta` (no obvious home) → `remove it`.
  - `version: '1.0'` → hint `set "version": "0.1"`.
  - `subject: 'x'` → hint contains `"subject": { "id", "title", "intent", "mode" }`.
  - missing `nodes` → hint `add "nodes": [] at the top level`; same for `wires`.
  - `validate([])`, `validate('x')`, `validate(null)` return `valid: false` without throwing,
    each issue with a hint (Review Focus 1).
  - In `packages/cli/test/validate.test.ts`: text output for a fixture with `title` contains the
    line `fix: move it to "subject.title"`; `--json` output has `hint` on that issue and **no**
    `hint` key on an issue without one (Review Focus 5).
- [ ] **Step 2:** Run `npx vitest run packages/core/test/validate.test.ts packages/cli/test/validate.test.ts`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement `schemaHint(e: ErrorObject): string | undefined` in `schema.ts`
  (map keyed by unknown top-level field name; others per the tests) and set `hint` only when
  defined. Print hints in `printReport`.
- [ ] **Step 4:** Run the tests; expect PASS. Run `npm test && npm run typecheck`.
- [ ] **Step 5:** `npm run build`; commit `feat(core): fix hints on schema issues` with `dist/`.

### Task 2: Hints on wire errors

**Files:**
- Create: `packages/core/src/validate/similar.ts`
- Modify: `packages/core/src/validate/integrity.ts` (`resolveEnd`, `err` gains optional `hint`)
- Test: `packages/core/test/validate.test.ts`

**Interfaces:**
- Produces: `closestIds(target: string, ids: string[], max?: number): string[]` — up to `max`
  (default 3) ids with Levenshtein distance ≤ `max(2, floor(target.length / 3))`, nearest first;
  substring matches count as distance 1.
- `err(issues, code, path, message, hint?)`.

- [ ] **Step 1: Failing tests:**
  - `missing-port` on a function `fetch` with outputs `data, error` used as `"from": "fetch"` →
    hint `use "fetch.<port>"; outputs of fetch: data, error`. A node with no ports on that side
    → hint `declare "outputs" on fetch, then use "fetch.<port>"`.
  - `unknown-node` `"to": "used_kit.in"` with existing `used-kits` → hint
    `did you mean "used-kits"? Otherwise add a node with id "used_kit"`. No close id → hint
    `add a node with id "used_kit", or fix the wire`.
  - Same `unknown-node` inside a blockType body suggests ids from the body only (Review Focus 3).
  - `unknown-port` hint lists the ports: `use one of: a, b`.
  - `closestIds` unit tests: exact substring, distance limit, `max`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement `closestIds` and pass hints from `resolveEnd`.
- [ ] **Step 4:** Run; PASS. `npm test && npm run typecheck`.
- [ ] **Step 5:** Build; commit `feat(core): fix hints on wire errors` with `dist/`.

### Task 3: `unwired-block` warning

**Files:**
- Modify: `packages/core/src/validate/integrity.ts` (new `checkWiring(root: Scope, issues)` in `checkIntegrity`, root scope only)
- Modify: `docs/cli.md` (warnings table row)
- Test: `packages/core/test/validate.test.ts`, `packages/cli/test/validate.test.ts`

**Interfaces:**
- Produces: issue `{ level: 'warning', code: 'unwired-block', path: <node id>, message, hint }`.

Rules (from the spec): a node is wired when a wire's `from` or `to` names it (`id` or
`id.port`), or names any of its descendants (via `parent`). Report: a trigger with no outgoing
wire; a result with no incoming wire; any other node with no wire at all. Exempt: nodes with
`change: "removed"`, `pin` nodes, and everything inside blockType bodies. A `state` named by
bare id counts. One issue per node; the message says which case; the hint says
`wire it, or remove it if it is not part of this flow`.

- [ ] **Step 1: Failing tests:** each case above fires; each exemption does not; an explored
  group whose children are wired does not fire (Review Focus 2); both bundled examples and
  every file in `logic/` produce no `unwired-block` (CLI test over the files).
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement `checkWiring`. Add the `unwired-block` row to `docs/cli.md`.
- [ ] **Step 4:** Run; PASS, including `tests/docs.test.ts`. `npm test && npm run typecheck`.
- [ ] **Step 5:** Build; commit `feat(core): warn about unwired blocks` with `dist/`.

### Task 4: Root causes first in the text report

**Files:**
- Create: `packages/cli/src/report.ts` (move `printReport` and `plural` out of `main.ts`)
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/report.test.ts`

**Interfaces:**
- Produces: `formatReport(report: FileReport): string[]` (lines). `FileReport` stays exported
  from `main.ts`.

Behavior: with at most 10 issues, unchanged (one line each, plus `fix:` lines). With more than
10, group by `code` in this order: `json`, `read`, `schema`, `duplicate-id`, `unknown-node`,
`missing-port`, `unknown-port`, then the remaining errors by count descending, then warnings,
then notices. Per group: a header `  <level> [<code>] × <n>`, then the first 3 issues
(message and `fix:`), then `    … <n-3> more` when needed. The first line keeps today's
`ok`/`FAIL` summary. `--json` is untouched.

- [ ] **Step 1: Failing tests:** a report with 76 synthetic issues (40 `unknown-node`,
  30 `missing-port`, 6 notices) prints `unknown-node` group first, 3 examples each, the
  `… 37 more` / `… 27 more` lines, notices last; a report with 10 issues prints exactly as
  before (snapshot of today's format).
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement `formatReport`; `main.ts` prints its lines.
- [ ] **Step 4:** Run; PASS. `npm test && npm run typecheck`.
- [ ] **Step 5:** Build; commit `feat(cli): group many issues by root cause` with `dist/`.

### Task 5: `new` command and the placeholder check

**Files:**
- Create: `packages/cli/src/starter.ts`, `packages/cli/src/checkPlaceholders.ts`
- Modify: `packages/cli/src/main.ts` (register `new`; `validateFile` runs `checkPlaceholders`; USAGE)
- Modify: `docs/cli.md` (`new` section, `placeholder` row in the errors table)
- Test: `packages/cli/test/new.test.ts`

**Interfaces:**
- Produces: `starterDoc(shape: 'understand' | 'overview'): LogicDoc`;
  `PLACEHOLDER = 'TODO'`; `checkPlaceholders(doc: LogicDoc): Issue[]` — one `error`,
  code `placeholder`, per string value anywhere in the doc that starts with `TODO`, path = the
  JSON pointer, hint `replace the TODO text with the real content`.
- CLI: `agentic-fbd new <file.logic.json> [--overview]`. Exit 0 and print
  `created <file>; replace every TODO, then run validate`. Existing file → exit 2,
  `<file> already exists`. Missing parent folders are created (Review Focus 4).

Starter shapes (all texts start with `TODO`, ids are fixed):
- understand: trigger `start` (source `user`) → function `step` → result `done`, wires `w1`,
  `w2`, port type `string`.
- overview: trigger `start` → unexplored group `system-a` → unexplored group `system-b` →
  result `done`, groups with declared `inputs`/`outputs`.

- [ ] **Step 1: Failing tests:** for both shapes, `validate(starterDoc(s))` (core) is valid
  with no `unwired-block`; the CLI `validate` on a fresh `new` file exits 1 and every error is
  `placeholder`; after replacing all `TODO` strings it exits 0; `new` on an existing file exits
  2; `new` into a missing folder creates it; `--overview` writes the overview shape.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement. The viewer's load path (`api.ts`) does **not** call `checkPlaceholders`.
- [ ] **Step 4:** Run; PASS, including `tests/docs.test.ts`. `npm test && npm run typecheck`.
- [ ] **Step 5:** Build; add an e2e test in `tests/e2e/cli.spec.ts` that `new` + `open` shows
  the starter in the viewer (no error banner). `npm run test:e2e`. Commit
  `feat(cli): new command with a starter diagram` with `dist/`.

### Task 6: Three-level skill

**Files:**
- Rewrite: `skills/agentic-fbd/SKILL.md`
- Create: `skills/agentic-fbd/references/workflow-overview.md`, `workflow-understand.md`,
  `workflow-design.md`, `workflow-edits.md`, `checklist.md`
- Modify: `skills/agentic-fbd/references/format.md` (first lines: CLI path per `SKILL.md`,
  pointer to `checklist.md`)
- Test: `tests/skill.test.ts`

**Interfaces:**
- Consumes: `new [--overview]` (Task 5), `fix:` lines (Task 1), `unwired-block` (Task 3).
- Each workflow file starts with a line `Read first: <files>` listing the other skill files it
  requires (relative to `<base>`); the test uses it.

Content (from the spec; nothing in today's `SKILL.md` is lost — each section moves to the
workflow where it is used, shared rules to `format.md` or `checklist.md`):
- `SKILL.md`: frontmatter (today's description plus "or a high-level overview of a repo");
  Find the tools (`<base>` = folder of this file; CLI `<base>/../../dist/cli.mjs`; else
  `find ~/.agentic-fbd ~/.claude ~/.config /tmp -maxdepth 6 -path '*agentic-fbd*/dist/cli.mjs' 2>/dev/null | head -1`;
  else `git clone --depth 1 https://github.com/gabolondon/agentic-fbd.git ~/.agentic-fbd`);
  the request table (overview, understand, design, viewer edits / after implementation → file);
  hard rules.
- Workflows: numbered steps, each with the command and a "done when"; layer-by-layer build
  (`new` → top level → validate to 0 errors and no `unwired-block` → one group at a time). The
  overview workflow ends with the message to the user (the systems found; ask for each block by
  name to go one level deeper, one at a time).
- `checklist.md`: the yes/no lines listed in the spec.

- [ ] **Step 1: Failing tests** in `tests/skill.test.ts` (add nothing to vitest config:
  `tests/*.test.ts` is already included):
  - `SKILL.md` is under 4096 bytes.
  - every `references/...` or `examples/...` path named in `SKILL.md` and in each workflow exists.
  - for each `workflow-*.md`: bytes(`SKILL.md`) + bytes(workflow) + bytes(each `Read first`
    file) ≤ 30000.
  - `SKILL.md` names all four workflow files and the `git clone` fallback.
- [ ] **Step 2:** Run `npx vitest run tests/skill.test.ts`; FAIL.
- [ ] **Step 3:** Write the files.
- [ ] **Step 4:** Run; PASS. Walk each workflow by hand once against this repo using
  `node dist/cli.mjs` (overview: `new --overview`, fill in, validate to 0 errors, no
  `unwired-block`); delete the scratch files.
- [ ] **Step 5:** Commit `feat(skill): three-level skill for small models`.

### Task 7: Human docs

**Files:**
- Modify: `docs/skill.md` (the overview request, the layered build, CLI fallback), `docs/cli.md`
  (`new`, `fix:` lines and the `hint` JSON field, grouped output), `docs/getting-started.md`
  (an overview example prompt), `README.md` Use list (add the overview prompt).

- [ ] **Step 1:** Update the pages; every shown command output is real (run it).
- [ ] **Step 2:** `npm test` (drift guard) passes.
- [ ] **Step 3:** Commit `docs: overview requests, new, fix hints and grouped output`.

### Task 8: Claude regression and final checks

- [ ] **Step 1:** Repeat Task 0's two requests with the new skill; save to
  `local/skill-after/`, with the files read and their bytes in `notes.md`.
- [ ] **Step 2:** Both files validate with 0 errors and no `unwired-block`; bytes read ≤ the
  baseline's.
- [ ] **Step 3:** `npm test`, `npm run typecheck`, `npm run test:e2e`, `npm run check:dist`, all
  exit 0.
- [ ] **Step 4:** Report to Gabriel the paths of the baseline and new diagrams for him to
  compare in the viewer. The Qwen run waits for his go-ahead.
