Read first: references/checklist.md, references/format.md, examples/auth-gate.logic.json

# Workflow: high-level overview of a repo

Goal: one diagram, one level only. One unexplored group per system or module, all wired
together. Do not go deeper. Depth comes later, one block at a time, when the user asks.

1. **Find the systems.** List the repo root. Read the README and the manifest files
   (`package.json`, `pyproject.toml`, `go.mod`, ...). Do not read source files in depth. A system
   is something that runs on its own or owns one job (web app, API, worker, CLI, library,
   pipeline step). Also note what starts work (a user, an HTTP call, a schedule, an agent) and
   what comes out (what the user sees, what is stored). Anything outside the repo (a database,
   a third-party API) is an `external`.
   Done when: you have a list of 3-10 systems, each with its folder and one line on its job.
2. **Create the file.** Pick an id like `<repo>-overview`.
   `$CLI new logic/<id>.logic.json --overview`
   Done when: the command prints `created ...`.
3. **Write the top level.** Edit the file. Replace every `TODO`. Keep the starter's shape and `subject.id`.
   - `subject`: `title`, `intent`. Keep `"mode": "understand"`.
   - One `trigger` per way work starts, with `source` and `context`.
   - One `group` per system, with `explored: false`, `label`, `desc`, `ref` (its folder, for
     example `"apps/api/"`) and declared `inputs` and `outputs` (`{ "portName": "type" }`).
     Copy the starter's group for each extra system. Remove the starter groups you do not use.
   - `external` blocks for what lives outside the repo, and one or more `result` blocks.
   - Wires, for example `{ "id": "w1", "from": "start.value", "to": "system-a.value" }`: `from`
     is `node.port` of an output, `to` is `node.port` of an input, and both ports must be
     declared on those blocks. Use `string` as the type of every port. Join triggers to the
     systems they start, systems to the systems they feed, systems to externals and results.
     Every block gets at least one wire.
   Done when: each system is a group block with ports, and every block is named by a wire.
4. **Check, then validate.** Go through `references/checklist.md`. Then
   `$CLI validate logic/<id>.logic.json`
   Fix what it reports, using the `fix:` lines. Run it again.
   Done when: exit code 0, and no `unwired-block` and no `placeholder` issue.
5. **Show it.** `$CLI open logic/<id>.logic.json`, in the background. Copy the URL it prints.
   Done when: you have the URL.
6. **Tell the user.** One message that lists the systems (one line each), gives the URL, and
   says each block is unexplored. Tell them to ask for each block by name to go one level
   deeper, one at a time. Give the exact message to send, for example:
   `Explain "<block label>" in logic/<id>.logic.json`
   Done when: the message is sent. Stop. Do not explore any block on your own.
