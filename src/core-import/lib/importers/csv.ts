import type { ImportResult, ImportedItem } from './types';

/**
 * Parse a CSV file into importable items.
 * `columnMap` maps CMS field names to CSV header names (e.g. { title: 'post_title' }).
 * Falls back to standard field names if no mapping is provided.
 */
export function parseCSV(
  csv: string,
  columnMap: Record<string, string>
): ImportResult {
  const warnings: string[] = [];
  const items: ImportedItem[] = [];

  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    warnings.push('CSV file is empty or has no data rows');
    return { items, warnings };
  }

  const headers = parseCsvLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });

    const title = row[columnMap.title ?? 'title'] ?? '';
    if (!title) {
      warnings.push(`Row ${i + 1}: Missing title, skipped`);
      continue;
    }

    const rawStatus = row[columnMap.status ?? 'status'] ?? '';
    const status: 'draft' | 'published' =
      rawStatus === 'published' ? 'published' : 'draft';

    const rawDate = row[columnMap.publishedAt ?? 'publishedAt'] ?? '';
    const publishedAt = rawDate ? new Date(rawDate) : undefined;

    const rawCategories = row[columnMap.categories ?? 'categories'] ?? '';
    const rawTags = row[columnMap.tags ?? 'tags'] ?? '';

    const slug =
      row[columnMap.slug ?? 'slug'] ??
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    items.push({
      title,
      slug,
      content: row[columnMap.content ?? 'content'] ?? '',
      status,
      publishedAt:
        publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
      metaDescription:
        row[columnMap.metaDescription ?? 'metaDescription'] ?? undefined,
      seoTitle: row[columnMap.seoTitle ?? 'seoTitle'] ?? undefined,
      categories: rawCategories
        ? rawCategories
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      tags: rawTags
        ? rawTags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    });
  }

  return { items, warnings };
}

/** Parse a single CSV line handling quoted fields with embedded commas and quotes. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}
