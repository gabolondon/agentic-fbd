import { basename } from 'node:path';
import type { Issue } from '@agentic-fbd/core';
import type { FileReport } from './main.ts';

/** With more issues than this, the text report groups them by code. */
const GROUP_THRESHOLD = 10;
const EXAMPLES_PER_GROUP = 3;

/** Root causes first: a parse or schema error hides everything after it, a missing node causes the wire errors that point at it. */
const CODE_ORDER = ['json', 'read', 'schema', 'duplicate-id', 'unknown-node', 'missing-port', 'unknown-port', 'unwired-block'];
const LEVEL_ORDER = ['error', 'warning', 'notice'];

export function formatReport(report: FileReport): string[] {
  const count = (level: string): number => report.issues.filter((i) => i.level === level).length;
  const parts = [plural(count('error'), 'error'), plural(count('warning'), 'warning'), plural(count('notice'), 'notice')];
  const summary = parts.filter((p) => !p.startsWith('0 ')).join(', ') || 'no issues';
  const lines = [`${report.valid ? 'ok  ' : 'FAIL'} ${basename(report.file)}: ${summary}`];

  if (report.issues.length <= GROUP_THRESHOLD) {
    for (const issue of report.issues) {
      lines.push(`  ${issue.level.padEnd(7)} [${issue.code}] ${issue.message}`);
      if (issue.hint) lines.push(`           fix: ${issue.hint}`);
    }
    return lines;
  }

  for (const group of groupIssues(report.issues)) {
    lines.push(`  ${group.level} [${group.code}] × ${group.issues.length}`);
    for (const issue of group.issues.slice(0, EXAMPLES_PER_GROUP)) {
      lines.push(`    ${issue.message}`);
      if (issue.hint) lines.push(`      fix: ${issue.hint}`);
    }
    const left = group.issues.length - EXAMPLES_PER_GROUP;
    if (left > 0) lines.push(`    … ${left} more`);
  }
  return lines;
}

interface Group {
  level: string;
  code: string;
  issues: Issue[];
}

function groupIssues(issues: Issue[]): Group[] {
  const groups = new Map<string, Group>();
  for (const issue of issues) {
    const key = `${issue.level}\0${issue.code}`;
    const group = groups.get(key);
    if (group) group.issues.push(issue);
    else groups.set(key, { level: issue.level, code: issue.code, issues: [issue] });
  }
  const rank = (list: string[], value: string): number => {
    const i = list.indexOf(value);
    return i === -1 ? list.length : i;
  };
  // Array.prototype.sort is stable, so ties keep the order in which the codes first appeared.
  return [...groups.values()].sort(
    (a, b) =>
      rank(LEVEL_ORDER, a.level) - rank(LEVEL_ORDER, b.level) ||
      rank(CODE_ORDER, a.code) - rank(CODE_ORDER, b.code) ||
      b.issues.length - a.issues.length,
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
