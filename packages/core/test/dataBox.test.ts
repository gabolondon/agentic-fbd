import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataBox, typeFields, type DataBox, type LogicDoc } from '../src/index.ts';
import { examplesDir, readJson } from './helpers.ts';

const example = (): LogicDoc => structuredClone(readJson(join(examplesDir, 'other-free-text.logic.json')) as LogicDoc);

function withStore(doc: LogicDoc): LogicDoc {
  const answers = doc.nodes.find((n) => n.id === 'answers')!;
  answers.store = 'Zustand store · lost on reload';
  return doc;
}

function block(box: DataBox | null): Extract<DataBox, { kind: 'block' }> {
  expect(box?.kind).toBe('block');
  return box as Extract<DataBox, { kind: 'block' }>;
}

const inline = (nodes: LogicDoc['nodes'], wires: LogicDoc['wires'], types: LogicDoc['types'] = {}): LogicDoc => ({
  version: '0.1',
  subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
  types,
  nodes,
  wires,
});

describe('dataBox', () => {
  it("lists a function's inputs as reads with where they come from", () => {
    const box = block(dataBox(example(), '', 'api', 'after'));
    expect(box.reads).toEqual([expect.objectContaining({ name: 'payload', typeName: 'Answers', where: 'from Review' })]);
    expect(box.writes).toEqual([expect.objectContaining({ name: 'ok', where: 'to Answer saved' })]);
    expect(box.responses).toEqual([]);
  });

  it('a port fed by a state shows the store as where', () => {
    const box = block(dataBox(withStore(example()), '', 'review', 'after'));
    expect(box.reads[0]).toMatchObject({
      name: 'answers',
      where: 'Zustand store · lost on reload',
      desc: 'Every answer of the wizard, by question id.',
      state: { scope: '', id: 'answers' },
    });
  });

  it('outputs named by status code go to responses', () => {
    const doc = inline([{ id: 'f', kind: 'function', label: 'F', outputs: { '200': 'Booking', '422': 'string', saved: 'boolean' } }], [], {
      Booking: { id: 'string' },
    });
    const box = block(dataBox(doc, '', 'f', 'after'));
    expect(box.responses.map((i) => i.name)).toEqual(['200', '422']);
    expect(box.writes.map((i) => i.name)).toEqual(['saved']);
    expect(box.responses[0]!.where).toBe('');
    expect(box.responses[0]!.fields).toEqual([{ name: 'id', type: 'string' }]);
  });

  it('uses typeInfo for the description and code of a named type', () => {
    const doc = example();
    doc.typeInfo = { Answers: { desc: 'Answers by question.', code: { file: 'src/types.ts', symbol: 'Answers' } } };
    const box = block(dataBox(doc, '', 'api', 'after'));
    expect(box.reads[0]).toMatchObject({ desc: 'Answers by question.', code: { file: 'src/types.ts', symbol: 'Answers' } });
  });

  it('state shows readBy and writtenBy in wire order', () => {
    const box = dataBox(withStore(example()), '', 'answers', 'after');
    expect(box).toMatchObject({
      kind: 'state',
      holds: { name: 'answers (store)', typeName: 'Answers', where: 'Zustand store · lost on reload' },
      writtenBy: [{ label: 'Save answer', scope: '', id: 'save' }],
      readBy: [{ label: 'Review', scope: '', id: 'review' }],
    });
  });

  it('group shows only data crossing its edge', () => {
    const doc = inline(
      [
        { id: 'g', kind: 'group', label: 'G' },
        { id: 'a', kind: 'function', label: 'A', parent: 'g', inputs: { x: 'number' }, outputs: { y: 'number' } },
        { id: 'b', kind: 'function', label: 'B', parent: 'g', inputs: { y: 'number' } },
        { id: 'x', kind: 'trigger', source: 'user', label: 'X', outputs: { x: 'number' } },
      ],
      [
        { id: 'w1', from: 'x.x', to: 'a.x' },
        { id: 'w2', from: 'a.y', to: 'b.y' },
      ],
    );
    const box = dataBox(doc, '', 'g', 'after');
    expect(box).toMatchObject({ kind: 'boundary', inside: 2, writes: [] });
    expect(box?.kind === 'boundary' && box.reads).toEqual([expect.objectContaining({ name: 'x', where: 'from X' })]);
  });

  it('is null for a pin or an unknown id', () => {
    const doc = example();
    expect(dataBox(doc, 'OtherOption', 'in-sel', 'after')).toBeNull();
    expect(dataBox(doc, '', 'nope', 'after')).toBeNull();
  });

  it('an instance uses its blockType ports', () => {
    const box = block(dataBox(example(), '', 'other-vaccines', 'after'));
    expect(box.reads.map((i) => [i.name, i.where])).toEqual([
      ['selected', 'from Click option'],
      ['text', "from Type in 'Other'"],
    ]);
  });

  it('in Before mode a new wire is not listed', () => {
    const before = block(dataBox(example(), '', 'save', 'before'));
    expect(before.reads.map((i) => [i.name, i.where])).toEqual([['optionId', 'from Click option']]);
    const after = block(dataBox(example(), '', 'save', 'after'));
    expect(after.reads.map((i) => [i.name, i.where])).toEqual([['answer', 'from Other: add vaccine']]);
  });
});

describe('typeFields', () => {
  it('resolves names, optionals and arrays to object fields', () => {
    const types = { Traveler: { name: 'string', age: 'number?' }, Trip: { travelers: 'Traveler[]' } };
    expect(typeFields('Trip', types)).toEqual([
      {
        name: 'travelers',
        type: 'Traveler[]',
        fields: [
          { name: 'name', type: 'string' },
          { name: 'age', type: 'number?' },
        ],
      },
    ]);
    expect(typeFields('Trip?', types)).toEqual(typeFields('Trip', types));
    expect(typeFields('string', types)).toBeUndefined();
  });

  it('stops on recursive types', () => {
    const types = { Node: { next: 'Node?' } };
    const fields = typeFields('Node', types);
    expect(fields).toEqual([{ name: 'next', type: 'Node?' }]);
  });
});
