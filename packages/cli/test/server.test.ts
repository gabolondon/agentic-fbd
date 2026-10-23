import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, staticPath, type RunningServer } from '../src/server.ts';

// Minimal shape of /api/doc used by these tests
type Payload = { valid: boolean; doc: { subject: { id: string; title: string } }; issues: { code: string }[] };

const example = resolve(import.meta.dirname, '../../../skills/agentic-fbd/examples/auth-gate.logic.json');

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

describe('startServer — layout', () => {
  let running: RunningServer;
  let dir: string;
  const json = { 'content-type': 'application/json' };
  const put = (body: unknown, headers: Record<string, string> = json, file = 'gate.logic.json') =>
    fetch(`${running.url}api/layout?file=${file}`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lb-layout-'));
    const viewer = join(dir, 'viewer');
    mkdirSync(viewer);
    writeFileSync(join(viewer, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'gate.logic.json'), readFileSync(example));
    running = await startServer({ file: join(dir, 'gate.logic.json'), viewerDir: viewer });
  });

  afterAll(async () => {
    await running.close();
  });

  it('serves no layout until one is saved', async () => {
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as { layout: unknown };
    expect(payload.layout).toBeNull();
  });

  it('saves a layout next to the diagram and serves it with the document', async () => {
    const res = await put({ version: '0.1', levels: { '': { proxy: { x: 120.6, y: 40 } } } });
    expect(res.status).toBe(200);
    expect(readFileSync(join(dir, 'gate.layout.json'), 'utf8')).toContain('"proxy": { "x": 121, "y": 40 }');
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as { layout: unknown };
    expect(payload.layout).toEqual({ version: '0.1', levels: { '': { proxy: { x: 121, y: 40 } } } });
  });

  it('removes the file when no level is arranged any more', async () => {
    expect((await put({ version: '0.1', levels: {} })).status).toBe(200);
    expect(existsSync(join(dir, 'gate.layout.json'))).toBe(false);
  });

  it('refuses bad bodies, other methods, other pages and bad names', async () => {
    expect((await put('{ nope')).status).toBe(400);
    expect((await put({ levels: { '': { a: { x: 'far' } } } })).status).toBe(400);
    expect((await put({ levels: {} }, { 'content-type': 'text/plain' })).status).toBe(403);
    expect((await put({ levels: {} }, { ...json, origin: 'https://other.example' })).status).toBe(403);
    expect((await put({ levels: {} }, json, '..%2Fgate.logic.json')).status).toBe(400);
    expect((await fetch(`${running.url}api/layout`)).status).toBe(405);
  });
});

