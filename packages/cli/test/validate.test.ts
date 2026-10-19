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
});
