import { Link } from '@/components/Link';
import { db } from '@/server/db';
import { getAuthorsForObject } from '../lib/author-helpers';

interface Props {
  postId: string;
  contentType: string;
}

/**
 * Server component: renders linked author names for a content object.
 * Replaces core's simple authorId byline when core-authors is installed.
 *
 * Usage in PostDetail:
 *   <AuthorByline postId={post.id} contentType="blog" />
 */
export async function AuthorByline({ postId, contentType }: Props) {
  const authors = await getAuthorsForObject(db, postId, contentType);
  if (authors.length === 0) return null;

  return (
    <span>
      {authors.map((author, i) => (
        <span key={author.id}>
          {i > 0 && ', '}
          <Link
            href={`/author/${author.slug}`}
            className="hover:text-(--text-secondary) hover:underline"
          >
            {author.name}
          </Link>
        </span>
      ))}
    </span>
  );
}
