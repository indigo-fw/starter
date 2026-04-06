export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum NotificationCategory {
  BILLING = 'billing',
  ORGANIZATION = 'organization',
  CONTENT = 'content',
  SYSTEM = 'system',
  SECURITY = 'security',
}

export interface NotificationShape {
  id: string;
  userId: string;
  orgId?: string | null;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  actionUrl?: string | null;
  read: boolean;
  readAt?: Date | null;
  createdAt: Date;
  expiresAt?: Date | null;
}
