import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEdit, copyReference, countEdits, editLines, summarizeEdits, type Edit, type LogicDoc } from '../src/index.ts';
import { examplesDir, readJson } from './helpers.ts';

const example = (): LogicDoc => structuredClone(readJson(join(examplesDir, 'other-free-text.logic.json')) as LogicDoc);
const auth = (): LogicDoc => structuredClone(readJson(join(examplesDir, 'auth-gate.logic.json')) as LogicDoc);
const at = (id: string, scope = '') => ({ scope, id });

function edited(original: LogicDoc, ...edits: Edit[]): LogicDoc {
  let doc = original;
  for (const e of edits) {
    const r = applyEdit(doc, e, original);
    if (!r.ok) throw new Error(r.reason);
    doc = r.doc;
  }
  return doc;
}

const linesFor = (original: LogicDoc, ...edits: Edit[]) => editLines(original, edited(original, ...edits));

describe('editLines', () => {
  it('a renamed block', () => {
    expect(linesFor(auth(), { op: 'setLabel', at: at('proxy'), value: 'Forward request' })).toEqual(['Renamed "Forward or deny" → "Forward request" (proxy)']);
  });

  it('a renamed function', () => {
    expect(linesFor(auth(), { op: 'setSymbol', at: at('proxy'), value: 'forward' })).toEqual(['Renamed function handleRequest → forward in "Forward or deny" (proxy)']);
  });

  it('a renamed, added or retyped port', () => {
    expect(linesFor(auth(), { op: 'renamePort', at: at('proxy'), side: 'inputs', from: 'decision', to: 'verdict' })).toEqual([
      '"Forward or deny" (proxy): renamed input decision → verdict',
    ]);
    expect(linesFor(auth(), { op: 'setPortType', at: at('proxy'), side: 'outputs', port: 'denied', type: 'number' })).toEqual([
      '"Forward or deny" (proxy): output denied is now number',
    ]);
  });

  it('an added or removed port, when it is not a rename', () => {
    const original = auth();
    const draft = structuredClone(original);
    const proxy = draft.nodes.find((n) => n.id === 'proxy')!;
    proxy.inputs = { target: 'AppTarget', user: 'Session' };
    expect(editLines(original, draft)).toEqual(['"Forward or deny" (proxy): removed input decision', '"Forward or deny" (proxy): added input user: Session']);
  });

  it('a port of a blockType edited through an instance', () => {
    expect(linesFor(example(), { op: 'renamePort', at: at('other-vaccines'), side: 'inputs', from: 'text', to: 'typed' })).toEqual([
      '"Other option" (OtherOption): renamed input text → typed',
    ]);
  });

  it('fields of a named type', () => {
    const original = auth();
    expect(linesFor(original, { op: 'setType', name: 'Session', type: { uid: 'string', email: 'string?', phone: 'string' } })).toEqual([
      'Session: field email is now string?',
      'Session: added field phone: string',
    ]);
    expect(linesFor(original, { op: 'setType', name: 'Session', type: { uid: 'string' } })).toEqual(['Session: removed field email']);
    expect(linesFor(original, { op: 'setType', name: 'AppId', type: 'number' })).toEqual(['AppId is now number']);
  });

  it('a trigger', () => {
    expect(linesFor(example(), { op: 'setTrigger', at: at('t-select'), source: 'agent', context: { from: 'Chat', modes: ['create', 'edit'] } })).toEqual([
      '"Click option" (t-select): trigger is now agent · from: Chat',
    ]);
  });

  it('a description', () => {
    expect(linesFor(auth(), { op: 'setDesc', at: at('proxy'), value: 'Forwards.' })).toEqual(['"Forward or deny" (proxy): edited description']);
  });

  it('a removed block lists the block once, not what was inside it', () => {
    expect(linesFor(auth(), { op: 'remove', at: at('auth') })).toEqual(['Removed "Authentication" (auth)']);
  });

  it('a removed wire', () => {
    expect(linesFor(auth(), { op: 'remove', at: at('w7') })).toEqual(['Removed wire t-request.appId → registry.appId (w7)']);
  });

  it('a note on a removed wire stays with the removal', () => {
    expect(linesFor(auth(), { op: 'setNote', at: at('w7'), value: 'Cached elsewhere now.' }, { op: 'remove', at: at('w7') })).toEqual([
      'Removed wire t-request.appId → registry.appId (w7)',
      'Note on wire t-request.appId → registry.appId (w7): Cached elsewhere now.',
    ]);
  });

  it('notes on a block and a wire', () => {
    expect(
      linesFor(
        auth(),
        { op: 'setNote', at: at('proxy'), value: 'Log denials too.' },
        { op: 'setNote', at: at('w7'), value: 'Cache this.' },
      ),
    ).toEqual(['Note on "Forward or deny" (proxy): Log denials too.', 'Note on wire t-request.appId → registry.appId (w7): Cache this.']);
  });

  it('body ids are written with their blockType', () => {
    expect(linesFor(example(), { op: 'setLabel', at: at('dec', 'OtherOption'), value: 'Typed text?' })).toEqual(['Renamed "Has text?" → "Typed text?" (OtherOption/dec)']);
  });

  it('the summary lists only the user\'s edits on a design file', () => {
    const original = example();
    const draft = edited(original, { op: 'setLabel', at: at('t-other'), value: 'Type a vaccine' });
    expect(editLines(original, draft)).toEqual(['Renamed "Type in \'Other\'" → "Type a vaccine" (t-other)']);
    expect(countEdits(original, draft)).toBe(1);
  });
});

describe('summarizeEdits', () => {
  it('heads the lines with the file and asks the agent to implement them', () => {
    const original = auth();
    const draft = edited(original, { op: 'setLabel', at: at('proxy'), value: 'Forward request' }, { op: 'setNote', at: at('verify'), value: 'Also accept a header.' });
    expect(summarizeEdits(original, draft, 'logic/auth-gate.logic.json')).toBe(
      [
        'I edited logic/auth-gate.logic.json in the viewer. Please review and implement:',
        '- Note on "Read session cookie" (verify): Also accept a header.',
        '- Renamed "Forward or deny" → "Forward request" (proxy)',
      ].join('\n'),
    );
  });

  it('is empty when nothing changed', () => {
    expect(summarizeEdits(auth(), auth(), 'x.logic.json')).toBe('');
  });
});

describe('copyReference', () => {
  it('copyReference for two blocks and a wire', () => {
    expect(copyReference(auth(), 'logic/auth-gate.logic.json', [at('proxy'), at('provider'), at('w8')])).toBe(
      [
        'logic/auth-gate.logic.json',
        '- "Forward or deny" (id: proxy, function) → server/proxy.ts · handleRequest',
        '- "Identity provider" (id: provider, external)',
        '- wire w8: authz.decision → proxy.decision (Decision)',
      ].join('\n'),
    );
  });

  it('copyReference writes body ids with their blockType', () => {
    expect(copyReference(example(), 'logic/x.logic.json', [at('mkText', 'OtherOption'), at('other-vaccines')])).toBe(
      [
        'logic/x.logic.json',
        '- "Build text answer" (id: OtherOption/mkText, function) → src/questionnaire/OtherOption.tsx · toTextAnswer',
        '- "Other: add vaccine" (id: other-vaccines, instance) → src/questionnaire/OtherOption.tsx · OtherOption',
      ].join('\n'),
    );
  });
});
