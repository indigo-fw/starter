import { useHydrated } from '../useHydrated';
import { cleanup, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

function Probe() {
  return <span>{useHydrated() ? 'client' : 'server'}</span>;
}

describe('useHydrated', () => {
  it('is false on the server render', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('flips to true after mount', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });
});
