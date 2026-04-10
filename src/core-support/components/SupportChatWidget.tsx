'use client';

import './SupportChatWidget.css';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, ArrowUpRight, Loader2, Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/core/lib/realtime/ws-client';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SupportChatMessage {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}

interface SupportChatWsEvent {
  type: 'chat_message' | 'chat_status';
  id?: string;
  sessionId: string;
  role?: string;
  body?: string;
  createdAt?: string;
  status?: string;
  ticketId?: string;
}

export interface SupportChatWidgetProps {
  /** Translation function — pass useBlankTranslations() or a real translator */
  __: (s: string) => string;
  /** Greeting shown when the chat panel opens */
  welcomeMessage?: string;
  /** Input placeholder */
  placeholder?: string;
  /** Support tickets page URL — for "View Ticket" link */
  supportUrl?: (ticketId: string) => string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('indigo-visitor-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('indigo-visitor-id', id);
  }
  return id;
}

function isNearBottom(el: HTMLElement, threshold = 120): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SupportChatWidget({
  __,
  welcomeMessage,
  placeholder,
  supportUrl = (id) => `/account/support/${id}`,
}: SupportChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('ai_active');
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [emailInput, setEmailInput] = useState('');
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startSession = trpc.supportChat.startSession.useMutation();
  const sendMessage = trpc.supportChat.sendMessage.useMutation();
  const escalateMut = trpc.supportChat.escalate.useMutation();
  const closeMut = trpc.supportChat.close.useMutation();

  // ─── WS real-time (empty string = no subscription, useChannel guards it) ─
  useChannel<SupportChatWsEvent>(sessionId ? `supportChat:${sessionId}` : '', useCallback((event: SupportChatWsEvent) => {
    if (event.type === 'chat_message' && (event.role === 'agent' || event.role === 'ai')) {
      const msg: SupportChatMessage = {
        id: event.id ?? crypto.randomUUID(),
        role: event.role,
        body: event.body ?? '',
        createdAt: event.createdAt ?? new Date().toISOString(),
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // AI response arrived — stop typing indicator
      if (event.role === 'ai') setIsAiTyping(false);
      if (!open) setUnread((c) => c + 1);
    }
    if (event.type === 'chat_status' && event.status) {
      setSessionStatus(event.status);
      setIsAiTyping(false); // Status change = AI done
      if (event.ticketId) setTicketId(event.ticketId);
    }
  }, [open]));

  // ─── Typing indicator timeout (30s safety net if WS/AI fails) ──────────
  useEffect(() => {
    if (!isAiTyping) return;
    const timer = setTimeout(() => {
      setIsAiTyping(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isAiTyping]);

  // ─── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = messagesRef.current;
    if (el && shouldScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isAiTyping]);

  const handleScroll = useCallback(() => {
    if (messagesRef.current) {
      shouldScrollRef.current = isNearBottom(messagesRef.current);
    }
  }, []);

  // ─── Open panel → start/resume session ──────────────────────────────────
  const handleOpen = useCallback(async () => {
    setOpen(true);
    setUnread(0);

    if (sessionId) return;

    const visitorId = getVisitorId();

    try {
      const result = await startSession.mutateAsync({ visitorId });
      setSessionId(result.id);
      setSessionStatus(result.status);
      if ('ticketId' in result && result.ticketId) {
        setTicketId(result.ticketId as string);
      }
      if (result.resumed && result.messages.length > 0) {
        setMessages(result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          body: m.body,
          createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
        })));
      }
    } catch {
      // Silently fail
    }
  }, [sessionId, startSession]);

  // ─── Send message ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || !sessionId || isAiTyping) return;

    const visitorId = getVisitorId();

    const tempId = crypto.randomUUID();
    const userMsg: SupportChatMessage = {
      id: tempId,
      role: 'user',
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    shouldScrollRef.current = true;

    if (sessionStatus === 'ai_active') {
      setIsAiTyping(true);
    }

    try {
      const result = await sendMessage.mutateAsync({ sessionId, visitorId, body });

      // Update optimistic message with server ID
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: result.userMessageId } : m))
      );

      // AI response will arrive via WebSocket — typing indicator stays on
      // until we get a chat_message or chat_status event
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setIsAiTyping(false);
    }
  }, [input, sessionId, isAiTyping, sessionStatus, sendMessage]);

  // ─── Escalate to ticket ─────────────────────────────────────────────────
  const handleEscalate = useCallback(async (email?: string) => {
    if (!sessionId) return;
    const visitorId = getVisitorId();
    try {
      const result = await escalateMut.mutateAsync({
        sessionId,
        visitorId,
        email: email || undefined,
      });
      if (result.ticketId) setTicketId(result.ticketId);
      if (result.emailCaptured) {
        setEmailCaptured(true);
        setNeedsEmail(false);
      }
      setSessionStatus('escalated');
    } catch (err) {
      // Anonymous without email → show email form (BAD_REQUEST = email required)
      // Don't change sessionStatus — keep server and client in sync
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === 'BAD_REQUEST') {
        setNeedsEmail(true);
      }
    }
  }, [sessionId, escalateMut]);

  const handleEmailSubmit = useCallback(async () => {
    const email = emailInput.trim();
    if (!email || !sessionId) return;
    await handleEscalate(email);
  }, [emailInput, sessionId, handleEscalate]);

  // ─── Close session & start new ──────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    if (sessionId) {
      try {
        await closeMut.mutateAsync({ sessionId, visitorId: getVisitorId() });
      } catch { /* ignore */ }
    }
    setSessionId(null);
    setMessages([]);
    setSessionStatus('ai_active');
    setTicketId(null);
    setEmailInput('');
    setEmailCaptured(false);
    setNeedsEmail(false);

    const visitorId = getVisitorId();
    try {
      const result = await startSession.mutateAsync({ visitorId });
      setSessionId(result.id);
    } catch { /* ignore */ }
  }, [sessionId, closeMut, startSession]);

  // ─── Key handler ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const isClosed = sessionStatus === 'closed';
  const isEscalated = sessionStatus === 'escalated';
  const welcomeText = welcomeMessage ?? __('Hi! How can I help you today?');
  const placeholderText = placeholder ?? __('Type your message...');

  return (
    <>
      {/* ═══ Chat Panel ═══ */}
      <div className={cn('support-chat-panel', open && 'support-chat-panel-open')}>
        {/* Header */}
        <div className="support-chat-header">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <span className="font-semibold">{__('Support Chat')}</span>
            {sessionStatus === 'agent_active' && (
              <span className="support-chat-live-dot" />
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="support-chat-close-btn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesRef}
          onScroll={handleScroll}
          className="support-chat-messages"
        >
          {/* Welcome message */}
          <div className="support-chat-msg support-chat-msg-ai">
            <div className="support-chat-bubble support-chat-bubble-ai">
              {welcomeText}
            </div>
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'support-chat-msg',
                msg.role === 'user'
                  ? 'support-chat-msg-user'
                  : 'support-chat-msg-ai'
              )}
            >
              <div
                className={cn(
                  'support-chat-bubble',
                  msg.role === 'user'
                    ? 'support-chat-bubble-user'
                    : msg.role === 'agent'
                      ? 'support-chat-bubble-agent'
                      : 'support-chat-bubble-ai'
                )}
              >
                {msg.role === 'agent' && (
                  <span className="support-chat-agent-label">{__('Support Agent')}</span>
                )}
                {msg.body}
              </div>
            </div>
          ))}

          {isAiTyping && (
            <div className="support-chat-msg support-chat-msg-ai">
              <div className="support-chat-bubble support-chat-bubble-ai support-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          {/* Email form — shown when anonymous user requests escalation */}
          {needsEmail && !emailCaptured && !ticketId && (
            <div className="support-chat-escalation">
              <p>{__('Enter your email so our team can follow up:')}</p>
              <form
                onSubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}
                className="support-chat-email-form"
              >
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={__('your@email.com')}
                  className="support-chat-email-input"
                />
                <button type="submit" className="support-chat-escalate-btn" disabled={escalateMut.isPending || !emailInput.trim()}>
                  {escalateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {__('Connect with support')}
                </button>
              </form>
            </div>
          )}

          {/* Escalated by AI — authenticated user can create ticket */}
          {isEscalated && !ticketId && !emailCaptured && !needsEmail && (
            <div className="support-chat-escalation">
              <p>{__('Would you like to create a support ticket so our team can follow up?')}</p>
              <button onClick={() => handleEscalate()} className="support-chat-escalate-btn" disabled={escalateMut.isPending}>
                {escalateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {__('Create Support Ticket')}
              </button>
            </div>
          )}

          {emailCaptured && !ticketId && (
            <div className="support-chat-escalation">
              <p>{__('Thanks! Our team will follow up at your email soon.')}</p>
            </div>
          )}

          {ticketId && (
            <div className="support-chat-escalation">
              <p>{__('Your ticket has been created. Our team will follow up soon.')}</p>
              <a href={supportUrl(ticketId)} className="support-chat-ticket-link">
                <ArrowUpRight className="h-4 w-4" />
                {__('View Ticket')}
              </a>
            </div>
          )}
        </div>

        {/* Input area */}
        {!isClosed ? (
          <div className="support-chat-input-area">
            <div className="support-chat-input-row">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText}
                rows={1}
                className="support-chat-input"
                disabled={isAiTyping}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isAiTyping}
                className="support-chat-send-btn"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {sessionStatus === 'ai_active' && messages.length > 0 && !needsEmail && (
              <button
                onClick={() => handleEscalate()}
                className="support-chat-human-btn"
              >
                {__('Talk to a human')}
              </button>
            )}
          </div>
        ) : (
          <div className="support-chat-input-area">
            <button onClick={handleNewChat} className="support-chat-new-btn">
              {__('Start New Chat')}
            </button>
          </div>
        )}
      </div>

      {/* ═══ Floating Bubble ═══ */}
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={cn('support-chat-bubble-btn', open && 'support-chat-bubble-btn-active')}
        aria-label={open ? __('Close chat') : __('Open chat')}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {unread > 0 && (
              <span className="support-chat-unread">{unread > 9 ? '9+' : unread}</span>
            )}
          </>
        )}
      </button>
    </>
  );
}
