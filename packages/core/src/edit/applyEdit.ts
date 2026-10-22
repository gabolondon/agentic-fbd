import type { Change, CodeRef, LogicDoc, LogicNode, Ports, TriggerSource, TypeExpr, TypeInfo, Wire } from '../format.ts';
import { parseEndpoint, type Side } from '../model.ts';
import { parseType, typeToString, type TypeNode } from '../types/parse.ts';

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
  switch (edit.op) {
    case 'setNote':
      return setNote(doc, edit.at, edit.value);
    case 'renamePort':
      return renamePort(doc, edit.at, edit.side, edit.from, edit.to, original);
    case 'setPortType':
      return setPortType(doc, edit.at, edit.side, edit.port, edit.type, original);
    case 'setType':
      return setType(doc, edit.name, edit.type);
    case 'remove':
      return remove(doc, edit.at);
    case 'restore':
      return restore(doc, edit.at, original);
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

// ---- Ports and types ------------------------------------------------------------------------

const SIDE_WORD: Record<Side, string> = { inputs: 'input', outputs: 'output' };
/** A body pin exposes a block input as its output, and a block output as its input. */
const PIN_SIDE: Record<Side, Side> = { inputs: 'outputs', outputs: 'inputs' };

/** The ports to edit for a node: its own, or its blockType's for an instance. */
function portOwner(doc: LogicDoc, at: ItemRef, original: LogicDoc | undefined): { target: Markable & { label: string; inputs?: Ports; outputs?: Ports }; orig?: Markable; typeName?: string } | string {
  const node = findNode(doc, at);
  if (!node) return `There is no block "${at.id}".`;
  if (node.kind === 'pin') return 'A pin is renamed through its block.';
  if (node.kind === 'state') return 'A state has no ports.';
  if (node.kind !== 'instance') return { target: node, orig: original ? findNode(original, at) : undefined };
  const type = node.of ? doc.blockTypes?.[node.of] : undefined;
  if (!type || !node.of) return `There is no block type "${node.of}".`;
  return { target: type, orig: original?.blockTypes?.[node.of], typeName: node.of };
}

function renamePort(doc: LogicDoc, at: ItemRef, side: Side, from: string, to: string, original: LogicDoc | undefined): Reason {
  const name = to.trim();
  if (!name) return 'A port name cannot be empty.';
  if (/[.\s]/.test(name)) return 'A port name cannot contain dots or spaces.';
  const owner = portOwner(doc, at, original);
  if (typeof owner === 'string') return owner;
  const { target, orig, typeName } = owner;
  const ports = target[side] ?? {};
  if (!(from in ports)) return `"${target.label}" has no ${SIDE_WORD[side]} "${from}".`;
  if (name === from) return null;
  if (name in ports) return `"${target.label}" already has an ${SIDE_WORD[side]} named "${name}".`;
  const failed = markField(target, side, renameKey(ports, from, name), orig);
  if (failed) return failed;

  if (!typeName) {
    rewire(scopeItems(doc, at.scope)!, scopeItems(original, at.scope), at.id, side, from, name);
    return null;
  }
  // A blockType port: its pin in the body, the body wires on that pin, and every instance's wires.
  const body = doc.blockTypes![typeName]!.body;
  const origBody = original?.blockTypes?.[typeName]?.body;
  for (const pin of body?.nodes ?? []) {
    const pinPorts = pin[PIN_SIDE[side]];
    if (pin.kind !== 'pin' || !pinPorts || !(from in pinPorts)) continue;
    const origPin = origBody?.nodes.find((n) => n.id === pin.id);
    markField(pin, PIN_SIDE[side], renameKey(pinPorts, from, name), origPin);
    if (pin.label === from) markField(pin, 'label', name, origPin);
    rewire(body!, origBody, pin.id, PIN_SIDE[side], from, name);
  }
  forEachScope(doc, (items, scope) => {
    for (const n of items.nodes) {
      if (n.kind === 'instance' && n.of === typeName) rewire(items, scopeItems(original, scope), n.id, side, from, name);
    }
  });
  return null;
}

function setPortType(doc: LogicDoc, at: ItemRef, side: Side, port: string, type: TypeExpr, original: LogicDoc | undefined): Reason {
  const bad = typeError(type);
  if (bad) return bad;
  const owner = portOwner(doc, at, original);
  if (typeof owner === 'string') return owner;
  const { target, orig, typeName } = owner;
  const ports = target[side] ?? {};
  if (!(port in ports)) return `"${target.label}" has no ${SIDE_WORD[side]} "${port}".`;
  const failed = markField(target, side, { ...ports, [port]: type }, orig);
  if (failed || !typeName) return failed;
  const origBody = original?.blockTypes?.[typeName]?.body;
  for (const pin of doc.blockTypes![typeName]!.body?.nodes ?? []) {
    const pinPorts = pin[PIN_SIDE[side]];
    if (pin.kind !== 'pin' || !pinPorts || !(port in pinPorts)) continue;
    markField(pin, PIN_SIDE[side], { [port]: type }, origBody?.nodes.find((n) => n.id === pin.id));
  }
  return null;
}

/** Changes a named type; the old expression is kept in `typeInfo[name].before`. */
function setType(doc: LogicDoc, name: string, type: TypeExpr): Reason {
  const old = doc.types?.[name];
  if (old === undefined) return `There is no type "${name}".`;
  const bad = typeError(type);
  if (bad) return bad;
  const info: TypeInfo = { ...(doc.typeInfo?.[name] ?? {}) };
  if (info.change !== 'modified') {
    info.change = 'modified';
    info.before = structuredClone(old);
  }
  doc.types![name] = type;
  if (sameValue(type, info.before)) {
    delete info.change;
    delete info.before;
  }
  const typeInfo = { ...(doc.typeInfo ?? {}) };
  if (Object.keys(info).length) typeInfo[name] = info;
  else delete typeInfo[name];
  if (Object.keys(typeInfo).length) doc.typeInfo = typeInfo;
  else delete doc.typeInfo;
  return null;
}

/** A readable reason when a type expression does not parse; null when it does. */
function typeError(type: TypeExpr): Reason {
  if (typeof type === 'string' && !type.trim()) return 'A type cannot be empty.';
  const unknown = (t: TypeNode): string | undefined => {
    switch (t.k) {
      case 'unknown':
        return t.raw;
      case 'array':
      case 'opt':
        return unknown(t.of);
      case 'record':
        return unknown(t.key) ?? unknown(t.value);
      case 'struct':
        return Object.values(t.fields).map(unknown).find((r) => r !== undefined);
      case 'union':
        return t.options.map(unknown).find((r) => r !== undefined);
      default:
        return undefined;
    }
  };
  const raw = unknown(parseType(type));
  return raw === undefined ? null : `Can't read the type "${raw || typeToString(parseType(type))}".`;
}

function renameKey(ports: Ports, from: string, to: string): Ports {
  return Object.fromEntries(Object.entries(ports).map(([k, v]) => [k === from ? to : k, v]));
}

/** Points the wires on `<node>.<from>` at `<node>.<to>`, marking the ones that are not new. */
function rewire(items: ScopeItems, origItems: ScopeItems | undefined, node: string, side: Side, from: string, to: string): void {
  const end = side === 'inputs' ? 'to' : 'from';
  for (const w of items.wires) {
    if (w.change === 'removed' || w[end] !== `${node}.${from}`) continue;
    markField(w, end, `${node}.${to}`, origItems?.wires.find((o) => o.id === w.id));
  }
}

// ---- Remove and restore ---------------------------------------------------------------------

/** Removes a node with everything inside it, or a wire. New items are deleted outright. */
function remove(doc: LogicDoc, at: ItemRef): Reason {
  const items = scopeItems(doc, at.scope);
  const node = items?.nodes.find((n) => n.id === at.id);
  const wire = items?.wires.find((w) => w.id === at.id);
  if (!items || (!node && !wire)) return `There is no block or wire "${at.id}".`;
  if ((node ?? wire)!.change === 'removed') return 'It is already removed.';
  const deleted = new Set<string>();

  if (wire) {
    if (wire.change === 'new') deleted.add(wire.id);
    else wire.change = 'removed';
  } else {
    if (node!.kind === 'pin') return 'A pin cannot be removed; remove the port on its block.';
    const inside = subtree(items.nodes, node!.id);
    for (const n of items.nodes) {
      if (!inside.has(n.id)) continue;
      if (n.change === 'new') deleted.add(n.id);
      else n.change = 'removed';
    }
    for (const w of items.wires) {
      const ends = [parseEndpoint(w.from).node, parseEndpoint(w.to).node];
      if (!ends.some((e) => inside.has(e))) continue;
      if (w.change === 'new' || ends.some((e) => deleted.has(e))) deleted.add(w.id);
      else w.change = 'removed';
    }
    reparent(items.nodes, deleted);
  }
  items.nodes = items.nodes.filter((n) => !deleted.has(n.id));
  items.wires = items.wires.filter((w) => !deleted.has(w.id));
  dropRefs(doc, at.scope, deleted);
  return null;
}

/** Takes back a removal made while editing: the item, what was inside it and its wires. */
function restore(doc: LogicDoc, at: ItemRef, original: LogicDoc | undefined): Reason {
  const items = scopeItems(doc, at.scope);
  const origItems = scopeItems(original, at.scope);
  const node = items?.nodes.find((n) => n.id === at.id);
  const wire = items?.wires.find((w) => w.id === at.id);
  if (!items || (!node && !wire)) return `There is no block or wire "${at.id}".`;
  if ((node ?? wire)!.change !== 'removed') return 'It is not removed.';
  const origItem = node ? origItems?.nodes.find((n) => n.id === at.id) : origItems?.wires.find((w) => w.id === at.id);
  if (!origItems || !origItem || origItem.change === 'removed') {
    return 'It was already removed before you started editing; ask the agent to bring it back.';
  }

  const takeBack = (cur: Markable, orig: Markable | undefined): void => {
    if (cur.change !== 'removed' || !orig || orig.change === 'removed') return;
    if (orig.change) cur.change = orig.change;
    else delete cur.change;
    if (orig.before) cur.before = structuredClone(orig.before);
    else delete cur.before;
  };
  if (wire) {
    takeBack(wire, origItem);
    return null;
  }

  // New items inside it were deleted on removal: put them back where they were.
  const inside = subtree(origItems.nodes, node!.id);
  for (const n of origItems.nodes) {
    if (inside.has(n.id) && !items.nodes.some((c) => c.id === n.id)) insertLike(items.nodes, structuredClone(n), origItems.nodes);
  }
  for (const n of items.nodes) if (inside.has(n.id)) takeBack(n, origItems.nodes.find((o) => o.id === n.id));
  const touches = (w: Wire): boolean => [w.from, w.to].some((e) => inside.has(parseEndpoint(e).node));
  for (const w of origItems.wires) {
    if (touches(w) && !items.wires.some((c) => c.id === w.id)) insertLike(items.wires, structuredClone(w), origItems.wires);
  }
  for (const w of items.wires) if (touches(w)) takeBack(w, origItems.wires.find((o) => o.id === w.id));
  return null;
}

/** A node and every descendant (by `parent`). */
function subtree(nodes: LogicNode[], id: string): Set<string> {
  const inside = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) {
      if (n.parent !== undefined && inside.has(n.parent) && !inside.has(n.id)) {
        inside.add(n.id);
        grew = true;
      }
    }
  }
  return inside;
}

