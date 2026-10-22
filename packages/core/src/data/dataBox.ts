import type { CodeRef, LogicDoc, TypeExpr } from '../format.ts';
import { parseEndpoint } from '../model.ts';
import type { TypeTable } from '../types/compat.ts';
import { parseType, typeToString, type TypeNode } from '../types/parse.ts';
import { effectiveScope, type EffNode, type EffScope, type EffWire, type ViewMode } from '../viewModel/effective.ts';

// The Data box (design spec §6.8): what a block reads and writes, and where that data lives.
// Everything here is computed from ports, wires, states and `typeInfo`; nothing new in the file.

export interface DataField {
  name: string;
  type: string;
  fields?: DataField[];
}

export interface DataItem {
  /** Port name, or the state's label for a state end. */
  name: string;
  type?: TypeExpr;
  /** Set when `type` is a bare named type. */
  typeName?: string;
  /** Badge: the state's `store`, else "from A, B" / "to A, B" (labels of the other ends). '' when unwired. */
  where: string;
  /** state.desc, else typeInfo[typeName].desc. */
  desc?: string;
  /** Fields when the type resolves to an object (through names, `?` and `[]`); max depth 4. */
  fields?: DataField[];
  /** typeInfo[typeName].code */
  code?: CodeRef;
  /** The state node behind this item, if any (clickable in the panel). */
  state?: { scope: string; id: string };
}

export interface DataUse {
  label: string;
  scope: string;
  id: string;
}

export type DataBox =
  | { kind: 'block'; reads: DataItem[]; writes: DataItem[]; responses: DataItem[] }
  | { kind: 'state'; holds: DataItem; readBy: DataUse[]; writtenBy: DataUse[] }
  | { kind: 'boundary'; reads: DataItem[]; writes: DataItem[]; inside: number };

const STATUS = /^\d{3}$/;
const MAX_DEPTH = 4;

export function dataBox(doc: LogicDoc, scope: string, id: string, mode: ViewMode): DataBox | null {
  const eff = effectiveScope(doc, scope, mode);
  const node = eff.byId.get(id);
  if (!node || node.kind === 'pin') return null;
  const wires = eff.wires.filter((w) => !w.ghost);

  if (node.kind === 'state') {
    const uses = (side: 'from' | 'to'): DataUse[] => {
      const seen = new Set<string>();
      const out: DataUse[] = [];
      for (const w of wires) {
        if (parseEndpoint(side === 'from' ? w.from : w.to).node !== id) continue;
        const other = eff.byId.get(parseEndpoint(side === 'from' ? w.to : w.from).node);
        if (!other || seen.has(other.id)) continue;
        seen.add(other.id);
        out.push({ label: other.label, scope, id: other.id });
      }
      return out;
    };
    return { kind: 'state', holds: stateItem(doc, scope, node), readBy: uses('from'), writtenBy: uses('to') };
  }

  const inner = node.kind === 'group' ? subtree(eff, id) : new Set<string>();
  if (inner.size > 0) return boundary(doc, eff, wires, inner);

  const item = (port: string, type: TypeExpr, side: 'inputs' | 'outputs'): DataItem => {
    const ref = `${id}.${port}`;
    const others = wires
      .filter((w) => (side === 'inputs' ? w.to : w.from) === ref)
      .map((w) => eff.byId.get(parseEndpoint(side === 'inputs' ? w.from : w.to).node))
      .filter((n): n is EffNode => n !== undefined);
    return portItem(doc, scope, port, type, side === 'inputs' ? 'from' : 'to', others);
  };
  const reads = Object.entries(node.inputs)
    .filter(([p]) => !node.ghostInputs.has(p))
    .map(([p, t]) => item(p, t, 'inputs'));
  const outs = Object.entries(node.outputs)
    .filter(([p]) => !node.ghostOutputs.has(p))
    .map(([p, t]) => item(p, t, 'outputs'));
  return {
    kind: 'block',
    reads,
    writes: outs.filter((i) => !STATUS.test(i.name)),
    responses: outs.filter((i) => STATUS.test(i.name)),
  };
}

