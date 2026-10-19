import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issue, LogicDoc, Mode } from '@logic-builder/core';

export interface DiagramFile {
  file: string;
  title: string;
  mode?: Mode;
  /** The file `open` was started with. */
  opened: boolean;
}

export interface DocState {
  /** The file path as passed to `logic-builder open` (or the sibling's name). */
  path: string;
  /** The file's name in its folder; links and the URL use it. */
  file: string;
  /** Last document that parsed; kept on screen while the file is invalid. */
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
  /** Bumped on every successful fetch, so views can react to reloads. */
  revision: number;
  connected: boolean;
  loaded: boolean;
  /** Every diagram in the same folder. */
  files: DiagramFile[];
}

const INITIAL: DocState = { path: '', file: '', doc: null, valid: true, issues: [], revision: 0, connected: false, loaded: false, files: [] };

interface Payload {
  path: string;
  file: string;
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
}

/**
 * Loads one diagram from the local server (the opened file when `file` is undefined) and
 * refetches when it changes on disk. Also keeps the list of diagrams in the folder.
 */
export function useDocument(file?: string): DocState {
  const [state, setState] = useState<DocState>(INITIAL);
  const inFlight = useRef(0);
  const current = useRef<string | undefined>(file);
  current.current = file;
  /** Name of the diagram on screen, to filter change events. */
  const loadedFile = useRef('');

  const refresh = useCallback(async () => {
    const ticket = ++inFlight.current;
    const wanted = current.current;
    try {
      const res = await fetch(wanted ? `api/doc?file=${encodeURIComponent(wanted)}` : 'api/doc', { cache: 'no-store' });
      const payload = (await res.json()) as Payload;
      if (ticket !== inFlight.current) return;
      loadedFile.current = payload.file;
      setState((prev) => {
        // Switching diagrams must not keep the previous diagram on screen.
        const same = prev.file === payload.file;
        return {
          ...prev,
          path: payload.path,
          file: payload.file,
          doc: payload.doc ?? (same ? prev.doc : null),
          valid: payload.valid,
          issues: payload.issues,
          revision: prev.revision + 1,
          loaded: true,
        };
      });
    } catch {
      setState((prev) => ({ ...prev, connected: false, loaded: true }));
    }
  }, []);

  const refreshFiles = useCallback(async () => {
    try {
      const files = (await (await fetch('api/files', { cache: 'no-store' })).json()) as DiagramFile[];
      setState((prev) => ({ ...prev, files }));
    } catch {
      // The list is a convenience; the diagram itself still loads.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [file, refresh]);

  useEffect(() => {
    void refreshFiles();
    const events = new EventSource('api/events');
    // Refetch on (re)connect too: changes may have happened while disconnected.
    events.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
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
    events.onerror = () => setState((prev) => ({ ...prev, connected: false }));
    return () => events.close();
  }, [refresh, refreshFiles]);

  return state;
}
