export interface ImportedItem {
  title: string;
  slug: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt?: Date;
  categories?: string[];
  tags?: string[];
  featuredImage?: string;
  metaDescription?: string;
  seoTitle?: string;
}

export interface ImportResult {
  items: ImportedItem[];
  warnings: string[];
}
