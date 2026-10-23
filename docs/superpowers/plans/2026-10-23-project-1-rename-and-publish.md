# Project 1 — Rename to agentic-fbd and Make the Repo Safe to Publish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The repo is renamed to agentic-fbd everywhere it names the product. A security audit finds nothing private in the tree or the history. Every commit, old and new, is authored with Gabriel's GitHub noreply address and signed. The repo is then ready for Gabriel to force-push and make public.

**Architecture:**
- The rename is a mechanical text and path change across manifests, packages, skill, CLI, viewer, tests and living docs. A guard test keeps the old name from coming back.
- The identity and signing changes are repo-local git config.
- The history rewrite is one `git rebase --root --exec`. It keeps every tree and every author date, and changes only the identity and the signature.

**Tech Stack:** git 2.56 (SSH signing), npm workspaces, TypeScript, vitest, Playwright, esbuild/Vite (for `dist/`).

**Spec:** `docs/superpowers/specs/2026-10-23-agentic-fbd-launch-design.md` (section "1. Rename and publish-readiness" and "Constraints").

## Global Constraints

- Everything is written in English: code, docs and commit messages.
- New product name: `agentic-fbd`. Package scope: `@agentic-fbd/*`. Install commands:
  `/plugin marketplace add gabolondon/agentic-fbd` and `/plugin install agentic-fbd@agentic-fbd`.
- Keep `.logic.json`, `.layout.json`, `.draft.json` and `.review.json`, the `logic/` folder in user repos, and the `lb-` CSS prefixes as they are.
- Historical docs under `docs/superpowers/specs/2026-10-18-*`, `docs/superpowers/plans/2026-10-18-*` and `docs/superpowers/plans/2026-10-22-*` keep their text and file names. The 2026-10-23 spec and this plan describe the rename, so they name the old product too.
- Commit identity: name `Gabriel Londoño`, email `105686051+gabolondon@users.noreply.github.com`. Every commit is SSH-signed.
- The agent never runs `git push`. Gabriel runs every push, and every step marked **(Gabriel)**.
- Gabriel's SSH key has a password. Signed commits only work while it is loaded in the macOS ssh-agent. If a commit fails to sign, stop and ask him. Never disable signing to get past it.
- `dist/` stays committed. `npm run check:dist` must exit 0 after any source change.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A rewrite that changes content or dates.** After Task 5, every rewritten commit must have the same tree and the same author date as its original. Only the name, the email and the signature may change. Task 5 checks this tree by tree.
2. **The old name surviving where users see it.** This includes CLI messages, the viewer `<title>`, the schema `$id`, the skill `name`, the README install lines and the bundled `dist/`. The guard test in Task 2 covers living files, including `dist/`.
3. **The CLI path the skill uses breaks after the folder move.** `SKILL.md` calls `<base>/../../dist/cli.mjs`. The e2e tests and one manual skill-relative run in Task 2 prove it still resolves from `skills/agentic-fbd/`.
4. **Signing silently off.** If a commit is made without a signature, the rewrite and Gabriel's "Verified" badge both fail later. Task 1 verifies a signature before any real work. Task 5 checks `%G?` on every commit.
5. **Private material in history but not in the tree.** A file that was deleted long ago still ships with the history. Task 4 scans every revision, not only `HEAD`.

---

### Task 1: Commit identity and SSH signing

**Files:**
- Modify: `.git/config` (repo-local, via `git config`)
- Create: `.git/allowed_signers` (local verification only, not committed)
- Commit: `docs/superpowers/specs/2026-10-23-agentic-fbd-launch-design.md`, `docs/superpowers/plans/2026-10-23-project-1-rename-and-publish.md`

**Interfaces:**
- Produces: repo-local `user.name`, `user.email`, `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true` and `gpg.ssh.allowedSignersFile`. Tasks 2–5 rely on every `git commit` being signed with this identity.

- [ ] **Step 1 (Gabriel): Pick the signing key and load it.** Use an existing key or make a new one, for example `ssh-keygen -t ed25519 -C "agentic-fbd signing"`. Then run `ssh-add --apple-use-keychain ~/.ssh/<key>`. Add the `.pub` key on GitHub under Settings → SSH and GPG keys → New SSH key, with **Key type: Signing Key**. On Settings → Emails, turn on "Keep my email addresses private" and "Block command line pushes that expose my email". Tell the agent the `.pub` path. The agent cannot read `~/.ssh`.

