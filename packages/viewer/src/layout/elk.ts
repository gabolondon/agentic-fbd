import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api';
import type { ViewModel, ViewNode } from '@agentic-fbd/core';
import { FRAME_PADDING, nodeSize, portY } from './sizes.ts';

export interface Box {
  /** Position relative to the parent frame (or the canvas for top-level nodes). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  boxes: Map<string, Box>;
  /** Orthogonal route per edge in canvas coordinates: start, bend points, end. */
  routes: Map<string, Point[]>;
}

// Lines first; connectors only where a line is hard to follow (spec §6.7). After a layout, a wire
// becomes a pair of flags when it is very long, loops far back, or crosses several other wires.

/** A forward wire longer than this is drawn with connectors if it crosses another wire... */
export const LONG_WIRE = 1400;
/** ...and past this, even if it crosses nothing. */
export const VERY_LONG_WIRE = 2400;
/** The same for a wire that runs backwards (a loop around the blocks in between). */
export const LONG_LOOP = 900;
export const VERY_LONG_LOOP = 1800;
/** A wire crossing this many others is drawn with connectors (the worst first). */
export const MAX_CROSSINGS = 3;
/** Layouts tried at most, each turning the remaining hard wires into connectors. */
const MAX_PASSES = 3;

type Segment = [Point, Point];

function segments(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1]!, points[i]!]);
  return out;
}

function routeLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
  return length;
}

const EPS = 2;
/** Parallel runs closer than this, sharing more than OVERLAP_MIN, count as overlapping. */
const OVERLAP_GAP = 3;
const OVERLAP_MIN = 12;

const between = (v: number, a: number, b: number): boolean => v > Math.min(a, b) + EPS && v < Math.max(a, b) - EPS;
const horizontal = ([a, b]: Segment): boolean => Math.abs(a.y - b.y) < 0.5;
const vertical = ([a, b]: Segment): boolean => Math.abs(a.x - b.x) < 0.5;
const shared = (a1: number, a2: number, b1: number, b2: number): number =>
  Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));

/** Whether two orthogonal segments cross or run on top of each other (1) or not (0). */
function meets(s: Segment, t: Segment): number {
  if (horizontal(s) && vertical(t)) return between(t[0].x, s[0].x, s[1].x) && between(s[0].y, t[0].y, t[1].y) ? 1 : 0;
  if (vertical(s) && horizontal(t)) return meets(t, s);
  if (horizontal(s) && horizontal(t) && Math.abs(s[0].y - t[0].y) < OVERLAP_GAP) return shared(s[0].x, s[1].x, t[0].x, t[1].x) > OVERLAP_MIN ? 1 : 0;
  if (vertical(s) && vertical(t) && Math.abs(s[0].x - t[0].x) < OVERLAP_GAP) return shared(s[0].y, s[1].y, t[0].y, t[1].y) > OVERLAP_MIN ? 1 : 0;
  return 0;
}

/**
 * Wires that are hard to follow by eye (spec §6.7):
 * - long ones that cross another wire, and very long ones in any case; a loop back counts as
 *   long sooner;
 * - wires crossing MAX_CROSSINGS or more others. These go greedily, worst first, since flagging
 *   one wire also clears the crossings of the wires it crossed.
 * Stubs to flags are never hard.
 */
export function hardEdges(view: ViewModel, layout: Layout): Set<string> {
  const lines = view.edges.filter((e) => !e.stub && (layout.routes.get(e.id)?.length ?? 0) >= 2);
  const length = (id: string): number => routeLength(layout.routes.get(id)!);

  // Crossings between wires that don't share a block (wires fanning out of one block touch).
  const crossings = new Map<string, Map<string, number>>(lines.map((e) => [e.id, new Map()]));
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    const sa = segments(layout.routes.get(a.id)!);
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j]!;
      if (a.source === b.source || a.source === b.target || a.target === b.source || a.target === b.target) continue;
      const sb = segments(layout.routes.get(b.id)!);
      let n = 0;
      for (const s of sa) for (const t of sb) n += meets(s, t);
      if (n) {
        crossings.get(a.id)!.set(b.id, n);
        crossings.get(b.id)!.set(a.id, n);
      }
    }
  }
  const total = (id: string): number => [...crossings.get(id)!.values()].reduce((sum, n) => sum + n, 0);
  const drop = (id: string): void => {
    for (const other of crossings.get(id)!.keys()) crossings.get(other)?.delete(id);
    crossings.delete(id);
  };

  const out = new Set<string>();
  for (const e of lines) {
    const points = layout.routes.get(e.id)!;
    const backwards = points[points.length - 1]!.x < points[0]!.x;
    const [long, veryLong] = backwards ? [LONG_LOOP, VERY_LONG_LOOP] : [LONG_WIRE, VERY_LONG_WIRE];
    const len = length(e.id);
    if (len > veryLong || (len > long && total(e.id) > 0)) out.add(e.id);
  }
  for (const id of out) drop(id);

  for (;;) {
    let worst: string | undefined;
    for (const id of crossings.keys()) {
      const n = total(id);
      if (n < MAX_CROSSINGS) continue;
      // Most crossings first; among equals, the longest wire.
      if (!worst || n > total(worst) || (n === total(worst) && length(id) > length(worst))) worst = id;
    }
    if (!worst) break;
    out.add(worst);
    drop(worst);
  }
  return out;
}

/**
 * Ways to break the cycles of a flow (which wire runs backwards). None wins everywhere: on the
 * bundled examples and agent-written diagrams, depth-first, greedy and model order (the order
 * blocks are written in, which the skill keeps in story order) each read best somewhere, so every
 * level tries them, in this order of preference.
 */
const CYCLE_BREAKING = ['DEPTH_FIRST', 'GREEDY', 'GREEDY_MODEL_ORDER', 'MODEL_ORDER'];

