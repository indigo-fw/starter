import { describe, it, expect } from 'vitest';

// Test the pure functions from docs-loader (no mocking needed)
import { stripHtml, markdownToPlainText } from '@/core-docs/lib/docs-loader';

describe('docs-loader', () => {
  describe('stripHtml', () => {
    it('removes HTML tags', () => {
      expect(stripHtml('<h1>Title</h1><p>Content</p>')).toBe('Title Content');
    });

    it('handles nested tags', () => {
      expect(stripHtml('<p>Text with <strong>bold</strong> and <em>italic</em></p>'))
        .toBe('Text with bold and italic');
    });

    it('collapses whitespace', () => {
      expect(stripHtml('<p>  Multiple   spaces  </p>')).toBe('Multiple spaces');
    });

    it('handles empty input', () => {
      expect(stripHtml('')).toBe('');
    });
  });

  describe('markdownToPlainText', () => {
    it('strips headings', () => {
      expect(markdownToPlainText('## Heading')).toBe('Heading');
    });

    it('strips bold and italic', () => {
      expect(markdownToPlainText('**bold** and *italic*')).toBe('bold and italic');
    });

    it('strips links but keeps text', () => {
      expect(markdownToPlainText('[Click here](https://example.com)')).toBe('Click here');
    });

    it('strips inline code', () => {
      expect(markdownToPlainText('Use `npm install`')).toBe('Use npm install');
    });

    it('strips code blocks', () => {
      const md = '```js\nconsole.log("hi")\n```\nAfter block';
      expect(markdownToPlainText(md)).toBe('After block');
    });

    it('converts list markers to bullets', () => {
      expect(markdownToPlainText('- Item one\n- Item two')).toBe('• Item one\n• Item two');
    });
  });
});
