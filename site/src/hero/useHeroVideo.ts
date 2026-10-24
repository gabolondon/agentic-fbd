import { useEffect, useRef, useState } from 'react';
import { crossesHold, INTRO_HOLD, segmentAt, type SegmentId } from './segments.ts';

export type HeroLayout = 'wide' | 'tall';

const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

/** The hero video's layout, current segment and play state. `lang` picks the render whose
 *  speech bubbles match the page; a new language mounts a new video element. */
export function useHeroVideo(lang: string) {
  const ref = useRef<HTMLVideoElement>(null);
  // Chosen once: the tall render keeps the diagram in frame on a portrait phone.
  const [layout] = useState<HeroLayout>(() => (matches('(orientation: portrait)') ? 'tall' : 'wide'));
  const [reducedMotion] = useState(() => matches('(prefers-reduced-motion: reduce)'));
  const [segment, setSegment] = useState<SegmentId>('intro');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // The pending resume while the video holds on the intro; the video is paused but still "playing".
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let last = video.currentTime;
    // Once per loop: after the resume the video sits right on the hold point again.
    let held = false;
    const check = (now: number) => {
      if (now < INTRO_HOLD.at - 1) held = false;
      if (crossesHold(last, now) && !held) {
        held = true;
        hold.current = setTimeout(() => {
          hold.current = undefined;
          video.play().catch(() => setPlaying(false));
        }, INTRO_HOLD.seconds * 1000);
        video.pause();
      }
      last = now;
    };
    const onTime = () => {
      setSegment(segmentAt(video.currentTime));
      check(video.currentTime);
    };
    // Per-frame checks stop the video right on the hold point; timeupdate alone can be 250 ms late.
    let frame = 0;
    const onFrame = (_: number, meta: { mediaTime: number }) => {
      check(meta.mediaTime);
      frame = video.requestVideoFrameCallback(onFrame);
    };
    if ('requestVideoFrameCallback' in video) frame = video.requestVideoFrameCallback(onFrame);
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      if (hold.current === undefined) setPlaying(false);
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    // React doesn't write the muted attribute, and browsers only autoplay muted video.
    video.muted = true;
    if (!reducedMotion) video.play().catch(() => setPlaying(false));
    setPlaying(!video.paused);
    return () => {
      clearTimeout(hold.current);
      hold.current = undefined;
      if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(frame);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [reducedMotion, lang]);

  function toggle() {
    const video = ref.current;
    if (!video) return;
    // Pause pressed during the intro hold: cancel the resume, the video is already still.
    if (hold.current !== undefined) {
      clearTimeout(hold.current);
      hold.current = undefined;
      setPlaying(false);
      return;
    }
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
