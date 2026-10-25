# CLI

agentic-fbd ships a small command line tool with two commands:

- `validate` checks one or more diagram files and reports problems.
- `open` starts the local viewer for a diagram.

Claude runs both for you when you use the plugin. You can also run them by hand, for example in
CI or before you commit a diagram.

For the file format itself, see
[`format.md`](../skills/agentic-fbd/references/format.md). For the node kinds and their fields,
see [Blocks](blocks.md). For what you can do in the viewer, see [Viewer](viewer.md).

## Running it

The CLI is one file with no dependencies: `dist/cli.mjs`. It needs Node.js 20 or later. The
bundle is built for Node 20, and `package.json` has no `engines` field, so older versions are not
checked for you.

**From the installed plugin.** The file sits two folders above the skill folder, inside the
plugin:

```bash
node "<plugin>/dist/cli.mjs" validate logic/auth-gate.logic.json
```

`<plugin>` is the folder where Claude Code installed agentic-fbd.

**From a clone.** Run it from the repo root. `dist/` is committed, so you do not need to build:

```bash
node dist/cli.mjs validate skills/agentic-fbd/examples/auth-gate.logic.json
```

If you change the source, run `npm run build` to rebuild `dist/`.

All examples below use `node dist/cli.mjs`. Replace it with your own path if you run the plugin
copy.

Usage and exit codes are printed by `node dist/cli.mjs --help`:

```text
Usage:
  agentic-fbd validate <file.logic.json>... [--check-code <repo-root>] [--json]
  agentic-fbd open <file.logic.json> [--port <n>] [--no-open]

Exit codes: 0 valid (warnings allowed), 1 invalid, 2 usage error.
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Every file is valid. Warnings and notices do not fail validation. `--help` also exits 0. |
| 1 | At least one file has an error, a file cannot be read, or `open` could not start. |
| 2 | Usage error: no command or an unknown command, `validate` with no file, `open` without exactly one file, a flag that needs a value and has none, or a bad `--port`. |

Flags that the CLI does not know are ignored without an error.

## `validate`

```text
node dist/cli.mjs validate <file.logic.json>... [--check-code <repo-root>] [--json]
```

You can pass several files. Each file is checked on its own, and the exit code is 1 if any of
them is invalid.

For each file `validate` runs these checks, in this order:

1. The file is read and parsed as JSON.
2. The structure is checked against the
   [JSON Schema](../skills/agentic-fbd/references/logic.schema.json).
3. If the structure is fine, it checks what the schema cannot express: ids, references, ports,
   wire types, groups, pins, block types and explanations.
4. It checks that every `see` link points at a diagram and a block that exist in the same folder.
5. With `--check-code`, it checks that every `code` reference still exists in your repo.

A problem is an **issue**. Each issue has a level (`error`, `warning` or `notice`), a stable
`code`, a `path` that says where it is, and a `message`. A file is valid when it has no errors.

If step 2 finds errors, steps 3 to 5 do not run. Fix the schema errors first. More issues can
show up afterward.

### A valid file

```bash
node dist/cli.mjs validate skills/agentic-fbd/examples/auth-gate.logic.json
```

```text
ok   auth-gate.logic.json: no issues
```

The first column is `ok` or `FAIL`. Then comes the file name (without its folder) and a count
of issues by level. The exit code is 0.

### A file with an error

Here a wire reads from `verify.token`, but the block `verify` has an output named `idToken`. The
block `provider` also links to a diagram that is not in the folder.

```bash
node dist/cli.mjs validate broken.logic.json
```

```text
FAIL broken.logic.json: 1 error, 1 warning
  error   [unknown-port] wire "w2" from "verify.token": "verify" has no output "token" (outputs: idToken)
  warning [link-missing-file] "provider" links to billing.logic.json, which is missing or unreadable next to this file
