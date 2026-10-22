import { describe, expect, it } from 'vitest';
import { applyEdit, type Edit, type EditResult, type LogicDoc, type LogicNode, type Wire } from '../src/index.ts';

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
