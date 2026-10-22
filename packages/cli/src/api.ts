import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import {
  draftFileName,
  formatLayout,
  layoutFileName,
  parseDraft,
  parseLayout,
  reviewFileName,
  validate,
  validateText,
  type DraftFile,
  type Issue,
  type LayoutFile,
  type LogicDoc,
  type Mode,
} from '@logic-builder/core';

// The endpoints the viewer talks to. Shared by `logic-builder open` and the Vite dev server.
// Every *.logic.json next to the opened file is served, so diagrams can link to each other.

export interface DocPayload {
  /** The file path as the user passed it, or the sibling's name. */
  path: string;
  /** The file's name in the folder, used in links and in the viewer's URL. */
  file: string;
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
  /** The saved arrangement (`<name>.layout.json`), or null when there is none. */
  layout: LayoutFile | null;
  /** Unsaved edits made in the viewer (`<name>.draft.json`), or null when there are none. */
  draft: DraftPayload | null;
  /** The name of `<name>.review.json` when a save set the agent's version aside for review. */
  review: string | null;
}

export interface DraftPayload {
  doc: LogicDoc;
  /** The diagram when editing started; null if that text does not parse. */
  original: LogicDoc | null;
  /** The diagram on disk is no longer what it was when editing started. */
  changedOnDisk: boolean;
}

export interface FileEntry {
  file: string;
  title: string;
  mode?: Mode;
  /** The file `open` was started with. */
  opened: boolean;
  /** It has unsaved edits from the viewer. */
  draft: boolean;
}

export interface DocApi {
  /** Handles /api/doc, /api/files, /api/layout, /api/draft, /api/save and /api/events; returns false for any other URL. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  close(): void;
}

const DEBOUNCE_MS = 120;
const KEEPALIVE_MS = 20_000;
const DIAGRAM = /^[^/\\]+\.logic\.json$/;
const MAX_LAYOUT_BYTES = 1_000_000;
const MAX_DRAFT_BYTES = 5_000_000;
/** Files written next to a diagram, reported as changes of that diagram. */
const SIDE_FILE = /^([^/\\]+)\.(draft|review)\.json$/;

export function isDiagramName(name: string): boolean {
  return DIAGRAM.test(name) && name !== '.' && name !== '..';
}

/** The diagram a changed file belongs to: itself, or the diagram of a draft or review file. */
function diagramOf(name: string): string | null {
  if (isDiagramName(name)) return name;
  const side = SIDE_FILE.exec(name);
  return side ? `${side[1]}.logic.json` : null;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function createDocApi(file: string, displayPath = file): DocApi {
  const absolute = resolve(file);
  const dir = dirname(absolute);
  const opened = basename(absolute);
  const clients = new Set<ServerResponse>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;
  // Names changed since the last event; null means "unknown, assume everything".
  let pending: Set<string> | null = new Set();

  const notify = (name: string | null): void => {
    if (name === null) pending = null;
    else pending?.add(name);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const files = pending === null ? null : [...pending];
      pending = new Set();
      const data = JSON.stringify(files === null ? {} : { files });
      for (const res of clients) res.write(`event: change\ndata: ${data}\n\n`);
    }, DEBOUNCE_MS);
  };

  // Watch the directory, not the file: editors often replace files with an atomic rename.
  try {
    watcher = watch(dir, (_event, name) => {
      const changed = name === null ? null : diagramOf(name.toString());
      if (name === null || changed !== null) notify(changed);
    });
    watcher.on('error', () => undefined);
  } catch {
    watcher = undefined;
  }

