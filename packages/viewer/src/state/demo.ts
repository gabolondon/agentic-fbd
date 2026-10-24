import { validate, validateText, type LayoutFile, type LogicDoc, type Mode } from '@agentic-fbd/core';

/**
 * Demo mode: the viewer published as static files (the landing page's Try it), with no
 * `agentic-fbd open` server behind it. A page turns it on with
 * `<meta name="agentic-fbd-demo" content="demo.json">`, pointing at a manifest of the diagrams
 * served next to it. The same /api calls are answered in the browser: diagrams and layouts are
 * read as static files, and edits, arrangements and saves live in memory until the tab closes.
 */
export interface DemoManifest {
  /** The diagrams, the one to open first at the top. Paths are relative to the manifest. */
  files: { file: string; title: string; mode?: Mode; layout?: string }[];
}

export interface EventsLike {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: 'change', listener: (e: MessageEvent<string>) => void): void;
  close(): void;
}

export interface Api {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  events(url: string): EventsLike;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The browser's own fetch and EventSource: the viewer served by `agentic-fbd open`. */
const serverApi: Api = {
  fetch: (url, init) => fetch(url, init),
  // EventSource's handlers take an event and a `this`; the viewer uses neither.
  events: (url) => new EventSource(url) as unknown as EventsLike,
};

/** Nothing changes on disk in a demo: the stream opens once and never sends a change. */
class StillEvents implements EventsLike {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private closed = false;
  constructor() {
    // After the caller has attached its handlers.
    queueMicrotask(() => !this.closed && this.onopen?.());
  }
  addEventListener(): void {}
  close(): void {
    this.closed = true;
  }
}

interface Draft {
  doc: LogicDoc;
  original: LogicDoc | null;
}

export function createDemoApi(manifestUrl: string, load: typeof fetch = (u, i) => fetch(u, i), page = document.baseURI): Api {
  const base = new URL(manifestUrl, page);
  const manifest = load(base.href).then((r) => r.json() as Promise<DemoManifest>);
  const docs = new Map<string, Promise<{ doc: LogicDoc | null; valid: boolean; issues: unknown[] }>>();
  const layouts = new Map<string, LayoutFile | null>();
  const drafts = new Map<string, Draft>();

  const entryOf = async (name: string | null) => {
    const { files } = await manifest;
    return name === null ? files[0] : files.find((f) => f.file === name);
  };

  // A diagram is fetched once; a save in the demo replaces it in memory.
  const docOf = (file: string) => {
    let doc = docs.get(file);
    if (!doc) {
      doc = load(new URL(file, base).href)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((text) => validateText(text))
        .then((result) => ({ doc: result.doc, valid: result.valid, issues: result.issues }))
        .catch(() => ({ doc: null, valid: false, issues: [{ level: 'error', code: 'read', path: '/', message: `cannot read ${file}` }] }));
      docs.set(file, doc);
    }
    return doc;
  };

  const layoutOf = async (entry: DemoManifest['files'][number]) => {
    if (!layouts.has(entry.file)) {
      const layout = entry.layout
        ? await load(new URL(entry.layout, base).href)
            .then((r) => (r.ok ? (r.json() as Promise<LayoutFile>) : null))
            .catch(() => null)
        : null;
      if (!layouts.has(entry.file)) layouts.set(entry.file, layout);
    }
    return layouts.get(entry.file) ?? null;
  };

  async function handle(url: URL, method: string, body: string | null): Promise<Response> {
    const entry = await entryOf(url.searchParams.get('file'));
    if (url.pathname.endsWith('/api/files')) {
      const { files } = await manifest;
      return json(
        200,
        files.map((f, i) => ({ file: f.file, title: f.title, mode: f.mode, opened: i === 0, draft: drafts.has(f.file) })),
      );
    }
    if (!entry) return json(404, { error: 'no such diagram' });
    const file = entry.file;
    if (url.pathname.endsWith('/api/doc')) {
      const loaded = await docOf(file);
      const draft = drafts.get(file);
      return json(200, {
        path: file,
        file,
        ...loaded,
        layout: await layoutOf(entry),
        draft: draft ? { doc: draft.doc, original: draft.original, changedOnDisk: false } : null,
        review: null,
      });
    }
    if (url.pathname.endsWith('/api/layout') && method === 'PUT') {
      layouts.set(file, JSON.parse(body ?? 'null') as LayoutFile);
      return json(200, { ok: true });
    }
    if (url.pathname.endsWith('/api/draft')) {
      if (method === 'DELETE') drafts.delete(file);
      else drafts.set(file, { doc: JSON.parse(body ?? 'null') as LogicDoc, original: drafts.get(file)?.original ?? (await docOf(file)).doc });
      return json(200, { ok: true });
    }
    if (url.pathname.endsWith('/api/save') && method === 'POST') {
      const draft = drafts.get(file);
      if (!draft) return json(404, { error: 'there are no edits to save' });
      const result = validate(draft.doc);
      if (!result.valid) return json(400, { error: 'the edited diagram has errors', issues: result.issues });
      docs.set(file, Promise.resolve({ doc: draft.doc, valid: true, issues: result.issues }));
      drafts.delete(file);
      return json(200, { ok: true, review: null });
    }
    return json(404, { error: 'not found' });
  }

  return {
    fetch: (url, init) => {
      const body = typeof init?.body === 'string' ? init.body : null;
      return handle(new URL(url, base), init?.method ?? 'GET', body);
    },
    events: () => new StillEvents(),
  };
}

/** The manifest named by the page's demo meta tag, or null when served by `agentic-fbd open`. */
export function demoManifest(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="agentic-fbd-demo"]')?.content || null;
}

/** How the viewer reaches its diagrams: the local server, or the demo's in-browser stand-in. */
export const api: Api = (() => {
  const manifest = typeof document === 'undefined' ? null : demoManifest();
  return manifest ? createDemoApi(manifest) : serverApi;
})();
