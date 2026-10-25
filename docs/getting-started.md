# Getting started

This page takes you from nothing to a diagram of your own code on screen, then to a first
design, and ends with how to commit the result and what to do when something goes wrong.

## Requirements

- [Claude Code](https://claude.com/claude-code).
- Node.js 20 or later, on your `PATH`. The plugin's CLI and viewer ship prebuilt, so there is no
  `npm install` and nothing is added to your projects.
- A browser. The viewer is a local web page.

Check Node with:

```bash
node --version
```

## Install

Run these two commands inside Claude Code:

```text
/plugin marketplace add gabolondon/agentic-fbd
/plugin install agentic-fbd@agentic-fbd
```

If you installed the plugin under its old name, remove it first with
`/plugin uninstall logic-builder@logic-builder` and `/plugin marketplace remove logic-builder`,
then install it again as above.

Installed plugins run from a cached copy, so reinstall after a new version is published.

## Your first diagram (Understand)

Pick one specific thing in a repo you know: a feature, a flow, a tool, a pipeline. The skill
explains one subject at a time. It does not map a whole repository. Then ask in plain words:

```text
Explain how authorization works here, with a logic diagram.
```

Claude does this, in order:

1. Fixes the subject and its boundary. What is inside the diagram, and what stays outside as an
   `external` block (an API, a database, another module).
2. Reads only the code for that subject.
3. Writes `logic/<subject-id>.logic.json` in your repo, for example
   `logic/authorization.logic.json`. There is one file per subject.
4. Runs `validate` on the file and fixes every error until the command exits with 0. See
   [cli.md](cli.md) for what `validate` checks.
5. Starts the viewer once, in the background, with `open`. The CLI prints a line like
   `agentic-fbd: http://127.0.0.1:52341/` and Claude gives you that URL. The port is chosen by
   the system, so it is different each time.
6. Tells you in a few sentences what the diagram shows and where to look first, such as the risks.

The CLI also tries to open the URL in your default browser. If no browser opens, paste the URL
yourself.

The top level is a short story: a few triggers, one group per system or stage, and the final
results. Each block is a real piece of code (a handler, a function, a store, an endpoint) and
points at it. Click a block to read what it does, how it works step by step, and the code it
maps to. The viewer is described in [viewer.md](viewer.md). The kinds of blocks and how they
connect are in [blocks.md](blocks.md).

A finished example is in
[`skills/agentic-fbd/examples/auth-gate.logic.json`](../skills/agentic-fbd/examples/auth-gate.logic.json).
You can open it yourself from a clone of this repo:

```bash
node dist/cli.mjs open skills/agentic-fbd/examples/auth-gate.logic.json
```

### Ask for changes

The viewer reloads by itself whenever the file changes. To change the diagram, tell Claude in
the chat ("this decision is missing the expired-token case"). Claude edits the JSON, validates it
and says what changed. It does not restart the viewer.

You can also make small edits in the viewer and hand them to Claude. That loop is described in
[skill.md](skill.md#the-edit-loop-with-the-viewer).

## Going one layer deeper

Some groups on the first diagram are left closed, as not yet explored. They are
sub-areas Claude left alone to keep the level readable. Two ways to open one:

- An unexplored group offers a **Copy for agent** button. Click it and paste the text into
  Claude Code.
- Or just ask:

  ```text
  Go one layer deeper into the token check.
  ```

Claude reads only the code of that group, adds its children, rewires the connections that ended
on the group to the real blocks inside, and removes the "unexplored" mark. The viewer updates.
Then double-click the group to go inside it. **Esc** goes back up.

Groups you have not asked about stay closed. You get the understanding you ask for, one layer
at a time.

## Your first design

Understand explains code that exists. Design proposes a change on top of it, so you can find
logic flaws before any code is written. Ask in plain words:

```text
Design adding an "Other" option with free text to the questionnaire as a logic diagram
before we plan it.
```

Claude works on top of a diagram of that area. If there is none yet, it runs Understand first
or reuses the existing file. Then it:

- sets the diagram's mode to `design` and its focus to the group where the change happens;
- marks every block, wire and reusable block type as `new`, `modified` or `removed`;
- for each modified item, records what it was before and a short note on why it changes;
- reuses an existing store when one already holds the data, instead of adding a new one;
- hunts for risks, especially where a type changes, by following every wire the type travels on.

In the viewer, the **Before / After** toggle shows exactly what the change touches. The **Risks**
list names the fragile spots, and clicking one highlights the blocks and wires involved. A
finished example is
[`skills/agentic-fbd/examples/other-free-text.logic.json`](../skills/agentic-fbd/examples/other-free-text.logic.json).

When you approve the diagram, Claude asks whether to continue to an implementation plan that
uses the diagram as its basis. It does not start implementing on its own.

If you already have the idea in your head, say it and let Claude draw it:

```text
I want a retry step after the payment call, with a limit of three tries. Draw it as a
logic diagram so I can check it.
```

## After the code is written

When the change has been implemented, ask Claude to fold the design back into living
documentation (see [After implementation](skill.md#after-implementation)):

```text
The change is implemented. Update the logic diagram to match the code.
```

Claude sets the mode back to `understand`, clears the change marks, deletes removed items,
updates the code references to the real files and symbols, and runs `validate --check-code .`.

## Committing the diagram

Diagrams are living documentation. Commit them with the code they describe:

- `logic/<subject-id>.logic.json`: always.
- `logic/<subject-id>.layout.json`, if it exists: commit it with the diagram. It holds the block
  positions you set by dragging in the viewer. Only the viewer writes it.
- `<subject-id>.draft.json` and `<subject-id>.review.json`: do not commit. The viewer writes
  these while you edit. Add `*.draft.json` and `*.review.json` to your `.gitignore`.

Old versions live in git history. A new change to the same area updates the same file. It does
not create a copy.

## Troubleshooting

### Node is missing or too old

The CLI is a plain Node script and needs Node 20 or later (it is built for the `node20` target).
If `node --version` prints "command not found", install Node from
[nodejs.org](https://nodejs.org). If it prints a version below 20, upgrade it. On an older
version the CLI may fail with a syntax or module error instead of a clear message.

### The port is in use

`open` asks the system for a free port by default, so you normally do not see this. It happens
only when a port is requested with `--port` and something else already uses it. The CLI prints
a message like this, with exit code 1 (if the command does not return to your prompt, press
Ctrl+C):

```text
agentic-fbd: cannot start the server: listen EADDRINUSE: address already in use 127.0.0.1:4000
```

Pick another port, or drop `--port` so the system chooses one. `--port` takes a number from 0 to
65535, where 0 means "any free port". Outside that range, or not a number, the CLI exits with 2.
The server listens only on `127.0.0.1`, so it is not reachable from other machines.

### The viewer shows "offline"

The page keeps a live connection to the `open` process. An "offline" chip in the top bar means
that connection dropped, almost always because the `open` process ended: you pressed Ctrl+C in
the terminal, the background task was stopped, or Claude Code was closed.

What you see stays on screen, but changes to the file no longer arrive and saving from the viewer
fails with a message that nothing was saved. To recover, ask Claude to open the diagram again,
or run `open` yourself (see [cli.md](cli.md)). Without `--port` the new run has a new URL, so
use the new one. The browser retries the connection by itself, and once the server is back
the page reloads the current state.

Other messages from `open`:

- `agentic-fbd: <file> does not exist` (exit 1): the path is wrong. Run it from the repo root
  or give the full path.
- `agentic-fbd: the viewer is not built (dist/viewer is missing)` (exit 1): you are running
  a source checkout that was not built. Run `npm run build`. The installed plugin ships the
  viewer prebuilt.

### `validate` reports errors

`validate` exits 0 when the file is valid, 1 when it is not, and 2 when you used the command
wrongly. Warnings and notices never make a file invalid. For example:

```text
FAIL bad.logic.json: 1 error, 1 notice
  error   [unknown-node] wire "w1" to "b.i": node "b" does not exist
  notice  [undefined-type] type "Missing" is not defined in "types"; it is treated as opaque
```

Each line shows the level, the issue code in brackets and what is wrong. Claude fixes errors
itself and reruns `validate` before it gives you a URL, so you should rarely see one. If you
edit a file by hand, run `validate` yourself. The meaning of every code and how to fix it is
in [cli.md](cli.md).

Two things to know:

- The viewer opens even when the file is invalid. It shows the errors in a banner instead of
  the diagram.
- A file that cannot be read at all, such as a wrong path, reports a single `read` error.

To check that `code` references still match your repo, add `--check-code <repo-root>`. It warns
(it does not fail) about files and symbols that no longer exist.

### Claude did not offer or use the skill

The skill runs on its own only when you explicitly ask for a diagram. It never starts by
itself, and it does not offer itself for simple tasks. See [skill.md](skill.md) for the exact
rules. Asking to "explain", "map", "diagram" or "visualize" something is an explicit request.
