import type { BlockType, LogicDoc, LogicNode, Ports, TypeExpr, Wire } from '../format.ts';
import { parseEndpoint, type Side } from '../model.ts';
import { parseType, typeToString } from '../types/parse.ts';
import { sameValue } from './applyEdit.ts';

// The request handed to the agent after a save (design spec §6.9 "Copy for agent"). It is a diff
// of the draft against the file as it was when editing started, not a reading of the marks, so on
// a file already in Design mode it lists only what the user changed.

/** One line per user change, diffing draft against original (not the marks). */
export function editLines(original: LogicDoc, draft: LogicDoc): string[] {
  const lines: string[] = [];
  diffScope(original.nodes, original.wires, draft.nodes, draft.wires, '', lines);
  for (const [name, before] of Object.entries(original.blockTypes ?? {})) {
    const after = draft.blockTypes?.[name];
    if (after) diffBlockType(name, before, after, lines);
  }
  for (const [name, before] of Object.entries(original.types ?? {})) {
    const after = draft.types?.[name];
    if (after !== undefined && !sameValue(before, after)) lines.push(...typeLines(name, before, after));
  }
  for (const [name, type] of Object.entries(original.blockTypes ?? {})) {
    const body = draft.blockTypes?.[name]?.body;
    if (type.body && body) diffScope(type.body.nodes, type.body.wires, body.nodes, body.wires, name, lines);
  }
  return lines;
}

export function countEdits(original: LogicDoc, draft: LogicDoc): number {
  return editLines(original, draft).length;
}

/** The "Copy for agent" request after a save. */
export function summarizeEdits(original: LogicDoc, draft: LogicDoc, filePath: string): string {
  const lines = editLines(original, draft);
  if (!lines.length) return '';
  return [`I edited ${filePath} in the viewer. Please review and implement:`, ...lines.map((l) => `- ${l}`)].join('\n');
}

function diffScope(nodes: LogicNode[], wires: Wire[], draftNodes: LogicNode[], draftWires: Wire[], scope: string, lines: string[]): void {
  const key = (id: string): string => (scope ? `${scope}/${id}` : id);
  const draftNode = new Map(draftNodes.map((n) => [n.id, n]));
  const gone = (n: LogicNode | undefined): boolean => !n || n.change === 'removed';
  const removedNow = new Set(nodes.filter((n) => n.change !== 'removed' && gone(draftNode.get(n.id))).map((n) => n.id));

  for (const before of nodes) {
    // A pin follows its block's port, which is listed on the blockType.
    if (before.kind === 'pin') continue;
    const after = draftNode.get(before.id);
    const id = key(before.id);
    if (removedNow.has(before.id)) {
      // A block removed with its group is part of that removal.
      if (before.parent === undefined || !removedNow.has(before.parent)) lines.push(`Removed "${before.label}" (${id})`);
      // A note says why, so it stays.
      if (after) lines.push(...noteLines(before.note, after.note, `"${before.label}" (${id})`));
      continue;
    }
    if (!after) continue;
    const name = `"${after.label}" (${id})`;
    if (before.label !== after.label) lines.push(`Renamed "${before.label}" → "${after.label}" (${id})`);
    if (before.kind !== 'instance') {
      lines.push(...symbolLines(before.code?.symbol, after.code?.symbol, name));
      lines.push(...portLines(before, after, name));
    }
    if (before.kind === 'trigger' && (before.source !== after.source || !sameValue(before.context ?? {}, after.context ?? {}))) {
      const changed = Object.entries(after.context ?? {})
        .filter(([k, v]) => !sameValue(before.context?.[k], v))
        .map(([k, v]) => ` · ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
      lines.push(`${name}: trigger is now ${after.source}${changed.join('')}`);
    }
    if ((before.desc ?? '') !== (after.desc ?? '')) lines.push(`${name}: edited description`);
    lines.push(...noteLines(before.note, after.note, name));
  }

  const draftWire = new Map(draftWires.map((w) => [w.id, w]));
  for (const before of wires) {
    const after = draftWire.get(before.id);
    const id = key(before.id);
    const touchesRemoved = [before.from, before.to].some((e) => removedNow.has(parseEndpoint(e).node));
    if (before.change !== 'removed' && (!after || after.change === 'removed')) {
      if (!touchesRemoved) lines.push(`Removed wire ${before.from} → ${before.to} (${id})`);
    }
    if (after) lines.push(...noteLines(before.note, after.note, `wire ${after.from} → ${after.to} (${id})`));
  }
}

function diffBlockType(name: string, before: BlockType, after: BlockType, lines: string[]): void {
  const label = `"${after.label}" (${name})`;
  lines.push(...symbolLines(before.code?.symbol, after.code?.symbol, label));
  lines.push(...portLines(before, after, label));
}

function symbolLines(before: string | undefined, after: string | undefined, name: string): string[] {
  if (before === after) return [];
  if (before && after) return [`Renamed function ${before} → ${after} in ${name}`];
  return after ? [`${name}: function is now ${after}`] : [`${name}: no function named`];
}

function noteLines(before: string | undefined, after: string | undefined, name: string): string[] {
  if (before === after) return [];
  return after ? [`Note on ${name}: ${after}`] : [`Removed the note on ${name}`];
}

function portLines(before: { inputs?: Ports; outputs?: Ports }, after: { inputs?: Ports; outputs?: Ports }, name: string): string[] {
  const lines: string[] = [];
  for (const side of ['inputs', 'outputs'] as Side[]) {
    const word = side === 'inputs' ? 'input' : 'output';
    const a = before[side] ?? {};
    const b = after[side] ?? {};
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const removed = aKeys.filter((k) => !(k in b));
    const added = bKeys.filter((k) => !(k in a));
    const renamed = new Map<string, string>();
    // A rename is a port that disappeared plus one that appeared at the same position.
    for (const old of removed) {
      const fresh = bKeys[aKeys.indexOf(old)];
      if (fresh !== undefined && added.includes(fresh) && !renamed.has(old)) renamed.set(old, fresh);
    }
    const renamedTo = new Set(renamed.values());
    for (const k of aKeys) {
      const to = renamed.get(k);
      if (to !== undefined) {
        lines.push(`${name}: renamed ${word} ${k} → ${to}`);
        if (!sameValue(a[k], b[to])) lines.push(`${name}: ${word} ${to} is now ${show(b[to]!)}`);
      } else if (!(k in b)) lines.push(`${name}: removed ${word} ${k}`);
      else if (!sameValue(a[k], b[k])) lines.push(`${name}: ${word} ${k} is now ${show(b[k]!)}`);
    }
    for (const k of added) if (!renamedTo.has(k)) lines.push(`${name}: added ${word} ${k}: ${show(b[k]!)}`);
  }
  return lines;
}

function typeLines(name: string, before: TypeExpr, after: TypeExpr): string[] {
  const a = parseType(before);
  const b = parseType(after);
  if (a.k !== 'struct' || b.k !== 'struct') return [`${name} is now ${typeToString(b)}`];
  const lines: string[] = [];
  for (const [f, t] of Object.entries(a.fields)) {
    const next = b.fields[f];
    if (!next) lines.push(`${name}: removed field ${f}`);
    else if (typeToString(t) !== typeToString(next)) lines.push(`${name}: field ${f} is now ${typeToString(next)}`);
  }
  for (const [f, t] of Object.entries(b.fields)) if (!(f in a.fields)) lines.push(`${name}: added field ${f}: ${typeToString(t)}`);
  return lines;
}

function show(type: TypeExpr): string {
  return typeToString(parseType(type));
}
