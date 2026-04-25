// Empty stub — replaces the `server-only` package in vitest.
// The real package throws when loaded outside Next.js webpack's react-server
// condition, which trips vitest (jsdom env, no react-server condition).
// Server-side modules in tests genuinely need to load; the build-time guard
// from the real package still applies during `next build`.
export {};
