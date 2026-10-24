# Project 3 — Landing Page and Hero Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-page website at `afbd.gabocodes.com`. It opens on a looping hero video with English and Spanish titles over it, explains the six features with real screenshots of the themed viewer, and ends with the two install commands. GitHub Pages serves it, and a GitHub Action deploys it.

**Architecture:**
- **Site:** a new workspace, `site/` (`@agentic-fbd/site`), with Vite and React like the viewer. It reads colors, radii and the UI font from `@agentic-fbd/theme/tokens.css`. Its own stylesheet adds only the display font, Anton.
- **Text:** every string lives in `site/src/i18n/{en,es}.json` and goes through `react-i18next`.
- **Hero titles:** the hero's HTML title follows the video's `currentTime` through a small table of segment start times.
- **Video:** a HyperFrames composition on Gabriel's machine, outside the repo. Its renders live as assets of a GitHub Release, and the Pages Action downloads them into the build.

**Tech Stack:**
- Vite 8, React 19
- i18next 26 and react-i18next 17
- `@fontsource-variable/inter` 5.x, `@fontsource/anton` 5.x (both OFL-1.1)
- vitest, Playwright
- HyperFrames 0.8 (`npx hyperframes`), ffmpeg and cwebp (Homebrew)
- GitHub Actions: `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`

**Spec:** `docs/superpowers/specs/2026-10-23-agentic-fbd-launch-design.md`, sections "3. Landing page" and "Hero video". Style reference: `local/design-reference/zipline/` (git-ignored, never copied).

## Global Constraints

- **Repo rules carried over from projects 1 and 2:**
  - Everything is in English. Spanish exists only as `es.json`.
  - Commits are SSH-signed with the noreply identity and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - The agent never pushes and never touches `~/.ssh`.
  - Commit scopes: `feat(landing)`, `test`, `ci`, `docs`. Nothing in this plan changes `packages/theme`, so the viewer and skill keep their versions.
  - `dist/` stays committed, and `npm run check:dist` exits 0. The site builds to `site/dist/`, which is git-ignored and is not part of `check:dist`.
- **Message:**
  - Who it's for: engineers who build with coding agents, or vibe coding done right.
  - Agents line: "For any coding agent (Claude Code package only). Codex support in progress."
  - Promise only what exists.
  - Every example name is generic and invented.
- **Style:**
  - Colors: cream canvas; ink text, 1px ink borders, and black pill or ghost pill buttons; violet only for feature-card surfaces.
  - Radii: `--radius-panel` (20px) for buttons, cards and pills, and `--radius-block` for diagram-like boxes.
  - No shadows.
  - No color literals in `site/src`; everything comes from `tokens.css`.
  - The display face is Anton, uppercase, line-height 0.85, and never smaller than 40px. Everything else is Inter.
  - Must work at 375px width: 16px gutters, no horizontal scroll.
- **Page order (approved):**
  1. Top bar
  2. Hero
  3. Statement
  4. Features: Understand→Design, Data box, Before/After & Risks, Code locations, Edit → Copy for agent, Living docs
  5. Example ("One wire [thumb] caught the bug.")
  6. "Two commands."
  7. Footer: "MIT License · made by Gabriel Londoño"
