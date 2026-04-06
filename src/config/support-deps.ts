/**
 * Wire core-support module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts (like email-list registration).
 */
import { setSupportDeps } from '@/core-support/deps';
import { saasTickets, saasTicketMessages } from '@/core-support/schema/support-tickets';
import { user } from '@/server/db/schema/auth';
import { db } from '@/server/db';
import { inArray } from 'drizzle-orm';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { sendNotification, sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { supportChatConfig } from '@/core-support/config';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('support-chat-ai');

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

setSupportDeps({
  async createTicketFromChat({ userId, orgId, subject, chatSessionId, transcript }) {
    const ticketId = crypto.randomUUID();

    await db.insert(saasTickets).values({
      id: ticketId,
      organizationId: orgId,
      userId,
      subject,
      status: 'open',
      priority: 'normal',
      source: 'chat',
      chatSessionId,
    });

    await db.insert(saasTicketMessages).values({
      ticketId,
      userId,
      isStaff: false,
      body: `**Chat transcript:**\n\n${transcript}`,
    });

    return { ticketId };
  },

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  sendNotification({ userId, title, body, actionUrl }) {
    sendNotification({
      userId,
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  sendOrgNotification(orgId, { title, body, actionUrl }) {
    sendOrgNotification(orgId, {
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) => broadcastToChannel(channel, type, payload))
      .catch(() => {/* WS not available */});
  },

  async lookupUsers(userIds) {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, userIds))
      .limit(100);
    return new Map(users.map((u) => [u.id, u]));
  },

  async callAI(messages) {
    const { env } = await import('@/lib/env');
    if (!env.AI_API_KEY) return null;

    const apiUrl = env.AI_API_URL ?? DEFAULT_API_URL;
    const model = supportChatConfig.model ?? env.AI_MODEL ?? DEFAULT_MODEL;

    const apiMessages = [
      { role: 'system', content: supportChatConfig.systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.body,
      })),
    ];

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => 'Unknown error');
        logger.error('Chat AI API error', { status: String(response.status), body: errBody });
        return null;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      logger.error('Chat AI call failed', { error: String(err) });
      return null;
    }
  },
});
