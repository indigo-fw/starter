/**
 * core-comments dependency injection.
 *
 * The comments module needs project-specific capabilities that differ between projects.
 * Call `setCommentsDeps()` once at startup to provide them.
 *
 * After this, the only hard project-layer import is `@/server/trpc`
 * (the one true framework convention).
 */

export interface CommentLifecycleEvent {
  commentId: string;
  userId: string;
  targetType: string;
  targetId: string;
  content?: string;
  parentId?: string | null;
}

export interface CommentsDeps {
  /**
   * Send a notification to a specific user (e.g. reply notification).
   */
  sendNotification: (params: {
    userId: string;
    title: string;
    body: string;
    url?: string;
  }) => Promise<void>;

  /** Called after a comment is created. Use to record activity, fire webhooks, etc. */
  onCommentCreated?: (event: CommentLifecycleEvent) => void;

  /** Called after a comment is deleted. */
  onCommentDeleted?: (event: Omit<CommentLifecycleEvent, 'content' | 'parentId'>) => void;
}

let _deps: CommentsDeps | null = null;

export function setCommentsDeps(deps: CommentsDeps): void {
  _deps = deps;
}

export function getCommentsDeps(): CommentsDeps {
  if (!_deps) {
    throw new Error(
      'Comments dependencies not configured. Call setCommentsDeps() at startup — see src/core-comments/deps.ts',
    );
  }
  return _deps;
}
