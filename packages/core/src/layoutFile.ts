// The arrangement a person made by dragging blocks in the viewer. It lives next to the diagram
// (`auth-gate.logic.json` → `auth-gate.layout.json`), is written only by the viewer, and is
// optional: whatever it doesn't place, the automatic layout does.

export const LAYOUT_VERSION = '0.1';

export interface SavedPosition {
  x: number;
  y: number;
}

export interface LayoutFile {
  version: string;
  /**
   * One entry per level, keyed by the level's path joined with "/" ("" is the top level). Each
   * maps a view node id to its position relative to the frame that contains it.
   */
  levels: Record<string, Record<string, SavedPosition>>;
}

const DIAGRAM_SUFFIX = '.logic.json';

/** `subject.logic.json` → `subject.layout.json`. */
export function layoutFileName(diagram: string): string {
  const base = diagram.endsWith(DIAGRAM_SUFFIX) ? diagram.slice(0, -DIAGRAM_SUFFIX.length) : diagram;
  return `${base}.layout.json`;
}

/** The key of a level in `levels`. */
export function levelKey(path: readonly string[]): string {
  return path.join('/');
}

const MAX_COORD = 1e6;

/** Checks and cleans a parsed layout file; null if it isn't one. Unknown fields are dropped. */
export function parseLayout(value: unknown): LayoutFile | null {
  if (!isObject(value) || !isObject(value.levels)) return null;
  const levels: LayoutFile['levels'] = {};
  for (const [key, entries] of Object.entries(value.levels)) {
    if (!isObject(entries)) return null;
    const level: Record<string, SavedPosition> = {};
    for (const [id, pos] of Object.entries(entries)) {
      if (!isObject(pos) || !isCoord(pos.x) || !isCoord(pos.y)) return null;
      level[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    if (Object.keys(level).length > 0) levels[key] = level;
  }
  return { version: LAYOUT_VERSION, levels };
}

/** Stable, diff-friendly text: sorted keys, one position per line. */
export function formatLayout(layout: LayoutFile): string {
  const levels = Object.keys(layout.levels)
    .sort()
    .map((key) => {
      const level = layout.levels[key]!;
      const rows = Object.keys(level)
        .sort()
        .map((id) => `      ${JSON.stringify(id)}: { "x": ${level[id]!.x}, "y": ${level[id]!.y} }`);
      return `    ${JSON.stringify(key)}: {\n${rows.join(',\n')}\n    }`;
    });
  const body = levels.length ? `{\n${levels.join(',\n')}\n  }` : '{}';
  return `{\n  "version": ${JSON.stringify(LAYOUT_VERSION)},\n  "levels": ${body}\n}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD;
}
