Read first: references/checklist.md, references/format.md, examples/auth-gate.logic.json

# Workflow: understand one subject

Goal: explain how one existing feature, section, flow, tool or pipeline works. Not the whole repo.

1. **Fix the subject and its boundary.** Say in one line what is inside. What stays outside
   (APIs, databases, other modules) becomes an `external`.
   Done when: you can name the subject and its boundary.
2. **Check for an existing diagram.** `ls logic/`. If a file for this subject exists (or the user
   said `Explain "<block>" in logic/<file>`), run
   `$CLI validate logic/<id>.logic.json --check-code .`
   and fix what it reports, then go to **Deeper** below. Otherwise continue.
   Done when: you know whether the file exists.
3. **Read only that code**, in one focused pass. Find the triggers (what starts the flow), the
   state (stores, variables, tables), and the real pieces of code (handler, function, component,
   endpoint, tool). For each state, find where the data lives and whether it survives a reload,
   in the code, never a guessed category (`"Zustand store · lost on reload"`,
   `"Postgres table bookings"`).
   Done when: you can list triggers, state and 5-12 pieces of code.
4. **Create the file.** `$CLI new logic/<id>.logic.json`
   Done when: the command prints `created ...`.
5. **Write the top level only**, as a short story, replacing every `TODO`:
   - `trigger` blocks: `source` and a `context` (where it comes from, which step or mode).
   - one `group` per system or stage, then `external` blocks and the final `result` blocks.
   - each block that is real code has `code: { "file", "symbol" }`.
   - `state` blocks with their `store`.
   - sub-areas you will not explain now: `kind: "group"`, `explored: false`, a `desc`, and
     declared `inputs` and `outputs` so wires can reach them.
   - `types`: names for things that mean something (`OptionId`, not just `number`). Give
     `typeInfo` (`desc`, `code`) only to types that matter, such as request and response models.
     HTTP responses are outputs named by status code (`"200"`, `"422"`).
   - wires, in story order.
   Done when: top level has 5-12 blocks, no `TODO`, every block is on a wire.
6. **Check, then validate.** Go through `references/checklist.md`. Then
   `$CLI validate logic/<id>.logic.json`. Fix every error and every `unwired-block` warning.
   Also fix the `missing-desc`, `missing-logic` and `missing-store` notices.
   Done when: exit code 0, no `unwired-block`, no `missing-desc`, `missing-logic` or `missing-store`.
7. **Risks.** Note fragile spots as `risks` (`id`, `severity`, `status`, `title`, `detail`,
   `refs` naming the blocks and wires involved). Validate again.
   Done when: exit code 0.
8. **Deeper, one group at a time** (the user asked for it, or the step 2 file has an unexplored
   group they named). For group `G`:
   1. Read only the code of `G`.
   2. Add its children as new blocks with `parent: "G"`. Give each `desc` and `code`.
   3. Rewire every wire that ended on `G.port` so it ends on the child that really receives it.
      Same for wires that started on `G.port`.
   4. Delete `inputs`, `outputs` and `explored` from `G`. A group with children has no ports.
   5. Sub-areas of `G` you do not explain stay unexplored groups with ports.
   6. Validate (step 6). Done when: exit code 0, no `unwired-block`.
   Do one group, validate, then the next one only if asked.
9. **Show it.** If `open` is not running for this file, run `$CLI open logic/<id>.logic.json` in
   the background. Give the user the URL. Say in two or three lines what the diagram shows and
   where to look (the risks, the groups still unexplored).
   Done when: the user has the URL and the summary.
10. **Changes.** When the user asks for changes in chat, edit the JSON, validate, and say what
    changed. The viewer reloads by itself.