- [ ] **Step 2: Set the repo-local identity and signing**

```bash
git config user.name "Gabriel Londoño"
git config user.email "105686051+gabolondon@users.noreply.github.com"
git config gpg.format ssh
git config user.signingkey "<path to the .pub Gabriel gave>"
git config commit.gpgsign true
printf '105686051+gabolondon@users.noreply.github.com %s\n' "$(cat <path to .pub>)" > .git/allowed_signers
git config gpg.ssh.allowedSignersFile .git/allowed_signers
```

If the hook blocks reading `~/.ssh`, ask Gabriel to run the `printf` line himself with `! <command>`.

- [ ] **Step 3: Commit the spec and this plan, and verify the signature**

```bash
git add docs/superpowers/specs/2026-10-23-agentic-fbd-launch-design.md docs/superpowers/plans/2026-10-23-project-1-rename-and-publish.md
git commit -m "docs: agentic-fbd launch design and project 1 plan"
git log -1 --format='%an <%ae> | %G?'
```

Expected: `Gabriel Londoño <105686051+gabolondon@users.noreply.github.com> | G`. On any other `%G?` value, or if the commit fails, stop and ask Gabriel. The usual cause is that the key is not loaded in the agent.

---

### Task 2: Rename logic-builder → agentic-fbd

**Files:**
- Create: `packages/cli/test/name.test.ts`
- Move: `skills/logic-builder/` → `skills/agentic-fbd/` (`git mv`)
- Modify: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `package.json`, `packages/{core,cli,viewer}/package.json`, `package-lock.json` (regenerated), every `@logic-builder/core` import in `packages/**/src` and `packages/**/test`, `packages/cli/src/main.ts`, `packages/cli/src/api.ts`, `packages/core/src/format.ts`, `packages/core/src/schema.ts`, `packages/core/test/helpers.ts`, `packages/cli/test/{server,validate}.test.ts`, `packages/viewer/test/{arrange,layout,tree}.test.ts`, `packages/viewer/index.html`, `packages/viewer/src/App.tsx`, `packages/viewer/src/state/useDocument.ts`, `packages/viewer/vite.config.ts`, `skills/agentic-fbd/SKILL.md`, `skills/agentic-fbd/references/format.md`, `skills/agentic-fbd/references/logic.schema.json`, `logic/phase-2d-2e.logic.json`, `tests/e2e/open.spec.ts`, `CLAUDE.md`, `README.md`, `dist/` (rebuilt)

**Interfaces:**
- Consumes: signed commits from Task 1.
- Produces: skill at `skills/agentic-fbd/` with `name: agentic-fbd`. Packages `@agentic-fbd/core`, `@agentic-fbd/cli` and `@agentic-fbd/viewer`. Root package `agentic-fbd-monorepo`. CLI messages prefixed `agentic-fbd:`. Schema `$id` `https://github.com/gabolondon/agentic-fbd/logic.schema.json`, title `agentic-fbd file`.

- [ ] **Step 1: Write the failing guard test** in `packages/cli/test/name.test.ts`

```ts
// The product was renamed from logic-builder; only historical docs may keep the old name.
test('no living file names the product logic-builder', () => {
  const out = spawnSync('git', ['grep', '-n', '-I', '-i', '-E', 'logic[- ]builder', '--',
    '.', ':!docs/superpowers/specs/2026-10-18-*', ':!docs/superpowers/plans/2026-10-18-*',
    ':!docs/superpowers/plans/2026-10-22-*', ':!docs/superpowers/*/2026-10-23-*',
    ':!packages/cli/test/name.test.ts'],
    { cwd: repoRoot, encoding: 'utf8' });
  // Links to the historical design doc keep its original file name, and the README tells
  // people who installed the old name how to remove it.
  const allowed = ['2026-10-18-logic-builder-', 'uninstall logic-builder@logic-builder', 'remove logic-builder'];
  const hits = out.stdout.split('\n').filter((l) => l && !allowed.some((a) => l.includes(a)));
  expect(hits).toEqual([]);
});
```

