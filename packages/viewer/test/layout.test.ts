import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildView, type LogicDoc, type ViewEdge, type ViewModel } from '@logic-builder/core';
import { hardEdges, LONG_LOOP, LONG_WIRE, layoutReadable, layoutView, VERY_LONG_WIRE, type Box, type Layout, type Point } from '../src/layout/elk.ts';

const examples = resolve(import.meta.dirname, '../../../skills/logic-builder/examples');
const load = (name: string) => JSON.parse(readFileSync(join(examples, name), 'utf8')) as LogicDoc;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function assertSane(view: ViewModel, layout: Layout): void {
  for (const n of view.nodes) expect(layout.boxes.has(n.id), n.id).toBe(true);

  // Siblings (same parent frame) never overlap.
  const groups = new Map<string, string[]>();
  for (const n of view.nodes) {
    const key = n.parentFrame ?? '';
    groups.set(key, [...(groups.get(key) ?? []), n.id]);
  }
  for (const siblings of groups.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = layout.boxes.get(siblings[i]!)!;
        const b = layout.boxes.get(siblings[j]!)!;
        expect(overlaps(a, b), `${siblings[i]} overlaps ${siblings[j]}`).toBe(false);
      }
    }
  }

  // Children sit inside their frame (positions are relative to the parent).
  for (const n of view.nodes) {
    if (!n.parentFrame) continue;
    const child = layout.boxes.get(n.id)!;
    const parent = layout.boxes.get(n.parentFrame)!;
    expect(child.x).toBeGreaterThanOrEqual(0);
    expect(child.y).toBeGreaterThanOrEqual(0);
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 0.5);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 0.5);
  }
}

describe('layoutView', () => {
  const design = load('other-free-text.logic.json');
  const understand = load('auth-gate.logic.json');

  for (const [name, doc, path] of [
    ['design root', design, []],
    ['design vaccines', design, ['vaccines']],
    ['design instance body', design, ['other-vaccines']],
    ['understand root', understand, []],
  ] as const) {
    it(`lays out ${name} without overlaps, children inside frames`, async () => {
      for (const mode of ['after', 'before'] as const) {
        const view = buildView(doc, [...path], mode);
        assertSane(view, await layoutView(view));
      }
    });
  }

  it('puts left boundary pins before right ones', async () => {
    const view = buildView(design, ['other-vaccines'], 'after');
    const layout = await layoutView(view);
    expect(layout.boxes.get('in-sel')!.x).toBeLessThan(layout.boxes.get('out')!.x);
  });

  it('flows left to right along wires', async () => {
    const view = buildView(understand, [], 'after');
    const layout = await layoutView(view);
    expect(layout.boxes.get('t-request')!.x).toBeLessThan(layout.boxes.get('proxy')!.x);
    expect(layout.boxes.get('proxy')!.x).toBeLessThan(layout.boxes.get('served')!.x);
  });
});

describe('layoutView — connectors and long wires', () => {
  const fn = (id: string, extra: object = {}) => ({ id, kind: 'function' as const, label: `Block ${id}`, ...extra });
  const hub: LogicDoc = {
    version: '0.1',
    subject: { id: 'hub', title: 'Hub', intent: 'Test', mode: 'understand' },
    nodes: [
      { id: 'db', kind: 'state', label: 'Shared database', valueType: 'string' },
      fn('a', { outputs: { s: 'string' } }),
      fn('b', { outputs: { s: 'string' } }),
      fn('c', { inputs: { s: 'string' } }),
    ],
    wires: [
      { id: 'w1', from: 'a.s', to: 'db', op: 'write' },
      { id: 'w2', from: 'b.s', to: 'db', op: 'write' },
      { id: 'w3', from: 'db', to: 'c.s', op: 'read' },
    ],
  };

  it('keeps a small hub as lines', async () => {
    const view = buildView(hub, [], 'after');
    const laid = await layoutReadable(view, (labelEdges) => buildView(hub, [], 'after', { labelEdges }));
    expect(laid.view.nodes.some((n) => n.type === 'connector')).toBe(false);
  });

  it('lays out connector flags next to their blocks without overlaps', async () => {
    const view = buildView(hub, [], 'after', { labelEdges: new Set(['e:w1', 'e:w2', 'e:w3']) });
    expect(view.nodes.some((n) => n.type === 'connector')).toBe(true);
    const layout = await layoutView(view);
    assertSane(view, layout);
    for (const e of view.edges) expect(layout.routes.get(e.id)?.length, e.id).toBeGreaterThanOrEqual(2);
  });

  it('draws the bundled examples with lines only', async () => {
    for (const doc of [load('other-free-text.logic.json'), load('auth-gate.logic.json')]) {
      const view = buildView(doc, [], 'after');
      const laid = await layoutReadable(view, (labelEdges) => buildView(doc, [], 'after', { labelEdges }));
      expect(laid.view.nodes.filter((n) => n.type === 'connector')).toEqual([]);
    }
  });
});

