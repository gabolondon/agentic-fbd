# Project 2 — Viewer Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The viewer adopts the agentic-fbd look: a cream canvas, black ink and hairlines, one violet accent, toned meaning colors, Inter, 10px and 20px radii, and pill buttons. Every color and shape comes from one token file that the landing (project 3) will reuse.

**Architecture:**
- A new workspace package, `packages/theme`, holds `tokens.css`: CSS custom properties only, and the only place in the viewer where a color literal may appear.
- `packages/viewer/src/styles.css` keeps its `lb-` classes and its structure, but reads every color, radius and font from the tokens. Shadows become hairlines.
- Inter is bundled from `@fontsource-variable/inter`, so the local viewer works offline.
- Guard tests stop literals and blurred shadows from creeping back in.

**Tech Stack:** CSS custom properties, Vite 8, React 19 + React Flow 12, vitest, Playwright, `@fontsource-variable/inter` 5.x (OFL-1.1).

**Spec:** `docs/superpowers/specs/2026-10-23-agentic-fbd-launch-design.md` (section "2. Viewer theme"; reference values in `local/design-reference/zipline/`, git-ignored).

## Global Constraints

- Everything is written in English. Commits are SSH-signed with the noreply identity and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The agent never pushes, and never touches `~/.ssh`.
- Brand values: cream `#f7f4e8`, ink `#000000`, stone `#c6c3ba` (secondary borders), violet `#643aed` (the one accent; the Data box uses it).
- Meaning colors stay as meanings: new green, modified amber, risk red, and trigger/selection blue. They are toned to sit on cream. The exact hex values are the builder's call, within the contrast rule in Task 1.
- Font: Inter for all UI, monospace for code as today. The condensed display face is **not** used in the viewer.
- Radii: 10px for blocks on the canvas, 20px for panels, buttons and pills.
- Buttons: the primary is a pill with a black fill and cream text; the secondary is a ghost pill with a 1px ink outline.
- No blurred shadows. Depth comes from 1px borders.
- Light only. The viewer has no dark mode today, so `color-scheme: light` is set explicitly.
- `lb-` class names, the DOM structure and all behavior stay the same. This project changes looks only.
- `dist/` stays committed, and `npm run check:dist` exits 0 after every task.
- Screenshots come from a capture script kept outside the repo, in `local/capture/` (git-ignored). Only the PNGs are committed.
- Conventional commit scopes, so the versioning skill bumps the right components: `feat(theme)` and `feat(viewer)`.

## Review Focus

1. **Contrast of muted and meaning text on cream.** The toned colors must stay readable. Task 1 pins WCAG ratios with a test.
2. **Missing font, or a font 404 in the built viewer.** The CLI serves `dist/viewer` offline. Task 4's e2e test checks that `Inter Variable` is loaded and that there are no console errors.
3. **React Flow's own colors** (the background dots, selection, the minimap if any) still showing the old cool grays. Task 2 sets them through React Flow's CSS variables, and the no-literal guard also covers `.tsx`.
4. **Edits panel states** (disabled buttons, the danger pill, the duplicate-port error, drafts) losing their meaning colors. The existing e2e tests exercise them. Task 3 also lists them in the visual check.
5. **Hairline shadows used for structure.** The stacked-card look of a closed group and the selection rings use zero-blur shadows. The guard allows zero blur and rejects any blur above 0.

---

### Task 1: Theme package and tokens

