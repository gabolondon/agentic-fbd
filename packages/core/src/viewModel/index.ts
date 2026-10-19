import type { LogicDoc, NodeKind, TypeExpr, WireOp } from '../format.ts';
import { parseEndpoint } from '../model.ts';
import { compat, type Compat } from '../types/compat.ts';
import { effectiveScope, type EffNode, type EffScope, type Mark, type ViewMode } from './effective.ts';

export type { Mark, ViewMode } from './effective.ts';

/**
 * Where the user is: a list of node ids. Every element except the last is an instance
 * (entering it switches to its blockType body); the last is a group or an instance.
 * [] is the file root.
 */
export type ViewPath = string[];

export const NODE_BUDGET = 25;

export interface ViewPort {
  /** Handle id, unique within its node. */
  id: string;
  label: string;
  type?: TypeExpr;
  ghost?: boolean;
}

export type ViewNodeType = 'block' | 'frame' | 'box' | 'pin';

export interface ViewNode {
  /** Unique within the view. */
  id: string;
  type: ViewNodeType;
  kind: NodeKind;
  label: string;
  /** Id of the open frame that contains this node. Frames come before their children. */
  parentFrame?: string;
  inputs: ViewPort[];
  outputs: ViewPort[];
  mark?: Mark;
  ghost?: boolean;
  openRisk?: boolean;
  /** Closed box whose contents include changes or open risks. */
  innerChanges?: boolean;
  innerRisk?: boolean;
  unexplored?: boolean;
  /** Double-click enters it. */
  enterable?: boolean;
  /** Which side a boundary pin sits on. */
  pinSide?: 'left' | 'right';
  /** The original node: scope ('' or blockType name) and id. Null for boundary pins. */
  ref: { scope: string; id: string } | null;
  /** For boundary pins: the outside endpoint, e.g. "save.answer". */
  outsideRef?: string;
}

export interface ViewEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  /** Original wire ids merged into this edge. */
  wireIds: string[];
  /** Original endpoints of the first merged wire, for the tooltip. */
  from: string;
  to: string;
  type?: TypeExpr;
  compat: Compat | 'none';
  mark?: Mark;
  ghost?: boolean;
  op?: WireOp;
}

export interface Crumb {
  label: string;
  path: ViewPath;
}

export interface ViewModel {
  path: ViewPath;
  scope: string;
  mode: ViewMode;
  nodes: ViewNode[];
  edges: ViewEdge[];
  breadcrumb: Crumb[];
}

interface Resolved {
  path: ViewPath;
  /** Scope name per segment: '' for the file root, then blockType names. */
  scope: string;
  /** Group id that roots the view inside the scope, or undefined for the scope top. */
  rootGroup?: string;
}

/** The path the app opens on: subject.focus if set, else the file root. */
export function initialPath(doc: LogicDoc): ViewPath {
  const focus = doc.subject.focus;
  return focus && doc.nodes.some((n) => n.id === focus) ? [focus] : [];
}

/** Trims a path to its longest valid prefix (used after live reload). */
export function resolvePath(doc: LogicDoc, path: ViewPath, mode: ViewMode = 'after'): Resolved {
  let scope = '';
  const valid: string[] = [];
  let rootGroup: string | undefined;
  for (let i = 0; i < path.length; i++) {
    const id = path[i]!;
    const eff = effectiveScope(doc, scope, mode);
    const node = eff.byId.get(id);
    if (!node || rootGroup !== undefined) break;
    if (node.kind === 'instance') {
      const type = node.node.of ? doc.blockTypes?.[node.node.of] : undefined;
      if (!type?.body) break;
      valid.push(id);
      scope = node.node.of!;
      continue;
    }
    if (node.kind === 'group' && node.node.explored !== false && eff.nodes.some((n) => n.parent === id)) {
      valid.push(id);
      rootGroup = id;
      continue;
    }
    break;
  }
  return { path: valid, scope, rootGroup };
}

