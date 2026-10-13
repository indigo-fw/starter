/**
 * Better Auth `hooks.before` middleware that rejects disposable email
 * addresses on the paths that set a user's email. Pure decision logic lives
 * in `assertEmailAllowed` so it is unit-testable without the Better Auth
 * request plumbing.
 *
 * Opt out with AUTH_BLOCK_DISPOSABLE_EMAILS=false (declared in src/lib/env.ts;
 * read raw here because auth.ts also loads where the server-only env module
 * can't). Extend the list from a deps file with `addDisposableDomains()`.
 */
import { APIError, createAuthMiddleware } from 'better-auth/api';

import {
  DISPOSABLE_EMAIL_MESSAGE,
  isDisposableEmail,
} from '@/core/lib/auth/disposable-email';

/** Better Auth endpoint path → request-body field carrying the new address. */
const EMAIL_FIELD_BY_PATH: Record<string, string> = {
  '/sign-up/email': 'email',
  '/change-email': 'newEmail',
};

export function disposableEmailBlockEnabled(): boolean {
  const raw = process.env.AUTH_BLOCK_DISPOSABLE_EMAILS;
  return raw !== 'false' && raw !== '0';
}

/**
 * Throws Better Auth's `APIError('BAD_REQUEST')` when `path` is an
 * email-setting endpoint and the submitted address is disposable. Any other
 * path, a missing body or a non-string field is a no-op — format validation
 * belongs to Better Auth's own schema.
 */
export function assertEmailAllowed(
  path: string,
  body: unknown,
  enabled = disposableEmailBlockEnabled()
): void {
  if (!enabled) return;
  const field = EMAIL_FIELD_BY_PATH[path];
  if (!field || typeof body !== 'object' || body === null) return;
  const email = (body as Record<string, unknown>)[field];
  if (isDisposableEmail(email)) {
    throw new APIError('BAD_REQUEST', { message: DISPOSABLE_EMAIL_MESSAGE });
  }
}

export const disposableEmailGuard = createAuthMiddleware(async (ctx) => {
  assertEmailAllowed(ctx.path, ctx.body);
});
