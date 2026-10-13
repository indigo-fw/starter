import { NextResponse } from 'next/server';

import { setChannelEnabled } from '@/core/lib/email/channels';
import { verifyEmailToken } from '@/core/lib/email/email-token';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('unsubscribe');

export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe (RFC 8058) + the human-visible link.
 *
 * Deliberately unauthenticated: the recipient's mail provider POSTs this URL
 * from its own servers, with no cookies and nobody watching. Authority comes
 * from the HMAC token, which is scoped to one user and one channel — the worst
 * a leaked link can do is mute that channel.
 *
 * POST is what providers call and must act immediately. GET is the link in the
 * message body; it also acts, because a "click here to confirm" step is
 * exactly the friction that makes people press "report spam" instead.
 */
async function unsubscribe(
  request: Request
): Promise<{ ok: boolean; channel?: string }> {
  const url = new URL(request.url);
  let token = url.searchParams.get('token');

  // Some providers post the parameters as a form body instead of keeping them
  // on the URL, so accept both.
  if (!token && request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData().catch(() => null);
      const field = form?.get('token');
      if (typeof field === 'string') token = field;
    }
  }

  if (!token) return { ok: false };

  const payload = verifyEmailToken(token);
  if (!payload) return { ok: false };

  try {
    await setChannelEnabled(payload.uid, payload.scope, false);
    log.info('Unsubscribed', { channel: payload.scope });
    return { ok: true, channel: payload.scope };
  } catch (err: unknown) {
    log.error('Failed to record unsubscribe', {
      channel: payload.scope,
      error: String(err),
    });
    return { ok: false };
  }
}

export async function POST(request: Request): Promise<Response> {
  const { ok } = await unsubscribe(request);
  // Providers only read the status code.
  return new NextResponse(null, { status: ok ? 200 : 400 });
}

export async function GET(request: Request): Promise<Response> {
  const { ok, channel } = await unsubscribe(request);

  const title = ok
    ? 'You have been unsubscribed'
    : 'This link is no longer valid';
  const body = ok
    ? `You will no longer receive ${channel} email from us. You can turn this back on in your account settings at any time.`
    : 'The link may have expired or already been used. Sign in and update your email preferences in account settings.';

  // Self-contained page: an unsubscribe confirmation must render even when the
  // reader is signed out on a device that has never loaded the app.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 0; min-height: 100vh;
         display: grid; place-items: center; background: #f6f6f8; color: #1a1a22; padding: 1.5rem; }
  main { max-width: 32rem; background: #fff; padding: 2rem; border-radius: .75rem;
         box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
  h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
  p { margin: 0; color: #4a4a5a; }
  @media (prefers-color-scheme: dark) {
    body { background: #14141a; color: #e8e8ef; }
    main { background: #1d1d26; box-shadow: none; }
    p { color: #a9a9bb; }
  }
</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