/** What a wire drawn as a pair of flags costs, against px of line: flags are the last resort. */
const FLAG_COST = 800;

/**
 * Lower is easier to read: the length of the wires that stay lines, where a wire running
 * backwards counts double (a flow reads left to right, with as few loops back as can be), plus
 * FLAG_COST for each wire that will become flags.
 */
function cost(view: ViewModel, layout: Layout): number {
  const hard = hardEdges(view, layout);
  let total = hard.size * FLAG_COST;
  for (const [id, points] of layout.routes) {
    if (hard.has(id)) continue;
    const backwards = points.length > 1 && points[points.length - 1]!.x < points[0]!.x;
    total += routeLength(points) * (backwards ? 2 : 1);
  }
  return total;
}

/**
 * Lays out a view with lines, keeping the cycle breaking that reads best; while some wires come
 * out hard to follow, draws those with connectors and lays out again. `rebuild` builds the same
 * view with a set of edges as connectors.
 */
export async function layoutReadable(
  view: ViewModel,
  rebuild: (labelEdges: Set<string>) => ViewModel,
): Promise<{ view: ViewModel; layout: Layout }> {
  let current = view;
  let layout = await bestLayout(view);
  const flagged = new Set<string>();
  for (let pass = 1; pass < MAX_PASSES; pass++) {
    const hard = hardEdges(current, layout);
    if (hard.size === 0) break;
    for (const id of hard) flagged.add(id);
    current = rebuild(new Set(flagged));
    // Flags change the graph, so the best cycle breaking may change too.
    layout = await bestLayout(current);
  }
  return { view: current, layout };
}

async function bestLayout(view: ViewModel): Promise<Layout> {
  let best: Layout | undefined;
  let lowest = Infinity;
  for (const strategy of CYCLE_BREAKING) {
    const laid = await layoutView(view, { 'elk.layered.cycleBreaking.strategy': strategy });
    const c = cost(view, laid);
    if (c < lowest) [lowest, best] = [c, laid];
  }
  return best!;
}

const elk = new ELK();

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Edge routes come back in canvas coordinates, whatever frame the edge crosses.
  'elk.json.edgeCoords': 'ROOT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.spacing.edgeEdge': '12',
  'elk.spacing.nodeNode': '28',
  'elk.spacing.componentComponent': '48',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Real flows loop back (a result returns to the form that started it); layoutReadable picks
  // the cycle breaking per level. Triggers are pinned to the first layer (leafOptions).
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
};

const FRAME_OPTIONS: Record<string, string> = {
  'elk.padding': `[top=${FRAME_PADDING.top},left=${FRAME_PADDING.left},bottom=${FRAME_PADDING.bottom},right=${FRAME_PADDING.right}]`,
};

export function portKey(nodeId: string, dir: 'in' | 'out', portId: string): string {
  return `${nodeId}::${dir}::${portId}`;
}

/** Lays out a view with ELK. Ports are fixed where the components draw their handles. */
export async function layoutView(view: ViewModel, options: Record<string, string> = {}): Promise<Layout> {
  const elkNodes = new Map<string, ElkNode>();
  const root: ElkNode = { id: '__root__', layoutOptions: { ...ROOT_OPTIONS, ...options }, children: [], edges: [] };

  for (const n of view.nodes) {
    const elkNode: ElkNode =
      n.type === 'frame'
        ? { id: n.id, layoutOptions: FRAME_OPTIONS, children: [] }
        : { id: n.id, ...nodeSize(n), ports: ports(n), layoutOptions: leafOptions(n) };
    elkNodes.set(n.id, elkNode);
    const parent = n.parentFrame ? elkNodes.get(n.parentFrame) : root;
    (parent ?? root).children!.push(elkNode);
  }

  root.edges = view.edges.map(
    (e): ElkExtendedEdge => ({
      id: e.id,
      sources: [portKey(e.source, 'out', e.sourceHandle)],
      targets: [portKey(e.target, 'in', e.targetHandle)],
    }),
  );

  const result = await elk.layout(root);
  const boxes = new Map<string, Box>();
  const routes = new Map<string, Point[]>();
  const collect = (node: ElkNode): void => {
    for (const child of node.children ?? []) {
      boxes.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0 });
      collect(child);
    }
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0];
      if (section) routes.set(edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x, y: p.y })));
    }
  };
  collect(result);
  return { boxes, routes };
}

function ports(n: ViewNode): ElkPort[] {
  const { width } = nodeSize(n);
  return [
    ...n.inputs.map((p, i) => ({
      id: portKey(n.id, 'in', p.id),
      x: 0,
      y: portY(n, i),
      width: 1,
      height: 1,
      layoutOptions: { 'elk.port.side': 'WEST', 'elk.port.index': String(i) },
    })),
    ...n.outputs.map((p, i) => ({
      id: portKey(n.id, 'out', p.id),
      x: width - 1,
      y: portY(n, i),
      width: 1,
      height: 1,
      layoutOptions: { 'elk.port.side': 'EAST', 'elk.port.index': String(i) },
    })),
  ];
}

function leafOptions(n: ViewNode): Record<string, string> {
  const options: Record<string, string> = { 'elk.portConstraints': 'FIXED_POS' };
  if (n.type === 'pin' && !n.parentFrame) {
    options['elk.layered.layering.layerConstraint'] = n.pinSide === 'left' ? 'FIRST' : 'LAST';
  }
  // What starts a flow is read first, whatever wires loop back to it.
  if (n.type === 'block' && n.kind === 'trigger' && !n.parentFrame && n.inputs.length === 0) {
    options['elk.layered.layering.layerConstraint'] = 'FIRST';
  }
  return options;
}