  const keepalive = setInterval(() => {
    for (const res of clients) res.write(': keepalive\n\n');
  }, KEEPALIVE_MS);
  keepalive.unref?.();

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  /** Runs a write for the viewer: one method, a diagram name, same origin and a JSON body type. */
  const write = (req: IncomingMessage, res: ServerResponse, name: string, methods: string[], run: () => Promise<unknown>): void => {
    if (!methods.includes(req.method ?? '')) {
      json(res, 405, { error: `use ${methods.join(' or ')}` });
    } else if (!isDiagramName(name)) {
      json(res, 400, { error: `not a diagram name: ${name}` });
    } else if (!sameOrigin(req) || !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      // A JSON content type forces a CORS preflight, which this server never answers, so
      // other web pages cannot write here.
      json(res, 403, { error: 'forbidden' });
    } else {
      void run().then(
        (body) => json(res, 200, body ?? { ok: true }),
        (e: Error) => (e instanceof HttpError ? json(res, e.status, { error: e.message, ...e.extra }) : json(res, 400, { error: e.message })),
      );
    }
  };

  return {
    handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/doc') {
        const name = url.searchParams.get('file') ?? opened;
        if (!isDiagramName(name)) {
          json(res, 400, { error: `not a diagram name: ${name}` });
          return true;
        }
        const path = name === opened ? displayPath : name;
        void load(join(dir, name), name, path).then((payload) => json(res, 200, payload));
        return true;
      }
      if (url.pathname === '/api/layout') {
        const name = url.searchParams.get('file') ?? opened;
        write(req, res, name, ['PUT'], () => saveLayout(req, join(dir, layoutFileName(name))));
        return true;
      }
      if (url.pathname === '/api/draft') {
        const name = url.searchParams.get('file') ?? opened;
        write(req, res, name, ['PUT', 'DELETE'], () =>
          req.method === 'PUT' ? saveDraft(req, dir, name) : unlink(join(dir, draftFileName(name))).catch(() => undefined),
        );
        return true;
      }
      if (url.pathname === '/api/save') {
        const name = url.searchParams.get('file') ?? opened;
        write(req, res, name, ['POST'], () => saveDiagram(dir, name));
        return true;
      }
      if (url.pathname === '/api/files') {
        void listDiagrams(dir, opened).then((files) => json(res, 200, files));
        return true;
      }
      if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return true;
      }
      return false;
    },
    close() {
      clearTimeout(timer);
      clearInterval(keepalive);
      watcher?.close();
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}

/** The diagrams in a folder with their titles, the opened one first. */
export async function listDiagrams(dir: string, opened: string): Promise<FileEntry[]> {
  let all: string[];
  try {
    all = await readdir(dir);
  } catch {
    all = [];
  }
  const names = all.filter(isDiagramName);
  const drafts = new Set(all);
  const entries = await Promise.all(
    names.map(async (file): Promise<FileEntry> => {
      const text = await readSafe(join(dir, file));
      let title = file;
      let mode: Mode | undefined;
      try {
        const subject = (JSON.parse(text ?? '') as Partial<LogicDoc>).subject;
        if (subject?.title) title = subject.title;
        mode = subject?.mode;
      } catch {
        // Unreadable or mid-write: list it by name.
      }
      return { file, title, mode, opened: file === opened, draft: drafts.has(draftFileName(file)) };
    }),
  );
  return entries.sort((a, b) => Number(b.opened) - Number(a.opened) || a.title.localeCompare(b.title));
}

/** Writes the layout from a request body, atomically; an empty layout removes the file. */
async function saveLayout(req: IncomingMessage, target: string): Promise<void> {
  const layout = parseLayout(await readJsonBody(req, MAX_LAYOUT_BYTES));
  if (!layout) throw new Error('not a layout');
  if (Object.keys(layout.levels).length === 0) {
    await unlink(target).catch(() => undefined);
    return;
  }
  await writeAtomic(target, formatLayout(layout));
}

/**
 * Keeps the viewer's edited document in `<name>.draft.json`. The diagram's text is copied in on
 * the first edit and kept from then on: it says what the user started from.
 */