/** Nodes left inside a deleted group move up to the nearest group that is still there. */
function reparent(nodes: LogicNode[], deleted: Set<string>): void {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent]));
  const up = (id: string | undefined): string | undefined => {
    const seen = new Set<string>();
    while (id !== undefined && deleted.has(id) && !seen.has(id)) {
      seen.add(id);
      id = parentOf.get(id);
    }
    return id !== undefined && deleted.has(id) ? undefined : id;
  };
  for (const n of nodes) {
    if (deleted.has(n.id)) continue;
    if (n.parent !== undefined && deleted.has(n.parent)) {
      const p = up(n.parent);
      if (p === undefined) delete n.parent;
      else n.parent = p;
    }
    if (n.before?.parent !== undefined && deleted.has(n.before.parent)) {
      const p = up(n.before.parent);
      if (p === undefined) delete n.before.parent;
      else n.before.parent = p;
    }
  }
}

/** Deleted items leave risks and the focus: a risk left with no refs goes too. */
function dropRefs(doc: LogicDoc, scope: string, deleted: Set<string>): void {
  if (!deleted.size) return;
  const keys = new Set([...deleted].map((id) => (scope ? `${scope}/${id}` : id)));
  if (doc.risks) {
    doc.risks = doc.risks.map((r) => ({ ...r, refs: r.refs.filter((ref) => !keys.has(ref)) })).filter((r) => r.refs.length > 0);
  }
  if (!scope && doc.subject.focus !== undefined && deleted.has(doc.subject.focus)) delete doc.subject.focus;
}

/** Inserts an item where it sat in `order`: before the next item of `order` still present. */
function insertLike<T extends { id: string }>(list: T[], item: T, order: T[]): void {
  const from = order.findIndex((o) => o.id === item.id);
  for (const next of order.slice(from + 1)) {
    const at = list.findIndex((c) => c.id === next.id);
    if (at >= 0) {
      list.splice(at, 0, item);
      return;
    }
  }
  list.push(item);
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

function scopeItems(doc: LogicDoc | undefined, scope: string): ScopeItems | undefined {
  if (!doc || !scope) return doc;
  return doc.blockTypes?.[scope]?.body;
}

/** The file root and every blockType body. */
function forEachScope(doc: LogicDoc, visit: (items: ScopeItems, scope: string) => void): void {
  visit(doc, '');
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) if (type.body) visit(type.body, name);
}

function findNode(doc: LogicDoc, at: ItemRef): LogicNode | undefined {
  return scopeItems(doc, at.scope)?.nodes.find((n) => n.id === at.id);
}

function findWire(doc: LogicDoc, at: ItemRef): Wire | undefined {
  return scopeItems(doc, at.scope)?.wires.find((w) => w.id === at.id);
}

