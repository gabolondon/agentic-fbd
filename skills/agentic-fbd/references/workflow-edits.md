Read first: references/checklist.md, references/format.md

# Workflow: edits from the viewer, and after implementation

Two cases. A: the user edited the diagram in the viewer (rename, change a type or trigger,
remove a block or wire, leave a `note`). B: the designed change has been implemented.

## A. Edits from the viewer

1. **Look for unsaved edits.** `ls logic/<id>.draft.json`. If it exists, the user has unsaved
   edits. Do not edit the diagram. Tell the user, and wait.
   Done when: there is no draft file.
2. **Get the request.** It is the pasted "Copy for agent" text. If the user only says they
   edited the diagram, run `git diff logic/<id>.logic.json`.
   Done when: you have a list of edits.
3. **Apply each edit to the code and the model.**
   - a renamed block, port or function: rename it in the code;
   - an added field: add it to the model;
   - a removed block: remove it from the design;
   - a `note` on a block or wire is a request: do it, then delete the note.
   Done when: every edit and every note is done.
4. **Review file.** `ls logic/<id>.review.json`. If it exists, a save set your own edits aside.
   Compare it with the diagram, re-apply what still makes sense on top of the user's version,
   then delete the review file.
   Done when: no review file is left.
5. **Validate.** Go through `references/checklist.md`, then
   `$CLI validate logic/<id>.logic.json --check-code .`. Fix every error and `unwired-block`.
   Done when: exit code 0.
6. **Say what changed.** In a few lines. The viewer reloads by itself. If `open` is not running
   for this file, run it once in the background and give the URL.

## B. After implementation

Fold the diagram back into living documentation.

1. **Edit the diagram.**
   - set `subject.mode` to `"understand"`;
   - remove `change` on all items (new and modified become existing);
   - delete the items marked `removed`, and wires that touch them;
   - drop `before`, `changeNote` and any remaining `note`, and `change` and `before` in `typeInfo`;
   - drop `risks` that are resolved, keep the open ones;
   - update every `code` reference to the real file and symbol.
   Done when: the file has no `change`, `before` or `changeNote` left.
2. **Validate against the code.** `$CLI validate logic/<id>.logic.json --check-code .`
   Fix every error, every `unwired-block`, and every `stale-code` warning.
   Done when: exit code 0 and no `stale-code`.
3. **Commit** the diagram with the implementation, and its `logic/<id>.layout.json` if one
   exists. Never commit `*.draft.json` or `*.review.json`.
   Done when: `git status` shows the diagram in the commit.
