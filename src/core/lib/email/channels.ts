/**
 * Email channel opt-out — the consent layer under bulk mail.
 *
 * Model is OPT-OUT: an absent preference means enabled, so a new channel
 * starts reaching everyone and only explicit unsubscribes are stored. That
 * keeps the write path empty for the overwhelming majority of users.
 *
 * Only BULK mail is gated. Transactional mail (password reset, email
 * verification, receipts, security alerts) must never consult this — a user
 * who muted the newsletter still has to be able to reset their password, and
 * suppressing those is its own kind of failure. The split is enforced by
 * shape: gating happens only when a caller passes a `channel`.
 */
import { getUserPrefs, patchUserPrefs } from '@/core/lib/preferences';

/** Preference key holding `{ [channel]: false }` for muted channels. */
const PREF_KEY = 'emailChannels';

/**
 * Channels shipped by core. Modules and projects add their own by passing any
 * string — the registry below only drives the "what can I unsubscribe from"
 * listing, never the gate, so an unknown channel is simply "enabled".
 */
export const CORE_EMAIL_CHANNELS = {
  /** Product news, announcements, newsletters. */
  marketing: 'marketing',
  /** Periodic digests and activity summaries. */
  digest: 'digest',
  /** Notifications mirrored to email (comments, mentions, replies). */
  notifications: 'notifications',
} as const;

export type EmailChannel = string;

type ChannelPrefs = Record<string, boolean>;

async function readChannels(userId: string): Promise<ChannelPrefs> {
  const prefs = await getUserPrefs<Record<string, unknown>>(userId, {});
  const stored = prefs[PREF_KEY];
  return stored && typeof stored === 'object' ? (stored as ChannelPrefs) : {};
}

/**
 * Whether `userId` still accepts mail on `channel`.
 * Absent preference = enabled. Errors fail CLOSED (returns false): if the
 * preference store is unreachable we cannot prove consent, and sending to
 * someone who unsubscribed is worse than delaying a newsletter.
 */
export async function isChannelEnabled(
  userId: string,
  channel: EmailChannel
): Promise<boolean> {
  const channels = await readChannels(userId);
  return channels[channel] !== false;
}

/** Mute or unmute one channel for one user. */
export async function setChannelEnabled(
  userId: string,
  channel: EmailChannel,
  enabled: boolean
): Promise<void> {
  const channels = await readChannels(userId);
  await patchUserPrefs(userId, {
    [PREF_KEY]: { ...channels, [channel]: enabled },
  });
}

/** Every channel this user has explicitly muted. */
export async function getMutedChannels(userId: string): Promise<string[]> {
  const channels = await readChannels(userId);
  return Object.entries(channels)
    .filter(([, enabled]) => enabled === false)
    .map(([name]) => name);
}

/**
 * Base URL for links inside emails.
 *
 * Read from the environment rather than imported from the project's app-url
 * helper: core may only import a small allowlist of project paths (see
 * `src/core/AGENTS.md`), and that helper is not on it. `BETTER_AUTH_URL` wins
 * because `NEXT_PUBLIC_APP_URL` is inlined by webpack at BUILD time, so a
 * prebuilt image would bake in the wrong host.
 */
function appUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

/**
 * Everything a bulk send needs to be unsubscribable: the visible link for the
 * email body, plus the RFC 8058 headers that let Gmail and Yahoo render their
 * own one-click control.
 */
export async function buildUnsubscribe(
  userId: string,
  channel: EmailChannel
): Promise<{ url: string; headers: Record<string, string> }> {
  const { signEmailToken, listUnsubscribeHeaders } =
    await import('./email-token');
  const token = signEmailToken(userId, channel);
  const url = `${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  return { url, headers: listUnsubscribeHeaders(url) };
}
