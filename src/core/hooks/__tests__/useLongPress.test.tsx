import { useLongPress } from '../useLongPress';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function touch(x: number, y: number, extra: Partial<React.TouchEvent> = {}) {
  return {
    touches: [{ clientX: x, clientY: y }],
    preventDefault: vi.fn(),
    ...extra,
  } as unknown as React.TouchEvent;
}

describe('useLongPress', () => {
  it('fires after the delay for a stationary touch', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useLongPress(cb, { delay: 300 }));
    act(() => result.current.onTouchStart(touch(10, 10)));
    act(() => vi.advanceTimersByTime(299));
    expect(cb).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels when the finger lifts early', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useLongPress(cb, { delay: 300 }));
    act(() => result.current.onTouchStart(touch(10, 10)));
    act(() => result.current.onTouchEnd(touch(10, 10)));
    act(() => vi.advanceTimersByTime(1000));
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancels when the finger moves beyond the tolerance (scroll)', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(cb, { delay: 300, moveTolerance: 10 })
    );
    act(() => result.current.onTouchStart(touch(10, 10)));
    act(() => result.current.onTouchMove(touch(15, 10)));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.onTouchMove(touch(40, 10)));
    act(() => vi.advanceTimersByTime(1000));
    expect(cb).not.toHaveBeenCalled();
  });

  it('swallows the synthesized click only after a fired press', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useLongPress(cb, { delay: 300 }));

    const short = touch(0, 0);
    act(() => result.current.onTouchStart(short));
    act(() => result.current.onTouchEnd(short));
    expect(short.preventDefault).not.toHaveBeenCalled();

    const long = touch(0, 0);
    act(() => result.current.onTouchStart(long));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.onTouchEnd(long));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(long.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback without changing handler identity', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useLongPress(cb),
      {
        initialProps: { cb: first },
      }
    );
    const start = result.current.onTouchStart;
    rerender({ cb: second });
    expect(result.current.onTouchStart).toBe(start);
    act(() => result.current.onTouchStart(touch(0, 0)));
    act(() => vi.advanceTimersByTime(450));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