describe('startServer — draft and save', () => {
  let running: RunningServer;
  let dir: string;
  let diagram: string;
  const json = { 'content-type': 'application/json' };
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = json) =>
    fetch(`${running.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const original = () => JSON.parse(readFileSync(example, 'utf8'));
  const renamed = (label: string) => {
    const doc = original();
    doc.nodes.find((n: { id: string }) => n.id === 'proxy').label = label;
    return doc;
  };
  const draftPath = () => join(dir, 'gate.draft.json');
  const reviewPath = () => join(dir, 'gate.review.json');

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lb-draft-'));
    const viewer = join(dir, 'viewer');
    mkdirSync(viewer);
    writeFileSync(join(viewer, 'index.html'), '<!doctype html>');
    diagram = join(dir, 'gate.logic.json');
    running = await startServer({ file: diagram, viewerDir: viewer });
  });

  afterAll(async () => {
    await running.close();
  });

  const reset = (text = readFileSync(example, 'utf8')) => {
    writeFileSync(diagram, text);
    for (const p of [draftPath(), reviewPath()]) if (existsSync(p)) rmSync(p);
  };

  it('PUT draft keeps the original text from when editing started', async () => {
    reset();
    const first = readFileSync(diagram, 'utf8');
    expect((await call('PUT', 'api/draft?file=gate.logic.json', renamed('One'))).status).toBe(200);
    writeFileSync(diagram, JSON.stringify(renamed('Changed by the agent')));
    expect((await call('PUT', 'api/draft?file=gate.logic.json', renamed('Two'))).status).toBe(200);
    const draft = JSON.parse(readFileSync(draftPath(), 'utf8'));
    expect(draft.original).toBe(first);
    expect(draft.doc.nodes.find((n: { id: string }) => n.id === 'proxy').label).toBe('Two');
  });

  it('/api/doc returns the draft and flags a change on disk', async () => {
    reset();
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Mine'));
    let payload = (await (await fetch(`${running.url}api/doc`)).json()) as { draft: { doc: { nodes: { id: string; label: string }[] }; original: unknown; changedOnDisk: boolean } };
    expect(payload.draft.doc.nodes.find((n) => n.id === 'proxy')!.label).toBe('Mine');
    expect(payload.draft.original).toEqual(original());
    expect(payload.draft.changedOnDisk).toBe(false);
    writeFileSync(diagram, JSON.stringify(renamed('Theirs')));
    payload = (await (await fetch(`${running.url}api/doc`)).json()) as typeof payload;
    expect(payload.draft.changedOnDisk).toBe(true);
  });

  it('save writes the draft and removes it', async () => {
    reset();
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Saved'));
    const res = await call('POST', 'api/save?file=gate.logic.json', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, review: null });
    expect(readFileSync(diagram, 'utf8')).toBe(JSON.stringify(renamed('Saved'), null, 2) + '\n');
    expect(existsSync(draftPath())).toBe(false);
    expect(existsSync(reviewPath())).toBe(false);
  });

  it('save keeps the disk version for review when it changed', async () => {
    reset();
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Mine'));
    const theirs = JSON.stringify(renamed('Theirs'), null, 2);
    writeFileSync(diagram, theirs);
    const res = await call('POST', 'api/save?file=gate.logic.json', {});
    expect(await res.json()).toEqual({ ok: true, review: 'gate.review.json' });
    expect(readFileSync(reviewPath(), 'utf8')).toBe(theirs);
    expect(JSON.parse(readFileSync(diagram, 'utf8'))).toEqual(renamed('Mine'));
    const payload = (await (await fetch(`${running.url}api/doc`)).json()) as { review: string | null; draft: unknown };
    expect(payload.review).toBe('gate.review.json');
    expect(payload.draft).toBeNull();
  });

  it('save keeps an invalid disk version for review too', async () => {
    reset();
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Mine'));
    writeFileSync(diagram, '{ broken');
    const res = await call('POST', 'api/save?file=gate.logic.json', {});
    expect(res.status).toBe(200);
    expect(readFileSync(reviewPath(), 'utf8')).toBe('{ broken');
    expect(JSON.parse(readFileSync(diagram, 'utf8'))).toEqual(renamed('Mine'));
  });

  it('save refuses an invalid draft with its issues', async () => {
    reset();
    const bad = renamed('x');
    bad.wires[0].to = 'verify.nope';
    await call('PUT', 'api/draft?file=gate.logic.json', bad);
    const res = await call('POST', 'api/save?file=gate.logic.json', {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { code: string }[] };
    expect(body.issues.map((i) => i.code)).toContain('unknown-port');
    expect(readFileSync(diagram, 'utf8')).toBe(readFileSync(example, 'utf8'));
    expect(existsSync(draftPath())).toBe(true);
  });

  it('save without a draft is a 404, and discard removes the draft', async () => {
    reset();
    expect((await call('POST', 'api/save?file=gate.logic.json', {})).status).toBe(404);
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Mine'));
    expect((await call('DELETE', 'api/draft?file=gate.logic.json')).status).toBe(200);
    expect(existsSync(draftPath())).toBe(false);
    expect((await call('DELETE', 'api/draft?file=gate.logic.json')).status).toBe(200);
  });

  it('draft endpoints refuse other origins and non-JSON requests', async () => {
    reset();
    const text = { 'content-type': 'text/plain' };
    const other = { ...json, origin: 'https://other.example' };
    expect((await call('PUT', 'api/draft?file=gate.logic.json', renamed('x'), text)).status).toBe(403);
    expect((await call('PUT', 'api/draft?file=gate.logic.json', renamed('x'), other)).status).toBe(403);
    expect((await call('DELETE', 'api/draft?file=gate.logic.json', undefined, text)).status).toBe(403);
    expect((await call('POST', 'api/save?file=gate.logic.json', {}, other)).status).toBe(403);
    expect((await call('PUT', 'api/draft?file=gate.logic.json', { nope: 1 })).status).toBe(400);
    expect((await call('PUT', 'api/draft?file=..%2Fgate.logic.json', renamed('x'))).status).toBe(400);
    expect(existsSync(draftPath())).toBe(false);
  });

  it('/api/files flags files with a draft', async () => {
    reset();
    await call('PUT', 'api/draft?file=gate.logic.json', renamed('Mine'));
    const files = (await (await fetch(`${running.url}api/files`)).json()) as { file: string; draft: boolean }[];
    expect(files).toEqual([expect.objectContaining({ file: 'gate.logic.json', draft: true })]);
  });
});