- **Hero video:**
  - Silent loop of 30 s. Diagram content only; no titles are baked into the video.
  - Played with `autoplay muted loop playsinline`.
  - Segments run intro → B → A → C. Starts at **0, 3, 12, 21 s** (agent's call; the spec left the intro beat optional).
- **Out of the repo:** the HyperFrames composition and its renders, in `~/Repogit/agentic-fbd-media/`, and the capture scripts in `local/capture/`. Only the final WebP screenshots are committed. Video and poster files are Release assets only.
- **Language:** stored under the `localStorage` key `afbd.lang`, with every access in try/catch. Without a stored choice, the browser language decides: Spanish if it starts with `es`, English otherwise.

## Review Focus

1. **Phone portrait crops a 16:9 video to a thin center strip.** The composition is rendered twice, at **1920×1080 (`wide`)** and **1080×1350 (`tall`)**. The site picks one with `matchMedia('(orientation: portrait)')` when it mounts. In both, the diagram action stays clear of where the HTML title sits. Task 5 owns the renders, Task 2 owns the choice, and an e2e test checks which source is picked.
2. **Autoplaying motion longer than 5 s needs a pause control (WCAG 2.2.2), and reduced motion must not autoplay.** Task 2 adds a pause/play ghost button and an e2e test for `reducedMotion: 'reduce'`.
3. **Titles drifting from the video.** `site/src/hero/segments.ts` is the only copy of the start times. Task 5 builds the composition from those same numbers. An e2e test fakes `currentTime` and checks each title.
4. **The hero media Release becoming "Latest".** It must be created with `--latest=false` so `v0.2.1` stays Latest. Its tag, `media-hero-1`, avoids the `<component>-vX.Y.Z` pattern that the versioning skill reads, and the root `v*` pattern that triggers the Release Action.
5. **A deploy without the video, or with a missing screenshot.** The Pages Action fails if the media download fails. Screenshots are imported as modules, so a missing file breaks `vite build`. An e2e test checks that every image has loaded (`naturalWidth > 0`).

---

### Task 1: Site workspace, i18n, top bar and footer

**Files:**
- Create the site skeleton:
  - `site/package.json` (`@agentic-fbd/site`, private, scripts `dev`, `build`, `preview`)
  - `site/index.html` (title "agentic-fbd — logic diagrams for coding agents", description, `og:*` and favicon tags)
  - `site/vite.config.ts` (`base: '/'`, `outDir: 'dist'`)
  - `site/tsconfig.json` (same shape as `packages/viewer/tsconfig.json`)
  - `site/public/{CNAME,favicon.svg}`
- Create the app files:
  - `site/src/{main.tsx,App.tsx,styles.css}`
  - `site/src/i18n/{index.ts,language.ts,en.json,es.json}`
  - `site/src/sections/{TopBar.tsx,Footer.tsx}`
- Create the shared CSS helpers: `tests/helpers/css.ts`, with `read`, `stripComments`, `boxShadows` and `colorLiterals` moved out of `packages/viewer/test/theme.test.ts`, which now imports them.
- Create the tests:
  - `site/test/language.test.ts`, `site/test/i18n.test.ts`, `site/test/style-guard.test.ts`
  - `tests/e2e/site.spec.ts`
- Modify:
  - `package.json`: add `site` to workspaces, scripts `dev:site` and `build:site`, and `tsc -p site` in `typecheck`
  - `vitest.config.ts`: include `site/test/**/*.test.ts`
  - `.gitignore`: `site/dist/`
  - `package-lock.json`

**Interfaces:**
- Produces:
  - `pickLanguage(stored: string | null, browser: readonly string[]): 'en' | 'es'`
  - `setLanguage(lang: 'en' | 'es'): void`, which changes i18next, sets `<html lang>` and stores the choice
  - The `en.json` key tree: `nav`, `hero.{intro,b,a,c}.{title,subtitle}`, `hero.{install,pause,play}`, `statement`, `features.<id>.{title,body,alt}`, `example`, `install`, `footer`
  - CSS: `--font-display: 'Anton', 'Arial Narrow', sans-serif` and `--gutter: 16px` in `site/src/styles.css`'s `:root`
  - `tests/e2e/site.spec.ts` with a `serveSite()` helper, which runs `vite preview --port 0` on `site/dist` and parses the URL, in the style of `open()` in `open.spec.ts`, plus `trackErrors`, which ignores load failures for `/media/`

- [ ] **Step 1: Write the failing unit tests.**

```ts
test.each([
  ['es', ['en-US'], 'es'], ['en', ['es-CO'], 'en'], [null, ['es-CO', 'en'], 'es'],
  [null, ['fr-FR', 'es'], 'es'], [null, ['en-GB', 'es'], 'en'], [null, [], 'en'], ['de', ['de-DE'], 'en'],
])('pickLanguage(%s, %j) is %s', (stored, browser, want) => expect(pickLanguage(stored, browser)).toBe(want));

test('es.json has exactly the keys of en.json, none empty', () => {
  expect(flatKeys(es)).toEqual(flatKeys(en));
  expect(Object.values(flat(es)).filter((v) => !v.trim())).toEqual([]);
});

test('site styles and code hold no color literals, raw radii, raw fonts or blurred shadows', () => {
  for (const file of siteFiles) expect(colorLiterals(file), file).toEqual([]); // same regex as the viewer guard
  // plus the viewer's border-radius / font-family / box-shadow guards, run over site/src/**/*.css
});
```

`pickLanguage` uses the first browser language whose primary subtag is `en` or `es`.

- [ ] **Step 2: Run** `npx vitest run site/test`. Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Build the skeleton.**
  - **Packages:** run `npm install` with `react`, `react-dom`, `i18next ^26`, `react-i18next ^17`, `@fontsource-variable/inter ^5.3`, `@fontsource/anton ^5.3` and `@agentic-fbd/theme`, plus `vite` and `@vitejs/plugin-react` as dev dependencies, at the viewer's versions.
  - **`main.tsx`:** imports the fonts, then the tokens, then `styles.css`.
  - **Top bar:**
    - A menu button opens a small sheet with anchors to Features, Example and Install.
    - The centered wordmark `agentic-fbd`.
    - EN | ES as a segmented ghost pill, with `aria-pressed`.
    - A ghost "GitHub ↗" link to `https://github.com/gabolondon/agentic-fbd`, with `rel="noopener"`.
    - It sits absolutely over the hero, in `--on-ink` colors.
  - **Footer:** "MIT License · made by Gabriel Londoño", the license linked to the repo's `LICENSE`, plus EN | ES.
  - **`CNAME`:** contains `afbd.gabocodes.com`.

- [ ] **Step 4: Write the e2e tests.** They need `npm run build:site` first.
  - `the site loads in English with no errors`
  - `a Spanish browser gets Spanish, and EN sticks after a reload`, using `locale: 'es-ES'`. It also checks `html[lang]`.
  - `localStorage blocked still renders`. It uses an init script that makes `localStorage` throw.

- [ ] **Step 5: Run** `npm test`, `npm run typecheck`, `npm run build:site` and `npx playwright test site`. Expected: everything passes.

- [ ] **Step 6: Commit** `feat(landing): site workspace with i18n, top bar and footer`. The helper move goes first, in its own commit: `test: share the CSS guard helpers`. Check `%G?` = `G` on both.

---

### Task 2: Hero

**Files:**
- Create: `site/src/hero/{segments.ts,Hero.tsx,useHeroVideo.ts}`, `site/test/segments.test.ts`
- Modify: `site/src/App.tsx`, `site/src/styles.css`, `tests/e2e/site.spec.ts`

**Interfaces:**
- Produces:
  - `SEGMENTS: readonly { id: 'intro' | 'b' | 'a' | 'c'; start: number }[]`, with starts `0, 3, 12, 21`.
  - `HERO_DURATION = 30`.
  - `segmentAt(time: number): SegmentId`, which returns the last segment whose start is ≤ `time % HERO_DURATION`.
  - Media URLs: `/media/hero-{wide,tall}.{webm,mp4}` and `/media/hero-{wide,tall}-poster.webp`.

- [ ] **Step 1: Write the failing tests.**
  - `segmentAt` gives `intro` at 0 and 2.99, `b` at 3, `a` at 12, `c` at 21 and 29.9, and `intro` at 30.
  - It never throws on `NaN`, and returns `intro`.

- [ ] **Step 2: Run** the tests. Expected: FAIL.

- [ ] **Step 3: Build the hero.**
  - **Layout:** full bleed, `min-height: 100svh`, an `--ink` background so the hero looks right with no media, and a curved bottom edge into the cream (an elliptical bottom radius or an SVG mask; builder's call).
  - **Video:**
    - `<video autoplay muted loop playsinline aria-hidden="true">` with WebM and then MP4 sources.
    - The `wide` or `tall` set is chosen once with `matchMedia('(orientation: portrait)')`. The poster matches.
  - **Titles:**
    - The title and subtitle come from `hero.<segment>`, updated on `timeupdate`.
    - The title is an `<h1>` and the subtitle a `<p>`, with no `aria-live`.
    - A short opacity crossfade when the segment changes.
  - **Buttons:**
    - A ghost "Install the plugin ↓" link to `#install`. This is the agent's call: the target is on the same page, so the spec's ↗ became ↓.
    - A pause/play ghost button labelled from `hero.pause` and `hero.play`.
  - **Reduced motion:** with `prefers-reduced-motion: reduce`, the video starts paused on its poster and the intro title shows.
  - **Copy:** start from the spec's draft titles and subtitles, and the opening question for the intro.

- [ ] **Step 4: Add the e2e tests.**
  - `hero titles follow the video`: stub `currentTime` with `Object.defineProperty` on the element, dispatch `timeupdate` at 1, 5, 14 and 25, and expect the intro, B, A and C titles from `en.json`.
  - `portrait picks the tall video`: at a 375×800 viewport, the `<source>` URLs contain `hero-tall`.
  - `reduced motion does not autoplay`: the video is `paused`, and the button reads "Play".

- [ ] **Step 5: Run** the unit tests, the typecheck, `build:site` and the site e2e. Expected: PASS. Then **commit** `feat(landing): hero with segment titles over the background video`.

---

### Task 3: Screenshots of the themed viewer

**Files:**
- Create outside the repo: `local/capture/site-shots.mjs`, which reuses `settle()` and the Playwright import from `readme-shots.mjs`.
- Create in the repo:
  - `site/src/shots/{modes-understand,modes-design,data-box,before-after,code-locations,edit-copy,living-docs,wire-thumb}.webp`
  - `site/public/og.png` (1200×630)

**Interfaces:**
- Produces: these files, which Task 4 imports by these names.

- [ ] **Step 1: Write the capture script.** It uses a 1280×800 viewport at `deviceScaleFactor: 2`. It saves PNGs to the scratchpad and converts each one with `cwebp -q 82`. Each WebP must be ≤ 300 KB. The shots are:
  1. **modes-understand:** `auth-gate`, overview.
  2. **modes-design:** `other-free-text`, overview in After view.
  3. **data-box:** a state block selected with its Data box open on who reads and writes it.
  4. **before-after:** `other-free-text` with a risk clicked and what it touches highlighted.
  5. **code-locations:** a block panel showing its `.lb-where` chip.
  6. **edit-copy:** a draft with a renamed block and the edit bar's "Copy for agent" visible.
  7. **living-docs:** `auth-gate` opened from a temp folder holding both examples, so the structure panel lists both diagrams.
  8. **wire-thumb:** a tight crop, about 3:1, of the flagged `number → OptionId` wire.

  Plus `og.png`: the design overview cropped to 1200×630.

- [ ] **Step 2: Run** the script. Look at every image yourself, then show Gabriel the eight images.

- [ ] **Step 3: Check and commit.** Confirm `git check-ignore local/capture/site-shots.mjs` prints the path, then commit `feat(landing): themed viewer screenshots`.

---

### Task 4: Statement, features, example, install

**Files:**
- Create: `site/src/sections/{Statement,Features,Example,Install}.tsx`
- Modify: `site/src/App.tsx`, `site/src/styles.css`, `site/src/i18n/{en,es}.json`, `tests/e2e/site.spec.ts`

**Interfaces:**
- Consumes: Task 3's shots, and the i18n keys from Task 1.
- Produces: the sections, in this order and with these ids: `#statement`, `#features`, `#example`, `#install`. Features is an ordered list of six `<article>`s with ids `understand-design`, `data-box`, `before-after`, `code-locations`, `edit-copy` and `living-docs`.

- [ ] **Step 1: Write the failing e2e tests.**
  - `sections come in the approved order`: the ids in DOM order, and the six feature ids in order.
  - `install shows the two commands`: exact text `/plugin marketplace add gabolondon/agentic-fbd` and `/plugin install agentic-fbd@agentic-fbd`, each with a copy button.
  - `phone width: no horizontal scroll, display type ≥ 40px, every image loaded`, at 375×800:
    - `scrollWidth <= innerWidth`;
    - every element whose computed `font-family` starts with `Anton` has a computed `font-size` ≥ 40px;
    - every `img` has `naturalWidth > 0` after scrolling it into view, and a non-empty `alt`.

- [ ] **Step 2: Run** the tests. Expected: FAIL.

- [ ] **Step 3: Build the sections.**
  - **Statement:** "Blocks. Wires. Types. Logic you can read." in Anton, then the positioning line, then the agents line, set small, with "Codex support in progress" smaller still.
  - **Features:**
    - Each feature has an Anton statement of at most six words, 3–4 compact sentences (what you see, why it matters to an engineer, what the agent does with it), and its screenshot.
    - Understand → Design shows both mode shots side by side, stacked on phones.
    - Features 2 and 5 sit on violet cards (`--violet` surface, `--on-ink` text). The rest sit on cream with a 1px ink border around the image.
    - Images are lazy-loaded, with width and height set.
  - **Example:** "One wire [wire-thumb] caught the bug." The thumbnail sits inline at the cap height of the line. Below it goes the questionnaire story, condensed from the README's "A real example".
  - **Install:**
    - "Two commands." with two code rows, each with a copy button (`navigator.clipboard`, falling back to selecting the text).
    - "Needs Node.js 20 or later."
    - A black pill "View on GitHub ↗".
  - **Display type:** Anton sizes use `clamp(40px, …, …)`.
  - **Spanish:** translate every new key in `es.json`. Product words stay in English: block names, "Copy for agent", "Before / After", "Data box".

- [ ] **Step 4: Run** `npm test`, the typecheck, `build:site` and `npx playwright test site`. Expected: PASS.

- [ ] **Step 5: Gabriel reviews.** Show him the page in EN and ES at 1440 and 375 widths (screenshots or `npm run dev:site`), together with the full `en.json` copy. Apply his changes.

- [ ] **Step 6: Commit** `feat(landing): statement, features, example and install sections`.

---

### Task 5: Hero video (outside the repo)

**Files:**
- Create, in `~/Repogit/agentic-fbd-media/`:
  - `BRIEF.md`: the video's description and the product description, for Gabriel's later promo video (spec goal 4).
  - The HyperFrames project.
  - Renders: `out/hero-{wide,tall}.{webm,mp4}` and `out/hero-{wide,tall}-poster.webp`.
- Copy the renders to `site/public/media/` (git-ignored).

- [ ] **Step 1: Start with the `hyperframes` skill as the entry point,** and follow its routing. It is not a superpowers skill, so it needs no prior question.
  - `BRIEF.md` carries the spec's "Hero video" section, the segment start times from `segments.ts`, and the colors as hex values copied from `tokens.css`.
  - The brief also fixes two layouts. **Wide:** the diagram action stays in the right 60%. **Tall:** it stays in the top 55%.

- [ ] **Step 2: Build the composition.**
  - **Look:** an ink background, cream strokes, Inter labels, block shapes like the viewer's (4px corners, 1px borders), violet for state and Data, amber for the flagged wire, a red risk dot, and green for the fix.
  - **Segments:**
    - **intro (0–3 s):** the empty canvas, with a faint dot grid fading in.
    - **B (3–12 s):** lines of code fade out, functions lift out as blocks, wires connect them, and a state's Data box opens on "Answer store · Zustand · lost on reload".
    - **A (12–21 s):** the questionnaire wizard draws itself. The "Other · free text" wire turns amber with a risk dot and the label "number → OptionId", then turns green as "text → OtherAnswer ✓".
    - **C (21–30 s):** a closed "Checkout" group. The camera dives in, the inner layer appears, and a panel opens on a block with `src/pay/charge.ts`.
  - **Loop:** the last frame equals frame 0 (the empty canvas), so the loop has no visible seam.

- [ ] **Step 3: Render** both layouts at 30 fps. Re-encode with ffmpeg:
  - WebM: VP9, CRF about 36.
  - MP4: H.264, CRF about 26, with `-movflags +faststart`.
  - Each file must be ≤ 4 MB.

  Posters are frame 0, saved as WebP. Check that `ffprobe` reports 30.0 s ± 0.1 for each video.

- [ ] **Step 4: Gabriel reviews.** Copy the renders into `site/public/media/`, run `npm run dev:site`, and show Gabriel the hero, wide and tall. Iterate on the composition until he approves.

- [ ] **Step 5: Publish the media.** This creates a public Release, so ask Gabriel first and run it only after his yes:

```bash
gh release create media-hero-1 site/public/media/* --title "Hero video 1" \
  --notes "Hero video renders for afbd.gabocodes.com. Not a product release." --latest=false --target main
```

Then `gh release list` must still show `v0.2.1` as Latest.

---

### Task 6: Deploy to GitHub Pages, then release

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md` (only if the site URL line needs updating)

**Interfaces:**
- Consumes: the `media-hero-1` Release and `npm run build:site`.

- [ ] **Step 1: Write `pages.yml`.**
  - **Triggers:** push to `main` with paths `site/**`, `packages/theme/**` and `.github/workflows/pages.yml`, plus `workflow_dispatch`.
  - **Settings:** `permissions: { contents: read, pages: write, id-token: write }`, `concurrency: pages`, and `env: HERO_MEDIA: media-hero-1`.
  - **Build job:**
    1. checkout@v4
    2. setup-node@v4 (Node 22, npm cache)
    3. `npm ci`
    4. `gh release download "$HERO_MEDIA" --dir site/public/media`, with no fallback, so a missing video fails the deploy
    5. `npm run build:site`
    6. configure-pages@v5
    7. upload-pages-artifact@v3 with `path: site/dist`
  - **Deploy job:** deploy-pages@v4, in environment `github-pages`.

- [ ] **Step 2: Check locally.** Run `npx --yes @action-validator/cli .github/workflows/pages.yml` if it is available; otherwise review the file by eye. Then run the full suite: `npm test`, `npm run typecheck`, `npm run build:site`, `npm run test:e2e` and `npm run check:dist` (exit 0).

- [ ] **Step 3: Commit** `ci: deploy the website to GitHub Pages`.

- [ ] **Step 4: Repo settings.** These change the GitHub repo, so ask Gabriel first and run them only after his yes:

```bash
gh api -X POST repos/gabolondon/agentic-fbd/pages -f build_type=workflow
gh api -X PUT  repos/gabolondon/agentic-fbd/pages -f cname=afbd.gabocodes.com
```

- [ ] **Step 5: Gabriel's own steps.**
  1. In Cloudflare, add the CNAME `afbd` → `gabolondon.github.io` (DNS only, grey cloud).
  2. Optional but recommended against domain takeover: verify `gabocodes.com` under GitHub → Settings → Pages, which takes a TXT record.
  3. `git push origin main`.

- [ ] **Step 6: Verify.**
  - The Pages run succeeds.
  - `curl -sI https://afbd.gabocodes.com` returns 200 once the certificate is issued.
  - Then, with Gabriel's yes: `gh api -X PUT repos/gabolondon/agentic-fbd/pages -F https_enforced=true` and `gh repo edit gabolondon/agentic-fbd --homepage https://afbd.gabocodes.com`.

- [ ] **Step 7: Release.** Run `/omniscope-skills:version-release`. The expected result is `landing` 0.2.0 and root `v0.3.0`.
  - Hand Gabriel the two pushes: first `git push origin main landing-v0.2.0`, then `git push origin v0.3.0` alone.
  - Then check that the Release Action published `agentic-fbd v0.3.0` as Latest.
