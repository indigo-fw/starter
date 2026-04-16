'use client';

import {
  MessageSquare,
  FileText,
  ShoppingCart,
  User,
  Activity,
} from 'lucide-react';
import { formatRelativeTime } from '@/core/lib/infra/datetime';
import { cn } from '@/lib/utils';

export interface ActivityItemEvent {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: unknown;
  createdAt: Date | string;
  actorName?: string | null;
  actorImage?: string | null;
}

const ACTION_ICONS: Record<string, { icon: typeof Activity; className: string }> = {
  comment: { icon: MessageSquare, className: 'activity-icon-comment' },
  post: { icon: FileText, className: 'activity-icon-post' },
  order: { icon: ShoppingCart, className: 'activity-icon-order' },
  user: { icon: User, className: 'activity-icon-user' },
};

const ACTION_LABELS: Record<string, string> = {
  'comment.created': 'commented on',
  'comment.updated': 'updated comment on',
  'comment.deleted': 'deleted comment on',
  'post.created': 'created',
  'post.published': 'published',
  'post.updated': 'updated',
  'post.deleted': 'deleted',
  'order.placed': 'placed an order for',
  'order.shipped': 'shipped order for',
  'order.delivered': 'delivered order for',
  'order.cancelled': 'cancelled order for',
  'user.registered': 'registered',
  'user.updated': 'updated profile',
  'user.deleted': 'was removed',
};

function getActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: turn 'some.action' into 'action'
  const parts = action.split('.');
  return parts[parts.length - 1] ?? action;
}

function getIconConfig(action: string): { icon: typeof Activity; className: string } {
  const prefix = action.split('.')[0];
  return ACTION_ICONS[prefix ?? ''] ?? { icon: Activity, className: 'activity-icon-system' };
}

interface ActivityItemProps {
  event: ActivityItemEvent;
  compact?: boolean;
}

export function ActivityItem({ event, compact }: ActivityItemProps) {
  const { icon: Icon, className: iconClass } = getIconConfig(event.action);
  const actorName = event.actorName ?? (event.actorType === 'system' ? 'System' : 'Unknown');

  return (
    <div className={cn('activity-item', compact && 'py-2')}>
      <div className={cn('activity-icon', iconClass)}>
        <Icon />
      </div>
      <div className="activity-content">
        <span className="activity-actor">{actorName}</span>
        {' '}
        <span className="activity-action">{getActionLabel(event.action)}</span>
        {event.targetLabel && (
          <>
            {' '}
            <span className="activity-target">{event.targetLabel}</span>
          </>
        )}
      </div>
      <time className="activity-time">
        {formatRelativeTime(event.createdAt)}
      </time>
    </div>
  );
}
