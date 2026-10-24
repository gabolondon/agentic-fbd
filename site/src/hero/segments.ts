// The hero video's segments. The HyperFrames composition (kept outside the repo) is built
// from these same start times, so the HTML titles switch with what the video shows.
export type SegmentId = 'intro' | 'b' | 'a' | 'c';

export const HERO_DURATION = 37;

export const SEGMENTS: readonly { id: SegmentId; start: number }[] = [
  { id: 'intro', start: 0 }, // the opening question over an empty canvas
  { id: 'b', start: 3 }, // code turns into logic
  { id: 'a', start: 15 }, // the diagram catches the bug
  { id: 'c', start: 26 }, // layer by layer
];

export function segmentAt(time: number): SegmentId {
  if (!Number.isFinite(time) || time < 0) return 'intro';
  const t = time % HERO_DURATION;
  let id: SegmentId = 'intro';
  for (const segment of SEGMENTS) if (segment.start <= t) id = segment.id;
  return id;
}
