'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface LongPressOptions {
  /** Hold duration before firing (ms). */
  delay?: number;
  /** Finger travel (px) that cancels the press — treat it as a scroll/drag. */
  moveTolerance?: number;
}

/**
 * Touch long-press detector ("hold to react"). Fires `onLongPress` after
 * `delay` ms of a stationary touch; cancels on move/end/cancel. Touch-only by
 * design — desktop uses hover affordances, and reacting to a slow mouse click
 * would misfire constantly. Spread the result onto the element.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10 }: LongPressOptions = {}
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      fired.current = false;
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        callbackRef.current();
        clear();
      }, delay);
    },
    [delay, clear]
  );

  // The press already acted, so swallow the click the browser synthesizes from
  // this touch — otherwise it lands outside whatever just opened and closes it.
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (fired.current) e.preventDefault();
      clear();
    },
    [clear]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t || !start.current) return;
      const dx = Math.abs(t.clientX - start.current.x);
      const dy = Math.abs(t.clientY - start.current.y);
      if (dx > moveTolerance || dy > moveTolerance) clear();
    },
    [moveTolerance, clear]
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: clear,
  };
}
