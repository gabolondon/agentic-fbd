import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildView, type LogicDoc, type SavedPosition, type ViewModel } from '@logic-builder/core';
import { layoutView, type Box, type Layout } from '../src/layout/elk.ts';
import { absolutePosition, applySaved, snapToWires, snapshot, WIRE_SNAP } from '../src/layout/arrange.ts';
import { FRAME_PADDING, portY } from '../src/layout/sizes.ts';

const examples = resolve(import.meta.dirname, '../../../skills/logic-builder/examples');
const load = (name: string) => JSON.parse(readFileSync(join(examples, name), 'utf8')) as LogicDoc;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const byId = (view: ViewModel) => new Map(view.nodes.map((n) => [n.id, n]));

/** A view with an open frame of at least two children, and its automatic layout. */
async function framed(): Promise<{ view: ViewModel; layout: Layout; frame: string; kids: string[] }> {
  const view = buildView(load('other-free-text.logic.json'), [], 'after');
  const layout = await layoutView(view);
  for (const f of view.nodes.filter((n) => n.type === 'frame')) {
    const kids = view.nodes.filter((n) => n.parentFrame === f.id).map((n) => n.id);
    if (kids.length >= 2) return { view, layout, frame: f.id, kids };
  }
  throw new Error('no frame with two children in the example');
}

describe('applySaved', () => {
  it('leaves the automatic layout alone when nothing is saved for the level', async () => {
    const { view, layout } = await framed();
    expect(applySaved(view, layout, undefined)).toBe(layout);
    expect(applySaved(view, layout, { 'not-here': { x: 1, y: 1 } })).toBe(layout);
  });

  it('puts saved blocks where they were dropped and refits their frame around them', async () => {
    const { view, layout, frame, kids } = await framed();
    const nodes = byId(view);
    const saved: Record<string, SavedPosition> = snapshot(layout.boxes, view.nodes.map((n) => n.id));
    const moved = kids[0]!;
    const before = absolutePosition(nodes, layout.boxes, moved);
    // Dragged far to the right inside its frame, and above the frame's top edge.
    saved[moved] = { x: saved[moved]!.x + 900, y: -40 };
    const result = applySaved(view, layout, saved);

    const frameBox = result.boxes.get(frame)!;
    const box = result.boxes.get(moved)!;
    expect(box.x + box.width + FRAME_PADDING.right).toBeLessThanOrEqual(frameBox.width);
    expect(frameBox.width).toBeGreaterThan(layout.boxes.get(frame)!.width);
    // The frame moved so its children sit at the padding again, without moving them.
    const kidBoxes = kids.map((k) => result.boxes.get(k)!);
    expect(Math.min(...kidBoxes.map((b) => b.y))).toBe(FRAME_PADDING.top);
    expect(Math.min(...kidBoxes.map((b) => b.x))).toBe(FRAME_PADDING.left);
    const after = absolutePosition(nodes, result.boxes, moved);
    expect(after.x).toBe(before.x + 900);
    expect(after.y).toBe(absolutePosition(nodes, layout.boxes, frame).y - 40);
    // Its sibling kept its place on the canvas.
    const sibling = kids[1]!;
    expect(absolutePosition(nodes, result.boxes, sibling)).toEqual(absolutePosition(nodes, layout.boxes, sibling));
  });

  it('places blocks the save does not know yet where they cover nothing', async () => {
    const view = buildView(load('auth-gate.logic.json'), [], 'after');
    const layout = await layoutView(view);
    const top = view.nodes.filter((n) => !n.parentFrame);
    const [fresh, other] = [top[0]!, top[1]!];
    const saved = snapshot(layout.boxes, view.nodes.filter((n) => n.id !== fresh.id).map((n) => n.id));
    // Another block was dropped right where the new one would go.
    saved[other.id] = { x: layout.boxes.get(fresh.id)!.x, y: layout.boxes.get(fresh.id)!.y };
    const result = applySaved(view, layout, saved);
    for (const n of top) {
      if (n.id !== fresh.id) expect(overlaps(result.boxes.get(fresh.id)!, result.boxes.get(n.id)!), n.id).toBe(false);
    }
  });
});

describe('snapToWires', () => {
  const doc: LogicDoc = {
    version: '0.1',
    subject: { id: 'pair', title: 'Pair', intent: 'Test', mode: 'understand' },
    nodes: [
      { id: 'a', kind: 'function', label: 'A', outputs: { v: 'string' } },
      { id: 'b', kind: 'function', label: 'B', inputs: { v: 'string' } },
    ],
    wires: [{ id: 'w', from: 'a.v', to: 'b.v' }],
  };

  it('levels a dragged block with the other end of its wire when it comes close', async () => {
    const view = buildView(doc, [], 'after');
    const layout = await layoutView(view);
    const nodes = byId(view);
    const a = layout.boxes.get('a')!;
    const level = a.y + portY(nodes.get('a')!, 0) - portY(nodes.get('b')!, 0);
    expect(snapToWires(nodes, layout.boxes, view.edges, 'b', level + WIRE_SNAP - 2)).toBe(level);
    expect(snapToWires(nodes, layout.boxes, view.edges, 'b', level - WIRE_SNAP + 2)).toBe(level);
    expect(snapToWires(nodes, layout.boxes, view.edges, 'b', level + WIRE_SNAP + 15)).toBe(level + WIRE_SNAP + 15);
  });
});
