import { describe, expect, it } from 'vitest';
import { computeLineDiff, computeFieldDiffs } from '../content/revision-diff';

describe('computeLineDiff', () => {
  it('returns unchanged for identical text', () => {
    const result = computeLineDiff('hello\nworld', 'hello\nworld');
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello' },
      { type: 'unchanged', text: 'world' },
    ]);
  });

  it('detects added lines', () => {
    const result = computeLineDiff('a', 'a\nb');
    expect(result).toEqual([
      { type: 'unchanged', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
  });

  it('detects removed lines', () => {
    const result = computeLineDiff('a\nb', 'a');
    expect(result).toEqual([
      { type: 'unchanged', text: 'a' },
      { type: 'removed', text: 'b' },
    ]);
  });

  it('detects mixed changes', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nx\nc');
    const types = result.map((l) => l.type);
    expect(types).toContain('unchanged');
    expect(types).toContain('added');
    expect(types).toContain('removed');
  });

  it('handles empty strings', () => {
    const result = computeLineDiff('', 'new');
    // Empty string splits to [''], so we get a removed empty line + added 'new'
    expect(result).toEqual([
      { type: 'removed', text: '' },
      { type: 'added', text: 'new' },
    ]);
  });
});

describe('computeFieldDiffs', () => {
  it('returns empty array when snapshots are identical', () => {
    const data = { title: 'Hello', slug: 'hello' };
    expect(computeFieldDiffs(data, { ...data })).toEqual([]);
  });

  it('detects short field changes', () => {
    const diffs = computeFieldDiffs(
      { title: 'Old Title' },
      { title: 'New Title' },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      key: 'title',
      label: 'Title',
      type: 'short',
      oldValue: 'Old Title',
      newValue: 'New Title',
    });
  });

  it('detects long field changes with line diffs', () => {
    const diffs = computeFieldDiffs(
      { content: 'line1\nline2' },
      { content: 'line1\nchanged' },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('long');
    expect(diffs[0].lines).toBeDefined();
    expect(diffs[0].lines!.length).toBeGreaterThan(0);
  });

  it('detects boolean field changes', () => {
    const diffs = computeFieldDiffs(
      { noindex: false },
      { noindex: true },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('boolean');
  });

  it('handles null/undefined values', () => {
    const diffs = computeFieldDiffs(
      { title: null },
      { title: 'New' },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].oldValue).toBeNull();
    expect(diffs[0].newValue).toBe('New');
  });

  it('detects new fields in current data', () => {
    const diffs = computeFieldDiffs(
      {},
      { slug: 'new-slug' },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].key).toBe('slug');
  });
});
