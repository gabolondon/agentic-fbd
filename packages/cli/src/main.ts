import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { validateText, type Issue } from '@agentic-fbd/core';
import { checkCode } from './checkCode.ts';
import { checkLinks } from './checkLinks.ts';
import { checkPlaceholders } from './checkPlaceholders.ts';
import { openBrowser } from './openBrowser.ts';
import { formatReport } from './report.ts';
import { findViewerDir, startServer, type RunningServer } from './server.ts';
import { starterDoc } from './starter.ts';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `agentic-fbd — logic diagrams for humans and coding agents

Usage:
  agentic-fbd new <file.logic.json> [--overview]
  agentic-fbd validate <file.logic.json>... [--check-code <repo-root>] [--json]
  agentic-fbd open <file.logic.json> [--port <n>] [--no-open]

Exit codes: 0 valid (warnings allowed), 1 invalid, 2 usage error.`;

export interface Command {
  name: string;
  /** Flags that take a value (`--port 4000`) and flags that do not (`--json`). Anything else is a usage error. */
  valued: string[];
  switches: string[];
  run: (args: ParsedArgs, io: Io) => Promise<number> | number;
}

export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[], valued: Set<string>, switches: Set<string>): ParsedArgs | string {
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
      if (value === undefined || value.startsWith('--')) return `--${name} needs a value`;
      flags.set(name, value);
    } else if (switches.has(name)) {
      flags.set(name, true);
    } else {
      return `unknown flag --${name}`;
    }
  }
  return { positional, flags };
}

const commands = new Map<string, Command>();

export function register(command: Command): void {
  commands.set(command.name, command);
}

export async function run(argv: string[], io: Io, nodeVersion: string = process.versions.node): Promise<number> {
  // The bundle targets node20; say so plainly instead of failing with a syntax or module error.
  if (Number(nodeVersion.split('.')[0]) < 20) {
    io.err(`agentic-fbd: Node 20 or later is required (found v${nodeVersion})`);
    return 1;
  }
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
  if (rest.includes('--help') || rest.includes('-h')) {
    io.out(USAGE);
    return 0;
  }
  const args = parseArgs(rest, new Set(command.valued), new Set(command.switches));
  if (typeof args === 'string') {
    io.err(`${args}\n\n${USAGE}`);
    return 2;
  }
  return command.run(args, io);
}

/** The subject id for a new file: its name without `.logic.json`, with characters an id cannot hold replaced. */
function subjectIdFor(file: string): string {
  const name = basename(file).replace(/\.logic\.json$/, '').replace(/[./\\\s]+/g, '-').replace(/^-+|-+$/g, '');
  return name || 'subject';
}

register({
  name: 'new',
  valued: [],
  switches: ['overview'],
  run(args, io) {
    const [file, ...extra] = args.positional;
    if (!file || extra.length) {
      io.err(`new needs exactly one file\n\n${USAGE}`);
      return 2;
    }
    if (existsSync(file)) {
      io.err(`${file} already exists`);
      return 2;
    }
    const doc = starterDoc(args.flags.has('overview') ? 'overview' : 'understand', subjectIdFor(file));
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    io.out(`created ${file}; replace every TODO, then run validate`);
    return 0;
  },
});

register({
  name: 'validate',
  valued: ['check-code'],
  switches: ['json'],
  run(args, io) {
    if (args.positional.length === 0) {
      io.err(`validate needs at least one file\n\n${USAGE}`);
      return 2;
    }
    const repo = args.flags.get('check-code');
    const asJson = args.flags.has('json');
    const reports = args.positional.map((file) => validateFile(file, typeof repo === 'string' ? repo : undefined));
    if (asJson) io.out(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    else for (const r of reports) for (const line of formatReport(r)) io.out(line);
    return reports.every((r) => r.valid) ? 0 : 1;
  },
});

register({
  name: 'open',
  valued: ['port'],
  switches: ['no-open'],
  async run(args, io) {
    const [file, ...extra] = args.positional;
    if (!file || extra.length) {
      io.err(`open needs exactly one file\n\n${USAGE}`);
      return 2;
    }
    if (!existsSync(file)) {
      io.err(`agentic-fbd: ${file} does not exist`);
      return 1;
    }
    const portFlag = args.flags.get('port');
    const port = typeof portFlag === 'string' ? Number(portFlag) : 0;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      io.err(`--port must be a number between 0 and 65535`);
      return 2;
    }
    const viewerDir = findViewerDir();
    if (!viewerDir) {
      io.err('agentic-fbd: the viewer is not built (dist/viewer is missing); run "npm run build"');
      return 1;
    }

    // The viewer opens even when the file is invalid; it shows the errors in a banner.
    const report = validateFile(file);
    let running: RunningServer;
    try {
      running = await startServer({ file, port, viewerDir });
    } catch (e) {
      io.err(`agentic-fbd: cannot start the server: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
    io.out(`agentic-fbd: ${running.url}`);
    io.out(`watching ${file} (${report.valid ? 'valid' : 'has errors, shown in the viewer'}); press Ctrl+C to stop`);
    if (!args.flags.has('no-open')) openBrowser(running.url);

    await new Promise<void>((done) => {
      const stop = (): void => {
        void running.close().then(done);
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
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
  // Placeholders are checked here and not in the viewer's load path, so the viewer shows a fresh starter without a banner.
  if (result.doc) issues.push(...checkPlaceholders(result.doc));
  if (result.doc) issues.push(...checkLinks(result.doc, resolve(file)));
  if (repoRoot && result.doc) issues.push(...checkCode(result.doc, resolve(repoRoot)));
  return { file, valid: issues.every((i) => i.level !== 'error'), issues };
}

