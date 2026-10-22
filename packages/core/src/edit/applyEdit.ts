import type { Change, CodeRef, LogicDoc, LogicNode, TriggerSource, TypeExpr, Wire } from '../format.ts';
import type { Side } from '../model.ts';

// Small edits made in the viewer (design spec §6.9). Each edit is a proposal for the agent, so it
// is written with the Design-mode marks: an `existing` item becomes `modified` and keeps its
// original value in `before`; a `new` item changes in place. A note marks nothing.

/** A node or wire: scope '' is the file root, otherwise the blockType whose body holds it. */
export type ItemRef = { scope: string; id: string };

export type Edit =
  | { op: 'setLabel'; at: ItemRef; value: string }
  | { op: 'setDesc'; at: ItemRef; value: string }
  | { op: 'setSymbol'; at: ItemRef; value: string }
  | { op: 'setTrigger'; at: ItemRef; source: TriggerSource; context: Record<string, unknown> }
  /** On a node or a wire; '' removes the note. */
  | { op: 'setNote'; at: ItemRef; value: string }
  | { op: 'renamePort'; at: ItemRef; side: Side; from: string; to: string }
  | { op: 'setPortType'; at: ItemRef; side: Side; port: string; type: TypeExpr }
  | { op: 'setType'; name: string; type: TypeExpr }
  /** A node (with everything inside it) or a wire. */
  | { op: 'remove'; at: ItemRef }
  | { op: 'restore'; at: ItemRef };

export type EditResult = { ok: true; doc: LogicDoc } | { ok: false; reason: string };

/** Pure: never mutates `doc`. `original` (the file when editing started) is needed by 'restore'. */
export function applyEdit(doc: LogicDoc, edit: Edit, original?: LogicDoc): EditResult {
  const next = structuredClone(doc);
  const reason = apply(next, edit, original);
  if (reason) return { ok: false, reason };
  if (edit.op !== 'setNote') next.subject.mode = 'design';
  return { ok: true, doc: next };
}

type Reason = string | null;

function apply(doc: LogicDoc, edit: Edit, original: LogicDoc | undefined): Reason {
  if (edit.op === 'setNote') return setNote(doc, edit.at, edit.value);
  if (edit.op === 'setType' || edit.op === 'remove' || edit.op === 'restore' || edit.op === 'renamePort' || edit.op === 'setPortType') {
    return 'Not supported yet.';
  }
  const node = findNode(doc, edit.at);
  if (!node) return `There is no block "${edit.at.id}".`;
  const orig = original ? findNode(original, edit.at) : undefined;
  switch (edit.op) {
    case 'setLabel': {
      const value = edit.value.trim();
      if (!value) return 'A name cannot be empty.';
      return markField(node, 'label', value, orig);
    }
    case 'setDesc':
      return markField(node, 'desc', edit.value.trim(), orig);
    case 'setSymbol': {
      const type = node.kind === 'instance' && node.of ? doc.blockTypes?.[node.of] : undefined;
      const target: (Markable & { code?: CodeRef }) | undefined = node.code ? node : type?.code ? type : undefined;
      if (!target?.code) return 'This block has no code file to rename a function in.';
      const code = { ...target.code };
      const symbol = edit.value.trim();
      if (symbol) code.symbol = symbol;
      else delete code.symbol;
      const origTarget = target === node ? orig : original && node.of ? original.blockTypes?.[node.of] : undefined;
      return markField(target, 'code', code, origTarget);
    }
    case 'setTrigger': {
      if (node.kind !== 'trigger') return 'Only a trigger has a source.';
      return markField(node, 'source', edit.source, orig) ?? markField(node, 'context', edit.context, orig);
    }
  }
}

function setNote(doc: LogicDoc, at: ItemRef, value: string): Reason {
  const item = findNode(doc, at) ?? findWire(doc, at);
  if (!item) return `There is no block or wire "${at.id}".`;
  const note = value.trim();
  if (note) item.note = note;
  else delete item.note;
  return null;
}

// ---- Marking --------------------------------------------------------------------------------

/** A node, wire or blockType: anything with `change` and `before`. */
type Markable = { change?: Change; changeNote?: string; before?: object } & object;

/** What a field held when it was absent, so `before` can say "there was none". */
const EMPTY: Record<string, unknown> = { desc: '', inputs: {}, outputs: {}, context: {} };

/**
 * Sets one field with the Design-mode marks (design spec §6.9). `orig` is the same item in the
 * file as it was when editing started; it says which mark to go back to when every edit on the
 * item is undone.
 */
function markField(item: Markable, field: string, value: unknown, orig?: Markable): Reason {
  if (item.change === 'removed') return 'Restore it before editing.';
  const rec = item as Record<string, unknown>;
  const set = (v: unknown): void => {
    if (v === undefined || (v === '' && field in EMPTY)) delete rec[field];
    else rec[field] = v;
  };
  if (item.change === 'new') {
    set(value);
    return null;
  }
  const before = { ...(item.before ?? {}) } as Record<string, unknown>;
  if (!(field in before)) before[field] = structuredClone(rec[field] ?? EMPTY[field]);
  set(value);
  if (sameValue(rec[field] ?? EMPTY[field], before[field])) delete before[field];
  if (Object.keys(before).length > 0) {
    item.before = before;
    item.change = 'modified';
    return null;
  }
  delete item.before;
  // Every edit on the item is undone: back to the mark it had.
  const had = orig ? orig.change : item.changeNote ? item.change : undefined;
  if (had && had !== 'removed') item.change = had;
  else delete item.change;
  return null;
}

/** Deep equality for JSON values, ignoring key order. */
export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}

// ---- Lookups --------------------------------------------------------------------------------

interface ScopeItems {
  nodes: LogicNode[];
  wires: Wire[];
}

function scopeItems(doc: LogicDoc, scope: string): ScopeItems | undefined {
  if (!scope) return doc;
  return doc.blockTypes?.[scope]?.body;
}

function findNode(doc: LogicDoc, at: ItemRef): LogicNode | undefined {
  return scopeItems(doc, at.scope)?.nodes.find((n) => n.id === at.id);
}

function findWire(doc: LogicDoc, at: ItemRef): Wire | undefined {
  return scopeItems(doc, at.scope)?.wires.find((w) => w.id === at.id);
}

