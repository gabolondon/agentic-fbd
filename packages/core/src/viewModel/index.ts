import type { LogicDoc, NodeKind, TypeExpr, WireDraw, WireOp } from '../format.ts';
import { parseEndpoint } from '../model.ts';
import { compat, namesIn, type Compat } from '../types/compat.ts';
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

export type ViewNodeType = 'block' | 'frame' | 'box' | 'pin' | 'connector';

/**
 * A shared state or external connected to at least this many blocks is a hub: when its wires are
 * drawn with connectors, it gets one flag per port instead of one per wire.
 */
export const HUB_MIN = 3;

export interface Connector {
  /** 'out' sits after an output ("goes to"); 'in' sits before an input ("comes from"). */
  side: 'out' | 'in';
  /** View node ids at the other end of the wire(s). */
  peers: string[];
  /** Their labels, in the same order. */
  peerLabels: string[];
}

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
  /** For connector flags: which side and what is at the other end. */
  connector?: Connector;
  /** Another diagram that explains this block (`see`). */
  see?: string;
  /** A note left for the agent in the viewer. */
  note?: string;
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
  draw?: WireDraw;
  /** Set on the short stubs that join a block to a connector flag. */
  stub?: boolean;
}

export interface Crumb {
  label: string;
  path: ViewPath;
}