**Files:**
- Create: `packages/theme/package.json`, `packages/theme/tokens.css`
- Create: `packages/viewer/test/theme.test.ts`
- Modify: `versions.yaml` (add a `theme` component; `viewer` and `landing` depend on it), `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: the package `@agentic-fbd/theme` (private, version `0.1.0`, `"exports": { "./tokens.css": "./tokens.css" }`). In `:root`, `tokens.css` defines at least:
  - Brand: `--cream`, `--ink`, `--stone`, `--violet`, `--violet-bg` (a light tint for the Data box surface).
  - Text: `--muted` (secondary text).
  - Meaning: `--new`, `--mod`, `--risk`, `--sel`, `--trigger`, each with a `-bg` tint.
  - Kinds: `--k-<kind>` and `--k-<kind>-bg` for every kind that `styles.css` colors today (trigger, function, state, decision, and the rest found under "Kind colors").
  - Shape and type: `--radius-block: 10px`, `--radius-panel: 20px`, `--radius-small` (tooltips and inline chips; the builder's call, ≤ 10px), `--font-ui: 'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif`, `--font-mono: ui-monospace, 'SF Mono', Menlo, monospace`.
  - `color-scheme: light`.
- Tasks 2–4 and the project 3 landing read only these names.

- [ ] **Step 1: Write the failing tests** in `packages/viewer/test/theme.test.ts`. Use a small helper that reads `packages/theme/tokens.css` and parses `--name: value;` pairs.

```ts
test('brand tokens carry the spec values', () => {
  expect(tokens['--cream']).toBe('#f7f4e8');
  expect(tokens['--ink']).toBe('#000000');
  expect(tokens['--stone']).toBe('#c6c3ba');
  expect(tokens['--violet']).toBe('#643aed');
  expect(tokens['--radius-block']).toBe('10px');
  expect(tokens['--radius-panel']).toBe('20px');
  expect(tokens['--font-ui']).toMatch(/^'Inter Variable', Inter,/);
});

// WCAG 2.x relative luminance. Colors used as text need 4.5:1 (risk shows up in error
// messages); accents used for wires, borders and marks need 3:1 (WCAG 1.4.11).
test.each(['--ink', '--muted', '--risk'])('%s text is readable on cream', (name) => {
  expect(contrast(tokens[name]!, tokens['--cream']!)).toBeGreaterThanOrEqual(4.5);
});
test.each(['--new', '--mod', '--sel', '--trigger', '--violet'])('%s stands out on cream', (name) => {
  expect(contrast(tokens[name]!, tokens['--cream']!)).toBeGreaterThanOrEqual(3);
});
```

`contrast(a, b)` is a test-local helper: the standard sRGB luminance formula, returning `(L1 + 0.05) / (L2 + 0.05)`.

- [ ] **Step 2: Run** `npx vitest run packages/viewer/test/theme.test.ts`. Expected: FAIL, because the token file does not exist.

- [ ] **Step 3: Create the package and `tokens.css`.**
  - Start the meaning colors from the current ones (`#22a35a`, `#d69a12`, `#e0473f`, `#2f6fd6`) and darken or warm them only as far as the contrast tests need. Wherever the UI writes text in green, amber or blue, it uses `--ink` on that color's `-bg` tint instead.
  - Add `"packages/theme"` to the root workspaces. It is already covered by the `packages/*` glob, so just check that.
  - In `versions.yaml`, add a `theme` component (path `packages/theme`, version `0.1.0`), and add `theme` to `depends_on` for `viewer` and `landing`. This is a structural edit, so it goes in this normal commit, not a release commit.
  - Run `npm install`.

- [ ] **Step 4: Run** the theme test and `python3 <versioning skill>/scripts/detect.py`. Expected: PASS, and no manifest warnings.

- [ ] **Step 5: Commit** `feat(theme): agentic-fbd design tokens` and check `%G?` = `G`.

---

### Task 2: The viewer reads every color from the tokens

**Files:**
- Modify: `packages/viewer/src/main.tsx` (import `@agentic-fbd/theme/tokens.css` before `styles.css`), `packages/viewer/package.json` (add the `@agentic-fbd/theme` dependency), `packages/viewer/src/styles.css`, `packages/viewer/src/App.tsx:554` (the Background `color` prop)
- Test: `packages/viewer/test/theme.test.ts`

