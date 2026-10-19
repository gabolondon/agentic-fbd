# logic-builder — Implementation plan (v0.1)

> Standalone plan for a fresh Claude Code session. Read first:
> 1. `CLAUDE.md` (repo rules: everything built in English; reply to Gabriel in Spanish; public repo, no client/internal names).
> 2. `docs/superpowers/specs/2026-10-18-logic-builder-design.md` — **the approved design. Source of truth.** Section numbers (§) below refer to it.
> 3. `docs/superpowers/specs/2026-10-18-logic-builder-prototype.html` — approved UI direction (open in a browser).
>
> Do not re-litigate design decisions. If something in the spec is ambiguous, pick the option most consistent with the spec, note it in the commit message, and keep going. Commit at the end of each milestone (conventional commits, English).

## Context

Gabriel (electronics engineer, ex-PLC programmer) builds apps with Claude Code and keeps hitting three gaps: plans ignore existing logic, he loses the mental model of agent-written code, and review collapses to input/output. logic-builder fixes that by rendering logic as a Function Block Diagram: a JSON format + a React Flow viewer + a Claude Code skill with two modes (Understand / Design). It ships as an open-source Claude Code plugin (later Codex). Outcome of this plan: a locally installable plugin that validates and renders `.logic.json` files with live reload, plus the skill that teaches Claude to produce them.

## Step 0 — Done by the brainstorming session before handoff

- Copy this plan to `docs/superpowers/plans/2026-10-18-logic-builder-plan.md`.
- Fix spec §9 and §11: `${CLAUDE_PLUGIN_ROOT}` is **not** expanded inside SKILL.md text. The skill calls the CLI through the "Base directory for this skill" path that Claude Code prints when a skill loads: `node "<base>/../../dist/cli.mjs" …`.
- `git init`; `.gitignore` = `node_modules/`, `local/`, `.superpowers/`, `.DS_Store`, `*.log`, `test-results/`, `playwright-report/`.
- First commit: `CLAUDE.md`, `docs/`, `.gitignore`.

## Repository layout (target)

```
.claude-plugin/plugin.json          name "logic-builder", version 0.1.0, author Gabriel Londoño, license MIT
.claude-plugin/marketplace.json     single plugin, "source": "./"
package.json                        npm workspaces; scripts: build, test, test:e2e, check:dist, typecheck
packages/core/                      browser-safe TS (no fs): format types, schema, type language, validator, view model
  src/format.ts  src/schema.ts  src/types/{parse,compat}.ts  src/validate/{schema,integrity,index}.ts
  src/viewModel/{mode,visibility,wires,index}.ts  src/index.ts
  package.json  exports: "./src/index.ts"   (consumed as TS source, no build order)
packages/viewer/                    Vite + React + TS + @xyflow/react + elkjs
  src/layout/elk.ts  src/layout/sizes.ts  src/components/*  src/state/*  src/App.tsx
  vite.config.ts  base: './'  build.outDir: ../../dist/viewer
packages/cli/                       Node CLI: src/index.ts, src/server.ts, src/watch.ts, src/checkCode.ts, src/openBrowser.ts
dist/cli.mjs  dist/viewer/          COMMITTED build output (marketplace users never build)
skills/logic-builder/
  SKILL.md                          ≤ ~200 lines
  references/format.md              full format reference (§5), loaded on demand
  references/logic.schema.json      SINGLE SOURCE of the JSON Schema (core imports it)
  examples/other-free-text.logic.json   design mode (spec Appendix A)
  examples/auth-gate.logic.json         understand mode, with unexplored groups
tests/fixtures/invalid/*.logic.json   one file per integrity rule
tests/fixtures/code-repo/             tiny fake repo for --check-code
tests/e2e/*.spec.ts                   Playwright
README.md  LICENSE (MIT, © 2026 Gabriel Londoño)
```

Tooling: TypeScript strict, vitest, esbuild (CLI bundle), Playwright (e2e only). Runtime deps: `ajv` (core), `react`, `react-dom`, `@xyflow/react`, `elkjs` (viewer). No `open` npm package, no express.

## Milestones

Each milestone ends green on its check, then commit.

### M0 — Workspace scaffold
npm workspaces, tsconfig base (strict, ES2022, moduleResolution bundler), vitest at root, empty packages. **Check:** `npm test` and `npm run typecheck` pass.

### M1 — Format types, JSON Schema, examples
- `format.ts`: TS types for every field in §5 (subject incl. `mode`, `focus?`; nodes incl. `explored`, `before`, `ref?`; wires incl. `op`, `before`; blockTypes incl. `body`, `before`; risks).
- `logic.schema.json` (draft 2020-12) in `skills/logic-builder/references/`; core imports it (`resolveJsonModule`). Use `ajv/dist/2020`.
- Write both examples from scratch, generic, English. `other-free-text` = spec Appendix A verbatim. `auth-gate` = understand mode: request → verify token → load roles → decide access (decision) → allow/deny result, with `external` Firebase-like auth provider, a `state` for session, and at least two `explored: false` groups with declared ports.
- **Check:** ajv accepts both examples; rejects structurally broken fixtures.

