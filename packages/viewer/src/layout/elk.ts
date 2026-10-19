import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api';
import type { ViewModel, ViewNode } from '@logic-builder/core';
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

/** A wire routed longer than this is drawn with connectors instead (spec §6.5). */
export const LONG_WIRE = 1100;
/** A wire that runs backwards (a loop) is drawn with connectors past this length. */
export const LONG_LOOP = 500;

/** Edges whose route is too long to follow by eye. Stubs to flags are never long. */
export function longEdges(view: ViewModel, layout: Layout): Set<string> {
  const out = new Set<string>();
  for (const e of view.edges) {
    const points = layout.routes.get(e.id);
    if (e.stub || !points || points.length < 2) continue;
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
    const backwards = points[points.length - 1]!.x < points[0]!.x;
    if (length > LONG_WIRE || (backwards && length > LONG_LOOP)) out.add(e.id);
  }
  return out;
}

/**
 * Lays out a view; if some wires come out too long, draws those with connectors and lays out
 * again. `rebuild` builds the same view with a set of edges forced to connectors.
 */
export async function layoutReadable(
  view: ViewModel,
  rebuild: (labelEdges: Set<string>) => ViewModel,
): Promise<{ view: ViewModel; layout: Layout }> {
  const first = await layoutView(view);
  const long = longEdges(view, first);
  if (long.size === 0) return { view, layout: first };
  const next = rebuild(long);
  return { view: next, layout: await layoutView(next) };
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
  // Real flows loop back (a result returns to the form that started it). Depth-first cycle
  // breaking keeps the sources of a flow (its triggers) on the left; compared on the bundled
  // examples and an agent-written diagram, it beat model-order and greedy strategies.
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
};

const FRAME_OPTIONS: Record<string, string> = {
  'elk.padding': `[top=${FRAME_PADDING.top},left=${FRAME_PADDING.left},bottom=${FRAME_PADDING.bottom},right=${FRAME_PADDING.right}]`,
};

export function portKey(nodeId: string, dir: 'in' | 'out', portId: string): string {
  return `${nodeId}::${dir}::${portId}`;
}

/** Lays out a view with ELK. Ports are fixed where the components draw their handles. */
export async function layoutView(view: ViewModel): Promise<Layout> {
  const elkNodes = new Map<string, ElkNode>();
  const root: ElkNode = { id: '__root__', layoutOptions: ROOT_OPTIONS, children: [], edges: [] };

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
  return options;
}
