# agentic-fbd launch: rename, viewer theme, landing page

Date: 2026-10-23. Status: draft for Gabriel's review.

## Intent

logic-builder becomes **agentic-fbd** (agentic function block diagrams) and goes public on GitHub
with a small landing page at `afbd.gabocodes.com`. The goal is to **share** the tool, not
sell it: someone who builds with coding agents should land on the page, understand in seconds why
it exists, and install it. Gabriel is credited as the creator.

The message every text and video must carry:

- **Who it's for:** engineers who build with coding agents and care about the logic of their
  program, not just that the app runs. Also anyone who wants to vibe-code the right way.
- **What it is:** a skill that lets you design and understand any application code as
  programmable, visual logic diagrams (PLC-style function block diagrams), which you read and
  edit before the agent writes code.
- **Why:** the agent builds fast, but the logic is still yours. agentic-fbd gives the mental model
  back. Problems that show up after implementation, even after brainstorming or grill-me, are
  logic problems the plan never showed.
- **Agents:** presented as for any coding agent, labelled "(Claude Code package only)", with a
  very small "Codex support in progress" note. The format, viewer and CLI are already
  agent-independent; only the skill package is Claude Code specific.

## Goals

1. Rename the project everywhere and make the repo safe to publish.
2. Give the viewer a new visual theme shared with the landing.
3. A landing page with a background hero video (three use cases), feature sections with real
   viewer screenshots, install, GitHub link, EN/ES switch.
4. A written description of the hero video and of the product, which Gabriel will reuse for his
   own promo video later.

## Non-goals

- Selling, pricing, sign-up, analytics, newsletter.
- Codex packaging (only mentioned as in progress).
- The social/README promo video. Gabriel makes it in another session with the `brag` skill; this
  project does not follow `brag`'s instructions.
- Adding blocks or wires from the UI, or any other viewer feature work.

## Anti-goals

- Looking like a generic AI SaaS page, or a Zipline clone. The style is an inspiration.
- Promising things that don't exist (any-agent support beyond the format, features not built).
- Any client or company-internal code, data or name in the repo **or its git history**.
- Using commercial fonts or third-party brand assets.

## Constraints

- Everything in English (code, UI, docs, commits, landing copy). Spanish exists only as the
  landing's ES translation.
- License stays **MIT, © 2026 Gabriel Londoño** (already in `LICENSE`, README and manifests).
  It keeps his copyright notice on every copy. No other license or NOTICE file.
- Gabriel does every `git push` himself (password-protected SSH key). The agent commits locally
  and tells him when a push is due.
- Remote: `git@github.com:gabolondon/agentic-fbd.git` (GitHub account `gabolondon`). It is
  **private** today and already holds the 32 local commits; it goes public only after project 1.
- **Author email (decided):** no personal email in the public history. Every commit, old and new, uses Gabriel's GitHub noreply address (`105686051+gabolondon@users.noreply.github.com`). On
  GitHub, "Keep my email addresses private" and "Block command line pushes that expose my email"
  are turned on.
- **Out of the repo, kept on Gabriel's machine:** the HyperFrames composition and its renders,
  any screenshot or capture scripts, and the style reference. The repo holds only the skill, its
  code, its docs and the landing site.
- DNS is in Cloudflare and Gabriel configures it.
- The third-party style reference lives in `local/design-reference/zipline/` (git-ignored) and is
  never committed. Our own tokens get our own names.
- `dist/` stays committed and `npm run check:dist` must stay clean.

## The three projects, in order

Each gets its own plan.

### 1. Rename and publish-readiness

- **Rename** `logic-builder` → `agentic-fbd` everywhere it is the product name: README, plugin
  and marketplace manifests (`.claude-plugin/`), the skill folder and its `name`, root and package
  `package.json` names, CLI help/banner text, viewer `<title>` and header, docs, examples' text,
  tests that assert the name. Today about 160 occurrences in 49 files. Install becomes:
  ```text
  /plugin marketplace add gabolondon/agentic-fbd
  /plugin install agentic-fbd@agentic-fbd
  ```
