import type { ViewNode } from '@logic-builder/core';

// Node geometry is computed, not measured, so layout runs in one pass (and in Node for tests).
// The React components use the same constants to place handles.

export const HEADER = 32;
export const PORT_GAP = 20;
export const PORT_FIRST = HEADER + 12;
export const FOOTER = 10;
export const BOX_FOOTER = 18;
export const PIN_HEIGHT = 36;
export const FLAG_HEIGHT = 26;
/** Longer connector labels are cut with an ellipsis; the full name is in the tooltip. */
export const MAX_FLAG_CHARS = 28;
export const STATE_HEIGHT = 46;
export const FRAME_PADDING = { top: 34, left: 18, bottom: 18, right: 18 };

const CHAR = 7.4;
const SMALL_CHAR = 6.4;

export interface Size {
  width: number;
  height: number;
}

export function nodeSize(n: ViewNode): Size {
  if (n.type === 'pin') {
    return { width: Math.max(110, Math.ceil(n.label.length * SMALL_CHAR) + 44), height: PIN_HEIGHT };
  }
  if (n.type === 'connector') {
    return { width: Math.max(72, Math.ceil(Math.min(n.label.length, MAX_FLAG_CHARS) * SMALL_CHAR) + 46), height: FLAG_HEIGHT };
  }
  if (n.kind === 'state') {
    return { width: Math.max(140, Math.ceil(n.label.length * CHAR) + 52), height: STATE_HEIGHT };
  }
  const rows = Math.max(n.inputs.length, n.outputs.length, 1);
  const longest = (ports: ViewNode['inputs']): number => Math.max(0, ...ports.map((p) => p.label.length));
  const portsWidth = (longest(n.inputs) + longest(n.outputs)) * SMALL_CHAR + 48;
  const labelWidth = n.label.length * CHAR + 56;
  const width = Math.ceil(Math.max(160, labelWidth, portsWidth));
  const height = PORT_FIRST + (rows - 1) * PORT_GAP + FOOTER + 8 + (n.type === 'box' ? BOX_FOOTER : 0);
  return { width, height };
}

/** Y offset of the i-th port of a node, from its top edge. */
export function portY(n: ViewNode, index: number): number {
  if (n.type === 'pin') return PIN_HEIGHT / 2;
  if (n.type === 'connector') return FLAG_HEIGHT / 2;
  if (n.kind === 'state') return STATE_HEIGHT / 2;
  return PORT_FIRST + index * PORT_GAP;
}
