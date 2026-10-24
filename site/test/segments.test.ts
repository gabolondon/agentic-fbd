import { expect, test } from 'vitest';
import { crossesHold, HERO_DURATION, INTRO_HOLD, segmentAt, SEGMENTS } from '../src/hero/segments.ts';

test('segments start at 0, 3, 15 and 26 s in a 37 s loop', () => {
  expect(SEGMENTS.map((s) => [s.id, s.start])).toEqual([['intro', 0], ['b', 3], ['a', 15], ['c', 26]]);
  expect(HERO_DURATION).toBe(37);
});

test.each([
  [0, 'intro'], [2.99, 'intro'], [3, 'b'], [14.9, 'b'], [15, 'a'], [26, 'c'], [36.9, 'c'], [37, 'intro'], [40.5, 'b'],
] as const)('at %s s the segment is %s', (time, id) => {
  expect(segmentAt(time)).toBe(id);
});

test('the intro holds at 2.2 s for 5 s', () => {
  expect(INTRO_HOLD).toEqual({ at: 2.2, seconds: 5 });
});

test.each([
  [2.1, 2.2, true], [2.0, 2.45, true], [2.2, 2.3, false], [0, 5, false], [36.9, 0.1, false], [2.1, 2.19, false],
] as const)('from %s s to %s s crosses the hold: %s', (previous, now, crosses) => {
  expect(crossesHold(previous, now)).toBe(crosses);
});

test.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('a bad time (%s) gives the intro', (time) => {
  expect(segmentAt(time)).toBe('intro');
});
