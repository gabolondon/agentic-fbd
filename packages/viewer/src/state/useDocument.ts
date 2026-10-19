import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issue, LogicDoc } from '@logic-builder/core';

export interface DocState {
  /** The file path as passed to `logic-builder open`. */
  path: string;
  /** Last document that parsed; kept on screen while the file is invalid. */
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
  /** Bumped on every successful fetch, so views can react to reloads. */
  revision: number;
  connected: boolean;
  loaded: boolean;
}

const INITIAL: DocState = { path: '', doc: null, valid: true, issues: [], revision: 0, connected: false, loaded: false };

interface Payload {
  path: string;
  doc: LogicDoc | null;
  valid: boolean;
  issues: Issue[];
}

/** Loads the document from the local server and refetches on every change event. */
export function useDocument(): DocState {
  const [state, setState] = useState<DocState>(INITIAL);
  const inFlight = useRef(0);

  const refresh = useCallback(async () => {
    const ticket = ++inFlight.current;
    try {
      const res = await fetch('api/doc', { cache: 'no-store' });
      const payload = (await res.json()) as Payload;
      if (ticket !== inFlight.current) return;
      setState((prev) => ({
        path: payload.path,
        doc: payload.doc ?? prev.doc,
        valid: payload.valid,
        issues: payload.issues,
        revision: prev.revision + 1,
        connected: prev.connected,
        loaded: true,
      }));
    } catch {
      setState((prev) => ({ ...prev, connected: false, loaded: true }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const events = new EventSource('api/events');
    // Refetch on (re)connect too: changes may have happened while disconnected.
    events.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
      void refresh();
    };
    events.addEventListener('change', () => void refresh());
    events.onerror = () => setState((prev) => ({ ...prev, connected: false }));
    return () => events.close();
  }, [refresh]);

  return state;
}