**Interfaces:**
- Consumes: the token names from Task 1.
- Produces: a `styles.css` with no color literals. The old local variables in its `:root` (`--bg`, `--canvas`, `--line`, `--border`, `--block`, `--frame-*`, `--ghost`) are either removed or defined only as `var(--token)` aliases, so that existing selectors keep working.

- [ ] **Step 1: Add the failing guard tests**

```ts
// Colors live in packages/theme/tokens.css only.
test('viewer styles and components hold no color literals', () => {
  for (const file of [stylesCss, ...viewerTsxFiles]) {
    const code = stripComments(read(file));
    expect(code.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi), file).toBeNull();
  }
});
```

Here `viewerTsxFiles` covers every `.ts`/`.tsx` under `packages/viewer/src`. The hex part of the regex must not match ids such as `#root` or `#/`: it only counts runs of 3, 4, 6 or 8 hex digits that end on a word boundary.

- [ ] **Step 2: Run** it. Expected: FAIL. It lists about 118 literals in `styles.css` and the one in `App.tsx`.

- [ ] **Step 3: Map every literal to a token.**
  - Surfaces become `--cream`, or a paler cream tint added to the tokens if a surface must stand out from the canvas.
  - Text becomes `--ink` or `--muted`. Primary borders become `--ink`; secondary borders and dividers become `--stone`.
  - The Data box uses `--violet` and `--violet-bg`.
  - Kind colors become `--k-*`.
  - The tooltip keeps a dark surface: `--ink` background and `--cream` text, with its accent text colors taken from the meaning tokens.
  - Remove the Background `color` prop and set `--xy-background-pattern-color: var(--stone)` on `.react-flow` in `styles.css`.
  - If a literal really needs a translucent value, add a token for it (for example `--frame-bg`). Do not inline it.

- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build` and `npm run test:e2e`. Expected: everything passes, and the guard is green.

- [ ] **Step 5: Commit** `feat(viewer): read every color from the theme tokens`, together with the rebuilt `dist/`. Then run `npm run check:dist` (exit 0) and check `%G?` = `G`.

---

### Task 3: Shapes, buttons and the font

**Files:**
- Modify: `packages/viewer/src/styles.css`, `packages/viewer/src/main.tsx` (import `@fontsource-variable/inter`), `packages/viewer/package.json` (add the `@fontsource-variable/inter` dependency, ^5.3)
- Test: `packages/viewer/test/theme.test.ts`

**Interfaces:**
- Consumes: `--radius-*`, `--font-ui`, `--font-mono`.
- Produces: the final look, which Task 4 checks in a real browser and photographs.

- [ ] **Step 1: Add the failing guard tests**

```ts
// Depth comes from 1px borders; zero-blur shadows (rings, the stacked card) are allowed.
test('no blurred shadows', () => {
  for (const [selector, value] of boxShadows(stylesCss)) {
    for (const layer of value.split(/,(?![^(]*\))/)) {
      const lengths = layer.replace(/var\([^)]*\)|inset/g, '').trim().split(/\s+/).filter((t) => /^-?\d/.test(t));
      expect(parseFloat(lengths[2] ?? '0'), `${selector}: ${layer}`).toBe(0);
    }
  }
});

