import { customType } from 'drizzle-orm/pg-core';

/** PostgreSQL tsvector column type for full-text search */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