export function buildView(doc: LogicDoc, path: ViewPath, mode: ViewMode = 'after'): ViewModel {
  const resolved = resolvePath(doc, path, mode);
  const eff = effectiveScope(doc, resolved.scope, mode);
  const risks = openRiskRefs(doc);
  const riskKey = (id: string): string => (resolved.scope ? `${resolved.scope}/${id}` : id);

  // --- Visibility: open child groups breadth-first within the budget. -------------------------
  const kids = (parent: string | undefined): EffNode[] => eff.nodes.filter((n) => n.parent === parent);
  const canOpen = (n: EffNode): boolean => n.kind === 'group' && n.node.explored !== false && kids(n.id).length > 0;

  const open = new Set<string>();
  const top = kids(resolved.rootGroup);
  let count = top.length;
  const queue = top.filter(canOpen);
  while (queue.length) {
    const g = queue.shift()!;
    const children = kids(g.id);
    if (count - 1 + children.length > NODE_BUDGET) continue;
    count += children.length - 1;
    open.add(g.id);
    queue.push(...children.filter(canOpen));
  }

  const visible = new Map<string, EffNode>(); // leaves and closed boxes
  const frames: EffNode[] = [];
  const walk = (parent: string | undefined): void => {
    for (const n of kids(parent)) {
      if (open.has(n.id)) {
        frames.push(n);
        walk(n.id);
      } else {
        visible.set(n.id, n);
      }
    }
  };
  walk(resolved.rootGroup);

  // --- Wires: lift ends to the nearest visible ancestor; outside ends become boundary pins. ----
  const isInside = (id: string): boolean => {
    if (resolved.rootGroup === undefined) return true;
    let cur = eff.byId.get(id)?.parent;
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur)) {
      if (cur === resolved.rootGroup) return true;
      seen.add(cur);
      cur = eff.byId.get(cur)?.parent;
    }
    return false;
  };
  const representative = (id: string): EffNode | undefined => {
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur)) {
      const v = visible.get(cur);
      if (v) return v;
      seen.add(cur);
      cur = eff.byId.get(cur)?.parent;
    }
    return undefined;
  };

  const boxPorts = new Map<string, { inputs: Map<string, ViewPort>; outputs: Map<string, ViewPort> }>();
  const pins = new Map<string, ViewNode>();
  const edges = new Map<string, ViewEdge>();

  for (const w of eff.wires) {
    const a = parseEndpoint(w.from);
    const b = parseEndpoint(w.to);
    const aIn = isInside(a.node);
    const bIn = isInside(b.node);
    if (!aIn && !bIn) continue;
    const fromType = endType(eff, a.node, a.port, 'outputs');
    const toType = endType(eff, b.node, b.port, 'inputs');

    const src = aIn ? attach(a, 'out', fromType, w.ghost) : pinFor(a, 'left', fromType, w.ghost);
    const tgt = bIn ? attach(b, 'in', toType, w.ghost) : pinFor(b, 'right', toType, w.ghost);
    if (!src || !tgt || src.node === tgt.node) continue;

    const key = `${src.node}:${src.handle}->${tgt.node}:${tgt.handle}`;
    const result: Compat | 'none' =
      w.ghost || fromType === undefined || toType === undefined ? 'none' : compat(fromType, toType, doc.types ?? {});
    const existing = edges.get(key);
    if (existing) {
      existing.wireIds.push(w.id);
      existing.compat = worse(existing.compat, result);
      existing.ghost = existing.ghost && w.ghost;
      if (existing.mark !== w.mark) existing.mark = existing.mark ?? w.mark;
    } else {
      edges.set(key, {
        id: `e:${w.id}`,
        source: src.node,
        sourceHandle: src.handle,
        target: tgt.node,
        targetHandle: tgt.handle,
        wireIds: [w.id],
        from: w.from,
        to: w.to,
        type: fromType ?? toType,
        compat: result,
        mark: w.mark,
        ghost: w.ghost,
        op: w.op,
      });
    }
  }

  function attach(
    end: { node: string; port?: string },
    dir: 'in' | 'out',
    type: TypeExpr | undefined,
    ghost: boolean,
  ): { node: string; handle: string } | undefined {
    const rep = representative(end.node);
    if (!rep) return undefined;
    if (rep.id === end.node) return { node: rep.id, handle: end.port ?? dir };
    // The end is hidden inside a closed box: synthesize a stable boundary port on the box.
    const handle = `${dir}:${end.node}.${end.port ?? dir}`;
    const ports = boxPorts.get(rep.id) ?? { inputs: new Map(), outputs: new Map() };
    boxPorts.set(rep.id, ports);
    const side = dir === 'in' ? ports.inputs : ports.outputs;
    const existing = side.get(handle);
    if (existing) existing.ghost = existing.ghost && ghost;
    else side.set(handle, { id: handle, label: end.port ?? eff.byId.get(end.node)?.label ?? end.node, type, ghost });
    return { node: rep.id, handle };
  }

  function pinFor(
    end: { node: string; port?: string },
    side: 'left' | 'right',
    type: TypeExpr | undefined,
    ghost: boolean,
  ): { node: string; handle: string } {
    const ref = end.port ? `${end.node}.${end.port}` : end.node;
    const id = `pin:${side === 'left' ? 'in' : 'out'}:${ref}`;
    const existing = pins.get(id);
    if (existing) {
      existing.ghost = existing.ghost && ghost;
    } else {
      const outside = eff.byId.get(end.node);
      const label = `${outside?.label ?? end.node}${end.port ? ` · ${end.port}` : ''}`;
      const port: ViewPort = { id: 'pin', label: end.port ?? '', type };
      pins.set(id, {
        id,
        type: 'pin',
        kind: 'pin',
        label,
        inputs: side === 'right' ? [port] : [],
        outputs: side === 'left' ? [port] : [],
        pinSide: side,
        ghost,
        ref: null,
        outsideRef: ref,
      });
    }
    return { node: id, handle: 'pin' };
  }

  // --- Nodes. ----------------------------------------------------------------------------------
  const frameOf = (n: EffNode): string | undefined => (n.parent !== undefined && open.has(n.parent) ? n.parent : undefined);
  const nodes: ViewNode[] = [];

  for (const f of frames) {
    nodes.push({
      id: f.id,
      type: 'frame',
      kind: 'group',
      label: f.label,
      parentFrame: frameOf(f),
      inputs: [],
      outputs: [],
      mark: f.mark,
      ghost: f.ghost,
      openRisk: risks.has(riskKey(f.id)),
      enterable: true,
      ref: { scope: resolved.scope, id: f.id },
    });
  }

  for (const n of visible.values()) {
    const isBox = n.kind === 'group';
    const base: ViewNode = {
      id: n.id,
      type: isBox ? 'box' : n.kind === 'pin' ? 'pin' : 'block',
      kind: n.kind,
      label: n.label,
      parentFrame: frameOf(n),
      inputs: [],
      outputs: [],
      mark: n.mark,
      ghost: n.ghost,
      openRisk: risks.has(riskKey(n.id)),
      ref: { scope: resolved.scope, id: n.id },
    };
    if (n.kind === 'state') {
      const t = n.node.valueType;
      base.inputs = [{ id: 'in', label: '', type: t }];
      base.outputs = [{ id: 'out', label: '', type: t }];
    } else if (isBox) {
      const declared = n.node.explored === false;
      const synth = boxPorts.get(n.id);
      base.inputs = declared ? portList(n.inputs, n.ghostInputs) : [...(synth?.inputs.values() ?? [])];
      base.outputs = declared ? portList(n.outputs, n.ghostOutputs) : [...(synth?.outputs.values() ?? [])];
      if (declared && synth) {
        base.inputs.push(...synth.inputs.values());
        base.outputs.push(...synth.outputs.values());
      }
      base.unexplored = declared;
      base.enterable = true;
      const inner = descendantsOf(eff, n.id);
      base.innerChanges = inner.some((d) => d.mark !== undefined);
      base.innerRisk = inner.some((d) => risks.has(riskKey(d.id)));
    } else {
      base.inputs = portList(n.inputs, n.ghostInputs);
      base.outputs = portList(n.outputs, n.ghostOutputs);
      if (n.kind === 'pin') base.pinSide = Object.keys(n.outputs).length ? 'left' : 'right';
      if (n.kind === 'instance') {
        const type = n.node.of ? doc.blockTypes?.[n.node.of] : undefined;
        base.enterable = !!type?.body;
        base.innerRisk = !!n.node.of && [...risks].some((r) => r.startsWith(`${n.node.of}/`));
      }
    }
    nodes.push(base);
  }
  nodes.push(...pins.values());

  return {
    path: resolved.path,
    scope: resolved.scope,
    mode,
    nodes,
    edges: [...edges.values()],
    breadcrumb: breadcrumb(doc, resolved.path, mode),
  };
}

