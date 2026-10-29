import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const cli = join(root, 'dist/cli.mjs');
const example = join(root, 'skills/agentic-fbd/examples/auth-gate.logic.json');

test('open exits with code 1 when the port is in use', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-e2e-port-'));
  const file = join(dir, 'subject.logic.json');
  copyFileSync(example, file);
  // Occupy a port on the same address the CLI binds to.
  const busy = createServer();
  await new Promise<void>((done) => busy.listen(0, '127.0.0.1', done));
  const port = (busy.address() as { port: number }).port;
  const child = spawn(process.execPath, [cli, 'open', file, '--no-open', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr!.on('data', (chunk) => (err += String(chunk)));
  try {
    const code = await new Promise<number | null>((done) => {
      const timer = setTimeout(() => done(null), 5000);
      child.on('exit', (c) => {
        clearTimeout(timer);
        done(c);
      });
    });
    expect(err).toContain('cannot start the server');
    expect(code).toBe(1);
  } finally {
    child.kill();
    busy.close();
  }
});