describe('hardEdges', () => {
  // Synthetic routes: what matters is where the wires run, not the blocks.
  const edge = (id: string, source: string, target: string): ViewEdge =>
    ({ id, source, target, sourceHandle: 'o', targetHandle: 'i', wireIds: [id], compat: 'ok' }) as unknown as ViewEdge;
  const pt = (x: number, y: number): Point => ({ x, y });
  const view = (edges: ViewEdge[]): ViewModel => ({ path: [], scope: '', mode: 'after', nodes: [], edges, breadcrumb: [] });
  const layout = (routes: Record<string, Point[]>): Layout => ({ boxes: new Map(), routes: new Map(Object.entries(routes)) });

  it('flags a wire that crosses three others, and only that one', () => {
    const edges = [edge('long', 'a', 'b'), edge('v1', 'c1', 'd1'), edge('v2', 'c2', 'd2'), edge('v3', 'c3', 'd3')];
    const routes = {
      long: [pt(0, 100), pt(900, 100)],
      v1: [pt(200, 0), pt(200, 50), pt(200, 200)],
      v2: [pt(400, 0), pt(400, 200)],
      v3: [pt(600, 0), pt(600, 200)],
    };
    expect(hardEdges(view(edges), layout(routes))).toEqual(new Set(['long']));
    // Two crossings are fine.
    expect(hardEdges(view(edges.slice(0, 3)), layout(routes))).toEqual(new Set());
  });

  it('ignores wires that share a block, and counts wires running on top of each other', () => {
    const shared = [edge('a', 'x', 'b'), edge('b1', 'x', 'c'), edge('b2', 'x', 'd'), edge('b3', 'x', 'e')];
    const routes = { a: [pt(0, 100), pt(900, 100)], b1: [pt(200, 0), pt(200, 200)], b2: [pt(400, 0), pt(400, 200)], b3: [pt(600, 0), pt(600, 200)] };
    expect(hardEdges(view(shared), layout(routes))).toEqual(new Set());
    const stacked = [edge('a', 'p', 'q'), edge('b', 'r', 's'), edge('c', 't', 'u'), edge('d', 'v', 'w')];
    const lanes = { a: [pt(0, 100), pt(900, 100)], b: [pt(100, 101), pt(300, 101)], c: [pt(400, 99), pt(600, 99)], d: [pt(700, 100), pt(800, 100)] };
    expect(hardEdges(view(stacked), layout(lanes))).toEqual(new Set(['a']));
  });

  it('flags long wires only when they cross something, unless they are very long', () => {
    const edges = [edge('far', 'a', 'b'), edge('v', 'c', 'd')];
    const far = [pt(0, 100), pt(LONG_WIRE + 100, 100)];
    expect(hardEdges(view(edges.slice(0, 1)), layout({ far }))).toEqual(new Set());
    expect(hardEdges(view(edges), layout({ far, v: [pt(300, 0), pt(300, 200)] }))).toEqual(new Set(['far']));
    expect(hardEdges(view(edges.slice(0, 1)), layout({ far: [pt(0, 100), pt(VERY_LONG_WIRE + 100, 100)] }))).toEqual(new Set(['far']));
  });

  it('treats a loop back as long sooner than a forward wire', () => {
    const edges = [edge('loop', 'a', 'b'), edge('v', 'c', 'd')];
    // 1140 px, between the two limits, running back over the vertical wire.
    const loop = [pt(500, 100), pt(520, 100), pt(520, -200), pt(0, -200), pt(0, 100)];
    const v = [pt(300, -300), pt(300, 200)];
    expect(LONG_LOOP).toBeLessThan(1140);
    expect(LONG_WIRE).toBeGreaterThan(1140);
    expect(hardEdges(view(edges), layout({ loop, v }))).toEqual(new Set(['loop']));
    const forward = [pt(0, 100), pt(20, 100), pt(20, -200), pt(520, -200), pt(520, 100), pt(620, 100)];
    expect(hardEdges(view(edges), layout({ loop: forward, v }))).toEqual(new Set());
  });
});
