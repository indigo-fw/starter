import { parseShortcodes } from '@/core/lib/markdown/shortcodes-parser';
import { markdownToHtml } from '@/core/lib/markdown/markdown';
import { resolveContentVars } from '@/core/lib/content/vars';

/** Map of shortcode names to their React components. Passed by the project layer. */
export type ShortcodeComponentMap = Record<
  string,
  React.ComponentType<{ attrs: Record<string, string>; content?: string }>
>;

interface Props {
  content: string;
  /** Shortcode component registry — project provides this via config. */
  components: ShortcodeComponentMap;
}

export function ShortcodeRenderer({ content, components }: Props) {
  const html = markdownToHtml(resolveContentVars(content));
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
