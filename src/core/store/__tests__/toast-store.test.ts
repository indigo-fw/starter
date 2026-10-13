import { toast, useToastStore } from '../toast-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = () => useToastStore.getState().toasts;

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  // Drain pending timers so a toast from one test can't vanish in the next.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('toast store', () => {
  it('keeps the legacy single-argument call signature', () => {
    toast.success('Saved');
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({
      message: 'Saved',
      type: 'success',
      timeout: 4000,
    });
  });

  it('auto-dismisses after the default timeout', () => {
    toast.info('Hello');
    vi.advanceTimersByTime(3999);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts()).toHaveLength(0);
  });

  it('gives error toasts a longer default timeout', () => {
    toast.error('Boom');
    vi.advanceTimersByTime(4000);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(toasts()).toHaveLength(0);
  });

  it('keeps timeout: 0 toasts until dismissed', () => {
    const id = toast.error('Persistent', { timeout: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toasts()).toHaveLength(1);
    toast.dismiss(id);
    expect(toasts()).toHaveLength(0);
  });

  it('updates a toast with the same id in place instead of stacking', () => {
    toast.info('Uploading 1/3', { id: 'upload' });
    toast.info('Uploading 2/3', { id: 'upload' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].message).toBe('Uploading 2/3');
  });

  it('restarts the timer when a toast is re-issued under the same id', () => {
    toast.info('first', { id: 'x' });
    vi.advanceTimersByTime(3000);
    toast.info('second', { id: 'x' });
    // The original 4 s deadline has passed, but the replacement is still fresh.
    vi.advanceTimersByTime(1500);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    expect(toasts()).toHaveLength(0);
  });

  it('preserves insertion order when updating a middle toast', () => {
    toast.info('a', { id: 'a' });
    toast.info('b', { id: 'b' });
    toast.info('c', { id: 'c' });
    toast.error('b2', { id: 'b' });
    expect(toasts().map((t) => t.message)).toEqual(['a', 'b2', 'c']);
  });

  it('carries an action through to the toast', () => {
    const onClick = vi.fn();
    toast.success('Deleted', { action: { label: 'Undo', onClick } });
    toasts()[0].action?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('manual dismiss cancels the pending auto-removal timer', () => {
    const id = toast.success('bye');
    useToastStore.getState().removeToast(id);
    toast.success('stay', { id });
    vi.advanceTimersByTime(4000 - 1);
    expect(toasts().map((t) => t.message)).toEqual(['stay']);
  });
});