test('shapes and fonts come from tokens', () => {
  const css = stripComments(read(stylesCss));
  expect(css.match(/border-radius:\s*(?!var\(|50%|0\b)[^;]+;/g)).toBeNull();
  expect(css.match(/font-family:\s*(?!var\()[^;]+;/g)).toBeNull();
});
```

`boxShadows(file)` is a test-local helper that returns `[selector, value]` for each `box-shadow` declaration.

- [ ] **Step 2: Run** them. Expected: FAIL. The output lists the 6 blurred shadows and the hard-coded radii and font families.

- [ ] **Step 3: Apply the shapes and the font.**
  - **Blocks:** `.lb-node` gets `--radius-block`, a 1px `--ink` border, and no shadow.
  - **Panels and cards:** the Data box, the edit bar, explanation sections and the selection and wire panels get `--radius-panel`. The docked side and navigation panels stay square at the window edges, separated by a 1px `--stone` line.
  - **Buttons:**
    - `.lb-button` is the primary pill: `--radius-panel`, `--ink` fill, `--cream` text.
    - `.lb-icon-button`, `.lb-up`, `.lb-button-small` and `.lb-caret-button` are ghost pills: transparent background and a 1px `--ink` outline. On hover, the background becomes `--stone` at a low tint (taken from a token).
    - Disabled and danger states keep their meaning.
  - **Small chips:** tooltips and inline chips use `--radius-small`.
  - **Remaining rings:** selection and highlight rings stay as zero-blur rings, and the closed-group stacked card becomes `3px 3px 0 -1px var(--cream), 3px 3px 0 0 var(--ink)`.
  - **Fonts:** `font-family` becomes `var(--font-ui)` on `:root` and `var(--font-mono)` wherever it is monospace today.
  - **Keep layout stable:** if Inter's metrics change block widths, adjust `packages/viewer/src/layout/sizes.ts` measurements so that labels still fit. The existing layout and arrange tests must keep passing.

- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build` and `npm run test:e2e`. Expected: everything passes.

- [ ] **Step 5: Visual check.** Open both examples with `node dist/cli.mjs open skills/agentic-fbd/examples/<file>`. Look at:
  - Overview, Before / After, risks, the Data box opened, a draft with edits, a removed block, the duplicate-port error, a wire panel, and the tooltip.
  - Fix anything that lost its meaning or reads badly on cream.

  Show Gabriel two screenshots, design and understand, taken with the script from Task 4 Step 2, before the commit.

- [ ] **Step 6: Commit** `feat(viewer): cream theme with Inter, hairlines and pill buttons`, together with the rebuilt `dist/`. Then run `check:dist` (exit 0) and check `%G?` = `G`.

---

### Task 4: Browser check, screenshots and README

**Files:**
- Modify: `tests/e2e/open.spec.ts` (one new test), `docs/images/viewer-design.png`, `docs/images/viewer-understand.png`, `README.md` (font credit)
- Create, outside the repo: `local/capture/readme-shots.mjs`, a copy of the session script that took the current README images. It is git-ignored under `local/` and stays on Gabriel's machine.

- [ ] **Step 1: Add the e2e test** `the viewer wears the agentic-fbd theme`. It opens the design example and checks:
  - `getComputedStyle(document.body).backgroundColor` is `rgb(247, 244, 232)`;
  - `.lb-node` has `border-radius: 10px`;
  - `.lb-button`, if one is on screen (otherwise open a panel that has one), has `border-radius: 20px`;
  - `await page.evaluate(() => document.fonts.check('13px "Inter Variable"'))` is `true` after `document.fonts.ready`;
  - `trackErrors` is empty.

  Run `npm run test:e2e`. Expected: 20 pass.

- [ ] **Step 2: Regenerate the README screenshots.**
  - Copy the session script to `local/capture/readme-shots.mjs` and change its Playwright import to the repo's `node_modules`, resolved relative to the script.
  - Open `other-free-text.logic.json` (design) and `auth-gate.logic.json` (understand) with `node dist/cli.mjs open … --no-open`.
  - Run `node local/capture/readme-shots.mjs <design-url> <understand-url> docs/images`.
  - Check that `git check-ignore local/capture/readme-shots.mjs` prints the path.

- [ ] **Step 3: README.** Add one line under the license section: `The viewer bundles the Inter typeface by Rasmus Andersson (SIL Open Font License 1.1).`

- [ ] **Step 4: Commit** `docs: README screenshots in the new theme`. Then run the full suite once more: `npm test`, `npm run test:e2e`, and `check:dist` (exit 0). Check `%G?` = `G`.

- [ ] **Step 5 (Gabriel): Push.** `git push origin main`. Releasing this as `v0.2.0`, with `/omniscope-skills:version-release`, is a separate step that comes up next, together with the GitHub Release Action.
