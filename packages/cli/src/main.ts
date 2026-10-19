import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { validateText, type Issue } from '@logic-builder/core';
import { checkCode } from './checkCode.ts';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `logic-builder — logic diagrams for humans and coding agents

Usage:
  logic-builder validate <file.logic.json>... [--check-code <repo-root>] [--json]
  logic-builder open <file.logic.json> [--port <n>] [--no-open]

Exit codes: 0 valid (warnings allowed), 1 invalid, 2 usage error.`;

export interface Command {
  name: string;
  run: (args: ParsedArgs, io: Io) => Promise<number> | number;
}

export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[], valued: Set<string>): ParsedArgs | string {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (valued.has(name)) {
      const value = argv[++i];
      if (value === undefined) return `--${name} needs a value`;
      flags.set(name, value);
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

const commands = new Map<string, Command>();

export function register(command: Command): void {
  commands.set(command.name, command);
}

export async function run(argv: string[], io: Io): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    io.out(USAGE);
    return name ? 0 : 2;
  }
  const command = commands.get(name);
  if (!command) {
    io.err(`unknown command "${name}"\n\n${USAGE}`);
    return 2;
  }
  const valued = new Set(['check-code', 'port']);
  const args = parseArgs(rest, valued);
  if (typeof args === 'string') {
    io.err(args);
    return 2;
  }
  return command.run(args, io);
}

register({
  name: 'validate',
  run(args, io) {
    if (args.positional.length === 0) {
      io.err(`validate needs at least one file\n\n${USAGE}`);
      return 2;
    }
    const repo = args.flags.get('check-code');
    const asJson = args.flags.has('json');
    const reports = args.positional.map((file) => validateFile(file, typeof repo === 'string' ? repo : undefined));
    if (asJson) io.out(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    else for (const r of reports) printReport(r, io);
    return reports.every((r) => r.valid) ? 0 : 1;
  },
});

export interface FileReport {
  file: string;
  valid: boolean;
  issues: Issue[];
}

export function validateFile(file: string, repoRoot?: string): FileReport {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { file, valid: false, issues: [{ level: 'error', code: 'read', path: '/', message: `cannot read file: ${message}` }] };
  }
  const result = validateText(text);
  const issues = [...result.issues];
  if (repoRoot && result.doc) issues.push(...checkCode(result.doc, resolve(repoRoot)));
  return { file, valid: result.valid, issues };
}

function printReport(report: FileReport, io: Io): void {
  const count = (level: string): number => report.issues.filter((i) => i.level === level).length;
  const parts = [plural(count('error'), 'error'), plural(count('warning'), 'warning'), plural(count('notice'), 'notice')];
  const summary = parts.filter((p) => !p.startsWith('0 ')).join(', ') || 'no issues';
  io.out(`${report.valid ? 'ok  ' : 'FAIL'} ${basename(report.file)}: ${summary}`);
  for (const issue of report.issues) io.out(`  ${issue.level.padEnd(7)} [${issue.code}] ${issue.message}`);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
