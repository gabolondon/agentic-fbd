import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeRef, Issue, LogicDoc, LogicNode } from '@logic-builder/core';

/**
 * Warns when a code reference no longer matches the repo: the file is missing, or the symbol
 * does not appear in it (plain text search). Items marked `new` are skipped (design spec §7).
 */
export function checkCode(doc: LogicDoc, repoRoot: string): Issue[] {
  const refs: { at: string; code: CodeRef }[] = [];
  const collect = (nodes: LogicNode[], prefix: string): void => {
    for (const n of nodes) if (n.code && n.change !== 'new') refs.push({ at: prefix + n.id, code: n.code });
  };
  collect(doc.nodes, '');
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) {
    if (type.change === 'new') continue;
    if (type.code) refs.push({ at: name, code: type.code });
    collect(type.body?.nodes ?? [], `${name}/`);
  }
  for (const [name, info] of Object.entries(doc.typeInfo ?? {})) if (info.code) refs.push({ at: `typeInfo/${name}`, code: info.code });

  const issues: Issue[] = [];
  const contents = new Map<string, string | null>();
  for (const { at, code } of refs) {
    if (!contents.has(code.file)) {
      const path = join(repoRoot, code.file);
      contents.set(code.file, existsSync(path) ? readFileSync(path, 'utf8') : null);
    }
    const text = contents.get(code.file);
    if (text === null || text === undefined) {
      issues.push({ level: 'warning', code: 'stale-code', path: at, message: `"${at}" points to ${code.file}, which does not exist` });
    } else if (code.symbol && !text.includes(code.symbol)) {
      issues.push({
        level: 'warning',
        code: 'stale-code',
        path: at,
        message: `"${at}" points to ${code.symbol} in ${code.file}, but that symbol does not appear in the file`,
      });
    }
  }
  return issues;
}
