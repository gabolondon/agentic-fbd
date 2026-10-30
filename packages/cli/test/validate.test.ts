import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/main.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const examples = join(repoRoot, 'skills/agentic-fbd/examples');
const invalid = join(repoRoot, 'tests/fixtures/invalid');
const codeRepo = join(repoRoot, 'tests/fixtures/code-repo');

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  return cliOn(process.versions.node, ...argv);
}

async function cliOn(nodeVersion: string, ...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) }, nodeVersion);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('Node version check', () => {
  it('exits 1 with a clear message below Node 20', async () => {
    for (const version of ['18.19.0', '19.9.0', '8.0.0']) {
      const { code, out, err } = await cliOn(version, 'validate', join(examples, 'auth-gate.logic.json'));
      expect(code, version).toBe(1);
      expect(err, version).toBe(`agentic-fbd: Node 20 or later is required (found v${version})`);
      expect(out, version).toBe('');
    }
  });

  it('runs on Node 20 and later', async () => {
    for (const version of ['20.0.0', '22.11.0', '100.0.0']) {
      expect((await cliOn(version, '--help')).code, version).toBe(0);
    }
  });
});

describe('agentic-fbd validate', () => {
  it('exits 0 on the bundled examples', async () => {
    const files = readdirSync(examples).map((f) => join(examples, f));
    const { code, out } = await cli('validate', ...files);
    expect(code).toBe(0);
    expect(out).toMatch(/^ok {3}other-free-text\.logic\.json/m);
  });

  it('reports no unwired-block on the bundled examples or on the logic/ diagrams', async () => {
    const logicDir = join(repoRoot, 'logic');
    const files = [
      ...readdirSync(examples).map((f) => join(examples, f)),
      ...readdirSync(logicDir).filter((f) => f.endsWith('.logic.json')).map((f) => join(logicDir, f)),
    ];
    expect(files.length).toBeGreaterThanOrEqual(4);
    const { code, out } = await cli('validate', ...files);
    expect(code).toBe(0);
    expect(out).not.toContain('unwired-block');
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

  it('rejects a flag value that is another flag', async () => {
    const check = await cli('validate', 'x.json', '--check-code', '--json');
    expect(check.code).toBe(2);
    expect(check.err).toContain('--check-code needs a value');
    const port = await cli('open', 'x.json', '--port', '--no-open');
    expect(port.code).toBe(2);
    expect(port.err).toContain('--port needs a value');
  });

  it('rejects an unknown flag, naming it', async () => {
    const typo = await cli('validate', join(examples, 'auth-gate.logic.json'), '--jsno');
    expect(typo.code).toBe(2);
    expect(typo.err).toContain('unknown flag --jsno');
    // A flag of another command is unknown here too.
    expect((await cli('validate', 'x.json', '--no-open')).code).toBe(2);
    expect((await cli('open', 'x.json', '--json')).code).toBe(2);
  });

  it('keeps --help working, also after a command', async () => {
    for (const argv of [['--help'], ['validate', '--help'], ['open', '-h']]) {
      const { code, out } = await cli(...argv);
      expect(code, argv.join(' ')).toBe(0);
      expect(out).toContain('Usage:');
    }
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

  describe('--check-code path escapes', () => {
    /** A repo with one source file, a secret next to it, and a diagram with one code reference per entry. */
    async function escapes(files: (root: string, outside: string) => string[]): Promise<{ at: string; code: string }[]> {
      const { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const base = mkdtempSync(join(tmpdir(), 'lb-escape-'));
      const repo = join(base, 'repo');
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'ok.ts'), 'export function inside() {}');
      writeFileSync(join(base, 'secret.txt'), 'hunter2 symbol');
      symlinkSync(join(base, 'secret.txt'), join(repo, 'src', 'link.txt'));
      const nodes = files(repo, join(base, 'secret.txt')).map((file, i) => ({
        id: `n${i}`, kind: 'function', label: `N${i}`, code: { file, symbol: 'symbol' },
      }));
      const doc = { version: '0.1', subject: { id: 'esc', title: 'Escape', intent: 'Check code paths', mode: 'understand' }, nodes, wires: [] };
      writeFileSync(join(base, 'esc.logic.json'), JSON.stringify(doc));
      const { out } = await cli('validate', join(base, 'esc.logic.json'), '--check-code', repo, '--json');
      return JSON.parse(out).issues.filter((i: { code: string }) => i.code.endsWith('-code') || i.code === 'code-outside-root')
        .map((i: { path: string; code: string }) => ({ at: i.path, code: i.code }));
    }

    it('warns instead of reading an absolute path, a ../ path or a symlink out of the root', async () => {
      const issues = await escapes((_root, secret) => ['../secret.txt', secret, 'src/../../secret.txt', 'src/link.txt', 'src/ok.ts']);
      expect(issues).toEqual([
        { at: 'n0', code: 'code-outside-root' },
        { at: 'n1', code: 'code-outside-root' },
        { at: 'n2', code: 'code-outside-root' },
        { at: 'n3', code: 'code-outside-root' },
        { at: 'n4', code: 'stale-code' },
      ]);
    });
  });
});

describe('agentic-fbd validate — links between diagrams', () => {
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

describe('agentic-fbd validate — fix hints', () => {
  const brokenFile = async (): Promise<string> => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lb-hints-'));
    const doc = {
      version: '0.1',
      subject: { id: 's', title: 'S', intent: 'I', mode: 'design' },
      title: 'x',
      nodes: [{ id: 'a', kind: 'function', label: 'A', extra: 1 }],
      wires: [],
    };
    writeFileSync(join(dir, 'broken.logic.json'), JSON.stringify(doc));
    return join(dir, 'broken.logic.json');
  };

  it('prints a fix line under an issue that has a hint', async () => {
    const { code, out } = await cli('validate', await brokenFile());
    expect(code).toBe(1);
    const lines = out.split('\n');
    const at = lines.findIndex((l) => l.includes('unknown field "title"'));
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe('           fix: move it to "subject.title"');
  });

  it('adds hint to --json, and no hint key on an issue without one', async () => {
    const { out } = await cli('validate', await brokenFile(), '--json');
    const issues: { message: string; hint?: string }[] = JSON.parse(out).issues;
    expect(issues.find((i) => i.message.includes('"title"'))!.hint).toBe('move it to "subject.title"');
    expect(issues.every((i) => i.hint === undefined || typeof i.hint === 'string')).toBe(true);
    // Issues that carry no hint must not have the key at all (not null, not "").
    // The fixture's blocks are deliberately unwired; unwired-block always carries a hint.
    const all: { code: string }[] = JSON.parse((await cli('validate', join(codeRepo, 'logic/check.logic.json'), '--check-code', codeRepo, '--json')).out).issues;
    const none = all.filter((i) => i.code !== 'unwired-block');
    expect(none.length).toBeGreaterThan(0);
    for (const issue of none) expect(Object.keys(issue)).not.toContain('hint');
  });

  it('does not crash on JSON that is not an object', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lb-hints-'));
    for (const text of ['[]', '"x"', 'null']) {
      writeFileSync(join(dir, 'x.logic.json'), text);
      const { code, out } = await cli('validate', join(dir, 'x.logic.json'));
      expect(code, text).toBe(1);
      expect(out, text).toContain('fix: the file must be one JSON object');
    }
  });
});
