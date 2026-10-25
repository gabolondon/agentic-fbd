# Contributing to agentic-fbd

Thanks for helping. This page covers how to set up the repo, which checks a pull request must
pass, and the rules that keep the project clean to publish. For what the project is for, read
[`CLAUDE.md`](CLAUDE.md) and the [README](README.md). For the user docs, see
[`docs/README.md`](docs/README.md).

## Set up

You need Node.js 20 or newer. CI builds the website on Node 22. `package.json` sets no
`engines` field.

```bash
git clone https://github.com/gabolondon/agentic-fbd.git
cd agentic-fbd
npm install
```

This is an npm workspace:

| Path | What it is |
|---|---|
| `packages/core` | Format types, schema validation, type checking and the view model. Browser-safe TypeScript |
| `packages/viewer` | React + React Flow + elkjs app |
| `packages/cli` | Node CLI and local server, bundled with esbuild into `dist/cli.mjs` |
| `packages/theme` | Design tokens shared by the viewer and the website |
| `site` | The website |
| `skills/agentic-fbd` | The skill, format reference, schema and examples |
| `logic` | Diagrams of agentic-fbd itself, made with agentic-fbd |
| `.claude-plugin` | Plugin and marketplace manifests |

The format, CLI and viewer don't depend on Claude Code; only `skills/` and `.claude-plugin/` are
agent-specific.

## Checks a pull request must pass

Run these from the repo root before you open a pull request.

| Command | What it does |
|---|---|
| `npm test` | Unit tests with Vitest: types, validator, view model, layout, CLI and server. |
| `npm run typecheck` | Runs `tsc` on `packages/core`, `packages/cli`, `packages/viewer` and `site`. |
| `npm run build` | Builds the viewer into `dist/viewer` and the CLI into `dist/cli.mjs`. |
| `npm run test:e2e` | Playwright tests against the built CLI and viewer. Run `npm run build` first. |
| `npm run check:dist` | Runs `npm run build`, then fails if `dist/` differs from what is committed. |

The e2e tests need the Playwright browsers. If they are missing, run
`npx playwright install chromium` once.

To work on the viewer with live reload, run `npm run dev`. Set `LB_FILE=path/to/file.logic.json`
to pick the diagram it opens.

## Why `dist/` is committed

The installed plugin runs `dist/cli.mjs` and serves `dist/viewer` as they are. Nothing is built
on the user's machine. So `dist/` must always match the source.

If you change anything under `packages/`, run `npm run build` and commit the new `dist/` in the
same pull request. `npm run check:dist` is the check: it rebuilds and fails if the result
differs from what you committed.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(viewer): ...`,
  `fix(cli): ...`, `docs: ...`, `test: ...`, `ci: ...`, `chore: ...`. The scope is usually the
  component name.
- One logical change per commit.
- Write the message in English.

## Language and content rules

- Everything is in English: code, comments, UI text, docs, examples and commit messages.
- Do not add client or company-internal code, data or names, not even in comments, tests or
  examples. This repo is public.
- Write examples from scratch and keep them generic. Do not copy a diagram or snippet from a
  private project.

## Versions

Contributors do not change versions. Do not edit the version values in `versions.yaml`, the
version numbers in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, or the
release sections of `CHANGELOG.md`. The maintainer does that in a `chore(release): vX.Y.Z`
commit, which also creates the tags. Adding a component or fixing a path in `versions.yaml` is a
normal change.

## Reporting a vulnerability

Do not open a public issue. See [`SECURITY.md`](SECURITY.md).
