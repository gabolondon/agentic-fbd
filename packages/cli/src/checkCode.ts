import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { CodeRef, Issue, LogicDoc, LogicNode } from '@agentic-fbd/core';

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The absolute path of `file` inside the repo root, or null when it is absolute, climbs out of
 * the root, or is a symlink that points out of it. A diagram can come from anywhere, so it must
 * not be able to probe other files.
 */
function pathInsideRoot(repoRoot: string, file: string): string | null {
  if (isAbsolute(file)) return null;
  const path = resolve(repoRoot, file);
  if (!isInside(repoRoot, path)) return null;
  if (existsSync(path) && !isInside(realpathSync(repoRoot), realpathSync(path))) return null;
  return path;
}

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
  // null: the file does not exist; 'outside': it is not inside the repo root and was not read.
  const contents = new Map<string, string | null | 'outside'>();
  for (const { at, code } of refs) {
    if (!contents.has(code.file)) {
      const path = pathInsideRoot(repoRoot, code.file);
      contents.set(code.file, path === null ? 'outside' : existsSync(path) ? readFileSync(path, 'utf8') : null);
    }
    const text = contents.get(code.file);
    if (text === 'outside') {
      issues.push({ level: 'warning', code: 'code-outside-root', path: at, message: `"${at}" points to ${code.file}, which is outside the repo root, so it was not read` });
    } else if (text === null || text === undefined) {
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
