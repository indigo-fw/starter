import { type Shortcut, useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

function press(
  target: Element | Document | Window,
  key: string,
  init: KeyboardEventInit = {}
) {
  return fireEvent.keyDown(target, { key, ...init });
}

describe('useKeyboardShortcuts', () => {
  it('fires a matching binding and prevents default', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 's', ctrl: true, handler }]));
    const notPrevented = press(document.body, 's', { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it('skips bare keys while typing in a form control', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: '/', handler }]));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, '/');
    expect(handler).not.toHaveBeenCalled();
    press(document.body, '/');
    expect(handler).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('still fires modified shortcuts inside a textarea (Ctrl+S saves)', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 's', ctrl: true, handler }]));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    press(textarea, 's', { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it('lets a bare key opt into inputs with allowInInputs', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', allowInInputs: true, handler }])
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, 'Escape');
    expect(handler).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('reads the latest bindings without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { rerender } = renderHook(
      ({ shortcuts }: { shortcuts: Shortcut[] }) =>
        useKeyboardShortcuts(shortcuts),
      { initialProps: { shortcuts: [{ key: 'a', handler: first }] } }
    );
    const subscriptions = addSpy.mock.calls.filter(
      ([type]) => type === 'keydown'
    ).length;
    rerender({ shortcuts: [{ key: 'a', handler: second }] });
    press(document.body, 'a');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(
      addSpy.mock.calls.filter(([type]) => type === 'keydown').length
    ).toBe(subscriptions);
    addSpy.mockRestore();
  });

  it('suspends all bindings when enabled is false', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useKeyboardShortcuts([{ key: 'k', ctrl: true, handler }], { enabled }),
      { initialProps: { enabled: false } }
    );
    press(document.body, 'k', { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
    rerender({ enabled: true });
    press(document.body, 'k', { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('matches shift and meta modifiers exactly', () => {
    const plain = vi.fn();
    const shifted = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'p', ctrl: true, handler: plain },
        { key: 'p', ctrl: true, shift: true, handler: shifted },
      ])
    );
    press(document.body, 'P', { metaKey: true, shiftKey: true });
    expect(shifted).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });
});
