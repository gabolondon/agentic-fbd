import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, staticPath, type RunningServer } from '../src/server.ts';

// Minimal shape of /api/doc used by these tests
type Payload = { valid: boolean; doc: { subject: { id: string; title: string } }; issues: { code: string }[] };

const example = resolve(import.meta.dirname, '../../../skills/logic-builder/examples/auth-gate.logic.json');

describe('staticPath', () => {
  const root = mkdtempSync(join(tmpdir(), 'lb-static-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'app.js'), '');

  it('serves files inside the root', () => {
    expect(staticPath(root, '/')).toBe(join(root, 'index.html'));
    expect(staticPath(root, '/assets/app.js?v=1')).toBe(join(root, 'assets', 'app.js'));
  });

  it('blocks path traversal and missing files', () => {
    expect(staticPath(root, '/../../etc/passwd')).toBeNull();
    expect(staticPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(staticPath(root, '/assets/..%2f..%2fsecret')).toBeNull();
    expect(staticPath(root, '/nope.js')).toBeNull();
    expect(staticPath(root, '/assets')).toBeNull();
  });
});

describe('startServer', () => {
  let running: RunningServer;
  let file: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lb-server-'));
    const viewer = join(dir, 'viewer');
    mkdirSync(viewer);
    writeFileSync(join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
    file = join(dir, 'gate.logic.json');
    writeFileSync(file, readFileSync(example));
    running = await startServer({ file, viewerDir: viewer });
  });

  afterAll(async () => {
    await running.close();
  });

  it('binds to loopback on a free port', () => {
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it('serves the viewer and the document', async () => {
    expect(await (await fetch(running.url)).text()).toContain('<title>viewer</title>');
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as Payload;
    expect(payload.valid).toBe(true);
    expect(payload.doc.subject.id).toBe('auth-gate');
  });

  it('pushes a change event when the file changes', async () => {
    const controller = new AbortController();
    const res = await fetch(`${running.url}api/events`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const sawChange = (async () => {
      while (!text.includes('event: change')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      return text.includes('event: change');
    })();
    await new Promise((r) => setTimeout(r, 100));
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    doc.subject.title = 'Changed title';
    writeFileSync(file, JSON.stringify(doc));
    const result = await Promise.race([sawChange, new Promise((r) => setTimeout(() => r(false), 3000))]);
    controller.abort();
    expect(result).toBe(true);
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as Payload;
    expect(payload.doc.subject.title).toBe('Changed title');
  });

  it('reports an invalid file without crashing', async () => {
    writeFileSync(file, '{ "version": "0.1", ');
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as Payload;
    expect(payload.valid).toBe(false);
    expect(payload.issues[0]?.code).toBe('json');
  });
});

describe('startServer — diagrams in the same folder', () => {
  let running: RunningServer;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lb-siblings-'));
    const viewer = join(dir, 'viewer');
    mkdirSync(viewer);
    writeFileSync(join(viewer, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'gate.logic.json'), readFileSync(example));
    const other = JSON.parse(readFileSync(example, 'utf8'));
    other.subject.id = 'other';
    other.subject.title = 'Another system';
    writeFileSync(join(dir, 'other.logic.json'), JSON.stringify(other));
    writeFileSync(join(dir, 'notes.json'), '{}');
    running = await startServer({ file: join(dir, 'gate.logic.json'), viewerDir: viewer });
  });

  afterAll(async () => {
    await running.close();
  });

  it('lists the folder diagrams, the opened one first', async () => {
    const files = (await (await fetch(`${running.url}api/files`)).json()) as { file: string; title: string; opened: boolean }[];
    expect(files.map((f) => f.file)).toEqual(['gate.logic.json', 'other.logic.json']);
    expect(files[0]!.opened).toBe(true);
    expect(files[1]!.title).toBe('Another system');
  });

  it('serves a sibling diagram by name', async () => {
    const payload = (await (await fetch(`${running.url}api/doc?file=other.logic.json`)).json()) as Payload & { file: string };
    expect(payload.file).toBe('other.logic.json');
    expect(payload.doc.subject.id).toBe('other');
  });

  it('refuses names outside the folder or that are not diagrams', async () => {
    expect((await fetch(`${running.url}api/doc?file=..%2Fgate.logic.json`)).status).toBe(400);
    expect((await fetch(`${running.url}api/doc?file=notes.json`)).status).toBe(400);
  });
});
