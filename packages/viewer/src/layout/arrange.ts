import type { SavedPosition, ViewEdge, ViewModel, ViewNode } from '@agentic-fbd/core';
import type { Box, Layout, Point } from './elk.ts';
import { FRAME_PADDING, frameMinWidth, portY } from './sizes.ts';

// Arrangements made by hand (spec §6.6). ELK lays out every level; saved positions then
// override it, frames are refitted around their children, and blocks the save doesn't know yet
// are placed where they don't cover anything.

/** A dragged block snaps level with a wire's other end when it comes this close. */
export const WIRE_SNAP = 10;
/** Step used to push a new block down until it covers nothing. */
const PLACE_STEP = 24;

/** Applies a level's saved positions to its automatic layout. Routes are left as they are. */
export function applySaved(view: ViewModel, layout: Layout, saved?: Record<string, SavedPosition>): Layout {
  if (!saved || !view.nodes.some((n) => saved[n.id])) return layout;
  const auto = layout.boxes;
  const boxes = new Map<string, Box>();
  for (const [id, box] of auto) boxes.set(id, { ...box });

  // How far the saved blocks moved, per frame: new blocks move along with their neighbors.
  const shift = new Map<string, Point & { count: number }>();
  for (const n of view.nodes) {
    const pos = saved[n.id];
    const box = boxes.get(n.id);
    if (!pos || !box) continue;
    const key = n.parentFrame ?? '';
    const s = shift.get(key) ?? { x: 0, y: 0, count: 0 };
    shift.set(key, { x: s.x + pos.x - box.x, y: s.y + pos.y - box.y, count: s.count + 1 });
    box.x = pos.x;
    box.y = pos.y;
  }

  const fresh = view.nodes.filter((n) => !saved[n.id] && boxes.has(n.id));
  if (fresh.length) {
    let fitted = fitFrames(view.nodes, boxes, false);
    for (const n of fresh) {
      const box = fitted.get(n.id)!;
      const s = shift.get(n.parentFrame ?? '');
      if (s) {
        box.x += Math.round(s.x / s.count);
        box.y += Math.round(s.y / s.count);
      }
      const siblings = view.nodes.filter((o) => o.id !== n.id && o.parentFrame === n.parentFrame && (saved[o.id] || fresh.indexOf(o) < fresh.indexOf(n)));
      while (siblings.some((o) => overlaps(box, fitted.get(o.id)!))) box.y += PLACE_STEP;
      fitted = fitFrames(view.nodes, fitted, false);
    }
    return { boxes: fitFrames(view.nodes, fitted, true), routes: layout.routes };
  }
  return { boxes: fitFrames(view.nodes, boxes, true), routes: layout.routes };
}

/**
 * Sizes every open frame around its children, innermost first. With `hug`, a frame also moves so
 * its children sit at the padding (they keep their place on the canvas) and shrinks to fit;
 * without it (while dragging), frames only grow to the right and down.
 */
export function fitFrames(nodes: readonly ViewNode[], boxes: ReadonlyMap<string, Box>, hug: boolean): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const [id, box] of boxes) out.set(id, { ...box });
  const children = new Map<string, ViewNode[]>();
  for (const n of nodes) if (n.parentFrame) children.set(n.parentFrame, [...(children.get(n.parentFrame) ?? []), n]);

  // Frames come before their children, so walking backwards fits inner frames first.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const f = nodes[i]!;
    const kids = children.get(f.id);
    const frame = out.get(f.id);
    if (f.type !== 'frame' || !kids?.length || !frame) continue;
    const kidBoxes = kids.map((k) => out.get(k.id)).filter((b): b is Box => !!b);
    if (!kidBoxes.length) continue;
    const minX = Math.min(...kidBoxes.map((b) => b.x));
    const minY = Math.min(...kidBoxes.map((b) => b.y));
    let dx = 0;
    let dy = 0;
    if (hug) {
      dx = FRAME_PADDING.left - minX;
      dy = FRAME_PADDING.top - minY;
      for (const b of kidBoxes) {
        b.x += dx;
        b.y += dy;
      }
      frame.x -= dx;
      frame.y -= dy;
    }
    const width = Math.max(...kidBoxes.map((b) => b.x + b.width)) + FRAME_PADDING.right;
    const height = Math.max(...kidBoxes.map((b) => b.y + b.height)) + FRAME_PADDING.bottom;
    frame.width = hug ? Math.max(width, frameMinWidth(f)) : Math.max(frame.width, width);
    frame.height = hug ? height : Math.max(frame.height, height);
  }
  return out;
}

/** Canvas position of a node, adding up the frames it sits in. */
export function absolutePosition(nodes: ReadonlyMap<string, ViewNode>, boxes: ReadonlyMap<string, Box>, id: string): Point {
  let x = 0;
  let y = 0;
  for (let cur: string | undefined = id; cur; cur = nodes.get(cur)?.parentFrame) {
    const box = boxes.get(cur);
    x += box?.x ?? 0;
    y += box?.y ?? 0;
  }
  return { x, y };
}

/**
 * Nudges a dragged block's y so one of its wires runs straight, when the wire's other end is
 * within WIRE_SNAP. `y` is relative to the block's frame.
 */
export function snapToWires(
  nodes: ReadonlyMap<string, ViewNode>,
  boxes: ReadonlyMap<string, Box>,
  edges: readonly ViewEdge[],
  id: string,
  y: number,
): number {
  const node = nodes.get(id);
  if (!node || node.type === 'frame') return y;
  const frameY = node.parentFrame ? absolutePosition(nodes, boxes, node.parentFrame).y : 0;
  let best = WIRE_SNAP + 1;
  let snapped = y;
  for (const e of edges) {
    const mine = e.source === id ? portIndex(node, 'out', e.sourceHandle) : e.target === id ? portIndex(node, 'in', e.targetHandle) : -1;
    if (mine < 0 || e.source === e.target) continue;
    const otherId = e.source === id ? e.target : e.source;
    const other = nodes.get(otherId);
    const theirs = other ? portIndex(other, e.source === id ? 'in' : 'out', e.source === id ? e.targetHandle : e.sourceHandle) : -1;
    if (!other || theirs < 0) continue;
    const target = absolutePosition(nodes, boxes, otherId).y + portY(other, theirs) - frameY - portY(node, mine);
    const distance = Math.abs(target - y);
    if (distance < best) {
      best = distance;
      snapped = target;
    }
  }
  return snapped;
}

/** Positions to save for a level, rounded. */
export function snapshot(boxes: ReadonlyMap<string, Box>, ids: Iterable<string>): Record<string, SavedPosition> {
  const out: Record<string, SavedPosition> = {};
  for (const id of ids) {
    const box = boxes.get(id);
    if (box) out[id] = { x: Math.round(box.x), y: Math.round(box.y) };
  }
  return out;
}

function portIndex(n: ViewNode, dir: 'in' | 'out', handle: string): number {
  return (dir === 'in' ? n.inputs : n.outputs).findIndex((p) => p.id === handle);
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
