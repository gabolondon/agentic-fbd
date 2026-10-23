import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dirname, '../../..');
export const examplesDir = join(repoRoot, 'skills/agentic-fbd/examples');
export const invalidDir = join(repoRoot, 'tests/fixtures/invalid');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listJson(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .sort()
    .map((f) => join(dir, f));
}

export function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}
