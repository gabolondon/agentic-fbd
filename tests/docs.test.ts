import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Drift guard: the human docs must keep up with the schema, the validators and the file tree.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

function schemaProperties(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => schemaProperties(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'properties' && child && typeof child === 'object') Object.keys(child).forEach((name) => found.add(name));
      schemaProperties(child, found);
    }
  }
  return found;
}

function issueCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of [...walk('packages/core/src'), ...walk('packages/cli/src')]) {
    const source = read(file);
    for (const match of source.matchAll(/\bcode: '([a-z0-9-]+)'/g)) codes.add(match[1]!);
    for (const match of source.matchAll(/\berr\(\s*issues,\s*'([a-z0-9-]+)'/g)) codes.add(match[1]!);
  }
  return codes;
}

describe('docs', () => {
  it('blocks.md mentions every node kind and every schema property', () => {
    const schema = JSON.parse(read('skills/agentic-fbd/references/logic.schema.json'));
    const page = read('docs/blocks.md');
    const kinds: string[] = schema.$defs.node.properties.kind.enum;
    const missing = [...kinds, ...schemaProperties(schema)].filter((name) => !page.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });

  it('cli.md lists every issue code the validators emit', () => {
    const codes = issueCodes();
    expect(codes.size).toBeGreaterThan(20);
    const page = read('docs/cli.md');
    expect([...codes].filter((code) => !page.includes(`\`${code}\``))).toEqual([]);
  });

  it('every relative link in the docs points at a file that exists', () => {
    const pages = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', ...readdirSync(join(root, 'docs')).filter((name) => name.endsWith('.md')).map((name) => `docs/${name}`)];
    const broken: string[] = [];
    for (const page of pages) {
      const text = read(page).replace(/```[\s\S]*?```/g, '');
      for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1]!.split('#')[0]!;
        if (!target || /^[a-z]+:/i.test(target)) continue;
        if (!existsSync(join(root, dirname(page), decodeURIComponent(target)))) broken.push(`${page} -> ${match[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
