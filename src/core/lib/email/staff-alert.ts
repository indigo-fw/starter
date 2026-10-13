/**
 * Staff alerts — mail the operators when a failure would otherwise be silent
 * (a webhook handler throwing, a signature check failing on every retry).
 *
 * Why a throttle: the callers are public endpoints. One handler bug replays on
 * every retry a provider sends for days, and junk POSTs could mint unlimited
 * mails. Dedup by error *signature* (ids/digits stripped, see alertSignature)
 * so one fault is one mail per window, and cap unverified traffic globally so
 * noise can never drown a real money event.
 *
 * Fails open end to end: a Redis, env or queue problem is logged and never
 * reaches the caller — an alert must not change a webhook response.
 */
import { createLogger } from '../infra/logger';
import { checkRateLimit } from '../infra/rate-limit';
import { getRequestRedis } from '../infra/redis';
import { enqueueTemplateEmail } from './queue';
import { createHash } from 'node:crypto';

const logger = createLogger('StaffAlert');

export const STAFF_ALERT_TEMPLATE = 'staff-alert';

/**
 * Decides how an alert is throttled:
 * - `unverified`: the request never passed signature verification. Per-signature
 *   window plus a shared cap — anyone can POST to the route.
 * - `processor`: verified, but a non-money failure. Per-signature window only.
 * - `money-event`: a handler failed after a verified signature, so a payment,
 *   order or subscription state may be lost. Never throttled.
 */
export type StaffAlertKind = 'unverified' | 'processor' | 'money-event';

export interface StaffAlertOptions {
  kind: StaffAlertKind;
  /** Extra fields for the log line and the mail body (event ids, handler names). */
  diagnostics?: Record<string, unknown>;
}

const WINDOW_MS = 15 * 60_000;
const PER_SIGNATURE_RULE = { windowMs: WINDOW_MS, maxRequests: 1 };
const UNVERIFIED_CAP_RULE = { windowMs: WINDOW_MS, maxRequests: 20 };
const UNVERIFIED_CAP_KEY = 'staff-alert:unverified-cap';
const PAYLOAD_MAX_CHARS = 4_096;
const STACK_MAX_CHARS = 2_000;
const SUBJECT_ERROR_MAX_CHARS = 120;

// Keys whose values must never leave the process in a mail: transport fields
// (raw body, headers, signatures) and anything credential-shaped. Matched on the
// key, not the value, so nested provider payloads are covered too.
const SECRET_KEY_RE =
  /secret|signature|passw|authorization|cookie|^headers?$|raw_?body|api_?key|token$|^__/i;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One fault → one signature. Ids, amounts and quoted values vary per request
 * (and attacker-controlled text could otherwise mint unlimited signatures), so
 * they are collapsed before hashing.
 */
export function alertSignature(source: string, error: unknown): string {
  const normalized = errorMessage(error)
    .slice(0, 300)
    .replace(/(["'`]).*?\1/g, '?')
    // The value after a label: "customer: cus_abc", "user #abc", "id=abc".
    .replace(/([:#=]\s*)[^\s,;()]+/g, '$1?')
    // Any token carrying a digit: ids, amounts, uuids, emails.
    .replace(/[^\s,;()]*\d[^\s,;()]*/g, '#')
    .replace(/[0-9a-f]{8,}/gi, '#')
    .slice(0, 200);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `${source}:${hash.slice(0, 16)}`;
}

/** Payload as it may appear in a mail: secrets stripped, bounded in size. */
export function visibleAlertPayload(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  if (typeof payload === 'string') return payload.slice(0, PAYLOAD_MAX_CHARS);
  try {
    const json = JSON.stringify(
      payload,
      (key, value: unknown) =>
        key && SECRET_KEY_RE.test(key) ? '[stripped]' : value,
      2
    );
    return (json ?? '').slice(0, PAYLOAD_MAX_CHARS);
  } catch {
    return '[unserializable payload]';
  }
}

let warnedUnset = false;

/** Staff inboxes from STAFF_ALERT_EMAILS; empty (with one warning) when unset. */
export function getStaffAlertRecipients(): string[] {
  const list = (process.env.STAFF_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 && !warnedUnset) {
    warnedUnset = true;
    logger.warn(
      'STAFF_ALERT_EMAILS is not set — staff alerts are logged but never mailed'
    );
  }
  return list;
}

type AlertDecision =
  | { emailed: true }
  | {
      emailed: false;
      suppressed: 'duplicate' | 'unverified-cap' | 'no-recipients';
    };

async function decide(
  signature: string,
  kind: StaffAlertKind
): Promise<AlertDecision> {
  if (kind === 'money-event') return { emailed: true };
  const redis = getRequestRedis();
  // Per-signature first: a repeat of one junk fault must not consume one of the
  // 20 shared unverified slots, or a single bug would silence every other alert.
  const perSignature = await checkRateLimit(
    redis,
    `staff-alert:${kind}:${signature}`,
    PER_SIGNATURE_RULE
  );
  if (!perSignature.allowed) return { emailed: false, suppressed: 'duplicate' };
  if (kind === 'unverified') {
    const cap = await checkRateLimit(
      redis,
      UNVERIFIED_CAP_KEY,
      UNVERIFIED_CAP_RULE
    );
    if (!cap.allowed) return { emailed: false, suppressed: 'unverified-cap' };
  }
  return { emailed: true };
}

/**
 * Log the failure with its payload and, per the kind's throttle, mail the staff
 * list. Resolves on every path — callers may `await` it without a try/catch.
 */
export async function sendStaffAlert(
  source: string,
  error: unknown,
  payload: unknown,
  options: StaffAlertOptions
): Promise<void> {
  try {
    const message = errorMessage(error);
    const signature = alertSignature(source, error);
    const visiblePayload = visibleAlertPayload(payload);
    const recipients = getStaffAlertRecipients();

    const decision: AlertDecision =
      recipients.length === 0
        ? { emailed: false, suppressed: 'no-recipients' }
        : await decide(signature, options.kind).catch(
            (err: unknown): AlertDecision => {
              // The limiter already fails open; this covers anything else the
              // same way — a throttle fault must not hide a payment error.
              logger.error('Staff alert throttle failed — alerting anyway', {
                error: String(err),
              });
              return { emailed: true };
            }
          );

    logger.warn('Staff alert', {
      source,
      kind: options.kind,
      signature,
      error: message,
      ...decision,
      ...options.diagnostics,
      payload: visiblePayload,
    });
    if (!decision.emailed) return;

    await enqueueTemplateEmail(recipients, STAFF_ALERT_TEMPLATE, {
      source,
      kind: options.kind,
      signature,
      error: message,
      errorShort: message.slice(0, SUBJECT_ERROR_MAX_CHARS),
      stack:
        error instanceof Error && error.stack
          ? error.stack.slice(0, STACK_MAX_CHARS)
          : '',
      payload: visiblePayload,
      diagnostics: options.diagnostics
        ? JSON.stringify(options.diagnostics, null, 2)
        : '',
    });
  } catch (err) {
    logger.error('Failed to send staff alert', {
      source,
      error: String(err),
    });
  }
}
