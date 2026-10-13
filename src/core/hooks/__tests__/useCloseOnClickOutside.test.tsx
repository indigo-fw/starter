import { useCloseOnClickOutside } from '../useCloseOnClickOutside';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let panel: HTMLDivElement;
let inside: HTMLButtonElement;
let trigger: HTMLButtonElement;
let outside: HTMLDivElement;

beforeEach(() => {
  panel = document.createElement('div');
  inside = document.createElement('button');
  panel.appendChild(inside);
  trigger = document.createElement('button');
  outside = document.createElement('div');
  document.body.append(panel, trigger, outside);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useCloseOnClickOutside', () => {
  it('closes on mousedown outside, not inside', () => {
    const onClose = vi.fn();
    renderHook(() => useCloseOnClickOutside({ current: panel }, onClose));
    fireEvent.mouseDown(inside);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats excludeRefs as inside so a trigger button does not double-fire', () => {
    const onClose = vi.fn();
    renderHook(() =>
      useCloseOnClickOutside({ current: panel }, onClose, {
        excludeRefs: [{ current: trigger }],
      })
    );
    fireEvent.mouseDown(trigger);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled and attaches once enabled', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCloseOnClickOutside({ current: panel }, onClose, { enabled }),
      { initialProps: { enabled: false } }
    );
    fireEvent.mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    rerender({ enabled: true });
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onClose without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');
    // Stable ref object, as `useRef` would hand a real component.
    const panelRef = { current: panel };
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useCloseOnClickOutside(panelRef, cb),
      { initialProps: { cb: first } }
    );
    const count = addSpy.mock.calls.filter(([t]) => t === 'mousedown').length;
    rerender({ cb: second });
    fireEvent.mouseDown(outside);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls.filter(([t]) => t === 'mousedown').length).toBe(
      count
    );
    addSpy.mockRestore();
  });

  it('ignores events while the ref is unattached', () => {
    const onClose = vi.fn();
    renderHook(() => useCloseOnClickOutside({ current: null }, onClose));
    fireEvent.mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() =>
      useCloseOnClickOutside({ current: panel }, onClose)
    );
    unmount();
    fireEvent.mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });
});
