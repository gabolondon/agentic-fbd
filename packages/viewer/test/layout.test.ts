import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildView, type LogicDoc, type ViewModel } from '@logic-builder/core';
import { layoutView, type Box, type Layout } from '../src/layout/elk.ts';

const examples = resolve(import.meta.dirname, '../../../skills/logic-builder/examples');
const load = (name: string) => JSON.parse(readFileSync(join(examples, name), 'utf8')) as LogicDoc;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function assertSane(view: ViewModel, layout: Layout): void {
  for (const n of view.nodes) expect(layout.has(n.id), n.id).toBe(true);

  // Siblings (same parent frame) never overlap.
  const groups = new Map<string, string[]>();
  for (const n of view.nodes) {
    const key = n.parentFrame ?? '';
    groups.set(key, [...(groups.get(key) ?? []), n.id]);
  }
  for (const siblings of groups.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = layout.get(siblings[i]!)!;
        const b = layout.get(siblings[j]!)!;
        expect(overlaps(a, b), `${siblings[i]} overlaps ${siblings[j]}`).toBe(false);
      }
    }
  }

  // Children sit inside their frame (positions are relative to the parent).
  for (const n of view.nodes) {
    if (!n.parentFrame) continue;
    const child = layout.get(n.id)!;
    const parent = layout.get(n.parentFrame)!;
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
    expect(layout.get('in-sel')!.x).toBeLessThan(layout.get('out')!.x);
  });

  it('flows left to right along wires', async () => {
    const view = buildView(understand, [], 'after');
    const layout = await layoutView(view);
    expect(layout.get('t-request')!.x).toBeLessThan(layout.get('proxy')!.x);
    expect(layout.get('proxy')!.x).toBeLessThan(layout.get('served')!.x);
  });
});
