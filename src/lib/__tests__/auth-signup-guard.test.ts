import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEmailAllowed,
  disposableEmailBlockEnabled,
  disposableEmailGuard,
} from '@/lib/auth-signup-guard';

const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  delete env.AUTH_BLOCK_DISPOSABLE_EMAILS;
});

describe('assertEmailAllowed', () => {
  it('rejects a disposable address on /sign-up/email with a 400 APIError', () => {
    let caught: unknown;
    try {
      assertEmailAllowed('/sign-up/email', { email: 'x@mailinator.com' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(APIError);
    const apiErr = caught as APIError;
    expect(apiErr.statusCode).toBe(400);
    expect(apiErr.body?.message).toBe(
      'Disposable email addresses are not allowed.'
    );
  });

  it('rejects a disposable newEmail on /change-email', () => {
    expect(() =>
      assertEmailAllowed('/change-email', {
        newEmail: 'x@sub.guerrillamail.com',
      })
    ).toThrow(APIError);
  });

  it('lets a regular address through', () => {
    expect(() =>
      assertEmailAllowed('/sign-up/email', { email: 'x@example.com' })
    ).not.toThrow();
  });

  it('ignores unrelated paths, missing bodies and non-string fields', () => {
    expect(() =>
      assertEmailAllowed('/sign-in/email', { email: 'x@mailinator.com' })
    ).not.toThrow();
    expect(() => assertEmailAllowed('/sign-up/email', undefined)).not.toThrow();
    expect(() => assertEmailAllowed('/sign-up/email', null)).not.toThrow();
    expect(() =>
      assertEmailAllowed('/sign-up/email', { email: ['x@mailinator.com'] })
    ).not.toThrow();
  });

  it('is a no-op when disabled explicitly or via AUTH_BLOCK_DISPOSABLE_EMAILS', () => {
    expect(() =>
      assertEmailAllowed('/sign-up/email', { email: 'x@mailinator.com' }, false)
    ).not.toThrow();

    env.AUTH_BLOCK_DISPOSABLE_EMAILS = 'false';
    expect(disposableEmailBlockEnabled()).toBe(false);
    expect(() =>
      assertEmailAllowed('/sign-up/email', { email: 'x@mailinator.com' })
    ).not.toThrow();

    env.AUTH_BLOCK_DISPOSABLE_EMAILS = '0';
    expect(disposableEmailBlockEnabled()).toBe(false);

    env.AUTH_BLOCK_DISPOSABLE_EMAILS = 'true';
    expect(disposableEmailBlockEnabled()).toBe(true);
    delete env.AUTH_BLOCK_DISPOSABLE_EMAILS;
    expect(disposableEmailBlockEnabled()).toBe(true);
  });
});

describe('disposableEmailGuard', () => {
  it('is a Better Auth middleware (callable with a request context)', async () => {
    expect(typeof disposableEmailGuard).toBe('function');
    await expect(
      disposableEmailGuard({
        path: '/sign-up/email',
        body: { email: 'x@mailinator.com', password: 'secret123', name: 'X' },
        headers: new Headers(),
        method: 'POST',
        query: {},
        context: {},
      } as unknown as Parameters<typeof disposableEmailGuard>[0])
    ).rejects.toBeInstanceOf(APIError);
  });
});
