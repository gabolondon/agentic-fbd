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

export type Layout = Map<string, Box>;

const elk = new ELK();

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.nodeNode': '28',
  'elk.spacing.componentComponent': '48',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
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
  const layout: Layout = new Map();
  const collect = (node: ElkNode): void => {
    for (const child of node.children ?? []) {
      layout.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0 });
      collect(child);
    }
  };
  collect(result);
  return layout;
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
