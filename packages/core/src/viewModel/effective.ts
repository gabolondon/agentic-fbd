import type { BlockType, LogicDoc, LogicNode, Ports, Wire, WireOp } from '../format.ts';
import { parseEndpoint } from '../model.ts';

// Step 1 of building a view: apply the Before/After mode to one scope (design spec §6.3).

export type ViewMode = 'before' | 'after';
export type Mark = 'new' | 'modified' | 'removed' | 'affected';

export interface EffNode {
  id: string;
  /** The original node, for the side panel. */
  node: LogicNode;
  kind: LogicNode['kind'];
  label: string;
  parent?: string;
  inputs: Ports;
  outputs: Ports;
  /** Port names that exist only in `before`, shown as ghosts so removed wires can attach. */
  ghostInputs: Set<string>;
  ghostOutputs: Set<string>;
  mark?: Mark;
  ghost: boolean;
}

export interface EffWire {
  id: string;
  wire: Wire;
  from: string;
  to: string;
  op?: WireOp;
  mark?: Mark;
  ghost: boolean;
}

export interface EffScope {
  /** '' for the file root, otherwise the blockType name. */
  name: string;
  nodes: EffNode[];
  byId: Map<string, EffNode>;
  wires: EffWire[];
}

export function effectiveScope(doc: LogicDoc, scopeName: string, mode: ViewMode): EffScope {
  const design = doc.subject.mode === 'design';
  const source = scopeName ? doc.blockTypes?.[scopeName]?.body : { nodes: doc.nodes, wires: doc.wires };
  const rawNodes = source?.nodes ?? [];
  const rawWires = source?.wires ?? [];
  const before = design && mode === 'before';
  const after = design && mode === 'after';

  const wires: EffWire[] = [];
  for (const w of rawWires) {
    if (before && w.change === 'new') continue;
    const useBefore = before && w.change === 'modified' && w.before;
    wires.push({
      id: w.id,
      wire: w,
      from: (useBefore && w.before?.from) || w.from,
      to: (useBefore && w.before?.to) || w.to,
      op: useBefore && w.before?.op ? w.before.op : w.op,
      mark: after ? markOf(w.change) : undefined,
      ghost: after && w.change === 'removed',
    });
  }

  // Ports that only removed wires use: they exist only in `before`.
  const removedEnds = new Set<string>();
  if (after) {
    for (const w of wires) {
      if (!w.ghost) continue;
      removedEnds.add(`out:${w.from}`);
      removedEnds.add(`in:${w.to}`);
    }
  }

  const nodes: EffNode[] = [];
  for (const n of rawNodes) {
    if (before && n.change === 'new') continue;
    const type = n.kind === 'instance' && n.of ? doc.blockTypes?.[n.of] : undefined;
    const applyBefore = before && n.change === 'modified' && n.before;
    let inputs = portsFor(n, type, 'inputs', before);
    let outputs = portsFor(n, type, 'outputs', before);
    if (applyBefore) {
      if (n.before?.inputs) inputs = n.before.inputs;
      if (n.before?.outputs) outputs = n.before.outputs;
    }
    const ghostInputs = new Set<string>();
    const ghostOutputs = new Set<string>();
    if (after) {
      const extra = (side: 'inputs' | 'outputs'): Ports => ({
        ...(n.before?.[side] ?? {}),
        ...(type?.before?.[side] ?? {}),
      });
      for (const [name, t] of Object.entries(extra('inputs'))) {
        if (!(name in inputs) && removedEnds.has(`in:${n.id}.${name}`)) {
          inputs = { ...inputs, [name]: t };
          ghostInputs.add(name);
        }
      }
      for (const [name, t] of Object.entries(extra('outputs'))) {
        if (!(name in outputs) && removedEnds.has(`out:${n.id}.${name}`)) {
          outputs = { ...outputs, [name]: t };
          ghostOutputs.add(name);
        }
      }
    }
    nodes.push({
      id: n.id,
      node: n,
      kind: n.kind,
      label: (applyBefore && n.before?.label) || n.label,
      parent: applyBefore && n.before?.parent !== undefined ? n.before.parent : n.parent,
      inputs,
      outputs,
      ghostInputs,
      ghostOutputs,
      mark: after ? (markOf(n.change) ?? (type && isChanged(type) ? 'affected' : undefined)) : undefined,
      ghost: after && n.change === 'removed',
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A wire is hidden whenever either end is hidden in this view.
  const visibleWires = wires.filter((w) => byId.has(parseEndpoint(w.from).node) && byId.has(parseEndpoint(w.to).node));
  return { name: scopeName, nodes, byId, wires: visibleWires };
}

function portsFor(n: LogicNode, type: BlockType | undefined, side: 'inputs' | 'outputs', before: boolean): Ports {
  if (n.kind === 'instance') {
    if (!type) return {};
    if (before && type.change === 'modified' && type.before?.[side]) return type.before[side]!;
    return type[side];
  }
  return n[side] ?? {};
}

function markOf(change: string | undefined): Mark | undefined {
  return change === 'new' || change === 'modified' || change === 'removed' ? change : undefined;
}

function isChanged(type: BlockType): boolean {
  return type.change === 'modified' || type.change === 'new';
}
