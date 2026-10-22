import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEdit, buildView, checkIntegrity, validate, type Edit, type EditResult, type LogicDoc, type LogicNode, type Wire } from '../src/index.ts';
import { examplesDir, readJson } from './helpers.ts';

function doc(nodes: LogicNode[], wires: Wire[] = [], mode: 'understand' | 'design' = 'understand'): LogicDoc {
  return { version: '0.1', subject: { id: 's', title: 'S', intent: 'I', mode }, nodes, wires };
}

const base = (): LogicDoc =>
  doc([
    { id: 't', kind: 'trigger', label: 'Click', source: 'user', context: { from: 'List' }, outputs: { x: 'string' } },
    { id: 'f', kind: 'function', label: 'Save', desc: 'Saves.', inputs: { x: 'string' }, code: { file: 'src/a.ts', symbol: 'save' } },
    { id: 'n', kind: 'function', label: 'Planned', change: 'new' },
  ]);

function ok(result: EditResult): LogicDoc {
  if (!result.ok) throw new Error(result.reason);
  return result.doc;
}

const at = (id: string) => ({ scope: '', id });
const node = (d: LogicDoc, id: string) => d.nodes.find((n) => n.id === id)!;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('applyEdit: text fields and marks', () => {
  it('renaming an existing block marks it modified and keeps the old label in before', () => {
    const d = ok(applyEdit(base(), { op: 'setLabel', at: at('f'), value: 'Store answer' }));
    expect(node(d, 'f')).toMatchObject({ label: 'Store answer', change: 'modified', before: { label: 'Save' } });
  });

  it('renaming it back clears the mark', () => {
    const once = ok(applyEdit(base(), { op: 'setLabel', at: at('f'), value: 'Store answer' }));
    const twice = ok(applyEdit(once, { op: 'setLabel', at: at('f'), value: 'Rename again' }));
    expect(node(twice, 'f').before).toEqual({ label: 'Save' });
    const back = ok(applyEdit(twice, { op: 'setLabel', at: at('f'), value: 'Save' }, base()));
    expect(node(back, 'f').change).toBeUndefined();
    expect(node(back, 'f').before).toBeUndefined();
  });

  it('keeps a modified mark the item already had in the original', () => {
    const original = base();
    Object.assign(node(original, 'f'), { change: 'modified', changeNote: 'Takes more input' });
    const edited = ok(applyEdit(original, { op: 'setLabel', at: at('f'), value: 'Store' }, original));
    const back = ok(applyEdit(edited, { op: 'setLabel', at: at('f'), value: 'Save' }, original));
    expect(node(back, 'f')).toMatchObject({ change: 'modified', changeNote: 'Takes more input' });
    expect(node(back, 'f').before).toBeUndefined();
  });

  it('editing a new block changes it in place with no before', () => {
    const d = ok(applyEdit(base(), { op: 'setLabel', at: at('n'), value: 'Planned step' }));
    expect(node(d, 'n')).toEqual({ id: 'n', kind: 'function', label: 'Planned step', change: 'new' });
  });

  it('the first edit switches an understand file to design', () => {
    const d = ok(applyEdit(base(), { op: 'setDesc', at: at('f'), value: 'Saves the answer.' }));
    expect(d.subject.mode).toBe('design');
    expect(node(d, 'f').before).toEqual({ desc: 'Saves.' });
  });

  it('a description added where there was none keeps an empty one in before', () => {
    const d = ok(applyEdit(base(), { op: 'setDesc', at: at('t'), value: 'The user clicks.' }));
    expect(node(d, 't').before).toEqual({ desc: '' });
    const back = ok(applyEdit(d, { op: 'setDesc', at: at('t'), value: '' }, base()));
    expect(node(back, 't')).toEqual(node(base(), 't'));
  });

  it('a note marks nothing and keeps the mode', () => {
    const d = ok(applyEdit(base(), { op: 'setNote', at: at('f'), value: 'Save before calling the API.' }));
    expect(d.subject.mode).toBe('understand');
    expect(node(d, 'f')).toEqual({ ...node(base(), 'f'), note: 'Save before calling the API.' });
  });

  it('a note can go on a wire', () => {
    const withWire = doc(base().nodes, [{ id: 'w', from: 't.x', to: 'f.x' }]);
    const d = ok(applyEdit(withWire, { op: 'setNote', at: at('w'), value: 'Check this.' }));
    expect(d.wires[0]).toEqual({ id: 'w', from: 't.x', to: 'f.x', note: 'Check this.' });
  });

  it("setNote '' removes the note", () => {
    const d = ok(applyEdit(base(), { op: 'setNote', at: at('f'), value: 'x' }));
    const cleared = ok(applyEdit(d, { op: 'setNote', at: at('f'), value: '' }));
    expect('note' in node(cleared, 'f')).toBe(false);
  });

  it('setSymbol keeps the whole original code ref in before', () => {
    const d = ok(applyEdit(base(), { op: 'setSymbol', at: at('f'), value: 'saveAnswer' }));
    expect(node(d, 'f').code).toEqual({ file: 'src/a.ts', symbol: 'saveAnswer' });
    expect(node(d, 'f').before).toEqual({ code: { file: 'src/a.ts', symbol: 'save' } });
  });

  it('setSymbol on an instance renames the blockType symbol', () => {
    const d = doc([{ id: 'i', kind: 'instance', of: 'Picker', label: 'Pick' }]);
    d.blockTypes = { Picker: { label: 'Picker', inputs: {}, outputs: {}, code: { file: 'src/p.ts', symbol: 'Picker' } } };
    const r = ok(applyEdit(d, { op: 'setSymbol', at: at('i'), value: 'OptionPicker' }));
    expect(r.blockTypes!.Picker).toMatchObject({ code: { symbol: 'OptionPicker' }, change: 'modified', before: { code: { file: 'src/p.ts', symbol: 'Picker' } } });
  });

  it('setTrigger stores source and context in before', () => {
    const d = ok(applyEdit(base(), { op: 'setTrigger', at: at('t'), source: 'schedule', context: { from: 'Nightly job' } }));
    expect(node(d, 't')).toMatchObject({ source: 'schedule', context: { from: 'Nightly job' }, change: 'modified', before: { source: 'user', context: { from: 'List' } } });
  });

  it('rejects an empty label', () => {
    const r = applyEdit(base(), { op: 'setLabel', at: at('f'), value: '   ' });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/empty/i) });
  });

  it('rejects editing a removed block', () => {
    const d = base();
    node(d, 'f').change = 'removed';
    expect(applyEdit(d, { op: 'setLabel', at: at('f'), value: 'X' })).toEqual({ ok: false, reason: 'Restore it before editing.' });
  });

  it('rejects an unknown item and a symbol with no file', () => {
    expect(applyEdit(base(), { op: 'setLabel', at: at('nope'), value: 'X' }).ok).toBe(false);
    expect(applyEdit(base(), { op: 'setSymbol', at: at('t'), value: 'x' }).ok).toBe(false);
  });

  it('does not mutate the input doc', () => {
    const frozen = deepFreeze(base());
    const edits: Edit[] = [
      { op: 'setLabel', at: at('f'), value: 'A' },
      { op: 'setDesc', at: at('f'), value: 'B' },
      { op: 'setSymbol', at: at('f'), value: 'c' },
      { op: 'setTrigger', at: at('t'), source: 'http', context: {} },
      { op: 'setNote', at: at('f'), value: 'd' },
    ];
    for (const e of edits) expect(applyEdit(frozen, e).ok).toBe(true);
  });
});

