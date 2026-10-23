import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyEdit, summarizeEdits, validate, type Edit, type Issue, type LayoutFile, type LogicDoc, type Mode } from '@agentic-fbd/core';

export interface DiagramFile {
  file: string;
  title: string;
  mode?: Mode;
  /** The file `open` was started with. */
  opened: boolean;
  /** It has unsaved edits from the viewer. */
  draft: boolean;
}

/** Unsaved edits made in the viewer (design spec §6.9). */
export interface DraftState {
  /** The diagram when editing started: what the edits are listed against. */
  original: LogicDoc;
  /** The diagram on disk changed while the user was editing. */
  changedOnDisk: boolean;
}

export interface DocState {
  /** The file path as passed to `agentic-fbd open` (or the sibling's path). */
  path: string;
  /** The file's name in its folder; links and the URL use it. */
  file: string;
  /** What is on screen: the draft while there is one, else the last document that parsed. */
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
  /** Bumped on every successful fetch, so views can react to reloads. */
  revision: number;
  connected: boolean;
  loaded: boolean;
  /** Every diagram in the same folder. */
  files: DiagramFile[];
  /** Positions arranged by hand, saved next to the diagram. */
  layout: LayoutFile | null;
  /** False when the last save of the layout failed. */
  layoutSaved: boolean;
  draft: DraftState | null;
  /** False when the last write of the draft failed. */
  draftSaved: boolean;
  /** `<name>.review.json`, when a save set the agent's version aside for review. */
  review: string | null;
}

export type SaveResult = { ok: true; summary: string; review: string | null } | { ok: false; message: string };

export interface DocHandle extends DocState {
  /** Shows a new arrangement at once and writes it next to the diagram. */
  saveLayout(layout: LayoutFile): void;
  /** Applies one edit to the draft; returns why it was refused, or null. */
  edit(e: Edit): string | null;
  /** Drops the draft. */
  discard(): void;
  /** Writes the draft over the diagram; on success, `summary` is the request for the agent. */
  save(): Promise<SaveResult>;
  /** The path of a diagram in the same folder, as the user would name it. */
  pathOf(file: string): string;
}

/** What the server sent last, plus the draft being edited. */
interface Inner {
  path: string;
  file: string;
  /** The diagram on disk (the last version that parsed). */
  diskDoc: LogicDoc | null;
  diskValid: boolean;
  diskIssues: Issue[];
  draftDoc: LogicDoc | null;
  draft: DraftState | null;
  revision: number;
  connected: boolean;
  loaded: boolean;
  files: DiagramFile[];
  layout: LayoutFile | null;
  layoutSaved: boolean;
  draftSaved: boolean;
  review: string | null;
}

const INITIAL: Inner = {
  path: '',
  file: '',
  diskDoc: null,
  diskValid: true,
  diskIssues: [],
  draftDoc: null,
  draft: null,
  revision: 0,
  connected: false,
  loaded: false,
  files: [],
  layout: null,
  layoutSaved: true,
  draftSaved: true,
  review: null,
};

interface Payload {
  path: string;
  file: string;
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
  layout: LayoutFile | null;
  draft: { doc: LogicDoc; original: LogicDoc | null; changedOnDisk: boolean } | null;
  review: string | null;
}

const DRAFT_DEBOUNCE_MS = 300;
const JSON_HEADERS = { 'content-type': 'application/json' };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Loads one diagram from the local server (the opened file when `file` is undefined) and
 * refetches when it changes on disk. Also keeps the list of diagrams in the folder, and the
 * draft of edits made in the viewer.
 */
