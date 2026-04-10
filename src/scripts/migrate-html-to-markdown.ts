/**
 * One-time migration: convert existing HTML content to Markdown.
 *
 * Usage:
 *   bun run src/scripts/migrate-html-to-markdown.ts           # live run
 *   bun run src/scripts/migrate-html-to-markdown.ts --dry-run  # preview only
 */

import { db } from '../server/db';
import { cmsPosts, cmsCategories } from '../server/db/schema';
import { eq } from 'drizzle-orm';
import { htmlToMarkdown } from '../core/lib/markdown/markdown';

const DRY_RUN = process.argv.includes('--dry-run');

function looksLikeHtml(text: string): boolean {
  return /<(div|p|h[1-6]|ul|ol|li|table|tr|td|th|section|article|blockquote|pre|br\s*\/?)[\s>]/i.test(
    text
  );
}

async function migratePosts() {
  const posts = await db
    .select({ id: cmsPosts.id, content: cmsPosts.content })
    .from(cmsPosts);

  let converted = 0;
  for (const post of posts) {
    if (!post.content || !looksLikeHtml(post.content)) continue;

    const md = htmlToMarkdown(post.content);
    if (md === post.content) continue;

    converted++;
    if (DRY_RUN) {
      console.log(`[DRY RUN] Post ${post.id}: would convert (${post.content.length} → ${md.length} chars)`);
    } else {
      await db.update(cmsPosts).set({ content: md }).where(eq(cmsPosts.id, post.id));
      console.log(`Post ${post.id}: converted (${post.content.length} → ${md.length} chars)`);
    }
  }
  console.log(`Posts: ${converted} of ${posts.length} converted${DRY_RUN ? ' (dry run)' : ''}`);
}

async function migrateCategories() {
  const cats = await db
    .select({ id: cmsCategories.id, content: cmsCategories.content })
    .from(cmsCategories);

  let converted = 0;
  for (const cat of cats) {
    if (!cat.content || !looksLikeHtml(cat.content)) continue;

    const md = htmlToMarkdown(cat.content);
    if (md === cat.content) continue;

    converted++;
    if (DRY_RUN) {
      console.log(`[DRY RUN] Category ${cat.id}: would convert (${cat.content.length} → ${md.length} chars)`);
    } else {
      await db.update(cmsCategories).set({ content: md }).where(eq(cmsCategories.id, cat.id));
      console.log(`Category ${cat.id}: converted (${cat.content.length} → ${md.length} chars)`);
    }
  }
  console.log(`Categories: ${converted} of ${cats.length} converted${DRY_RUN ? ' (dry run)' : ''}`);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING ===');
  await migratePosts();
  await migrateCategories();
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
