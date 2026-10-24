import { useEffect, useRef, useState } from 'react';
import { segmentAt, type SegmentId } from './segments.ts';

export type HeroLayout = 'wide' | 'tall';

const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

/** The hero video's layout, current segment and play state. */
export function useHeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  // Chosen once: the tall render keeps the diagram in frame on a portrait phone.
  const [layout] = useState<HeroLayout>(() => (matches('(orientation: portrait)') ? 'tall' : 'wide'));
  const [reducedMotion] = useState(() => matches('(prefers-reduced-motion: reduce)'));
  const [segment, setSegment] = useState<SegmentId>('intro');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onTime = () => setSegment(segmentAt(video.currentTime));
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    // React doesn't write the muted attribute, and browsers only autoplay muted video.
    video.muted = true;
    if (!reducedMotion) video.play().catch(() => setPlaying(false));
    setPlaying(!video.paused);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [reducedMotion]);

  function toggle() {
    const video = ref.current;
    if (!video) return;
    // play() rejects when the media is missing or the browser blocks it; the poster stays.
    if (video.paused) video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  // The last <source> failing means no format loaded: the ink background and titles stay.
  function onSourceError() {
    setFailed(true);
    setPlaying(false);
  }

  return { ref, layout, reducedMotion, segment, playing, failed, toggle, onSourceError };
}