/** Wires with exactly one end inside the group: what comes in and what goes out. */
function boundary(doc: LogicDoc, eff: EffScope, wires: EffWire[], inner: Set<string>): DataBox {
  const reads = new Map<string, { inner: EffNode; port?: string; type?: TypeExpr; others: EffNode[] }>();
  const writes = new Map<string, { inner: EffNode; port?: string; type?: TypeExpr; others: EffNode[] }>();
  for (const w of wires) {
    const from = parseEndpoint(w.from);
    const to = parseEndpoint(w.to);
    const fromIn = inner.has(from.node);
    const toIn = inner.has(to.node);
    if (fromIn === toIn) continue;
    const [inEnd, outEnd, side, map] = toIn ? [to, from, 'inputs' as const, reads] : [from, to, 'outputs' as const, writes];
    const innerNode = eff.byId.get(inEnd.node);
    const outer = eff.byId.get(outEnd.node);
    if (!innerNode || !outer) continue;
    const key = toIn ? w.to : w.from;
    const entry = map.get(key) ?? {
      inner: innerNode,
      port: inEnd.port,
      type: inEnd.port === undefined ? innerNode.node.valueType : innerNode[side][inEnd.port],
      others: [],
    };
    if (!entry.others.includes(outer)) entry.others.push(outer);
    map.set(key, entry);
  }
  const items = (map: typeof reads, dir: 'from' | 'to'): DataItem[] =>
    [...map.values()].map((e) =>
      e.port === undefined ? stateAt(doc, eff.name, e.inner, e.others, dir) : portItem(doc, eff.name, e.port, e.type, dir, e.others),
    );
  return { kind: 'boundary', reads: items(reads, 'from'), writes: items(writes, 'to'), inside: inner.size };
}

function portItem(doc: LogicDoc, scope: string, name: string, type: TypeExpr | undefined, dir: 'from' | 'to', others: EffNode[]): DataItem {
  const state = others.find((n) => n.kind === 'state');
  const item = typedItem(doc, name, type);
  if (state) {
    item.where = state.node.store ?? '';
    if (state.node.desc) item.desc = state.node.desc;
    item.state = { scope, id: state.id };
  } else {
    item.where = whereOf(others, dir);
  }
  return item;
}

/** A state inside a group, used from outside: where it lives, else who uses it. */
function stateAt(doc: LogicDoc, scope: string, node: EffNode, others: EffNode[], dir: 'from' | 'to'): DataItem {
  const item = stateItem(doc, scope, node);
  if (!item.where) item.where = whereOf(others, dir);
  return item;
}

function stateItem(doc: LogicDoc, scope: string, node: EffNode): DataItem {
  const item = typedItem(doc, node.label, node.node.valueType);
  item.where = node.node.store ?? '';
  if (node.node.desc) item.desc = node.node.desc;
  item.state = { scope, id: node.id };
  return item;
}

function typedItem(doc: LogicDoc, name: string, type: TypeExpr | undefined): DataItem {
  const item: DataItem = { name, where: '' };
  if (type === undefined) return item;
  item.type = type;
  const parsed = parseType(type);
  if (parsed.k === 'name') {
    item.typeName = parsed.name;
    const info = doc.typeInfo?.[parsed.name];
    if (info?.desc) item.desc = info.desc;
    if (info?.code) item.code = info.code;
  }
  const fields = typeFields(type, doc.types ?? {});
  if (fields) item.fields = fields;
  return item;
}

function whereOf(others: EffNode[], dir: 'from' | 'to'): string {
  const labels = [...new Set(others.map((n) => n.label))];
  return labels.length ? `${dir} ${labels.join(', ')}` : '';
}

/** Every descendant of a group (by `parent`), groups included. */
function subtree(eff: EffScope, groupId: string): Set<string> {
  const inside = new Set<string>();
  for (const n of eff.nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n.parent;
    while (cur !== undefined && !seen.has(cur)) {
      if (cur === groupId) {
        inside.add(n.id);
        break;
      }
      seen.add(cur);
      cur = eff.byId.get(cur)?.parent;
    }
  }
  return inside;
}

/** The fields of a type when it resolves to an object, through names, `?` and `[]`. */
export function typeFields(type: TypeExpr, types: TypeTable): DataField[] | undefined {
  return fieldsOf(parseType(type), types, new Set(), 0);
}

function fieldsOf(t: TypeNode, types: TypeTable, seen: Set<string>, depth: number): DataField[] | undefined {
  if (depth >= MAX_DEPTH) return undefined;
  switch (t.k) {
    case 'opt':
    case 'array':
      return fieldsOf(t.of, types, seen, depth);
    case 'name': {
      const def = types[t.name];
      if (def === undefined || seen.has(t.name)) return undefined;
      return fieldsOf(parseType(def), types, new Set(seen).add(t.name), depth);
    }
    case 'struct':
      return Object.entries(t.fields).map(([name, f]) => {
        const field: DataField = { name, type: typeToString(f) };
        const inner = fieldsOf(f, types, seen, depth + 1);
        if (inner) field.fields = inner;
        return field;
      });
    default:
      return undefined;
  }
}
