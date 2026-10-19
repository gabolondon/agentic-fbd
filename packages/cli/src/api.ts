import { readFile, readdir } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { validateText, type Issue, type LogicDoc, type Mode } from '@logic-builder/core';

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
}

export interface FileEntry {
  file: string;
  title: string;
  mode?: Mode;
  /** The file `open` was started with. */
  opened: boolean;
}

export interface DocApi {
  /** Handles /api/doc, /api/files and /api/events; returns false for any other URL. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  close(): void;
}

const DEBOUNCE_MS = 120;
const KEEPALIVE_MS = 20_000;
const DIAGRAM = /^[^/\\]+\.logic\.json$/;

export function isDiagramName(name: string): boolean {
  return DIAGRAM.test(name) && name !== '.' && name !== '..';
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
      const changed = name === null ? null : name.toString();
      if (changed === null || isDiagramName(changed)) notify(changed);
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
  let names: string[];
  try {
    names = (await readdir(dir)).filter(isDiagramName);
  } catch {
    names = [];
  }
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
      return { file, title, mode, opened: file === opened };
    }),
  );
  return entries.sort((a, b) => Number(b.opened) - Number(a.opened) || a.title.localeCompare(b.title));
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
    };
  }
  return { path: displayPath, file, doc: result.doc, valid: result.valid, issues: result.issues };
}

async function readSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
