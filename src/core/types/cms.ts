/** Post type enum values — matches cms_posts.type smallint */
export const PostType = {
  PAGE: 1,
  BLOG: 2,
} as const;
export type PostTypeValue = (typeof PostType)[keyof typeof PostType];

/** Content status — matches cms_posts.status and cms_categories.status */
export const ContentStatus = {
  DRAFT: 0,
  PUBLISHED: 1,
  SCHEDULED: 2,
} as const;
export type ContentStatusValue =
  (typeof ContentStatus)[keyof typeof ContentStatus];

/** File type for attachments/media */
export const FileType = {
  IMAGE: 1,
  VIDEO: 2,
  DOCUMENT: 3,
  OTHER: 4,
} as const;
export type FileTypeValue = (typeof FileType)[keyof typeof FileType];

/** Shape of a content revision snapshot (JSONB) */
export interface ContentSnapshot {
  [key: string]: unknown;
}
