import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate, validateText } from '../src/index.ts';
import { baseName, examplesDir, invalidDir, listJson, readJson, repoRoot } from './helpers.ts';

const explanationCodes = new Set(['missing-desc', 'missing-logic', 'missing-store', 'similar-store']);
const typeIssues = (issues: { level: string; code: string }[]) =>
  issues.filter((i) => !explanationCodes.has(i.code)).map((i) => [i.level, i.code]);

describe('validate', () => {
  for (const file of [...listJson(examplesDir), join(repoRoot, 'tests/fixtures/valid-fixture.logic.json')]) {
    it(`accepts ${baseName(file)} with no errors or warnings`, () => {
      const result = validate(readJson(file));
      expect(result.issues.filter((i) => i.level !== 'notice')).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  for (const file of listJson(invalidDir, 'integrity-')) {
    const code = baseName(file).replace('integrity-', '').replace('.logic.json', '');
    it(`rejects ${baseName(file)} with a "${code}" error`, () => {
      const result = validateText(readFileSync(file, 'utf8'));
      expect(result.valid).toBe(false);
      const error = result.issues.find((i) => i.level === 'error' && i.code === code);
      expect(error, JSON.stringify(result.issues, null, 2)).toBeDefined();
      expect(error!.message.length).toBeGreaterThan(10);
    });
  }

  it('reports unparseable JSON as an error', () => {
    const result = validateText(readFileSync(join(invalidDir, 'json-not-json.logic.json'), 'utf8'));
    expect(result.valid).toBe(false);
    expect(result.doc).toBeNull();
    expect(result.issues[0]?.code).toBe('json');
  });

  it('allows several wires into one input', () => {
    const doc = readJson(join(examplesDir, 'other-free-text.logic.json')) as { blockTypes: Record<string, { body: { wires: { to: string }[] } }> };
    const into = doc.blockTypes.OtherOption!.body.wires.filter((w) => w.to === 'out.answer');
    expect(into.length).toBe(2);
    expect(validate(doc).valid).toBe(true);
  });

  it('flags a bare number into a named id as a warning, not an error', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      types: { OptionId: 'number' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A', outputs: { n: 'number' } },
        { id: 'b', kind: 'function', label: 'B', inputs: { id: 'OptionId' } },
      ],
      wires: [{ id: 'w', from: 'a.n', to: 'b.id' }],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(typeIssues(result.issues)).toEqual([['warning', 'type-meaning']]);
  });

  it('treats undefined type names as opaque notices', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A', outputs: { r: 'Mystery' } },
        { id: 'b', kind: 'function', label: 'B', inputs: { r: 'number' } },
      ],
      wires: [{ id: 'w', from: 'a.r', to: 'b.r' }],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(typeIssues(result.issues)).toEqual([['notice', 'undefined-type']]);
  });

  it('reports blocks without desc or logic as notices', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [
        { id: 'a', kind: 'function', label: 'A' },
        { id: 'b', kind: 'result', label: 'B', desc: 'Shows B.' },
      ],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => [i.level, i.code])).toEqual([
      ['notice', 'missing-desc'],
      ['notice', 'missing-logic'],
    ]);
  });

  it('accepts store and typeInfo', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      types: { Booking: { id: 'string' } },
      typeInfo: { Booking: { desc: 'd', code: { file: 'a.ts', symbol: 'Booking' } } },
      nodes: [{ id: 'cart', kind: 'state', label: 'Cart', valueType: 'Booking', store: 'Zustand store · lost on reload' }],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues.find((i) => i.code === 'missing-store')).toBeUndefined();
  });

  it('reports a state without store as a notice', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'understand' },
      nodes: [{ id: 'cart', kind: 'state', label: 'Cart', valueType: 'string' }],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ level: 'notice', code: 'missing-store', path: 'cart' }));
  });

  it('flags a new state that copies an existing one', () => {
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      nodes: [
        { id: 'draft', kind: 'state', label: 'Draft', valueType: 'Draft', store: 'Zustand store' },
        { id: 'wizard', kind: 'state', label: 'Wizard', valueType: 'Draft', store: 'Redux store', change: 'new' },
      ],
      wires: [],
    };
    const result = validate(doc);
    expect(result.valid).toBe(true);
    const similar = result.issues.find((i) => i.code === 'similar-store');
    expect(similar).toMatchObject({ level: 'notice', path: 'wizard' });
    expect(similar!.message).toBe('new state "wizard" holds the same type as existing "draft"; reuse it if it holds the same data');
  });
});
