import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LogicDoc } from '@agentic-fbd/core';
import { buildTree, type TreeItem } from '../src/state/lookup.ts';

const examples = resolve(import.meta.dirname, '../../../skills/agentic-fbd/examples');
const design = JSON.parse(readFileSync(join(examples, 'other-free-text.logic.json'), 'utf8')) as LogicDoc;

const find = (items: TreeItem[], label: string): TreeItem | undefined => {
  for (const item of items) {
    if (item.label === label) return item;
    const inner = find(item.children, label);
    if (inner) return inner;
  }
  return undefined;
};

describe('buildTree', () => {
  const tree = buildTree(design);

  it('mirrors the group hierarchy', () => {
    expect(tree.map((t) => t.label)).toEqual(['Wizard', 'Save answer', 'answers (store)', 'Review', 'POST /questionnaire', 'Answer saved']);
    expect(find(tree, 'Wizard')!.children.map((c) => c.label)).toEqual(['Step: Vaccinations', 'Step: Known conditions']);
  });

  it('makes groups and instances levels, and leaves select a node at their level', () => {
    expect(find(tree, 'Step: Vaccinations')).toMatchObject({ isLevel: true, path: ['vaccines'] });
    expect(find(tree, 'Click option')).toMatchObject({ isLevel: false, path: ['vaccines'], select: { scope: '', id: 't-select' } });
    expect(find(tree, 'Other: add vaccine')).toMatchObject({ isLevel: true, path: ['other-vaccines'] });
    expect(find(tree, 'Has text?')).toMatchObject({ path: ['other-vaccines'], select: { scope: 'OtherOption', id: 'dec' } });
  });

  it('marks unexplored groups and changes', () => {
    expect(find(tree, 'Step: Known conditions')).toMatchObject({ isLevel: false, unexplored: true });
    expect(find(tree, "Type in 'Other'")!.mark).toBe('new');
    expect(find(tree, 'Review')).toMatchObject({ mark: 'modified', risk: true });
  });

  it('skips pins', () => {
    expect(find(tree, 'selected')).toBeUndefined();
  });
});