export function useDocument(file?: string): DocHandle {
  const [inner, setInner] = useState<Inner>(INITIAL);
  const latest = useRef(inner);
  latest.current = inner;
  const inFlight = useRef(0);
  const current = useRef<string | undefined>(file);
  current.current = file;
  /** Name of the diagram on screen, to filter change events. */
  const loadedFile = useRef('');
  // The draft is written to the server debounced; a refetch must not undo edits not sent yet.
  const queued = useRef<{ file: string; doc: LogicDoc } | null>(null);
  const putTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const putChain = useRef<Promise<void>>(Promise.resolve());
  const unsentFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const ticket = ++inFlight.current;
    const wanted = current.current;
    try {
      const res = await fetch(wanted ? `api/doc?file=${encodeURIComponent(wanted)}` : 'api/doc', { cache: 'no-store' });
      const payload = (await res.json()) as Payload;
      if (ticket !== inFlight.current) return;
      loadedFile.current = payload.file;
      setInner((prev) => {
        // Switching diagrams must not keep the previous diagram on screen.
        const sameFile = prev.file === payload.file;
        const diskDoc = payload.doc ?? (sameFile ? prev.diskDoc : null);
        let draftDoc: LogicDoc | null = null;
        let draft: DraftState | null = null;
        if (sameFile && unsentFor.current === payload.file) {
          // Local edits (or a discard) not written yet win over the server's copy.
          draftDoc = prev.draftDoc;
          draft = prev.draft && { ...prev.draft, changedOnDisk: payload.draft?.changedOnDisk ?? prev.draft.changedOnDisk };
        } else if (payload.draft) {
          draftDoc = sameFile && same(prev.draftDoc, payload.draft.doc) ? prev.draftDoc : payload.draft.doc;
          const original = payload.draft.original ?? diskDoc ?? payload.draft.doc;
          draft = { original: sameFile && prev.draft && same(prev.draft.original, original) ? prev.draft.original : original, changedOnDisk: payload.draft.changedOnDisk };
        }
        return {
          ...prev,
          path: payload.path,
          file: payload.file,
          diskDoc,
          diskValid: payload.valid,
          diskIssues: payload.issues,
          draftDoc,
          draft,
          layout: payload.layout ?? null,
          review: payload.review ?? null,
          revision: prev.revision + 1,
          loaded: true,
        };
      });
    } catch {
      setInner((prev) => ({ ...prev, connected: false, loaded: true }));
    }
  }, []);

  const refreshFiles = useCallback(async () => {
    try {
      const files = (await (await fetch('api/files', { cache: 'no-store' })).json()) as DiagramFile[];
      setInner((prev) => ({ ...prev, files }));
    } catch {
      // The list is a convenience; the diagram itself still loads.
    }
  }, []);

  const saveLayout = useCallback((layout: LayoutFile) => {
    const target = loadedFile.current;
    setInner((prev) => ({ ...prev, layout }));
    void fetch(`api/layout?file=${encodeURIComponent(target)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(layout),
    })
      .then((res) => res.ok)
      .catch(() => false)
      .then((ok) => setInner((prev) => ({ ...prev, layoutSaved: ok })));
  }, []);

  /** Sends the queued draft now; resolves once every write so far has finished. */
  const flushDraft = useCallback((): Promise<void> => {
    clearTimeout(putTimer.current);
    const next = queued.current;
    queued.current = null;
    if (next) {
      putChain.current = putChain.current.then(() =>
        fetch(`api/draft?file=${encodeURIComponent(next.file)}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(next.doc) })
          .then((res) => res.ok)
          .catch(() => false)
          .then((ok) => setInner((prev) => ({ ...prev, draftSaved: ok }))),
      );
    }
    const chain = putChain.current;
    void chain.then(() => {
      if (putChain.current === chain && !queued.current) unsentFor.current = null;
    });
    return chain;
  }, []);

  const edit = useCallback(
    (e: Edit): string | null => {
      const s = latest.current;
      const base = s.draftDoc ?? s.diskDoc;
      if (!base) return 'There is no diagram to edit yet.';
      const original = s.draft?.original ?? base;
      const result = applyEdit(base, e, original);
      if (!result.ok) return result.reason;
      const draft = s.draft ?? { original, changedOnDisk: false };
      // Later edits in the same tick build on this one.
      latest.current = { ...s, draftDoc: result.doc, draft };
      setInner((prev) => ({ ...prev, draftDoc: result.doc, draft: prev.draft ?? draft }));
      queued.current = { file: loadedFile.current, doc: result.doc };
      unsentFor.current = loadedFile.current;
      clearTimeout(putTimer.current);
      putTimer.current = setTimeout(() => void flushDraft(), DRAFT_DEBOUNCE_MS);
      return null;
    },
    [flushDraft],
  );

  const discard = useCallback(() => {
    const target = loadedFile.current;
    clearTimeout(putTimer.current);
    queued.current = null;
    unsentFor.current = target;
    setInner((prev) => ({ ...prev, draftDoc: null, draft: null, draftSaved: true }));
    void putChain.current
      .then(() => fetch(`api/draft?file=${encodeURIComponent(target)}`, { method: 'DELETE', headers: JSON_HEADERS }))
      .catch(() => undefined)
      .then(() => {
        unsentFor.current = null;
        void refresh();
      });
  }, [refresh]);

  const pathOf = useCallback((name: string): string => {
    const s = latest.current;
    const folder = s.path.endsWith(s.file) ? s.path.slice(0, s.path.length - s.file.length) : '';
    return folder + name;
  }, []);

  const save = useCallback(async (): Promise<SaveResult> => {
    const s = latest.current;
    if (!s.draft || !s.draftDoc) return { ok: false, message: 'There are no edits to save.' };
    const target = loadedFile.current;
    const { original } = s.draft;
    const doc = s.draftDoc;
    await flushDraft();
    try {
      const res = await fetch(`api/save?file=${encodeURIComponent(target)}`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      const body = (await res.json()) as { review?: string | null; error?: string; issues?: Issue[] };
      if (!res.ok) {
        const first = body.issues?.find((i) => i.level === 'error');
        return { ok: false, message: first?.message ?? body.error ?? 'The diagram could not be saved.' };
      }
      const review = body.review ?? null;
      setInner((prev) => ({ ...prev, diskDoc: doc, diskValid: true, draftDoc: null, draft: null, review }));
      void refresh();
      return { ok: true, summary: summarizeEdits(original, doc, pathOf(target)), review };
    } catch {
      return { ok: false, message: 'The viewer lost its connection to agentic-fbd; nothing was saved.' };
    }
  }, [flushDraft, pathOf, refresh]);

  useEffect(() => {
    void refresh();
  }, [file, refresh]);

  useEffect(() => {
    void refreshFiles();
    const events = new EventSource('api/events');
    // Refetch on (re)connect too: changes may have happened while disconnected.
    events.onopen = () => {
      setInner((prev) => ({ ...prev, connected: true }));
      void refresh();
      void refreshFiles();
    };
    events.addEventListener('change', (e) => {
      let files: string[] | undefined;
      try {
        files = (JSON.parse((e as MessageEvent<string>).data) as { files?: string[] }).files;
      } catch {
        files = undefined;
      }
      void refreshFiles();
      if (!files || files.includes(loadedFile.current)) void refresh();
    });
    events.onerror = () => setInner((prev) => ({ ...prev, connected: false }));
    return () => events.close();
  }, [refresh, refreshFiles]);

  // While there is a draft, the diagram on screen is the draft, and so are its issues.
  const checked = useMemo(() => (inner.draftDoc ? validate(inner.draftDoc) : null), [inner.draftDoc]);

  return useMemo(() => {
    const { diskDoc, diskValid, diskIssues, draftDoc, ...rest } = inner;
    return {
      ...rest,
      doc: draftDoc ?? diskDoc,
      valid: checked ? checked.valid : diskValid,
      issues: checked ? checked.issues : diskIssues,
      saveLayout,
      edit,
      discard,
      save,
      pathOf,
    };
  }, [inner, checked, saveLayout, edit, discard, save, pathOf]);
}
