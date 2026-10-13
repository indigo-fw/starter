import {
  alertSignature,
  sendStaffAlert,
  visibleAlertPayload,
} from '../staff-alert';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit, enqueueTemplateEmail, warn, error } = vi.hoisted(
  () => ({
    checkRateLimit: vi.fn(),
    enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn(),
    error: vi.fn(),
  })
);

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error }),
}));
vi.mock('@/core/lib/infra/rate-limit', () => ({ checkRateLimit }));
vi.mock('@/core/lib/infra/redis', () => ({
  getRequestRedis: () => ({ kind: 'request' }),
}));
vi.mock('@/core/lib/email/queue', () => ({ enqueueTemplateEmail }));

const ALLOWED = { allowed: true, remaining: 1, retryAfterMs: 0 };
const BLOCKED = { allowed: false, remaining: 0, retryAfterMs: 1000 };

describe('alertSignature', () => {
  it('collapses ids, amounts and quoted values so one fault is one signature', () => {
    const a = alertSignature(
      'stripe-webhook',
      new Error(
        'No org for customer cus_Abc123 (event evt_9f8e7d, amount 1999)'
      )
    );
    const b = alertSignature(
      'stripe-webhook',
      new Error('No org for customer cus_Zyx987 (event evt_1a2b3c, amount 500)')
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^stripe-webhook:[0-9a-f]{16}$/);
  });

  it('separates different faults and different sources', () => {
    const err = new Error('relation "orders" does not exist');
    expect(alertSignature('stripe-webhook', err)).not.toBe(
      alertSignature('stripe-webhook', new Error('column "x" does not exist'))
    );
    expect(alertSignature('stripe-webhook', err)).not.toBe(
      alertSignature('nowpayments-webhook', err)
    );
  });
});

describe('visibleAlertPayload', () => {
  it('strips transport and secret fields and truncates to 4 KB', () => {
    const out = visibleAlertPayload({
      id: 'evt_1',
      __rawBody: 'RAW_BODY_VALUE',
      headers: { 'stripe-signature': 'x' },
      metadata: { type: 'store_order', apiKey: 'sk_live' },
      accessToken: 'tok',
      tokens: 50,
      blob: 'x'.repeat(10_000),
    });
    expect(out).toContain('"id": "evt_1"');
    expect(out).not.toContain('RAW_BODY_VALUE');
    expect(out).not.toContain('stripe-signature');
    expect(out).not.toContain('sk_live');
    expect(out).not.toContain('"tok"');
    expect(out).toContain('"tokens": 50');
    expect(out.length).toBeLessThanOrEqual(4_096);
  });
});

describe('sendStaffAlert', () => {
  const ORIGINAL_ENV = process.env.STAFF_ALERT_EMAILS;

  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue(ALLOWED);
    process.env.STAFF_ALERT_EMAILS = 'ops@example.com, cto@example.com';
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.STAFF_ALERT_EMAILS;
    else process.env.STAFF_ALERT_EMAILS = ORIGINAL_ENV;
  });

  it('mails every configured address with the stripped payload', async () => {
    await sendStaffAlert(
      'stripe-webhook',
      new Error('boom'),
      { id: 'evt_1', __rawBody: 'secret' },
      { kind: 'processor', diagnostics: { stripeEventId: 'evt_1' } }
    );
    expect(enqueueTemplateEmail).toHaveBeenCalledTimes(1);
    const [to, template, vars] = enqueueTemplateEmail.mock.calls[0]!;
    expect(to).toEqual(['ops@example.com', 'cto@example.com']);
    expect(template).toBe('staff-alert');
    expect(vars.error).toBe('boom');
    expect(vars.payload).not.toContain('secret');
    expect(vars.diagnostics).toContain('evt_1');
  });

  it('throttles repeats of one signature to one mail per window', async () => {
    checkRateLimit
      .mockResolvedValueOnce(ALLOWED)
      .mockResolvedValueOnce(BLOCKED);
    await sendStaffAlert(
      's',
      new Error('fault id=1'),
      {},
      { kind: 'processor' }
    );
    await sendStaffAlert(
      's',
      new Error('fault id=2'),
      {},
      { kind: 'processor' }
    );

    expect(enqueueTemplateEmail).toHaveBeenCalledTimes(1);
    // Both calls hit the limiter under the same key.
    expect(checkRateLimit.mock.calls[0]![1]).toBe(
      checkRateLimit.mock.calls[1]![1]
    );
    expect(checkRateLimit.mock.calls[0]![1]).toMatch(
      /^staff-alert:processor:s:/
    );
    expect(warn).toHaveBeenLastCalledWith(
      'Staff alert',
      expect.objectContaining({ emailed: false, suppressed: 'duplicate' })
    );
  });

  it('caps unverified traffic with a shared 20/15min budget, checked after the signature', async () => {
    checkRateLimit
      .mockResolvedValueOnce(ALLOWED) // per-signature
      .mockResolvedValueOnce(BLOCKED); // shared cap
    await sendStaffAlert('s', new Error('bad sig'), 'raw', {
      kind: 'unverified',
    });

    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit.mock.calls[1]![1]).toBe('staff-alert:unverified-cap');
    expect(checkRateLimit.mock.calls[1]![2]).toEqual({
      windowMs: 15 * 60_000,
      maxRequests: 20,
    });
    expect(warn).toHaveBeenLastCalledWith(
      'Staff alert',
      expect.objectContaining({ suppressed: 'unverified-cap' })
    );
  });

  it('does not touch the shared cap for verified (processor) alerts', async () => {
    await sendStaffAlert('s', new Error('x'), {}, { kind: 'processor' });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit.mock.calls[0]![2]).toEqual({
      windowMs: 15 * 60_000,
      maxRequests: 1,
    });
  });

  it('never throttles money events', async () => {
    checkRateLimit.mockResolvedValue(BLOCKED);
    await sendStaffAlert('s', new Error('x'), {}, { kind: 'money-event' });
    await sendStaffAlert('s', new Error('x'), {}, { kind: 'money-event' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(enqueueTemplateEmail).toHaveBeenCalledTimes(2);
  });

  it('alerts anyway when the throttle itself fails', async () => {
    checkRateLimit.mockRejectedValue(new Error('redis down'));
    await sendStaffAlert('s', new Error('x'), {}, { kind: 'processor' });
    expect(enqueueTemplateEmail).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the enqueue fails', async () => {
    enqueueTemplateEmail.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      sendStaffAlert('s', new Error('x'), {}, { kind: 'money-event' })
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Failed to send staff alert',
      expect.objectContaining({ source: 's' })
    );
  });

  it('is a logged no-op with a single warning when STAFF_ALERT_EMAILS is unset', async () => {
    delete process.env.STAFF_ALERT_EMAILS;
    vi.resetModules();
    const fresh = await import('../staff-alert');

    await fresh.sendStaffAlert(
      's',
      new Error('a'),
      {},
      { kind: 'money-event' }
    );
    await fresh.sendStaffAlert(
      's',
      new Error('b'),
      {},
      { kind: 'money-event' }
    );

    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    const unsetWarnings = warn.mock.calls.filter(([msg]) =>
      String(msg).includes('STAFF_ALERT_EMAILS')
    );
    expect(unsetWarnings).toHaveLength(1);
    // The failure itself is still logged every time.
    expect(
      warn.mock.calls.filter(([msg]) => msg === 'Staff alert')
    ).toHaveLength(2);
  });
});
