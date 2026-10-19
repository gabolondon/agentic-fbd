import { readFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, resolve } from 'node:path';
import { validateText, type Issue, type LogicDoc } from '@logic-builder/core';

// The two endpoints the viewer talks to. Shared by `logic-builder open` and the Vite dev server.

export interface DocPayload {
  /** The file path as the user passed it. */
  path: string;
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
}

export interface DocApi {
  /** Handles /api/doc and /api/events; returns false for any other URL. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  close(): void;
}

const DEBOUNCE_MS = 120;
const KEEPALIVE_MS = 20_000;

export function createDocApi(file: string, displayPath = file): DocApi {
  const absolute = resolve(file);
  const clients = new Set<ServerResponse>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;

  const notify = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of clients) res.write('event: change\ndata: {}\n\n');
    }, DEBOUNCE_MS);
  };

  // Watch the directory, not the file: editors often replace files with an atomic rename.
  try {
    watcher = watch(dirname(absolute), (_event, name) => {
      if (name === null || name === basename(absolute)) notify();
    });
    watcher.on('error', () => undefined);
  } catch {
    watcher = undefined;
  }

  const keepalive = setInterval(() => {
    for (const res of clients) res.write(': keepalive\n\n');
  }, KEEPALIVE_MS);
  keepalive.unref?.();

  return {
    handle(req, res) {
      const url = (req.url ?? '').split('?')[0];
      if (url === '/api/doc') {
        void load(absolute, displayPath).then((payload) => {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify(payload));
        });
        return true;
      }
      if (url === '/api/events') {
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

async function load(absolute: string, displayPath: string): Promise<DocPayload> {
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
      doc: null,
      valid: false,
      issues: [{ level: 'error', code: 'read', path: '/', message: `cannot read ${displayPath}` }],
    };
  }
  return { path: displayPath, doc: result.doc, valid: result.valid, issues: result.issues };
}

async function readSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
