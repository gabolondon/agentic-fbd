import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Issue, LogicDoc, LogicNode } from '@agentic-fbd/core';

/** Warns when a `see` link names a diagram or block that does not exist next to the file. */
export function checkLinks(doc: LogicDoc, file: string): Issue[] {
  const issues: Issue[] = [];
  const dir = dirname(file);
  const cache = new Map<string, LogicDoc | null>();
  const load = (name: string): LogicDoc | null => {
    if (!cache.has(name)) {
      try {
        cache.set(name, JSON.parse(readFileSync(join(dir, name), 'utf8')) as LogicDoc);
      } catch {
        cache.set(name, null);
      }
    }
    return cache.get(name)!;
  };

  const visit = (nodes: LogicNode[], prefix: string): void => {
    for (const n of nodes) {
      if (!n.see) continue;
      const [name = '', target] = n.see.split('#');
      const at = prefix + n.id;
      if (name === basename(file)) {
        issues.push({ level: 'warning', code: 'link-self', path: at, message: `"${at}" links to its own file (${n.see}); link to another diagram` });
        continue;
      }
      const other = load(name);
      if (!other) {
        issues.push({ level: 'warning', code: 'link-missing-file', path: at, message: `"${at}" links to ${name}, which is missing or unreadable next to this file` });
      } else if (target && !(other.nodes ?? []).some((o) => o.id === target)) {
        issues.push({ level: 'warning', code: 'link-missing-node', path: at, message: `"${at}" links to ${n.see}, but ${name} has no block "${target}"` });
      }
    }
  };
  visit(doc.nodes, '');
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) visit(type.body?.nodes ?? [], `${name}/`);
  return issues;
}
