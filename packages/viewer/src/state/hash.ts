import type { ViewMode, ViewPath } from '@logic-builder/core';

// The current level and mode live in the URL hash: #/vaccines/other-vaccines?mode=before

export interface Location {
  path: ViewPath;
  mode: ViewMode;
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
  const mode = new URLSearchParams(query).get('mode') === 'before' ? 'before' : 'after';
  return { path, mode, explicit: true };
}

export function writeHash(path: ViewPath, mode: ViewMode): void {
  const next = `#/${path.map(encodeURIComponent).join('/')}${mode === 'before' ? '?mode=before' : ''}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}
