import { describe, it, expect } from 'vitest';
import { escapeHtml, replacePlaceholders } from '../email/template';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('returns safe string unchanged', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });
});

describe('replacePlaceholders', () => {
  it('replaces {{key}} with escaped value', () => {
    const result = replacePlaceholders('Hello {{name}}!', { name: '<b>Bob</b>' });
    expect(result).toBe('Hello &lt;b&gt;Bob&lt;/b&gt;!');
  });

  it('replaces {{{key}}} with raw (unescaped) value', () => {
    const result = replacePlaceholders('Click {{{url}}}', { url: 'https://example.com?a=1&b=2' });
    expect(result).toBe('Click https://example.com?a=1&b=2');
  });

  it('leaves unmatched placeholders intact', () => {
    const result = replacePlaceholders('Hello {{name}}', {});
    expect(result).toBe('Hello {{name}}');
  });

  it('uses fallback value when key is missing', () => {
    const result = replacePlaceholders('Hello {{name|Guest}}', {});
    expect(result).toBe('Hello Guest');
  });

  it('uses fallback that references another var', () => {
    const result = replacePlaceholders('{{greeting|siteName}}', { siteName: 'Indigo' });
    expect(result).toBe('Indigo');
  });

  it('prefers actual value over fallback', () => {
    const result = replacePlaceholders('{{name|Guest}}', { name: 'Alice' });
    expect(result).toBe('Alice');
  });

  it('skips escaping when escape=false', () => {
    const result = replacePlaceholders('{{title}}', { title: 'A & B' }, false);
    expect(result).toBe('A & B');
  });

  it('handles multiple placeholders in one string', () => {
    const result = replacePlaceholders(
      'Hi {{name}}, welcome to {{site}}!',
      { name: 'Alice', site: 'Indigo' },
    );
    expect(result).toBe('Hi Alice, welcome to Indigo!');
  });

  it('handles mixed double and triple braces', () => {
    const result = replacePlaceholders(
      '{{name}} - {{{url}}}',
      { name: '<b>A</b>', url: 'https://x.com?a=1&b=2' },
    );
    expect(result).toBe('&lt;b&gt;A&lt;/b&gt; - https://x.com?a=1&b=2');
  });

  it('treats empty string value as missing (uses fallback)', () => {
    const result = replacePlaceholders('{{name|Guest}}', { name: '' });
    expect(result).toBe('Guest');
  });
});