export interface ViewModel {
  path: ViewPath;
  scope: string;
  /** Group that roots the view inside its scope; undefined at the scope top. */
  rootGroup?: string;
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

export interface BuildOptions {
  /** View edge ids to draw with connectors: wires the layout found hard to follow. */
  labelEdges?: ReadonlySet<string>;
}

export function buildView(doc: LogicDoc, path: ViewPath, mode: ViewMode = 'after', options: BuildOptions = {}): ViewModel {
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

  const boxPorts = new Map<string, { inputs: Map<string, BoxPort>; outputs: Map<string, BoxPort> }>();
  const pins = new Map<string, ViewNode>();
  const edges = new Map<string, ViewEdge>();
  // A wire that carries a type changed in Design mode is affected by that change.
  const changedTypes = new Set(
    doc.subject.mode === 'design' && mode === 'after'
      ? Object.entries(doc.typeInfo ?? {}).flatMap(([name, info]) => (info.change === 'modified' ? [name] : []))
      : [],
  );
  const carriesChanged = (type: TypeExpr | undefined): boolean =>
    changedTypes.size > 0 && type !== undefined && namesIn(type).some((n) => changedTypes.has(n));

  for (const w of eff.wires) {
    const a = parseEndpoint(w.from);
    const b = parseEndpoint(w.to);
    const aIn = isInside(a.node);
    const bIn = isInside(b.node);
    if (!aIn && !bIn) continue;
    const fromType = endType(eff, a.node, a.port, 'outputs');
    const toType = endType(eff, b.node, b.port, 'inputs');

    const src = aIn ? locate(a, 'out') : pinFor(a, 'left', fromType, w.ghost);
    const tgt = bIn ? locate(b, 'in') : pinFor(b, 'right', toType, w.ghost);
    if (!src || !tgt || src.node === tgt.node) continue;
    // An end hidden inside a closed box gets one box port per outside endpoint it connects to.
    const srcHandle = src.handle ?? boxPort(src.node, 'out', tgt, a, fromType, w.ghost);
    const tgtHandle = tgt.handle ?? boxPort(tgt.node, 'in', src, b, toType, w.ghost);

    const key = `${src.node}:${srcHandle}->${tgt.node}:${tgtHandle}`;
    const result: Compat | 'none' =
      w.ghost || fromType === undefined || toType === undefined ? 'none' : compat(fromType, toType, doc.types ?? {});
    const existing = edges.get(key);
    if (existing) {
      existing.wireIds.push(w.id);
      existing.compat = worse(existing.compat, result);
      existing.ghost = existing.ghost && w.ghost;
      if (existing.mark !== w.mark) existing.mark = existing.mark ?? w.mark;
      existing.draw = mergeDraw(existing.draw, w.wire.draw);
    } else {
      edges.set(key, {
        id: `e:${w.id}`,
        source: src.node,
        sourceHandle: srcHandle,
        target: tgt.node,
        targetHandle: tgtHandle,
        wireIds: [w.id],
        from: w.from,
        to: w.to,
        type: fromType ?? toType,
        compat: result,
        mark: w.mark ?? (carriesChanged(fromType ?? toType) ? 'affected' : undefined),
        ghost: w.ghost,
        op: w.op,
        draw: w.wire.draw,
      });
    }
  }

  /** The visible node an end lands on; `handle` is undefined when it is hidden in a closed box. */
  function locate(end: { node: string; port?: string }, dir: 'in' | 'out'): { node: string; handle?: string } | undefined {
    const rep = representative(end.node);
    if (!rep) return undefined;
    return rep.id === end.node ? { node: rep.id, handle: end.port ?? dir } : { node: rep.id };
  }

  function boxPort(
    box: string,
    dir: 'in' | 'out',
    far: { node: string; handle?: string },
    inner: { node: string; port?: string },
    type: TypeExpr | undefined,
    ghost: boolean,
  ): string {
    const handle = `${dir}:${far.handle === undefined ? far.node : `${far.node}.${far.handle}`}`;
    const ports = boxPorts.get(box) ?? { inputs: new Map(), outputs: new Map() };
    boxPorts.set(box, ports);
    const side = dir === 'in' ? ports.inputs : ports.outputs;
    const name = inner.port ?? eff.byId.get(inner.node)?.label ?? inner.node;
    const existing = side.get(handle);
    if (existing) {
      existing.ghost = existing.ghost && ghost;
      existing.names.add(name);
      if (existing.type !== undefined && JSON.stringify(existing.type) !== JSON.stringify(type)) existing.type = undefined;
    } else {
      side.set(handle, { id: handle, names: new Set([name]), type, ghost });
    }
    return handle;
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
      note: f.node.note,
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
      see: n.node.see,
      note: n.node.note,
    };
    if (n.kind === 'state') {
      const t = n.node.valueType;
      base.inputs = [{ id: 'in', label: '', type: t }];
      base.outputs = [{ id: 'out', label: '', type: t }];
    } else if (isBox) {
      const declared = n.node.explored === false;
      const synth = boxPorts.get(n.id);
      const synthIn = [...(synth?.inputs.values() ?? [])].map(toViewPort);
      const synthOut = [...(synth?.outputs.values() ?? [])].map(toViewPort);
      base.inputs = declared ? [...portList(n.inputs, n.ghostInputs), ...synthIn] : synthIn;
      base.outputs = declared ? [...portList(n.outputs, n.ghostOutputs), ...synthOut] : synthOut;
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
  const drawn = withConnectors(nodes, [...edges.values()], options.labelEdges ?? new Set());

  return {
    path: resolved.path,
    scope: resolved.scope,
    rootGroup: resolved.rootGroup,
    mode,
    nodes: drawn.nodes,
    edges: drawn.edges,
    breadcrumb: breadcrumb(doc, resolved.path, mode),
  };
}

/**
 * Replaces wires with labeled connector flags, as net labels in a schematic (spec §6.5, §6.7):
 * wires marked `draw: "label"`, and the wires the layout found hard to follow (`forced`: long,
 * looping far back, or crossing many others). Everything else stays a line. A hub (a state or
 * external block connected to HUB_MIN or more blocks) gets one flag per port; each block on the
 * other side gets its own.
 */
function withConnectors(nodes: ViewNode[], edges: ViewEdge[], forced: ReadonlySet<string>): { nodes: ViewNode[]; edges: ViewEdge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    neighbors.set(a, (neighbors.get(a) ?? new Set()).add(b));
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  const isHub = (id: string): boolean => {
    const n = byId.get(id);
    return !!n && n.type === 'block' && (n.kind === 'state' || n.kind === 'external') && (neighbors.get(id)?.size ?? 0) >= HUB_MIN;
  };
  const isPin = (id: string): boolean => byId.get(id)?.type === 'pin';

  const flags = new Map<string, ViewNode>();
  /** The block each flag sits next to. */
  const flagAt = new Map<string, string>();
  const out: ViewEdge[] = [];
  const stubs = new Map<string, ViewEdge>();

  const flag = (id: string, side: 'out' | 'in', at: ViewNode, peer: ViewNode, edge: ViewEdge): ViewNode => {
    const existing = flags.get(id);
    if (existing) {
      if (!existing.connector!.peers.includes(peer.id)) {
        existing.connector!.peers.push(peer.id);
        existing.connector!.peerLabels.push(peer.label);
      }
      existing.ghost = existing.ghost && edge.ghost;
      return existing;
    }
    const port: ViewPort = { id: 'c', label: '', type: edge.type };
    const created: ViewNode = {
      id,
      type: 'connector',
      kind: peer.kind,
      label: peer.label,
      parentFrame: at.parentFrame,
      inputs: side === 'out' ? [port] : [],
      outputs: side === 'in' ? [port] : [],
      ghost: edge.ghost,
      ref: null,
      connector: { side, peers: [peer.id], peerLabels: [peer.label] },
    };
    flags.set(id, created);
    flagAt.set(id, at.id);
    return created;
  };
  // Stubs into the same flag merge, like duplicate wires.
  const stub = (edge: ViewEdge, patch: Partial<ViewEdge>): void => {
    const next = { ...edge, ...patch, stub: true };
    const key = `${next.source}:${next.sourceHandle}->${next.target}:${next.targetHandle}`;
    const existing = stubs.get(key);
    if (existing) {
      existing.wireIds.push(...edge.wireIds.filter((w) => !existing.wireIds.includes(w)));
      existing.compat = worse(existing.compat, edge.compat);
      existing.ghost = existing.ghost && edge.ghost;
    } else {
      next.wireIds = [...edge.wireIds];
      stubs.set(key, next);
      out.push(next);
    }
  };

  for (const e of edges) {
    const srcHub = isHub(e.source);
    const tgtHub = isHub(e.target);
    const wanted = e.draw === 'label' || (forced.has(e.id) && e.draw !== 'line');
    // Boundary pins already are connectors to the level above.
    if (!wanted || isPin(e.source) || isPin(e.target)) {
      out.push(e);
      continue;
    }
    const src = byId.get(e.source)!;
    const tgt = byId.get(e.target)!;
    // A hub collects one flag per port. Every other block gets one flag per block at the other
    // end, however many wires run between the two.
    const outFlag = srcHub && !tgtHub ? flag(`c:out:${e.source}.${e.sourceHandle}`, 'out', src, tgt, e) : flag(`c:out:${e.source}->${e.target}`, 'out', src, tgt, e);
    const inFlag = tgtHub && !srcHub ? flag(`c:in:${e.target}.${e.targetHandle}`, 'in', tgt, src, e) : flag(`c:in:${e.target}<-${e.source}`, 'in', tgt, src, e);
    stub(e, { id: `${e.id}:out`, target: outFlag.id, targetHandle: 'c' });
    stub(e, { id: `${e.id}:in`, source: inFlag.id, sourceHandle: 'c' });
  }

  // A hub's flag names its peer when there is one, otherwise how many blocks it reaches.
  for (const f of flags.values()) {
    const peers = f.connector!.peers;
    if (peers.length > 1) f.label = `${peers.length} blocks`;
  }
  // Each flag goes next to its block in the node order ("comes from" before it, "goes to" after
  // it): layouts that follow the model order then keep stubs short.
  const ordered: ViewNode[] = [];
  const near = (n: ViewNode, side: 'in' | 'out'): ViewNode[] =>
    [...flags.values()].filter((f) => flagAt.get(f.id) === n.id && f.connector!.side === side);
  for (const n of nodes) ordered.push(...near(n, 'in'), n, ...near(n, 'out'));
  return { nodes: ordered, edges: out };
}

interface BoxPort {
  id: string;
  /** Inner port names bundled into this box port. */
  names: Set<string>;
  type?: TypeExpr;
  ghost: boolean;
}

function toViewPort(p: BoxPort): ViewPort {
  const [first = '', ...rest] = [...p.names];
  return { id: p.id, label: rest.length ? `${first} +${rest.length}` : first, type: p.type, ghost: p.ghost || undefined };
}

function mergeDraw(a: WireDraw | undefined, b: WireDraw | undefined): WireDraw | undefined {
  if (a === 'line' || b === 'line') return 'line';
  return a ?? b;
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
