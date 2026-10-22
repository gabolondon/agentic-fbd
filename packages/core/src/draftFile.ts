import type { LogicDoc } from './format.ts';

// Edits made in the viewer are kept in a draft next to the diagram (`booking.logic.json` →
// `booking.draft.json`) until the user saves (design spec §6.9). If the diagram changed on disk
// meanwhile, the save keeps the other version as `booking.review.json` for the agent. Neither
// name ends in `.logic.json`, so neither is listed as a diagram. The agent never writes them.

export interface DraftFile {
  /** The diagram's text when editing started. */
  original: string;
  /** The edited document. */
  doc: LogicDoc;
}

const DIAGRAM_SUFFIX = '.logic.json';

function base(diagram: string): string {
  return diagram.endsWith(DIAGRAM_SUFFIX) ? diagram.slice(0, -DIAGRAM_SUFFIX.length) : diagram;
}

/** `subject.logic.json` → `subject.draft.json`. */
export function draftFileName(diagram: string): string {
  return `${base(diagram)}.draft.json`;
}

/** `subject.logic.json` → `subject.review.json`. */
export function reviewFileName(diagram: string): string {
  return `${base(diagram)}.review.json`;
}

/** Checks the shape of a parsed draft file; null if it isn't one. The doc is validated elsewhere. */
export function parseDraft(value: unknown): DraftFile | null {
  if (!isObject(value) || typeof value.original !== 'string') return null;
  const doc = value.doc;
  if (!isObject(doc) || !isObject(doc.subject) || !Array.isArray(doc.nodes)) return null;
  return { original: value.original, doc: doc as unknown as LogicDoc };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
