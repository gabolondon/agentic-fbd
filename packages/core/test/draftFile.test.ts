import { describe, expect, it } from 'vitest';
import { draftFileName, parseDraft, reviewFileName } from '../src/index.ts';

const doc = { version: '0.1', subject: { id: 's', title: 'S', intent: 'I', mode: 'design' }, nodes: [], wires: [] };

describe('draft file', () => {
  it('draftFileName/reviewFileName strip .logic.json', () => {
    expect(draftFileName('booking.logic.json')).toBe('booking.draft.json');
    expect(reviewFileName('booking.logic.json')).toBe('booking.review.json');
    expect(draftFileName('notes.json')).toBe('notes.json.draft.json');
    expect(reviewFileName('notes.json')).toBe('notes.json.review.json');
  });

  it('parseDraft keeps the original text and the edited doc', () => {
    expect(parseDraft({ original: '{}', doc })).toEqual({ original: '{}', doc });
  });

  it('parseDraft rejects missing original or doc', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ doc })).toBeNull();
    expect(parseDraft({ original: 1, doc })).toBeNull();
    expect(parseDraft({ original: '{}' })).toBeNull();
    expect(parseDraft({ original: '{}', doc: { subject: {} } })).toBeNull();
    expect(parseDraft({ original: '{}', doc: [] })).toBeNull();
  });
});
