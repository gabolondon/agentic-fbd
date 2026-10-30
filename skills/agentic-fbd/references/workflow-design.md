Read first: references/checklist.md, references/format.md, examples/other-free-text.logic.json

# Workflow: design a feature or change

Goal: propose a change on top of what exists. Show what is new, modified, removed and affected,
and the risks, before any code is written.

1. **Find the diagram of the area.** `ls logic/`. If a file for the area exists, run
   `$CLI validate logic/<id>.logic.json --check-code .`, fix what it reports, and edit that
   same file (old versions live in git). If none exists, read `references/workflow-understand.md`
   and do its steps for the area first, then come back here.
   Done when: you have a valid diagram of the area, in a file you will edit.
2. **Set the mode.** `subject.mode` is `"design"`. `subject.focus` is the id of the group where
   the change happens; if the change is on the top level, leave `focus` out. Keep the file's
   existing risks. For an idea with no existing code, create the file with
   `$CLI new logic/<id>.logic.json`, replace every `TODO` (keep the `subject.id` it set), and set
   `mode` to `"design"`.
   Done when: `mode` and `focus` are set and validate exits 0.
3. **Reuse before creating.** Before a new `state`, look for an existing store in the area that
   holds that data. Wire the new blocks to it. A truly new store needs a reason in its
   `changeNote`. (`validate` reports `similar-store` otherwise.)
   Done when: every new `state` has a reason or was replaced by an existing one.
4. **Mark the change, one level at a time.** Start with the level of `focus`. Add or change
   blocks and wires. Put `change: "new" | "modified" | "removed"` on every new, modified or
   removed node, wire and blockType. A modified item gets a `changeNote` and a `before` with the
   fields as they were (for example the old `inputs`). A removed wire may point at a port that
   exists only in `before`. Validate. Go one group down only when the change goes there.
   Done when: validate exits 0, no `unwired-block`, every change is marked.
5. **Repeated patterns.** If the same pattern appears in several places, model it once as a
   `blockTypes` entry with `instance` blocks. When a blockType changes, every instance shows as
   affected, even four levels down.
   Done when: no pattern is copied by hand more than twice.
6. **Explain** every new and modified block: `desc`, and `logic` on functions and decisions.
   Validate. Done when: no `missing-desc` or `missing-logic` notice on them.
7. **Hunt for risks.** Where a type changes, follow every wire it travels on. A bare `number`
   flowing into `OptionId` is the kind of bug this finds. Run `$CLI validate` and read the
   `type-meaning` warnings. Add each real problem to `risks` with `refs`.
   Done when: every warning is either fixed or written down as a risk.
8. **Show it.** `$CLI open logic/<id>.logic.json` once, in the background, if it is not
   running. Give the URL. Say what is new, modified and affected, and where the risks are.
   Done when: the user has the URL and the summary.
9. **Ask.** When the user approves the diagram, ask one line: continue to the implementation
   plan using this diagram as its basis? Wait for the answer.
10. **Changes.** When the user asks for changes in chat, edit the JSON, validate, and say what
    changed. The viewer reloads by itself.