function portList(ports: Record<string, TypeExpr>, ghosts: Set<string>): ViewPort[] {
  return Object.entries(ports).map(([name, type]) => ({ id: name, label: name, type, ghost: ghosts.has(name) || undefined }));
}

function endType(eff: EffScope, nodeId: string, port: string | undefined, side: 'inputs' | 'outputs'): TypeExpr | undefined {
  const n = eff.byId.get(nodeId);
  if (!n) return undefined;
  if (port === undefined) return n.kind === 'state' ? n.node.valueType : undefined;
  return n[side][port];
}

function descendantsOf(eff: EffScope, groupId: string): EffNode[] {
  const out: EffNode[] = [];
  const stack = [groupId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of eff.nodes) {
      if (n.parent === cur) {
        out.push(n);
        stack.push(n.id);
      }
    }
  }
  return out;
}

function openRiskRefs(doc: LogicDoc): Set<string> {
  const out = new Set<string>();
  for (const r of doc.risks ?? []) if (r.status === 'open') for (const ref of r.refs) out.add(ref);
  return out;
}

const SEVERITY: Record<Compat | 'none', number> = { none: 0, ok: 1, unknown: 2, warning: 3, error: 4 };

function worse(a: Compat | 'none', b: Compat | 'none'): Compat | 'none' {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

function breadcrumb(doc: LogicDoc, path: ViewPath, mode: ViewMode): Crumb[] {
  const crumbs: Crumb[] = [{ label: doc.subject.title, path: [] }];
  let scope = '';
  const prefix: string[] = [];
  for (const id of path) {
    const eff = effectiveScope(doc, scope, mode);
    const chain: EffNode[] = [];
    let cur = eff.byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur);
      seen.add(cur.id);
      cur = cur.parent !== undefined ? eff.byId.get(cur.parent) : undefined;
    }
    for (const n of chain) crumbs.push({ label: n.label, path: [...prefix, n.id] });
    prefix.push(id);
    const node = eff.byId.get(id);
    if (node?.kind === 'instance' && node.node.of) scope = node.node.of;
  }
  return crumbs;
}
