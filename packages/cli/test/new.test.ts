import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate, type LogicDoc } from '@agentic-fbd/core';
import { checkPlaceholders } from '../src/checkPlaceholders.ts';
import { run } from '../src/main.ts';
import { starterDoc } from '../src/starter.ts';

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const tmp = (): string => mkdtempSync(join(tmpdir(), 'lb-new-'));

/** Replaces every string that starts with TODO, anywhere in the JSON, with real text. */
function fillTodos(text: string): string {
  return text.replace(/"TODO[^"]*"/g, '"filled in"');
}

describe('starterDoc', () => {
  for (const shape of ['understand', 'overview'] as const) {
    it(`${shape}: validates with no errors and no unwired-block warning`, () => {
      const result = validate(starterDoc(shape));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.issues.map((i) => i.code)).not.toContain('unwired-block');
    });

    it(`${shape}: is in understand mode and every text starts with TODO`, () => {
      const doc = starterDoc(shape);
      expect(doc.subject.mode).toBe('understand');
      for (const text of [doc.subject.title, doc.subject.intent, ...doc.nodes.map((n) => n.label), ...doc.nodes.map((n) => n.desc ?? 'TODO')]) {
        expect(text).toMatch(/^TODO/);
      }
    });
  }

  it('uses the given subject id, and the default is a valid id', () => {
    expect(starterDoc('understand', 'checkout').subject.id).toBe('checkout');
    expect(starterDoc('understand').subject.id).toMatch(/^[^./\s]+$/);
  });

  it('overview has two unexplored groups with ports', () => {
    const groups = starterDoc('overview').nodes.filter((n) => n.kind === 'group');
    expect(groups.map((g) => g.id)).toEqual(['system-a', 'system-b']);
    for (const g of groups) {
      expect(g.explored).toBe(false);
      expect(Object.keys(g.inputs ?? {}).length).toBeGreaterThan(0);
      expect(Object.keys(g.outputs ?? {}).length).toBeGreaterThan(0);
    }
  });
});

describe('checkPlaceholders', () => {
  it('reports one error per TODO string, with its JSON pointer and a hint', () => {
    const doc = starterDoc('understand');
    const issues = checkPlaceholders(doc);
    expect(issues.length).toBeGreaterThan(3);
    for (const i of issues) {
      expect(i).toMatchObject({ level: 'error', code: 'placeholder', hint: 'replace the TODO text with the real content' });
    }
    expect(issues.map((i) => i.path)).toContain('/subject/title');
    expect(issues.map((i) => i.path)).toContain('/nodes/0/label');
  });

  it('reports nothing once no string starts with TODO, and ignores TODO in the middle of a text', () => {
    const doc = JSON.parse(fillTodos(JSON.stringify(starterDoc('understand')))) as LogicDoc;
    doc.subject.intent = 'Explain the TODO list feature';
    expect(checkPlaceholders(doc)).toEqual([]);
  });
});

describe('agentic-fbd new', () => {
  for (const shape of ['understand', 'overview'] as const) {
    it(`${shape}: validate on the fresh file fails only with placeholder errors, and passes once they are replaced`, async () => {
      const file = join(tmp(), 'flow.logic.json');
      const made = await cli('new', file, ...(shape === 'overview' ? ['--overview'] : []));
      expect(made.code).toBe(0);
      expect(made.out).toBe(`created ${file}; replace every TODO, then run validate`);

      const first = await cli('validate', file, '--json');
      expect(first.code).toBe(1);
      const report = JSON.parse(first.out) as { issues: { level: string; code: string }[] };
      const errors = report.issues.filter((i) => i.level === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.every((i) => i.code === 'placeholder')).toBe(true);
      expect(report.issues.map((i) => i.code)).not.toContain('unwired-block');

      writeFileSync(file, fillTodos(readFileSync(file, 'utf8')));
      const second = await cli('validate', file);
      expect(second.code).toBe(0);
    });
  }

  it('derives the subject id from the file name', async () => {
    const file = join(tmp(), 'order-flow.logic.json');
    await cli('new', file);
    expect((JSON.parse(readFileSync(file, 'utf8')) as LogicDoc).subject.id).toBe('order-flow');
  });

  it('keeps the subject id valid for odd file names', async () => {
    const file = join(tmp(), 'my flow.v2.logic.json');
    await cli('new', file);
    expect((JSON.parse(readFileSync(file, 'utf8')) as LogicDoc).subject.id).toMatch(/^[^./\s]+$/);
    expect((await cli('validate', file, '--json')).out).not.toContain('"code": "schema"');
  });

  it('--overview writes the overview shape', async () => {
    const file = join(tmp(), 'map.logic.json');
    await cli('new', file, '--overview');
    const doc = JSON.parse(readFileSync(file, 'utf8')) as LogicDoc;
    expect(doc.nodes.filter((n) => n.kind === 'group')).toHaveLength(2);
  });

  it('refuses to overwrite an existing file (exit 2) and leaves it untouched', async () => {
    const file = join(tmp(), 'there.logic.json');
    writeFileSync(file, 'keep me');
    const { code, err } = await cli('new', file);
    expect(code).toBe(2);
    expect(err).toContain(`${file} already exists`);
    expect(readFileSync(file, 'utf8')).toBe('keep me');
  });

  it('creates missing parent folders', async () => {
    const dir = join(tmp(), 'logic', 'deeper');
    const file = join(dir, 'x.logic.json');
    expect(existsSync(dir)).toBe(false);
    const { code } = await cli('new', file);
    expect(code).toBe(0);
    expect(existsSync(file)).toBe(true);
  });

  it('needs exactly one file', async () => {
    expect((await cli('new')).code).toBe(2);
    expect((await cli('new', 'a.logic.json', 'b.logic.json')).code).toBe(2);
  });
});