- **Kept as is (agent's call):** the `.logic.json` / `.layout.json` / `.draft.json` extensions,
  the `logic/` folder in user repos, and internal `lb-` CSS prefixes. They describe content, not
  the brand, and renaming them would break existing diagrams. Historical docs under
  `docs/superpowers/` (old specs and plans) keep their text; only living docs are renamed.
- **Security audit before going public**, over the working tree *and* the whole history:
  secrets and tokens, `.env` or key files, emails, local absolute paths, internal URLs, company or
  client names, real data, and anything that should be git-ignored. A first quick scan
  (2026-10-23) found no secrets, env files, absolute paths or company names; the "password" and
  "secret" hits are minified React code and a path-traversal test. The origin story in the
  2026-10-18 design ("an internal HTML document", "Case A") is generic and stays unless the full
  audit finds a real name. Also: `.gitignore` covers `local/`, `.superpowers/`, `.env*`, the
  viewer's `*.draft.json` / `*.review.json`, media and capture output.
- **Signed commits:** every commit is signed with an SSH signing key (`gpg.format ssh`,
  `commit.gpgsign true`) registered on GitHub as a *signing* key, so GitHub shows "Verified" and
  the authorship is provable. Gabriel's key is password-protected, so the agent's commits only
  work while the key is loaded in the macOS ssh-agent/keychain; the plan says how to set that up
  and Gabriel runs it. The rewritten old commits are re-signed too (for example
  `git rebase --root --exec 'git commit --amend --no-edit -S'` after the author rewrite).
- **History rewrite:** rewrite every commit's author and committer to the noreply address
  (`git filter-repo` with a mailmap), plus anything the audit finds. Gabriel approves the exact
  command first. Because the remote is private and nobody else has cloned it, the fix is a force
  push or deleting and recreating the GitHub repo; Gabriel does either.
- README updated for the new name and install, and linking the landing.
- Gabriel pushes; then the repo is made public by him.

### 2. Viewer theme

One token file of our own, used by both the viewer and the landing. Inspired by the reference:

- **Canvas** warm cream (around `#f7f4e8`), **ink** black text and 1px black hairline borders
  instead of shadows, a muted warm gray for secondary borders, **one brand violet** (around
  `#643aed`) as the accent surface.
- **Meaning colors stay** (new green, modified amber, risk red, trigger/selection blue), slightly
  toned to sit on cream. The Data box already uses violet; it becomes the brand accent.
- **Font:** Inter for all UI (free, Google Fonts or bundled), monospace for code as today. The
  condensed display face is **not** used in the viewer.
- **Radii:** about 10px for blocks on the canvas, 20px for panels, buttons and pills. Pill-shaped
  primary buttons (black fill, cream text) and ghost outline buttons.
- Light only, as today, unless the builder finds dark mode is already supported, in which case
  keep it working.
- All existing unit and e2e tests keep passing; screenshots in the README are regenerated.
- **Screenshots:** taken with a capture script kept outside the repo (Gabriel's machine). Only
  the resulting PNGs are committed (README images in `docs/images/`, landing images in `site/`).

### 3. Landing page

**Where and how:** a `site/` folder in this repo, Vite + React (same stack as the viewer), static
build, deployed to GitHub Pages by a GitHub Action on push to `main`, custom domain
`afbd.gabocodes.com` (a `CNAME` file in the build). Cloudflare: CNAME `afbd` →
`gabolondon.github.io`, DNS only (grey cloud), HTTPS enforced in Pages.

**i18n:** `i18next` (+ `react-i18next`) with `en.json` and `es.json` holding every string,
including the hero titles and subtitles. Default from the browser language, EN | ES switch in the
top bar, choice remembered in `localStorage` (wrapped in try/catch).

**Style:** the reference's editorial direction, with free fonts: Anton (display, uppercase,
line-height 0.85, 40px and up only) and Inter (everything else). Cream canvas, black pill and
ghost buttons, 20px radii, 1px black borders, no shadows, violet only for feature-card surfaces.
Full bleed, generous section gaps. Must work at phone width (16px gutters, no horizontal scroll;
display type scales down).

**Page order** (approved by Gabriel):

1. **Top bar:** menu, centered wordmark `agentic-fbd`, EN | ES, ghost "GitHub ↗". Floats over the
   hero.
2. **Hero:** full-bleed background video, dark, with a curved bottom edge into the cream canvas.
   Over it, HTML text (never baked into the video): a **title and subtitle per segment**, changing
   in sync with the video's `currentTime`, plus a ghost "Install the plugin ↗" button. Opening
   question (draft): *"Did your app's logic break after it was built?"* with *"Even with
   brainstorming or grill-me, the plan missed how states, data and functions really connect."*
3. **Statement:** "Blocks. Wires. Types. Logic you can read." plus the positioning line (draft):
   *"Logic diagrams for engineers who build with coding agents. Not vibe coding — or vibe coding
   done right."* and the agent line *"For any coding agent (Claude Code package only). Codex
   support in progress."*
4. **Features, in this order**, each a full-width block with an Anton statement, **3–4 compact
   sentences** (what you see, why it matters to an engineer, what the agent does with it) and a
   **real screenshot of the themed viewer**; some on violet cards:
   1. Understand → Design (two modes on the same diagram)
   2. Data box (where each piece of data lives, who reads and writes it)
   3. Before / After and Risks
   4. Code locations
   5. Edit → Copy for agent
   6. Living docs (committed next to the code, folded back to Understand)
5. **The real example** with an inline diagram thumbnail inside the headline: "One wire [thumb]
   caught the bug." and the "Other option" story from the README.
6. **"Two commands."** install block and a black pill "View on GitHub ↗".
7. **Footer:** "MIT License · made by Gabriel Londoño", EN | ES.

Screenshots come from the themed viewer on the repo's own generic examples, taken by the local
capture script (outside the repo).

### Hero video

- **Tool:** HyperFrames (HTML + GSAP compositions rendered to video), already installed. Not
  Remotion, and not via the `brag` skill's workflow.
- **Output:** a silent loop, about 30 s, rendered to WebM and MP4, plus a poster image. Played
  with `autoplay muted loop playsinline`. Diagram content only, no text in the video. The same
  composition can later render a version with English titles baked in, for the README or
  social posts (optional, not required here).
- **Look:** dark ink background, cream strokes and labels in Inter, violet for state/Data,
  amber for a flagged wire, red risk dot, green for fixed. Same shapes as the real viewer.
- **Segments, in this order** (B → A → C), each about 8–10 s, with an optional short intro beat
  for the opening question (agent's call):
  1. **B · Code turns into logic.** Lines of code fade; functions lift out as blocks; wires
     connect them; a state's Data box opens ("Answer store · Zustand · lost on reload").
     Draft title: *"Your code, as logic."* Subtitle: *"Ask your agent to explain a flow. It comes
     back as a function block diagram: typed blocks, wires, and where every piece of data
     lives."*
  2. **A · The diagram catches the bug.** The questionnaire wizard draws itself; the
     "Other · free text" wire turns amber with a risk dot, "number → OptionId"; it is fixed and
     turns green, "text → OtherAnswer ✓". Draft title: *"Catch the flaw before it's code."*
     Subtitle: *"A bare number wired into an OptionId port fits by shape but means something else.
     The diagram flags it while it's still a plan."*
  3. **C · Layer by layer.** A closed group ("Checkout"); the camera dives in; the inner layer
     appears; a block's panel opens with what it does and its file, `src/pay/charge.ts`. Draft
     title: *"Open only what matters."* Subtitle: *"Double-click a group to go one layer deeper.
     Every block points at the file and symbol it maps to."*
- The page holds a small table of segment start times so the HTML titles switch with the video.
- **Where it lives:** the composition and renders stay outside the repo, in a local folder on
  Gabriel's machine (for example `~/Repogit/agentic-fbd-media/`), possibly a private repo later.
  The site only needs the final files. *Agent's call, to confirm:* they are uploaded as assets of
  a GitHub Release of this repo (for example `hero-video-v1`); release assets are not part of the
  git history and are not cloned by `/plugin marketplace add`. The Pages Action downloads them
  into the build; locally they sit in a git-ignored `site/public/media/`.
- All example names in the video are generic and invented.

## Left to the builder

- Exact hex values of the toned meaning colors, spacing, and responsive breakpoints.
- Final English copy (drafts above are a starting point; keep the message and length rules), and
  the Spanish translation.
- HyperFrames composition structure, easing and exact timings.
- How the site build shares the token file with the viewer.
- Image formats and sizes for screenshots and the poster.
