import { describe, it, expect } from 'vitest';
import { compileMdx } from '@/core/lib/mdx-compiler';

describe('mdx-compiler', () => {
  describe('basic markdown rendering', () => {
    it('renders headings with id slugs', async () => {
      const html = await compileMdx('## Getting Started');
      expect(html).toContain('<h2');
      expect(html).toContain('id="getting-started"');
      expect(html).toContain('Getting Started');
    });

    it('renders paragraphs', async () => {
      const html = await compileMdx('Hello world');
      expect(html).toContain('<p>Hello world</p>');
    });

    it('renders bold and italic', async () => {
      const html = await compileMdx('**bold** and *italic*');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('renders code blocks', async () => {
      const html = await compileMdx('```typescript\nconst x = 1;\n```');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      expect(html).toContain('const x = 1;');
    });

    it('renders inline code', async () => {
      const html = await compileMdx('Use `bun install`');
      expect(html).toContain('<code>bun install</code>');
    });

    it('renders links', async () => {
      const html = await compileMdx('[Docs](https://example.com)');
      expect(html).toContain('<a href="https://example.com"');
      expect(html).toContain('Docs</a>');
    });

    it('renders GFM tables', async () => {
      const html = await compileMdx('| Col A | Col B |\n|-------|-------|\n| 1 | 2 |');
      expect(html).toContain('<table>');
      expect(html).toContain('<th>Col A</th>');
      expect(html).toContain('<td>1</td>');
    });

    it('renders GFM strikethrough', async () => {
      const html = await compileMdx('~~deleted~~');
      expect(html).toContain('<del>deleted</del>');
    });

    it('renders unordered lists', async () => {
      const html = await compileMdx('- One\n- Two');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>One</li>');
      expect(html).toContain('<li>Two</li>');
    });
  });

  describe('MDX components — block-level (mdxJsxFlowElement)', () => {
    it('renders Callout with type', async () => {
      const mdx = '<Callout type="warning">\nDo not do this.\n</Callout>';
      const html = await compileMdx(mdx);
      expect(html).toContain('class="docs-callout docs-callout-warning"');
      expect(html).toContain('role="note"');
      expect(html).toContain('docs-callout-title');
      expect(html).toContain('Do not do this.');
    });

    it('renders Callout with default type (info)', async () => {
      const mdx = '<Callout>\nSome info.\n</Callout>';
      const html = await compileMdx(mdx);
      expect(html).toContain('docs-callout-info');
    });

    it('renders CodeTabs with Tab children', async () => {
      const mdx = `<CodeTabs>
<Tab label="JS">

\`\`\`js
const x = 1;
\`\`\`

</Tab>
<Tab label="Python">

\`\`\`python
x = 1
\`\`\`

</Tab>
</CodeTabs>`;
      const html = await compileMdx(mdx);
      expect(html).toContain('class="docs-code-tabs"');
      expect(html).toContain('data-tab-label="JS"');
      expect(html).toContain('data-tab-label="Python"');
      expect(html).toContain('docs-tab-button');
      expect(html).toContain('docs-tab-content');
      expect(html).toContain('const x = 1;');
      expect(html).toContain('x = 1');
    });

    it('renders Steps with Step children', async () => {
      const mdx = `<Steps>
<Step title="Install">

Run \`bun install\`.

</Step>
<Step title="Configure">

Edit the config file.

</Step>
</Steps>`;
      const html = await compileMdx(mdx);
      expect(html).toContain('<ol class="docs-steps"');
      expect(html).toContain('class="docs-step"');
      expect(html).toContain('docs-step-title');
      expect(html).toContain('Install');
      expect(html).toContain('Configure');
      expect(html).toContain('bun install');
    });

    it('renders Badge as block element', async () => {
      const mdx = '<Badge variant="success">Active</Badge>';
      const html = await compileMdx(mdx);
      expect(html).toContain('class="docs-badge docs-badge-success"');
      expect(html).toContain('Active');
    });
  });

  describe('MDX components — inline (mdxJsxTextElement)', () => {
    it('renders Badge inline within a paragraph', async () => {
      const mdx = 'Status: <Badge variant="warning">beta</Badge> release.';
      const html = await compileMdx(mdx);
      expect(html).toContain('docs-badge-warning');
      expect(html).toContain('beta');
      expect(html).toContain('Status:');
      expect(html).toContain('release.');
    });
  });

  describe('MDX with markdown content', () => {
    it('renders markdown inside components', async () => {
      const mdx = `<Callout type="tip">

Use **bold** and \`code\` inside callouts.

</Callout>`;
      const html = await compileMdx(mdx);
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('docs-callout-tip');
    });

    it('renders headings with slugs alongside MDX', async () => {
      const mdx = '## Overview\n\nSome text.\n\n<Callout type="info">\nNote this.\n</Callout>';
      const html = await compileMdx(mdx);
      expect(html).toContain('id="overview"');
      expect(html).toContain('docs-callout-info');
    });
  });

  describe('unrecognized MDX elements', () => {
    it('does not crash on unknown components and preserves content', async () => {
      const mdx = '<UnknownWidget>content</UnknownWidget>\n\nParagraph after.';
      const html = await compileMdx(mdx);
      expect(html).toContain('data-mdx-component="UnknownWidget"');
      expect(html).toContain('content');
      expect(html).toContain('Paragraph after.');
    });
  });

  describe('error handling', () => {
    it('returns error HTML for invalid MDX syntax', async () => {
      const mdx = '<Callout type="info">\nUnclosed content.';
      const html = await compileMdx(mdx);
      expect(html).toBeTruthy();
    });
  });
});
