export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

export interface FieldDiff {
  key: string;
  label: string;
  type: 'short' | 'long' | 'boolean';
  oldValue: unknown;
  newValue: unknown;
  lines?: DiffLine[];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  content: 'Content',
  seoTitle: 'SEO Title',
  metaDescription: 'Meta Description',
  noindex: 'No Index',
  jsonLd: 'JSON-LD',
  featuredImage: 'Featured Image',
  featuredImageAlt: 'Featured Image Alt',
  status: 'Status',
  slug: 'Slug',
  publishedAt: 'Published At',
  lang: 'Language',
  name: 'Name',
  text: 'Text',
  icon: 'Icon',
  order: 'Order',
};

const LONG_FIELDS = new Set(['content', 'text', 'jsonLd']);
const BOOLEAN_FIELDS = new Set(['noindex']);

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const stack: DiffLine[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }

  const result: DiffLine[] = [];
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }
  return result;
}

function normalize(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return String(val);
  return String(val);
}

export function computeFieldDiffs(
  revisionSnapshot: Record<string, unknown>,
  currentData: Record<string, unknown>
): FieldDiff[] {
  const allKeys = new Set([
    ...Object.keys(revisionSnapshot),
    ...Object.keys(currentData),
  ]);

  const diffs: FieldDiff[] = [];

  for (const key of allKeys) {
    const oldVal = revisionSnapshot[key];
    const newVal = currentData[key];
    const oldStr = normalize(oldVal);
    const newStr = normalize(newVal);

    if (oldStr === newStr) continue;

    const label = FIELD_LABELS[key] ?? key;

    if (BOOLEAN_FIELDS.has(key)) {
      diffs.push({ key, label, type: 'boolean', oldValue: oldVal, newValue: newVal });
    } else if (LONG_FIELDS.has(key)) {
      const lines = computeLineDiff(oldStr, newStr);
      diffs.push({ key, label, type: 'long', oldValue: oldVal, newValue: newVal, lines });
    } else {
      diffs.push({ key, label, type: 'short', oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}
