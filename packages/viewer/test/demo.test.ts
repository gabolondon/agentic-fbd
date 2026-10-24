import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { createDemoApi } from '../src/state/demo.ts';

const example = readFileSync(resolve(import.meta.dirname, '../../../skills/agentic-fbd/examples/auth-gate.logic.json'), 'utf8');
const layout = JSON.stringify({ version: '0.1', positions: {} });
const files: Record<string, string> = {
  'https://site.test/demo/demo.json': JSON.stringify({
    files: [
      { file: 'diagrams/auth-gate.logic.json', title: 'Access gate', mode: 'understand', layout: 'diagrams/auth-gate.layout.json' },
      { file: 'diagrams/missing.logic.json', title: 'Missing' },
    ],
  }),
  'https://site.test/demo/diagrams/auth-gate.logic.json': example,
  'https://site.test/demo/diagrams/auth-gate.layout.json': layout,
};
const fetched: string[] = [];
const load = (async (url: string) => {
  fetched.push(url);
  return url in files ? new Response(files[url]) : new Response('', { status: 404 });
}) as typeof fetch;

const demo = () => createDemoApi('demo.json', load, 'https://site.test/demo/index.html');
const get = async (api: ReturnType<typeof demo>, url: string, init?: RequestInit) => {
  const res = await api.fetch(url, init);
  return { status: res.status, body: await res.json() };
};

test('lists the manifest, the first diagram as the opened one', async () => {
  const { body } = await get(demo(), 'api/files');
  expect(body).toEqual([
    { file: 'diagrams/auth-gate.logic.json', title: 'Access gate', mode: 'understand', opened: true, draft: false },
    { file: 'diagrams/missing.logic.json', title: 'Missing', opened: false, draft: false },
  ]);
});

test('serves the first diagram, validated, with its layout', async () => {
  const { body } = await get(demo(), 'api/doc');
  expect(body.file).toBe('diagrams/auth-gate.logic.json');
  expect(body.valid).toBe(true);
  expect(body.doc.subject.id).toBe('auth-gate');
  expect(body.layout).toEqual(JSON.parse(layout));
  expect(body.draft).toBeNull();
});

test('a diagram that cannot be read comes back invalid, not as a crash', async () => {
  const { body } = await get(demo(), `api/doc?file=${encodeURIComponent('diagrams/missing.logic.json')}`);
  expect(body.doc).toBeNull();
  expect(body.valid).toBe(false);
  expect(await get(demo(), 'api/doc?file=nope.logic.json')).toMatchObject({ status: 404 });
});

test('edits, arrangements and saves stay in memory', async () => {
  const api = demo();
  const file = encodeURIComponent('diagrams/auth-gate.logic.json');
  const doc = JSON.parse(example);
  const edited = { ...doc, subject: { ...doc.subject, title: 'Edited in the demo' } };
  await get(api, `api/draft?file=${file}`, { method: 'PUT', body: JSON.stringify(edited) });
  const withDraft = await get(api, 'api/doc');
  expect(withDraft.body.draft.doc.subject.title).toBe('Edited in the demo');
  expect(withDraft.body.draft.original.subject.title).toBe(doc.subject.title);
  expect((await get(api, 'api/files')).body[0].draft).toBe(true);

  expect(await get(api, `api/save?file=${file}`, { method: 'POST', body: '{}' })).toEqual({ status: 200, body: { ok: true, review: null } });
  const saved = await get(api, 'api/doc');
  expect(saved.body.doc.subject.title).toBe('Edited in the demo');
  expect(saved.body.draft).toBeNull();

  const arranged = { version: '0.1', positions: { verify: { x: 1, y: 2 } } };
  await get(api, `api/layout?file=${file}`, { method: 'PUT', body: JSON.stringify(arranged) });
  expect((await get(api, 'api/doc')).body.layout).toEqual(arranged);
});

test('an invalid edit is refused on save, like the server does', async () => {
  const api = demo();
  const file = encodeURIComponent('diagrams/auth-gate.logic.json');
  const broken = { ...JSON.parse(example), wires: [{ id: 'bad', from: 'nowhere.out', to: 'verify.cookie' }] };
  await get(api, `api/draft?file=${file}`, { method: 'PUT', body: JSON.stringify(broken) });
  const res = await get(api, `api/save?file=${file}`, { method: 'POST', body: '{}' });
  expect(res.status).toBe(400);
  expect(res.body.issues.some((i: { level: string }) => i.level === 'error')).toBe(true);
});

test('the change stream opens once and never fires', async () => {
  let opened = 0;
  const events = demo().events('api/events');
  events.onopen = () => (opened += 1);
  await Promise.resolve();
  await Promise.resolve();
  expect(opened).toBe(1);
});