Here `repoRoot` is the repo root, resolved the same way `validate.test.ts` does it. `git grep` searches tracked files, so `dist/` and `package-lock.json` are covered.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run packages/cli/test/name.test.ts`
Expected: FAIL. The output lists about 80 matching lines.

- [ ] **Step 3: Rename**

- `git mv skills/logic-builder skills/agentic-fbd`.
- Replace `@logic-builder/` with `@agentic-fbd/` and `logic-builder` with `agentic-fbd` in every file listed above. The exceptions:
  - The README and `CLAUDE.md` keep their links to `docs/superpowers/specs/2026-10-18-logic-builder-design.md`. That file name is historical, and the guard test already lets those lines through.
  - `logic.schema.json` gets the `$id` and title from Interfaces.
  - In `logic/phase-2d-2e.logic.json`, the `code.file` refs become `skills/agentic-fbd/SKILL.md` and the scope becomes `agentic-fbd: core, CLI server, viewer and skill`.
- README:
  - Use the install lines from Global Constraints.
  - Change `claude --plugin-dir /path/to/agentic-fbd`.
  - Update the layout table path to `skills/agentic-fbd`.
  - Add one line under the title: `Website: https://afbd.gabocodes.com` (live after project 3).
  - Under Install, add a short note for people who installed the old name: `/plugin uninstall logic-builder@logic-builder` and `/plugin marketplace remove logic-builder`, then install again.
- Run `npm install` to regenerate `package-lock.json`. Then run `npm run build` to rebuild `dist/`.

- [ ] **Step 4: Run everything**

```bash
npx vitest run packages/cli/test/name.test.ts   # PASS
npm test && npm run typecheck                    # all pass, as before (220 unit tests + the new one)
npm run test:e2e                                 # 19 pass
npm run check:dist                               # exit 0
node skills/agentic-fbd/../../dist/cli.mjs validate skills/agentic-fbd/examples/*.logic.json   # skill-relative CLI path still works
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: rename logic-builder to agentic-fbd"
git log -1 --format='%ae %G?'    # noreply address, G
```

- [ ] **Step 6 (Gabriel, after the commit): Reinstall locally.** In Claude Code, run `/plugin uninstall logic-builder@logic-builder` and `/plugin marketplace remove logic-builder`. Then run `/plugin marketplace add <path to this checkout>` and `/plugin install agentic-fbd@agentic-fbd` in a new session. Renaming the local folder is optional and not part of this plan, because it would move Claude's per-project memory.

---

### Task 3: Ignore what must never be committed

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check what is not ignored yet**

```bash
for f in .env .env.local x.pem x.key logic/a.draft.json logic/a.review.json site/public/media/hero.webm; do git check-ignore -q "$f" && echo "ignored  $f" || echo "MISSING  $f"; done
```

Expected: every line prints `MISSING`. Only `local/` and `.superpowers/` are ignored today.

- [ ] **Step 2: Add these entries to `.gitignore`**, each under a one-line comment: `.env`, `.env.*`, `*.pem`, `*.key`, `*.draft.json`, `*.review.json` (viewer drafts and review copies) and `site/public/media/` (hero video renders, hosted as release assets).

- [ ] **Step 3: Re-run the Step 1 loop.** Expected: every line prints `ignored`. Then run `git status --short`. Expected: only `.gitignore` is listed, because no tracked file became ignored.

- [ ] **Step 4: Commit** `chore: ignore env files, keys, viewer drafts and media renders`. Then check `%G?` = `G`.

---

### Task 4: Security audit of the tree and the whole history

**Files:**
- Create: `<scratchpad>/audit.md`, in the agent session scratchpad. This is outside the repo and is never committed.

**Interfaces:**
- Produces: a findings list that Gabriel reads. Task 5 starts only when he says the history is clean, or after his chosen fixes are committed.

- [ ] **Step 1 (Gabriel): Give the list of private names to search for.** That means internal app, service, project, client and bucket names at his employer or elsewhere. Naming his employer is fine. Its infrastructure must not appear. The list stays in the scratchpad, never in the repo.