const example = (): LogicDoc => structuredClone(readJson(join(examplesDir, 'other-free-text.logic.json')) as LogicDoc);
const understandExample = (): LogicDoc => structuredClone(readJson(join(examplesDir, 'auth-gate.logic.json')) as LogicDoc);
const wire = (d: LogicDoc, id: string) => d.wires.find((w) => w.id === id)!;

describe('applyEdit: ports and types', () => {
  it('renaming a port rewrites its wires and keeps Before drawable', () => {
    const d = understandExample();
    // proxy.decision is fed by an existing wire.
    const into = d.wires.find((w) => w.to === 'proxy.decision')!;
    const r = ok(applyEdit(d, { op: 'renamePort', at: at('proxy'), side: 'inputs', from: 'decision', to: 'verdict' }));
    expect(validate(r).valid).toBe(true);
    expect(Object.keys(node(r, 'proxy').inputs!)).toContain('verdict');
    expect(wire(r, into.id)).toMatchObject({ to: 'proxy.verdict', change: 'modified', before: { to: 'proxy.decision' } });
    const before = buildView(r, [], 'before').edges.find((e) => e.wireIds.includes(into.id));
    expect(before?.targetHandle).toBe('decision');
    const after = buildView(r, [], 'after').edges.find((e) => e.wireIds.includes(into.id));
    expect(after?.targetHandle).toBe('verdict');
  });

  it('keeps port order and renaming back clears every mark', () => {
    const d = understandExample();
    const keys = Object.keys(node(d, 'proxy').inputs!);
    const r = ok(applyEdit(d, { op: 'renamePort', at: at('proxy'), side: 'inputs', from: 'decision', to: 'verdict' }, d));
    expect(Object.keys(node(r, 'proxy').inputs!)).toEqual(keys.map((k) => (k === 'decision' ? 'verdict' : k)));
    const back = ok(applyEdit(r, { op: 'renamePort', at: at('proxy'), side: 'inputs', from: 'verdict', to: 'decision' }, d));
    expect(back.nodes).toEqual(d.nodes);
    expect(back.wires).toEqual(d.wires);
  });

  it('rejects a port rename onto an existing name, an empty name or a dot', () => {
    const d = understandExample();
    const [first, second] = Object.keys(node(d, 'proxy').inputs!);
    for (const to of [second!, ' ', 'a.b']) {
      expect(applyEdit(d, { op: 'renamePort', at: at('proxy'), side: 'inputs', from: first!, to }).ok).toBe(false);
    }
  });

  it('renaming an instance port renames the blockType, its pin and every instance wire', () => {
    const r = ok(applyEdit(example(), { op: 'renamePort', at: at('other-vaccines'), side: 'inputs', from: 'text', to: 'typed' }));
    expect(validate(r).valid).toBe(true);
    expect(checkIntegrity(r).filter((i) => i.code.startsWith('pin'))).toEqual([]);
    const type = r.blockTypes!.OtherOption!;
    expect(Object.keys(type.inputs)).toEqual(['selected', 'typed']);
    expect(type.body!.nodes.find((n) => n.id === 'in-txt')!.outputs).toEqual({ typed: 'string?' });
    expect(type.body!.wires.find((w) => w.id === 'b2')!.from).toBe('in-txt.typed');
    expect(wire(r, 'w2').to).toBe('other-vaccines.typed');
  });

  it('setPortType retypes a port and rejects an unparseable type', () => {
    const r = ok(applyEdit(understandExample(), { op: 'setPortType', at: at('verify'), side: 'outputs', port: Object.keys(node(understandExample(), 'verify').outputs!)[0]!, type: 'string?' }));
    expect(node(r, 'verify')).toMatchObject({ change: 'modified', before: { outputs: node(understandExample(), 'verify').outputs } });
    const bad = applyEdit(understandExample(), { op: 'setPortType', at: at('verify'), side: 'outputs', port: 'idToken', type: 'Record<string' });
    expect(bad).toEqual({ ok: false, reason: expect.stringMatching(/type/i) });
  });

  it('setType marks typeInfo and setting it back clears it', () => {
    const d = understandExample();
    const old = d.types!.Session!;
    const r = ok(applyEdit(d, { op: 'setType', name: 'Session', type: { uid: 'string', email: 'string', phone: 'string?' } }));
    expect(r.typeInfo!.Session).toMatchObject({ change: 'modified', before: old, desc: d.typeInfo!.Session!.desc });
    const back = ok(applyEdit(r, { op: 'setType', name: 'Session', type: old }));
    expect(back.typeInfo).toEqual(d.typeInfo);
    expect(applyEdit(d, { op: 'setType', name: 'Nope', type: 'string' }).ok).toBe(false);
  });
});