```

The exit code is 1. Each issue line is `level [code] message`. Look the code up in the
[issue codes](#issue-codes) table.

### Several files

```bash
node dist/cli.mjs validate good.logic.json missing.logic.json
```

```text
ok   good.logic.json: no issues
FAIL missing.logic.json: 1 error
  error   [read] cannot read file: ENOENT: no such file or directory, open 'missing.logic.json'
```

The exit code is 1 because one file failed.

### `--check-code <repo-root>`

Diagrams point at real code with `code: { "file": ..., "symbol": ... }`. Code moves. With
`--check-code`, `validate` looks each reference up under the repo root you give and warns when:

- the file does not exist, or
- the file exists but the symbol does not appear in it (a plain text search, not a parser).

```bash
node dist/cli.mjs validate good.logic.json --check-code repo
```

```text
ok   good.logic.json: 3 warnings
  warning [stale-code] "verify" points to readSessionCookie in server/auth/session.ts, but that symbol does not appear in the file
  warning [stale-code] "proxy" points to handleRequest in server/proxy.ts, but that symbol does not appear in the file
  warning [stale-code] "access-log" points to server/audit.ts, which does not exist
```

These are warnings, so the exit code stays 0. Things to know:

- Paths in `code.file` are resolved against `<repo-root>`, not against the diagram's folder.
- Nodes and block types marked `change: "new"` are skipped. Their code does not exist yet.
- Block types, nodes inside block bodies and `typeInfo` entries are checked too.
- The flag needs a value. `--check-code` with nothing after it is a usage error (exit 2). The
  next argument is always taken as the value, so `--check-code --json` would use `--json` as the
  repo root. Always write the root right after the flag.

### `--json`

`--json` prints the result as JSON instead of text. With one file you get one object. With
several files you get an array of those objects.

```bash
node dist/cli.mjs validate broken.logic.json --json
```

```json
{
  "file": "broken.logic.json",
  "valid": false,
  "issues": [
    {
      "level": "error",
      "code": "unknown-port",
      "path": "w2",
      "message": "wire \"w2\" from \"verify.token\": \"verify\" has no output \"token\" (outputs: idToken)"
    },
    {
      "level": "warning",
      "code": "link-missing-file",
      "path": "provider",
      "message": "\"provider\" links to billing.logic.json, which is missing or unreadable next to this file"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `file` | string | The path exactly as you passed it. |
| `valid` | boolean | `false` when there is at least one error. |
| `issues` | array | Every issue found. Empty when there are none. |
| `issues[].level` | `"error"` \| `"warning"` \| `"notice"` | Severity. |
| `issues[].code` | string | Stable code. Safe to match on in scripts. |
| `issues[].path` | string | Where the problem is: a node, wire or risk id, a `blockType/id` path, a `types/Name` path, or a JSON pointer such as `/version` for schema errors. `/` means the whole file. |
| `issues[].message` | string | Human-readable text. Do not match on it, it can change. |

The exit code is the same as in text mode: 0 when every file is valid, 1 otherwise.

## `open`

```text
node dist/cli.mjs open <file.logic.json> [--port <n>] [--no-open]
```

`open` starts a small web server for one diagram and opens the viewer in your browser. It prints
the address and keeps running until you press Ctrl+C:

```text
agentic-fbd: http://127.0.0.1:47911/
watching skills/agentic-fbd/examples/auth-gate.logic.json (valid); press Ctrl+C to stop
```

| Flag | Meaning |
|---|---|
| `--port <n>` | The port to listen on, from 0 to 65535. The default is 0, which picks a free port. Anything else is a usage error (exit 2). |
| `--no-open` | Print the address but do not start a browser. Use it on a server, in CI or in a script. |

Other things to know:

- **Local only.** The server binds to `127.0.0.1`. Other machines on your network cannot reach it.
- **Invalid files still open.** The viewer shows the errors in a banner, so you can see what is
  wrong. The line above says `has errors, shown in the viewer`.
- **Live reload.** The server watches the diagram's folder. When the file changes on disk, for
  example because Claude edited it, the viewer reloads it. No browser refresh is needed.
- **Other diagrams in the folder.** Every `*.logic.json` next to the file you opened is served,
  so a `see` link from one diagram to another opens inside the same viewer.
- **Missing file.** `open` prints `<file> does not exist` and exits 1. If the viewer was not
  built (`dist/viewer` is missing) it asks you to run `npm run build` and exits 1.
- **Port in use.** `open` prints `cannot start the server: listen EADDRINUSE ...` and the exit
  code is 1. If the command does not return to your prompt, press Ctrl+C. Pick another port or
  use `--port 0`.

### Files next to the diagram

The viewer is the only thing that writes these files. All of them sit in the same folder as the
diagram, and their names come from the diagram's file name. For `auth-gate.logic.json`:

| File | Written when | What it holds |
|---|---|---|
| `auth-gate.layout.json` | You drag blocks or use **Auto layout** | Block positions. The diagram has no coordinates. Commit it with the diagram if you want the same arrangement for everyone. Clearing the layout deletes the file. |
| `auth-gate.draft.json` | You edit in the viewer | Your unsaved edits, plus a copy of the diagram as it was when editing started. Deleted on **Save**. |
| `auth-gate.review.json` | You **Save**, and the diagram had changed on disk since you started editing | The version that was on disk. Your version still wins in `auth-gate.logic.json`. The review file is kept so the agent can compare the two. |

Notes:

- None of these names end in `.logic.json`, so they are not listed as diagrams.
- **Save** is refused while the edited diagram has errors.
- The agent never writes these files. See [Viewer](viewer.md) for how editing works.

## Issue codes

Every code that `validate` can report, from the schema check and the integrity checks in
`packages/core/src/validate`, plus the link and code checks in `packages/cli/src`.

Levels:

- **error**: the file is invalid. `validate` exits 1.
- **warning**: something is probably wrong, but the file is valid.
- **notice**: a hint about quality. The file is valid.

### Errors

| Code | What it means | How to fix it |
|---|---|---|
| `read` | The file cannot be read (missing, no permission). | Check the path you passed. |
| `json` | The file is not valid JSON. | Fix the syntax at the position in the message. A missing comma or quote is the usual cause. |
| `schema` | The structure breaks the JSON Schema: a missing required field, an unknown field, a wrong value, a wrong type. The `path` is a JSON pointer. | Fix the field named in the message. See [`format.md`](../skills/agentic-fbd/references/format.md) and [Blocks](blocks.md). While there are schema errors, the other checks do not run. |
| `duplicate-id` | Two things share an id. At the top level, nodes, wires, block types and risks share one set of ids. Inside a block type body, nodes and wires share another. | Rename one of them, and update every wire or `parent` that uses the old id. |
| `unknown-parent` | A node has `parent` (or `before.parent`) naming a node that does not exist. | Fix the id, or remove `parent`. |
| `parent-not-group` | `parent` names a node that is not a `group`. | Point `parent` at a group, or change that node to a group. |
| `parent-cycle` | Groups are nested in a loop (A inside B inside A). | Break the loop by changing one `parent`. |
| `unknown-blocktype` | An `instance` has `of` naming a block type that is not in `blockTypes`. | Fix the name, or add the block type. |
| `pin-outside-body` | A `pin` is at the top level. Pins are only allowed inside a block type `body`. | Move the pin into a block type body, or use another kind. |
| `pin-see` | A `pin` has `see`. | Remove `see` from the pin. Put the link on the instance or on a block. |
| `pin-ports` | A pin does not have exactly one port: an output for a block input, or an input for a block output. | Give the pin one port. |
| `pin-mismatch` | A pin stands for a block input or output that the block type does not declare, or the pin's type differs from the declared type. | Make the pin's port name and type match the block type's `inputs` or `outputs`. |
| `body-cycle` | A block type contains an instance of itself, directly or through other block types. | Remove the loop. A block cannot be built out of itself. |
| `unexplored-with-children` | A group has `explored: false` but also has children. | Remove `explored`. A group with children is explored. |
| `group-ports-and-children` | A group has children and also declares `inputs` or `outputs`. | Rewire its wires to the children and remove the ports from the group. |
| `ports-on-explored-group` | A group declares ports but is not marked `explored: false`. | Mark it `explored: false`, or remove the ports. Only unexplored groups declare ports. |
| `unknown-node` | A wire end names a node that does not exist (in a block type body, that body is searched). | Fix the id in `from` or `to`, or add the node. |
| `missing-port` | A wire end names a node with no port, and the node is not a `state`. Only states can be referenced by id alone. | Write `node.port`. |
| `state-port` | A wire end writes `state.port`. States have no ports. | Use the state's id alone. |
| `unknown-port` | A wire end names a port that the node does not have. The message lists the ports it does have. | Fix the port name, or declare the port on the node. |
| `type-mismatch` | A wire connects two types of different shape, for example `string` into a number. | Fix the type on one side, or change the wiring. If one side is a named type, check its definition in `types`. |
| `unknown-ref` | A risk lists in `refs` a node, wire, block type or body item that does not exist. | Fix the id in `refs`. Use `BlockType/id` for items inside a block type body. |
| `unknown-focus` | `subject.focus` is not the id of a group or an instance at the top level. | Point `focus` at a group or instance, or remove it. |
| `unknown-type-info` | `typeInfo` describes a type that is not in `types`. | Add the type to `types`, or remove the `typeInfo` entry. |

### Warnings

| Code | What it means | How to fix it |
|---|---|---|
| `type-meaning` | A wire fits by shape, but the type names differ, for example a plain `number` into a named `OptionId`. | Check the two types mean the same thing. If so, use the same named type on both ends. If not, rewire. |
| `link-self` | A `see` link points at the diagram's own file. | Link to another diagram, or remove `see`. |
| `link-missing-file` | A `see` link names a diagram that is missing or unreadable in the same folder. | Fix the file name, create the diagram, or remove `see`. |
| `link-missing-node` | A `see` link of the form `file#block` names a block that the other diagram does not have. | Fix the block id, or drop the `#block` part. |
| `stale-code` | With `--check-code`: a `code` reference points at a file that does not exist, or at a symbol that does not appear in the file. | Update `code.file` or `code.symbol` to match the repo. For a new block, mark it `change: "new"` and the check skips it. |

`link-*` warnings are reported on every `validate` run. `stale-code` only appears with
`--check-code`.

### Notices

| Code | What it means | How to fix it |
|---|---|---|
| `missing-desc` | Some blocks have no `desc`. The message counts them and lists up to six ids. Pins and instances are not counted. The `path` is the first one. | Add a one or two sentence `desc` saying what the block does. |
| `missing-logic` | Some `function` and `decision` blocks, or block types, have no `logic` guide. | Add `logic`, a short step-by-step of how the block works. |
| `missing-store` | Some `state` blocks have no `store`. | Add `store`: where the data lives (a table, a cache, a variable). |
| `similar-store` | A new state (`change: "new"`) holds the same type as an existing state. | If it holds the same data, reuse the existing state. If not, ignore the notice. |
| `before-unused` | A node has `before` but is not marked `change: "modified"`, so `before` is ignored. | Set `change` to `modified`, or remove `before`. |
| `undefined-type` | A type name is used but is not in `types`. It is treated as opaque, so wires using it are not checked in depth. | Define the type in `types`, or ignore the notice if opaque is intended. |

## Using `validate` in CI

`validate` exits 1 on errors, so it works as a gate. A warning does not fail the build. To fail
on warnings too, use `--json` and check the issues yourself:

```bash
node dist/cli.mjs validate logic/*.logic.json --check-code . --json > report.json
```

With several files the output is an array, so a script can count issues per level across all of
them.
