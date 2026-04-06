export interface WsMessage {
  type: string;
  channel?: string;
  payload?: unknown;
}

export interface WsChannel {
  name: string;
  /** Pattern for matching, e.g. 'user:*', 'org:*' */
  pattern: string;
  /** Auth check: can user subscribe to this specific channel? */
  requiresAuth: boolean;
}
