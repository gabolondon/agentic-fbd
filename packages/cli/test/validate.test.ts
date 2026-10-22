import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/main.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const examples = join(repoRoot, 'skills/logic-builder/examples');
const invalid = join(repoRoot, 'tests/fixtures/invalid');
const codeRepo = join(repoRoot, 'tests/fixtures/code-repo');

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('logic-builder validate', () => {
  it('exits 0 on the bundled examples', async () => {
    const files = readdirSync(examples).map((f) => join(examples, f));
    const { code, out } = await cli('validate', ...files);
    expect(code).toBe(0);
    expect(out).toMatch(/^ok {3}other-free-text\.logic\.json/m);
  });

  it('exits 1 on every invalid fixture with a readable message', async () => {
    for (const f of readdirSync(invalid)) {
      const { code, out } = await cli('validate', join(invalid, f));
      expect(code, f).toBe(1);
      expect(out, f).toMatch(/^FAIL /m);
      expect(out, f).toMatch(/error {3}\[/);
    }
  });

  it('exits 2 on usage errors', async () => {
    expect((await cli()).code).toBe(2);
    expect((await cli('validate')).code).toBe(2);
    expect((await cli('frobnicate')).code).toBe(2);
    expect((await cli('validate', 'x.json', '--check-code')).code).toBe(2);
  });

  it('prints JSON with --json', async () => {
    const { out } = await cli('validate', join(invalid, 'integrity-unknown-port.logic.json'), '--json');
    const report = JSON.parse(out);
    expect(report.valid).toBe(false);
    expect(report.issues[0].code).toBe('unknown-port');
  });

  it('warns about stale code references with --check-code, skipping new items', async () => {
    const { code, out } = await cli('validate', join(codeRepo, 'logic/check.logic.json'), '--check-code', codeRepo, '--json');
    expect(code).toBe(0);
    const report = JSON.parse(out);
    const stale = report.issues.filter((i: { code: string }) => i.code === 'stale-code').map((i: { path: string }) => i.path);
    expect(stale.sort()).toEqual(['gone', 'renamed']);
  });

  it('--check-code warns on a stale typeInfo code', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lb-typeinfo-'));
    const doc = {
      version: '0.1',
      subject: { id: 'ti', title: 'Type info', intent: 'Check typeInfo code', mode: 'understand' },
      types: { Session: { id: 'string' }, Gone: { id: 'string' } },
      typeInfo: { Session: { code: { file: 'src/session.ts', symbol: 'readSession' } }, Gone: { code: { file: 'src/session.ts', symbol: 'NoSuchType' } } },
      nodes: [],
      wires: [],
    };
    writeFileSync(join(dir, 'ti.logic.json'), JSON.stringify(doc));
    const { out } = await cli('validate', join(dir, 'ti.logic.json'), '--check-code', codeRepo, '--json');
    const stale = JSON.parse(out).issues.filter((i: { code: string }) => i.code === 'stale-code').map((i: { path: string }) => i.path);
    expect(stale).toEqual(['typeInfo/Gone']);
  });
});

describe('logic-builder validate — links between diagrams', () => {
  it('warns about links to missing diagrams or blocks, without failing', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lb-links-'));
    const doc = JSON.parse(readFileSync(join(examples, 'auth-gate.logic.json'), 'utf8'));
    writeFileSync(join(dir, 'roles.logic.json'), JSON.stringify(doc));
    doc.nodes[0].see = 'roles.logic.json#authz';
    doc.nodes[1].see = 'roles.logic.json#nope';
    doc.nodes[2].see = 'gone.logic.json';
    writeFileSync(join(dir, 'gate.logic.json'), JSON.stringify(doc));
    const { code, out } = await cli('validate', join(dir, 'gate.logic.json'));
    expect(code).toBe(0);
    expect(out).toContain('[link-missing-node]');
    expect(out).toContain('[link-missing-file]');
    expect(out.match(/\[link-/g)).toHaveLength(2);
  });
});
