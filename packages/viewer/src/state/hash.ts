import type { ViewMode, ViewPath } from '@agentic-fbd/core';

// The current diagram, level and mode live in the URL hash:
// #/vaccines/other-vaccines?mode=before&file=other.logic.json

export interface Location {
  path: ViewPath;
  mode: ViewMode;
  /** A sibling diagram by name; undefined means the file `open` was started with. */
  file?: string;
  /** false when the hash was empty, so the app may start at subject.focus. */
  explicit: boolean;
}

export function readHash(hash: string = window.location.hash): Location {
  const raw = hash.replace(/^#/, '');
  if (!raw) return { path: [], mode: 'after', explicit: false };
  const [pathPart = '', query = ''] = raw.split('?');
  const path = pathPart
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
  const params = new URLSearchParams(query);
  const mode = params.get('mode') === 'before' ? 'before' : 'after';
  return { path, mode, file: params.get('file') ?? undefined, explicit: true };
}

export function writeHash(path: ViewPath, mode: ViewMode, file?: string): void {
  const params = new URLSearchParams();
  if (mode === 'before') params.set('mode', 'before');
  if (file) params.set('file', file);
  const query = params.toString();
  const next = `#/${path.map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}