describe('applyEdit: remove and restore', () => {
  it('removing an existing group marks the group, its children and their wires removed', () => {
    const d = understandExample();
    const r = ok(applyEdit(d, { op: 'remove', at: at('auth') }));
    const inside = d.nodes.filter((n) => n.parent === 'auth').map((n) => n.id);
    expect(inside.length).toBeGreaterThan(0);
    for (const id of ['auth', ...inside]) expect(node(r, id).change).toBe('removed');
    const touching = d.wires.filter((w) => [w.from, w.to].some((e) => ['auth', ...inside].includes(e.split('.')[0]!)));
    for (const w of touching) expect(wire(r, w.id).change).toBe('removed');
    expect(validate(r).valid).toBe(true);
  });

  it('removing a new block deletes it and its wires', () => {
    const r = ok(applyEdit(example(), { op: 'remove', at: at('t-other') }));
    expect(r.nodes.find((n) => n.id === 't-other')).toBeUndefined();
    expect(r.wires.find((w) => w.id === 'w2')).toBeUndefined();
    expect(validate(r).valid).toBe(true);
  });

  it('removing a new block referenced by a risk and by focus keeps the file valid', () => {
    const d = example();
    const vaccines = node(d, 'vaccines');
    vaccines.change = 'new';
    d.risks!.push({ id: 'r3', severity: 'low', status: 'open', title: 'Only about the step', refs: ['vaccines'] });
    const r = ok(applyEdit(d, { op: 'remove', at: at('vaccines') }));
    expect(r.subject.focus).toBeUndefined();
    expect(r.risks!.find((x) => x.id === 'r3')).toBeUndefined();
    expect(r.risks!.find((x) => x.id === 'r2')!.refs).toEqual(['review']);
    expect(validate(r).valid).toBe(true);
  });

  it('restore brings back a removed block and the wires removed with it, as they were', () => {
    const d = example();
    const removed = ok(applyEdit(d, { op: 'remove', at: at('save') }, d));
    expect(node(removed, 'save').change).toBe('removed');
    const restored = ok(applyEdit(removed, { op: 'restore', at: at('save') }, d));
    expect(restored.nodes).toEqual(d.nodes);
    expect(restored.wires).toEqual(d.wires);
  });

  it('restore refuses an item removed in the original', () => {
    const d = example();
    expect(applyEdit(d, { op: 'restore', at: at('w0') }, d).ok).toBe(false);
    expect(applyEdit(d, { op: 'restore', at: at('save') }, d).ok).toBe(false);
  });

  it('removes and restores a single wire', () => {
    const d = example();
    const r = ok(applyEdit(d, { op: 'remove', at: at('w6') }, d));
    expect(wire(r, 'w6').change).toBe('removed');
    expect(ok(applyEdit(r, { op: 'restore', at: at('w6') }, d)).wires).toEqual(d.wires);
  });
});
