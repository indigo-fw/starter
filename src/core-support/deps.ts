/**
 * core-support dependency injection.
 *
 * The chat module needs project-specific capabilities that differ between projects.
 * Call `setSupportDeps()` once at startup to provide them.
 *
 * After this, the only hard project-layer import is `@/server/trpc`
 * (the one true framework convention).
 */

export interface EscalationResult {
  ticketId: string;
}

export interface UserInfo {
  id: string;
  name: string | null;
  email: string;
}

export interface SupportDeps {
  /**
   * Create a support ticket from an escalated chat session.
   * Returns null if the project doesn't support tickets.
   */
  createTicketFromChat: (params: {
    userId: string;
    orgId: string;
    subject: string;
    chatSessionId: string;
    transcript: string;
  }) => Promise<EscalationResult | null>;

  /**
   * Resolve the active organization ID for a user.
   */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /**
   * Send a notification to a specific user.
   */
  sendNotification: (params: {
    userId: string;
    title: string;
    body: string;
    actionUrl?: string;
  }) => void;

  /**
   * Send a notification to all members of an organization.
   */
  sendOrgNotification: (
    orgId: string,
    params: {
      title: string;
      body: string;
      actionUrl?: string;
    }
  ) => void;

  /**
   * Broadcast a real-time event to a WebSocket channel.
   * Fire-and-forget — implementations should not throw.
   */
  broadcastEvent: (
    channel: string,
    type: string,
    payload: Record<string, unknown>
  ) => void;

  /**
   * Look up user info by IDs (for admin list enrichment).
   * Returns a map of userId → { id, name, email }.
   */
  lookupUsers: (userIds: string[]) => Promise<Map<string, UserInfo>>;

  /**
   * Call AI with conversation history. Returns assistant response text, or null if unavailable.
   * The implementation chooses the provider, model, and system prompt.
   */
  callAI: (
    messages: { role: string; body: string }[]
  ) => Promise<string | null>;

  /**
   * Enqueue a template email (same shape as the other modules' deps).
   * `locale` picks the template language; implementations default to 'en'.
   */
  enqueueTemplateEmail: (
    to: string | string[],
    template: string,
    data: Record<string, string>,
    locale?: string
  ) => Promise<void>;

  /**
   * The inbox that receives staff-facing ticket emails (new ticket, customer
   * reply). `null` disables staff emails — in-app notifications still fire.
   * Read it from site settings (`company.support_email`) so operators can
   * change it without a deploy.
   */
  getSupportEmail: () => Promise<string | null>;
}

let _deps: SupportDeps | null = null;

export function setSupportDeps(deps: SupportDeps): void {
  _deps = deps;
}

export function getSupportDeps(): SupportDeps {
  if (!_deps) {
    throw new Error(
      'Chat dependencies not configured. Call setSupportDeps() at startup — see src/core-support/deps.ts'
    );
  }
  return _deps;
}