### M2 — Type language + compatibility
- Parser for strings: primitives, names, `T[]`, `T?`, `Record<K,V>`, `'literal'`. JSON objects: exactly one key `oneOf` with array value = union; any other object = struct.
- `compat(source, target, types) → ok | warning | error | unknown` (§5.6, nominal). Rules to encode as table tests: same name → ok; same primitive, both unnamed → ok; named vs. different name with compatible shape → warning; named vs. identical unnamed shape → warning; `T?`→`T` warning; `T`→`T?` ok; incompatible shape → error; undefined name → opaque → unknown (never error).
- **Check:** table tests pass, including explicit "no false red" cases.

### M3 — Validator + CLI `validate` + bundle
- Integrity checks (errors unless noted): unique ids in one file namespace, each `body` its own scope (`Type/id` in risk refs); `node.port` refs resolve (instances inherit ports from blockType; `removed` wires may resolve against `before` ports on node or blockType); `state` nodes referenced by bare id (synthesize one in/out port); `parent`, `of`, `refs`, `subject.focus` resolve; no parent cycles; no blockType body that contains itself directly or indirectly; pins: one port, name+type match the blockType port; group with children must not declare ports; ports only on unexplored groups; multiple wires into one input **allowed**; type compat per wire → errors fail, warnings and undefined type names are notices.
- CLI (`packages/cli`): `logic-builder validate <file> [--check-code <repoRoot>] [--json]`; exit 0 valid (warnings allowed), 1 invalid, 2 usage. `--check-code` (CLI only, uses fs): warn when `code.file` missing or `code.symbol` not found by text search; skip `change: new`.
- esbuild: `platform=node`, `format=esm`, bundle all, banner `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` → `dist/cli.mjs` with shebang.
- **Check:** `node dist/cli.mjs validate skills/logic-builder/examples/*.json` → 0; every `tests/fixtures/invalid/*` → 1 with a readable message naming the offending id; `--check-code` tested on `tests/fixtures/code-repo`.

