import { expect, test } from 'vitest';
import { HERO_DURATION, segmentAt, SEGMENTS } from '../src/hero/segments.ts';

test('segments start at 0, 3, 12 and 21 s in a 30 s loop', () => {
  expect(SEGMENTS.map((s) => [s.id, s.start])).toEqual([['intro', 0], ['b', 3], ['a', 12], ['c', 21]]);
  expect(HERO_DURATION).toBe(30);
});

test.each([
  [0, 'intro'], [2.99, 'intro'], [3, 'b'], [11.9, 'b'], [12, 'a'], [21, 'c'], [29.9, 'c'], [30, 'intro'], [33.5, 'b'],
] as const)('at %s s the segment is %s', (time, id) => {
  expect(segmentAt(time)).toBe(id);
});

test.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('a bad time (%s) gives the intro', (time) => {
  expect(segmentAt(time)).toBe('intro');
});