async function saveDraft(req: IncomingMessage, dir: string, name: string): Promise<void> {
  const target = join(dir, draftFileName(name));
  const body = await readJsonBody(req, MAX_DRAFT_BYTES);
  const existing = await readDraft(target);
  const original = existing?.original ?? (await readSafe(join(dir, name)));
  if (original === null) throw new HttpError(404, `cannot read ${name}`);
  const draft = parseDraft({ original, doc: body });
  if (!draft) throw new Error('not a diagram');
  await writeAtomic(target, JSON.stringify(draft, null, 2) + '\n');
}

/**
 * Writes the draft over the diagram. If the diagram changed on disk since editing started, the
 * user's version still wins and the other one is kept as `<name>.review.json` for the agent.
 */
async function saveDiagram(dir: string, name: string): Promise<{ ok: true; review: string | null }> {
  const draftPath = join(dir, draftFileName(name));
  const draft = await readDraft(draftPath);
  if (!draft) throw new HttpError(404, 'there are no edits to save');
  const result = validate(draft.doc);
  if (!result.valid) throw new HttpError(400, 'the edited diagram has errors', { issues: result.issues });
  const target = join(dir, name);
  const current = await readSafe(target);
  let review: string | null = null;
  if (current !== null && current !== draft.original) {
    review = reviewFileName(name);
    await writeAtomic(join(dir, review), current);
  }
  await writeAtomic(target, JSON.stringify(draft.doc, null, 2) + '\n');
  await unlink(draftPath).catch(() => undefined);
  return { ok: true, review };
}

async function readDraft(path: string): Promise<DraftFile | null> {
  const text = await readSafe(path);
  if (text === null) return null;
  try {
    return parseDraft(JSON.parse(text));
  } catch {
    return null;
  }
}

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('not JSON');
  }
}

/** Writes through a temp file and a rename, so readers never see half a file. */
async function writeAtomic(target: string, text: string): Promise<void> {
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, text);
  await rename(temp, target);
}

/** Requests from the viewer itself carry no Origin, or the server's own. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function loadLayout(absolute: string): Promise<LayoutFile | null> {
  const text = await readSafe(join(dirname(absolute), layoutFileName(basename(absolute))));
  if (text === null) return null;
  try {
    return parseLayout(JSON.parse(text));
  } catch {
    return null;
  }
}

async function load(absolute: string, file: string, displayPath: string): Promise<DocPayload> {
  let text = await readSafe(absolute);
  let result = text === null ? null : validateText(text);
  // The file may be mid-write or briefly missing during an atomic rename: retry once.
  if (text === null || result?.issues.some((i) => i.code === 'json')) {
    await new Promise((r) => setTimeout(r, 80));
    text = await readSafe(absolute);
    result = text === null ? null : validateText(text);
  }
  if (text === null || result === null) {
    return {
      path: displayPath,
      file,
      doc: null,
      valid: false,
      issues: [{ level: 'error', code: 'read', path: '/', message: `cannot read ${displayPath}` }],
      layout: null,
      draft: await loadDraft(absolute, null),
      review: await reviewOf(absolute),
    };
  }
  const layout = await loadLayout(absolute);
  const draft = await loadDraft(absolute, text);
  const review = await reviewOf(absolute);
  return { path: displayPath, file, doc: result.doc, valid: result.valid, issues: result.issues, layout, draft, review };
}

async function loadDraft(absolute: string, current: string | null): Promise<DraftPayload | null> {
  const draft = await readDraft(join(dirname(absolute), draftFileName(basename(absolute))));
  if (!draft) return null;
  let original: LogicDoc | null = null;
  try {
    original = JSON.parse(draft.original) as LogicDoc;
  } catch {
    original = null;
  }
  return { doc: draft.doc, original, changedOnDisk: current !== draft.original };
}

async function reviewOf(absolute: string): Promise<string | null> {
  const name = reviewFileName(basename(absolute));
  return (await readSafe(join(dirname(absolute), name))) === null ? null : name;
}

async function readSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
