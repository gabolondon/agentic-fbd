import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

// The product was renamed from logic-builder; only historical docs may keep the old name.
test('no living file names the product logic-builder', () => {
  const out = spawnSync('git', ['grep', '-n', '-I', '-i', '-E', 'logic[- ]builder', '--',
    '.', ':!docs/superpowers/specs/2026-10-18-*', ':!docs/superpowers/plans/2026-10-18-*',
    ':!docs/superpowers/plans/2026-10-22-*', ':!docs/superpowers/*/2026-10-23-*',
    ':!packages/cli/test/name.test.ts'],
    { cwd: repoRoot, encoding: 'utf8' });
  // Links to the historical design doc keep its original file name, and the README tells
  // people who installed the old name how to remove it.
  const allowed = ['2026-10-18-logic-builder-', 'uninstall logic-builder@logic-builder', 'remove logic-builder'];
  const hits = out.stdout.split('\n').filter((l) => l && !allowed.some((a) => l.includes(a)));
  expect(hits).toEqual([]);
});
