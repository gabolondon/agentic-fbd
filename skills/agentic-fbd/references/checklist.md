# Checklist before every validate

Answer each line yes or no. Fix every no, then run `$CLI validate <file>`.

## Shape of the file
- Top-level keys are only `version`, `subject`, `types`, `typeInfo`, `blockTypes`, `nodes`,
  `wires`, `risks`, `$schema`? (Not `title`, `description`, `layers`, `meta`.)
- `"version": "0.1"`, and `subject` is an object with `id`, `title`, `intent`, `mode`?
- `nodes` and `wires` are arrays? Blocks are in `nodes`, never nested in a group.
- Ids have no `.`, no `/` and no spaces, and no two things share an id?
- No `TODO` text left anywhere?

## Wires
- Every `from` and `to` is `node.port`? Only a `state` is written as its bare id.
- Every node a wire names exists in `nodes`?
- `from` is an output port of that node and `to` is an input port of that node?
- A child of a group is joined by `parent: "<group id>"`, and wires go to the child itself?

## Wired
- Every trigger has an outgoing wire? Every result has an incoming wire?
- Every other block has at least one wire? (A group counts its children's wires.)
- A wire ending on an unexplored group uses a port declared on that group?

## Content
- Every block except a pin has `desc`, 1-2 plain sentences on what it does?
- Every `function` and `decision` has `logic`, an array of 2-5 short steps on how it works?
- Every trigger has `source` and a `context`? Every `state` has `store`?
- Do `desc` and `logic` describe behavior and decisions for a reader who has not read the code,
  not syntax, and mention the edge cases that matter ("an empty cookie gives an empty token")?
- A block that is real code has `code: { "file", "symbol" }`? Not-code has `ref`.
- An unexplored group has `explored: false`, `desc` and ports? A group never has both children
  and ports?

## Readable
- 5-12 blocks on each level, in story order (triggers, each stage in order, results)?
- A store or service used by one area sits inside that area's group?
- No `draw` on wires, no coordinates? (The viewer lays everything out.)
- More than about 40 blocks, or separately deployed systems? Split into one file per system
  (`logic/<subject>-<system>.logic.json`) and an overview file where each system is a block with
  `see: "<subject>-<system>.logic.json"`.
- Only the subject, not the whole repo? Code outside it is an `external`.

## Design diagrams only
- Every new, modified or removed node, wire and blockType has `change`? Modified ones have
  `changeNote` and `before`?
