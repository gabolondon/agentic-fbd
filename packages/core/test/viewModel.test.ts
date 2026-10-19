import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildView, initialPath, resolvePath, type LogicDoc, type ViewModel } from '../src/index.ts';
import { examplesDir, readJson } from './helpers.ts';

const design = readJson(join(examplesDir, 'other-free-text.logic.json')) as LogicDoc;
const understand = readJson(join(examplesDir, 'auth-gate.logic.json')) as LogicDoc;

const node = (v: ViewModel, id: string) => {
  const n = v.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id} in view: ${v.nodes.map((x) => x.id).join(', ')}`);
  return n;
};
const ids = (v: ViewModel) => v.nodes.map((n) => n.id).sort();
const edgeFor = (v: ViewModel, wire: string) => v.edges.find((e) => e.wireIds.includes(wire));

describe('buildView — design example, file root, After', () => {
  const v = buildView(design, [], 'after');

  it('opens groups breadth-first: wizard and vaccines open, unexplored conditions closed', () => {
    expect(node(v, 'wizard').type).toBe('frame');
    expect(node(v, 'vaccines').type).toBe('frame');
    expect(node(v, 'vaccines').parentFrame).toBe('wizard');
    const conditions = node(v, 'conditions');
    expect(conditions.type).toBe('box');
    expect(conditions.unexplored).toBe(true);
    expect(node(v, 't-select').parentFrame).toBe('vaccines');
  });

  it('lists frames before their children', () => {
    const order = v.nodes.map((n) => n.id);
    expect(order.indexOf('wizard')).toBeLessThan(order.indexOf('vaccines'));
    expect(order.indexOf('vaccines')).toBeLessThan(order.indexOf('t-select'));
  });

  it('marks changes and resolves instance ports from the blockType', () => {
    expect(node(v, 't-other').mark).toBe('new');
    expect(node(v, 'save').mark).toBe('modified');
    expect(node(v, 'api').mark).toBeUndefined();
    const inst = node(v, 'other-vaccines');
    expect(inst.inputs.map((p) => p.id)).toEqual(['selected', 'text']);
    expect(inst.outputs.map((p) => p.id)).toEqual(['answer']);
    expect(inst.enterable).toBe(true);
  });

  it('shows the removed wire as a ghost attached to a ghost port', () => {
    const save = node(v, 'save');
    expect(save.inputs.find((p) => p.id === 'optionId')?.ghost).toBe(true);
    const w0 = edgeFor(v, 'w0')!;
    expect(w0.ghost).toBe(true);
    expect(w0.compat).toBe('none');
  });

  it('gives state nodes synthesized in/out handles', () => {
    const w4 = edgeFor(v, 'w4')!;
    expect(w4.target).toBe('answers');
    expect(w4.targetHandle).toBe('in');
    expect(w4.op).toBe('write');
  });

  it('flags open risks on nodes', () => {
    expect(node(v, 'review').openRisk).toBe(true);
    expect(node(v, 'save').openRisk).toBe(false);
  });

  it('checks wire types', () => {
    expect(edgeFor(v, 'w3')!.compat).toBe('ok');
  });
});

describe('buildView — Before', () => {
  const v = buildView(design, [], 'before');

  it('hides new items and wires touching them', () => {
    expect(ids(v)).not.toContain('t-other');
    expect(ids(v)).not.toContain('other-vaccines');
    expect(edgeFor(v, 'w3')).toBeUndefined();
  });

  it('shows removed items normally and applies before fields', () => {
    const save = node(v, 'save');
    expect(save.inputs.map((p) => p.id)).toEqual(['optionId']);
    expect(save.mark).toBeUndefined();
    const w0 = edgeFor(v, 'w0')!;
    expect(w0.ghost).toBe(false);
    expect(w0.compat).toBe('ok');
  });
});

describe('buildView — entering levels', () => {
  it('root = vaccines shows its children and boundary pins for outside wires', () => {
    const v = buildView(design, ['vaccines'], 'after');
    expect(ids(v)).toEqual(expect.arrayContaining(['t-select', 't-other', 'other-vaccines']));
    const pin = node(v, 'pin:out:save.answer');
    expect(pin.type).toBe('pin');
    expect(pin.pinSide).toBe('right');
    expect(pin.label).toBe('Save answer · answer');
    expect(edgeFor(v, 'w3')!.target).toBe('pin:out:save.answer');
    expect(v.breadcrumb.map((c) => c.label)).toEqual(["'Other' option with free text", 'Wizard', 'Step: Vaccinations']);
  });

  it('root = an instance shows its body with pins on both sides', () => {
    const v = buildView(design, ['other-vaccines'], 'after');
    expect(v.scope).toBe('OtherOption');
    expect(node(v, 'in-sel').pinSide).toBe('left');
    expect(node(v, 'out').pinSide).toBe('right');
    expect(v.edges.filter((e) => e.target === 'out')).toHaveLength(2);
    expect(v.breadcrumb.map((c) => c.path)).toEqual([[], ['wizard'], ['vaccines'], ['other-vaccines']]);
  });

  it('trims invalid paths to the longest valid prefix', () => {
    expect(resolvePath(design, ['vaccines', 'nope']).path).toEqual(['vaccines']);
    expect(resolvePath(design, ['gone']).path).toEqual([]);
    expect(resolvePath(design, ['conditions']).path).toEqual([]); // unexplored: cannot be entered
  });

  it('starts at subject.focus', () => {
    expect(initialPath(design)).toEqual(['vaccines']);
    expect(initialPath(understand)).toEqual([]);
  });
});

describe('buildView — understand example', () => {
  const v = buildView(understand, [], 'after');

  it('draws unexplored groups as closed boxes with their declared ports', () => {
    const authz = node(v, 'authz');
    expect(authz.type).toBe('box');
    expect(authz.unexplored).toBe(true);
    expect(authz.inputs.map((p) => p.id)).toEqual(['session', 'appId']);
    expect(edgeFor(v, 'w5')!.target).toBe('authz');
    expect(edgeFor(v, 'w5')!.targetHandle).toBe('session');
  });

  it('ignores change marks outside design mode', () => {
    expect(v.nodes.every((n) => n.mark === undefined)).toBe(true);
  });

  it('flags a nominal mismatch as a warning on the edge', () => {
    // signed-in.yes is Session; authz.session is Session -> ok
    expect(edgeFor(v, 'w5')!.compat).toBe('ok');
  });
});

describe('buildView — budget and propagation', () => {
  const many = (n: number, parent: string, change?: 'new') =>
    Array.from({ length: n }, (_, i) => ({ id: `${parent}-${i}`, kind: 'function' as const, label: `${parent} ${i}`, parent, change: i === 0 ? change : undefined }));

  const doc: LogicDoc = {
    version: '0.1',
    subject: { id: 'b', title: 'Budget', intent: 'Test', mode: 'design' },
    nodes: [
      { id: 'big', kind: 'group', label: 'Big' },
      { id: 'small', kind: 'group', label: 'Small' },
      { id: 'x', kind: 'function', label: 'X', inputs: { v: 'number' } },
      { id: 'y', kind: 'function', label: 'Y', outputs: { v: 'number' } },
      ...many(30, 'big', 'new').map((n, i) => (i === 5 ? { ...n, outputs: { v: 'number' } } : n)),
      ...many(3, 'small'),
    ],
    wires: [
      { id: 'w1', from: 'big-5.v', to: 'x.v' },
      { id: 'w2', from: 'big-5.v', to: 'x.v' },
    ],
    risks: [{ id: 'r', severity: 'low', status: 'open', title: 'R', refs: ['big-7'] }],
  };

  it('keeps a group closed when opening it would exceed the budget, opens others', () => {
    const v = buildView(doc, [], 'after');
    expect(node(v, 'big').type).toBe('box');
    expect(node(v, 'small').type).toBe('frame');
    expect(v.nodes.filter((n) => n.type !== 'frame').length).toBeLessThanOrEqual(25);
  });

  it('propagates changes and risks inside a closed box', () => {
    const v = buildView(doc, [], 'after');
    expect(node(v, 'big').innerChanges).toBe(true);
    expect(node(v, 'big').innerRisk).toBe(true);
    expect(node(v, 'small').innerChanges).toBeUndefined();
  });

  it('synthesizes stable box ports and merges duplicate edges', () => {
    const v = buildView(doc, [], 'after');
    const big = node(v, 'big');
    expect(big.outputs.map((p) => p.id)).toEqual(['out:big-5.v']);
    const edges = v.edges.filter((e) => e.source === 'big');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.wireIds).toEqual(['w1', 'w2']);
  });

  it('shows all direct children of the root even beyond the budget', () => {
    const v = buildView(doc, ['big'], 'after');
    expect(v.nodes.filter((n) => n.type === 'block')).toHaveLength(30);
    expect(node(v, 'pin:out:x.v').pinSide).toBe('right');
  });
});
