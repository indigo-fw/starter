import { mergeRouters } from '../../trpc';
import { cmsPostsRouter } from './posts';
import { cmsPublicRouter } from './public';
import { cmsAttachmentsRouter } from './attachments';
import { cmsSchedulingRouter } from './scheduling';

export const cmsRouter = mergeRouters(
  cmsPostsRouter,
  cmsPublicRouter,
  cmsAttachmentsRouter,
  cmsSchedulingRouter,
);
