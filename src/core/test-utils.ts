/**
 * Type-safe mock cast for bun's test runner.
 * Replaces vitest's `vi.mocked()` which isn't available in bun.
 *
 * Usage:
 *   asMock(someFunction).mockReturnValue(42);
 *   asMock(someFunction).mockResolvedValue('hello');
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asMock(fn: unknown): any {
  return fn;
}
