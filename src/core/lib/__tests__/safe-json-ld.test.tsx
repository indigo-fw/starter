import {
  SafeJsonLd,
  StructuredData,
  parseJsonLd,
  safeJsonLdString,
} from '../../components/seo/StructuredData';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('safeJsonLdString', () => {
  it('escapes every < so a string can never close the script tag', () => {
    const out = safeJsonLdString({
      name: '</script><img src=x onerror=alert(1)>',
    });
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
    // Still valid JSON that round-trips to the original text.
    expect(JSON.parse(out)).toEqual({
      name: '</script><img src=x onerror=alert(1)>',
    });
  });
});

describe('parseJsonLd', () => {
  it('returns the parsed value for valid JSON', () => {
    expect(parseJsonLd('{"@type":"Article"}')).toEqual({ '@type': 'Article' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonLd('{"@type": Article}')).toBeNull();
    expect(parseJsonLd('<script>alert(1)</script>')).toBeNull();
  });
});

describe('SafeJsonLd', () => {
  it('renders nothing for malformed input', () => {
    expect(renderToStaticMarkup(<SafeJsonLd raw="not json {" />)).toBe('');
  });

  it('renders a script tag with escaped content for valid input', () => {
    const raw = JSON.stringify({
      '@type': 'Article',
      headline: 'A </script> B',
    });
    const html = renderToStaticMarkup(<SafeJsonLd raw={raw} />);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('A \\u003c/script> B');
    // Exactly one closing tag — the one React emits.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('matches StructuredData output for the same object', () => {
    const data = { '@type': 'Article', headline: 'x<y' };
    expect(
      renderToStaticMarkup(<SafeJsonLd raw={JSON.stringify(data)} />)
    ).toBe(renderToStaticMarkup(<StructuredData data={data} />));
  });
});
