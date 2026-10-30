import { describe, expect, it } from 'vitest';
import type { Issue } from '@agentic-fbd/core';
import { formatReport } from '../src/report.ts';
import type { FileReport } from '../src/main.ts';

function issues(count: number, level: Issue['level'], code: string, hint?: string): Issue[] {
  return Array.from({ length: count }, (_, i) => ({
    level,
    code,
    path: `p${i + 1}`,
    message: `${code} problem ${i + 1}`,
    ...(hint ? { hint } : {}),
  }));
}

function report(list: Issue[], file = 'dir/big.logic.json'): FileReport {
  return { file, valid: !list.some((i) => i.level === 'error'), issues: list };
}

describe('formatReport', () => {
  it('prints at most 10 issues one per line, with fix lines, as before', () => {
    const list = [
      ...issues(1, 'error', 'unknown-port', 'use "verify.idToken"'),
      ...issues(1, 'warning', 'link-missing-file'),
      ...issues(8, 'notice', 'missing-desc'),
    ];
    expect(formatReport(report(list))).toEqual([
      'FAIL big.logic.json: 1 error, 1 warning, 8 notices',
      '  error   [unknown-port] unknown-port problem 1',
      '           fix: use "verify.idToken"',
      '  warning [link-missing-file] link-missing-file problem 1',
      ...Array.from({ length: 8 }, (_, i) => `  notice  [missing-desc] missing-desc problem ${i + 1}`),
    ]);
  });

  it('prints ok and no issues for an empty report', () => {
    expect(formatReport(report([], 'a.logic.json'))).toEqual(['ok   a.logic.json: no issues']);
  });

  it('groups more than 10 issues by code, root causes first, notices last', () => {
    const list = [
      ...issues(6, 'notice', 'missing-desc'),
      ...issues(30, 'error', 'missing-port', 'write "node.port"'),
      ...issues(40, 'error', 'unknown-node', 'did you mean "verify"?'),
    ];
    const lines = formatReport(report(list));
    expect(lines).toEqual([
      'FAIL big.logic.json: 70 errors, 6 notices',
      '  error [unknown-node] × 40',
      '    unknown-node problem 1',
      '      fix: did you mean "verify"?',
      '    unknown-node problem 2',
      '      fix: did you mean "verify"?',
      '    unknown-node problem 3',
      '      fix: did you mean "verify"?',
      '    … 37 more',
      '  error [missing-port] × 30',
      '    missing-port problem 1',
      '      fix: write "node.port"',
      '    missing-port problem 2',
      '      fix: write "node.port"',
      '    missing-port problem 3',
      '      fix: write "node.port"',
      '    … 27 more',
      '  notice [missing-desc] × 6',
      '    missing-desc problem 1',
      '    missing-desc problem 2',
      '    missing-desc problem 3',
      '    … 3 more',
    ]);
  });

  it('orders groups: priority codes, other errors by count, warnings (unwired-block first), notices', () => {
    const list = [
      ...issues(2, 'notice', 'missing-desc'),
      ...issues(5, 'warning', 'stale-code'),
      ...issues(1, 'warning', 'unwired-block'),
      ...issues(2, 'error', 'type-mismatch'),
      ...issues(4, 'error', 'unknown-ref'),
      ...issues(1, 'error', 'unknown-port'),
      ...issues(1, 'error', 'schema'),
    ];
    const headers = formatReport(report(list)).filter((l) => /^ {2}\S/.test(l));
    expect(headers).toEqual([
      '  error [schema] × 1',
      '  error [unknown-port] × 1',
      '  error [unknown-ref] × 4',
      '  error [type-mismatch] × 2',
      '  warning [unwired-block] × 1',
      '  warning [stale-code] × 5',
      '  notice [missing-desc] × 2',
    ]);
  });

  it('does not print a more line for a group of 3 or fewer', () => {
    const lines = formatReport(report([...issues(3, 'error', 'duplicate-id'), ...issues(8, 'notice', 'missing-desc')]));
    expect(lines.some((l) => l.includes('… 0 more'))).toBe(false);
    expect(lines).toContain('  error [duplicate-id] × 3');
    expect(lines).not.toContain('    … 0 more');
  });
});
