import {
  listUnsubscribeHeaders,
  signEmailToken,
  verifyEmailToken,
} from '../email-token';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const UID = '11111111-2222-4333-8444-555555555555';

describe('email tokens', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789ab';
    vi.useRealTimers();
  });

  it('round-trips a scoped token', () => {
    const payload = verifyEmailToken(signEmailToken(UID, 'marketing'));
    expect(payload?.uid).toBe(UID);
    expect(payload?.scope).toBe('marketing');
  });

  it('rejects a tampered payload', () => {
    const token = signEmailToken(UID, 'marketing');
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        uid: 'someone-else',
        scope: 'marketing',
        exp: Date.now() + 1000,
      })
    ).toString('base64url');
    expect(body).toBeDefined();
    expect(verifyEmailToken(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signEmailToken(UID, 'marketing');
    process.env.BETTER_AUTH_SECRET = 'a-completely-different-secret-value-here';
    expect(verifyEmailToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verifyEmailToken(signEmailToken(UID, 'marketing', -1))).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyEmailToken('')).toBeNull();
    expect(verifyEmailToken('no-dot')).toBeNull();
    expect(verifyEmailToken('a.b.c')).toBeNull();
    expect(verifyEmailToken('!!!.???')).toBeNull();
  });

  it('scopes the token to one channel', () => {
    const token = signEmailToken(UID, 'marketing');
    expect(verifyEmailToken(token)?.scope).toBe('marketing');
    // A different channel needs its own token — the scope is not a wildcard.
    expect(verifyEmailToken(signEmailToken(UID, 'digest'))?.scope).toBe(
      'digest'
    );
  });

  it('builds RFC 8058 one-click headers', () => {
    const headers = listUnsubscribeHeaders(
      'https://example.com/api/email/unsubscribe?t=x'
    );
    expect(headers['List-Unsubscribe']).toBe(
      '<https://example.com/api/email/unsubscribe?t=x>'
    );
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