- [ ] **Step 2: Scan every revision.** For each pattern, run `git grep -n -I -i -E '<pattern>' $(git rev-list --all)`, then deduplicate by file and line. The patterns:
  - Secrets: `(api|secret|access)[_-]?key`, `token`, `password`, `BEGIN [A-Z ]*PRIVATE KEY`, `ghp_|gho_|github_pat_`, `sk-[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{35}`, `xox[abp]-`.
  - Emails: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`. Allowed: `noreply@anthropic.com`, the noreply address, and `example.com` and `example.org` addresses.
  - Paths and hosts: `/Users/`, `/home/`, `C:\\`, `localhost:[0-9]+` outside tests, internal-looking URLs.
  - Cloud: `firebase`, `gcloud`, `gs://`, `projectId`, `\.run\.app`, `\.web\.app`.
  - Gabriel's private names from Step 1, and his employer's name.

  Also list every path ever committed with `git log --all --name-only --format= | sort -u`. Flag `.env`, keys, data dumps, `local/`, and any file over 1 MB (`git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)'`).

- [ ] **Step 3: Classify each hit** in `audit.md` as *false positive* (with the reason, e.g. "minified React in dist/", "path-traversal test") or *real*, with commit, file and line. Expected false positives from the 2026-10-23 quick scan:
  - "password" in minified `dist/viewer` bundles;
  - "secret" in a path-traversal test;
  - "Firebase" as a generic example in docs and examples.

- [ ] **Step 4: Report to Gabriel and wait.** Send the *real* findings, most serious first, and a one-line count of the false positives. If there are real findings in the tree, fix them in a commit, with Gabriel's approval of each change. If there are real findings only in old commits, the fix is part of Task 5's rewrite. In that case, add an `--exec` edit, or give Gabriel the option to start a fresh history. That choice is his.

---

### Task 5: Rewrite the history with the noreply identity and signatures

**Files:**
- Create: `../agentic-fbd-backup-2026-10-23.bundle`. This is a backup next to the repo folder, not inside it.

**Interfaces:**
- Consumes: Task 4 approved by Gabriel, and signing from Task 1.
- Produces: a `main` with the same trees and author dates as before. Every commit has author and committer `Gabriel Londoño <105686051+gabolondon@users.noreply.github.com>` and `%G? = G`.

- [ ] **Step 1: Back up and record the originals**

```bash
git bundle create ../agentic-fbd-backup-2026-10-23.bundle --all
git branch backup/pre-rewrite main
git log --reverse --format='%T %ad' --date=iso-strict main > <scratchpad>/before.txt   # tree + author date per commit
```

- [ ] **Step 2: Show Gabriel the exact command and wait for his yes**

```bash
git rebase --root --committer-date-is-author-date \
  --exec 'GIT_COMMITTER_DATE="$(git log -1 --format=%aD)" git commit --amend --no-edit -S --author="Gabriel Londoño <105686051+gabolondon@users.noreply.github.com>"'
```

The commit messages and their `Co-Authored-By` trailers are left as they are.

- [ ] **Step 3: Run it, then verify**

```bash
git log --reverse --format='%T %ad' --date=iso-strict main | diff - <scratchpad>/before.txt   # no output
git diff backup/pre-rewrite main                                                           # no output
git log --format='%an <%ae>|%cn <%ce>|%G?' main | sort | uniq -c
```

Expected: the two diffs are empty. The last command prints one line: `<count> Gabriel Londoño <105686051+…>|Gabriel Londoño <105686051+…>|G`, where count = 32 + this project's commits. Run `npm test` and `npm run check:dist` once more.

- [ ] **Step 4: Hand over to Gabriel**

Tell him the next steps are his:
1. Run `git push --force-with-lease origin main`. The remote is private and nobody else has cloned it. Deleting and recreating the GitHub repo, then running `git push -u origin main`, works too.
2. Check that the commit list on GitHub shows "Verified" and his avatar.
3. Keep `backup/pre-rewrite` and the bundle until he has checked GitHub. Then delete the branch with `git branch -D backup/pre-rewrite`.

---

### Task 6 (Gabriel): Go public

- [ ] On GitHub, open the repo's Settings and make the repo public.
- [ ] Add the description "Logic diagrams for engineers who build with coding agents" and the topics `function-block-diagram`, `claude-code`, `coding-agents` and `logic`.
- [ ] Enable secret scanning, push protection and Dependabot alerts. They are free on public repos.
- [ ] From a clean machine or a new session, run `/plugin marketplace add gabolondon/agentic-fbd`, then `/plugin install agentic-fbd@agentic-fbd`. Ask for a diagram of anything to confirm the public install works.
