import { parseShortcodes } from '@/core/lib/markdown/shortcodes-parser';
import { markdownToHtml } from '@/core/lib/markdown/markdown';

/** Map of shortcode names to their React components. Passed by the project layer. */
export type ShortcodeComponentMap = Record<
  string,
  React.ComponentType<{ attrs: Record<string, string>; content?: string }>
>;

interface Props {
  /**
   * Markdown content with shortcodes already %VAR%-resolved.
   * Server-side call sites should pipe through `resolveContentVars()` from
   * `@/core/lib/content/vars` before passing here. We don't resolve inside
   * this component because vars.ts transitively imports ioredis (Redis pub/sub
   * for cross-instance cache invalidation), and ioredis can't be bundled into
   * client bundles — this component is used by both server AND client callers.
   */
  content: string;
  /** Shortcode component registry — project provides this via config. */
  components: ShortcodeComponentMap;
}

// Matches content variable placeholders like %COMPANY_NAME%. Used only as a
// dev-mode footgun guard — see warning below.
const UNRESOLVED_VAR_RE = /%[A-Z][A-Z0-9_]*%/;

export function ShortcodeRenderer({ content, components }: Props) {
  if (process.env.NODE_ENV !== 'production') {
    const unresolved = content.match(UNRESOLVED_VAR_RE);
    if (unresolved) {
      console.warn(
        `[ShortcodeRenderer] content contains unresolved %VAR% placeholder "${unresolved[0]}". ` +
          'Pipe through resolveContentVars() in the parent server component before ' +
          'passing to ShortcodeRenderer. (vars.ts is server-only and cannot be ' +
          'imported into client bundles.)',
      );
    }
  }

  const html = markdownToHtml(content);
  const segments = parseShortcodes(html);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'html') {
          return (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: seg.content }}
            />
          );
        }

        const Component = components[seg.name];
        if (!Component) {
          // Unknown shortcode — render raw
          return (
            <div key={i} className="my-2 rounded bg-(--surface-secondary) p-3 text-sm text-(--text-muted)">
              [{seg.name}] (unsupported shortcode)
            </div>
          );
        }

        return <Component key={i} attrs={seg.attrs} content={seg.content} />;
      })}
    </>
  );
}
