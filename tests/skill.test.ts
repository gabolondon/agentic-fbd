import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = join(__dirname, '..', 'skills', 'agentic-fbd');
const refs = join(base, 'references');
const size = (rel: string): number => statSync(join(base, rel)).size;
const text = (rel: string): string => readFileSync(join(base, rel), 'utf8');
const workflows = existsSync(refs)
  ? readdirSync(refs).filter((f) => /^workflow-.*\.md$/.test(f)).map((f) => `references/${f}`)
  : [];
const pathsIn = (s: string): string[] =>
  [...new Set(s.match(/(?:references|examples)\/[A-Za-z0-9._-]+\.[a-z]+/g) ?? [])];

describe('skill files', () => {
  it('SKILL.md is under 4096 bytes', () => {
    expect(size('SKILL.md')).toBeLessThan(4096);
  });

  it('SKILL.md names all four workflow files and the git clone fallback', () => {
    const s = text('SKILL.md');
    for (const w of ['overview', 'understand', 'design', 'edits']) {
      expect(s).toContain(`references/workflow-${w}.md`);
    }
    expect(s).toContain('git clone --depth 1 https://github.com/gabolondon/agentic-fbd.git');
    // /tmp is a symlink on macOS: find only descends into it with a trailing slash.
    expect(s).toContain(' /tmp/ ');
    // an older CLI copy (no `new`) must not be used with these instructions
    expect(s).toContain('--help` lists `new`');
  });

  it('there are exactly four workflow files plus the checklist', () => {
    expect(workflows.sort()).toEqual(
      ['overview', 'understand', 'design', 'edits'].map((w) => `references/workflow-${w}.md`).sort(),
    );
    expect(existsSync(join(refs, 'checklist.md'))).toBe(true);
  });

  it('every references/ or examples/ path named in the skill files exists', () => {
    for (const f of ['SKILL.md', ...workflows, 'references/checklist.md', 'references/format.md']) {
      for (const p of pathsIn(text(f))) {
        expect(existsSync(join(base, p)), `${p} (named in ${f})`).toBe(true);
      }
    }
  });

  it('format.md points at the checklist and at $CLI', () => {
    const s = text('references/format.md');
    expect(s).toContain('checklist.md');
    expect(s).toContain('$CLI');
  });

  for (const w of workflows) {
    describe(w, () => {
      const first = text(w).split('\n')[0] ?? '';

      it('starts with a Read first line', () => {
        expect(first).toMatch(/^Read first: \S/);
      });

      it('context budget: SKILL.md + workflow + Read first files <= 30000 bytes', () => {
        const files = first
          .replace(/^Read first:\s*/, '')
          .split(',')
          .map((f) => f.trim().replace(/\.$/, ''))
          .filter(Boolean);
        for (const f of files) expect(existsSync(join(base, f)), f).toBe(true);
        const total = size('SKILL.md') + size(w) + files.reduce((n, f) => n + size(f), 0);
        expect(total).toBeLessThanOrEqual(30000);
      });
    });
  }
});