### M4 — Pure view model (core, unit-tested)
`buildView(doc, { root, mode }) → { nodes, edges, breadcrumb, closedBoxes, pins }`. Order of operations is fixed:
1. **Mode.** Before: hide `new`, show `removed`, apply `before` fields (incl. `before.parent` → rebuild hierarchy per mode), no change colors. After: show all; `removed` as ghosts; merge ports that exist only in `before` as ghost ports so removed wires can attach. Design-mode only; understand mode ignores change fields.
2. **Resolve instances** (ports from blockType; blockType `modified` ⇒ all instances "affected"). Body node ids are prefixed `Type/`.
3. **Visibility.** Root = file root | group id | instance id (instance root shows its `body`). Open child groups breadth-first in document order while visible leaf nodes ≤ 25 (open frames don't count). Instances never open in place; unexplored groups never open. Everything else = closed box.
4. **Wires.** Lift each end to its nearest visible ancestor; drop if both ends land on the same node; ends outside the root become boundary pins keyed by outside `node.port` (inputs left, outputs right); closed-box ports get stable ids `in:<node>.<port>` / `out:<node>.<port>`; merge duplicate edges, keeping the list of original wire ids (tooltips, type checks).
5. **Marks.** Change color per item; open-risk dot; affected marks propagate upward to closed boxes; wire compat result from M2.
6. **Hidden wire rule:** a wire is hidden if either end is hidden.
- **Check:** snapshot + assertion tests on Appendix A for: file root, root=`vaccines`, root=`other-vaccines` (body), Before vs After, budget overflow (synthetic doc with 40 nodes), boundary pins, affected propagation, `focus`.

### M5 — ELK layout adapter (runs in Node too)
- `import ELK from 'elkjs/lib/elk.bundled.js'` (not the worker build).
- Root options: `elk.algorithm: layered`, `elk.direction: RIGHT`, `elk.hierarchyHandling: INCLUDE_CHILDREN`, sensible spacing; open groups as compound nodes with top padding for the label.
- Ports: globally unique ids, `port.side` WEST/EAST, `port.index`, `portConstraints: FIXED_ORDER`.
- Node sizes computed from label length and port count (like the prototype's `h()`), no DOM measuring.
- Output: positions relative to parent (matches React Flow `parentId`), parents before children, per-port y offsets for handles. Ignore ELK edge routes.
- **Check:** vitest on both examples: no overlapping siblings, children inside parents, ports in declared order.

### M6 — Viewer UI (React Flow)
Follow §6 and the prototype. Light theme, white blocks, kind icons, port names in grey, thin grey edges.
- Custom nodes: Block, Trigger, State, Decision, External, Result, GroupFrame (open), ClosedBox (incl. unexplored style), BoundaryPin, Ghost variant. Handles placed at ELK port y. Custom edge with hover tooltip (type, expanded shape, source → target) and color by compat/change.
- Chrome: breadcrumb (click to go up; Esc = up one level), Before/After toggle (design mode only), Risks button with open count → panel; clicking a risk highlights its refs (navigating to the level that contains them). Side panel on click (§6.3 fields). Double-click group/instance → enter; unexplored → panel with "Copy request for Claude" (`Explain "<label>" (<id>) in <file>`).
- React Flow: `nodesDraggable={false}`, pan/zoom on; `fitView` only when root changes; `updateNodeInternals` when handles change.
- State: root + mode in URL hash; on reload, if root vanished, walk up the breadcrumb to the nearest existing level. Initial root = `subject.focus` if set.
- Invalid doc: banner listing validation errors; keep last good render if any; never blank.
- Dev mode: Vite dev server can load an example via `?file=` from a dev-only endpoint or static import.
- **Check:** manual review of both examples against the prototype (hover, click, double-click, Before/After, risks, unexplored panel).

### M7 — `open` server, live reload, build, e2e
- `logic-builder open <file> [--port N] [--no-open]`: bind `127.0.0.1`, default port 0 (free); prints `logic-builder: http://127.0.0.1:<port>/`; starts even if the file is invalid (banner shows errors).
- Static: serve `dist/viewer` resolved from `import.meta.url`, block path traversal. `GET /api/doc` → `{ path, raw, doc|null, result }` (validation via core). `GET /api/events` → SSE: bare `change` events + `: keepalive` every 20 s; client refetches `/api/doc` on `change` and on EventSource reconnect.
- Watch the file's **directory**, match basename (treat `null` filename as change on macOS), debounce ~120 ms, retry parse once on JSON error, survive the file briefly disappearing (atomic rename).
- Open browser via `child_process` (`open` / `xdg-open` / `cmd /c start`).
- Root `npm run build` = viewer build then CLI bundle. `npm run check:dist` = build + `git diff --exit-code dist`.
- **Check (Playwright, against built `dist/cli.mjs`):** both examples render with zero console errors; editing a temp copy of an example updates the DOM without reload (spec success criterion 4); invalid file shows the banner.

### M8 — Skill + plugin manifests
- `SKILL.md` frontmatter `name: logic-builder`; `description` must encode §8.1 exactly: use when the user explicitly asks to explain/map/design logic as a diagram; for non-trivial design work, **offer in one line and wait**; never for simple tasks; never auto-run.
- Body (≤ ~200 lines): the two methods (§8.2), workflow (§8.4), file location (§8.5), fold-back after implementation (§8.6), cost targets (§2), CLI usage:
  - `node "<base>/../../dist/cli.mjs" validate logic/<id>.logic.json` (fix errors until exit 0).
  - Start `open` **once per file with Bash `run_in_background: true`**; never restart after edits (live reload handles it); share the printed URL.
  - Load `references/format.md` and an example only when writing a file.
- `references/format.md`: the full §5 reference in English, concise, with the type-language and compat table.
- **Check:** `claude --plugin-dir /path/to/logic-builder` → skill is listed; in a scratch repo, ask "explain <something> with a logic diagram" → Claude writes `logic/*.logic.json`, validates, opens the viewer. Note in README that installed plugins run from a cached copy (reinstall to pick up new `dist/`).

### M9 — Docs, release hygiene, acceptance
- `README.md` for external users: what/why (FBD, two modes), screenshot/GIF placeholder, install (marketplace add + install; `--plugin-dir` for dev), usage, format overview link, contributing (build, test, `check:dist`).
- `LICENSE` MIT.
- Confirm no internal names anywhere: `git grep -i` for any client/company terms Gabriel lists before publishing.
- **Acceptance with Gabriel** (spec §10.1): on his real repos, one Understand run (top level + two expansions) and one Design run. Scenarios and outputs live in git-ignored `local/`. Do not push to GitHub or publish to a marketplace without Gabriel's explicit go-ahead.

## Verification (end-to-end)

1. `npm ci && npm run typecheck && npm test` — unit tests (types, validator, view model, ELK).
2. `npm run build && npm run test:e2e` — Playwright on the built CLI + viewer, both examples, live reload, invalid banner.
3. `npm run check:dist` — committed `dist/` matches sources.
4. `node dist/cli.mjs validate skills/logic-builder/examples/other-free-text.logic.json` → exit 0; an invalid fixture → exit 1 with readable error.
5. `node dist/cli.mjs open skills/logic-builder/examples/other-free-text.logic.json` → manual pass: hover wire shows `Answer` shape; click `Save answer` shows code ref + "what changes"; double-click `Other: add vaccine` shows its body; Before/After; risks highlight; `conditions` shows the unexplored panel with a copyable request; edit the file → view updates in place.
6. `claude --plugin-dir .` in a scratch repo → skill triggers only on explicit request, produces a valid file, opens the viewer.
