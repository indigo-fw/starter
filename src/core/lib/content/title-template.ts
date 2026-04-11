/**
 * Resolve a content type's titleTemplate into a final title string.
 *
 * Template syntax:
 *   {title}      — page/section title
 *   {sitename}   — site name from config
 *   {page}       — page number (only for paginated lists)
 *   {pageLabel}  — translated "Page" word (e.g. "Page", "Seite", "Página")
 *   [...]        — conditional block, only rendered when {page} > 1
 *
 * Examples:
 *   '{title}[ - {pageLabel} {page}] | {sitename}'
 *   Page 1: 'Blog | Indigo'
 *   Page 2: 'Blog - Page 2 | Indigo'
 */

/**
 * Build a page title from a content type config + optional DB seoTitle override.
 *
 * If the DB seoTitle contains template vars ({page}, {sitename}), it's used
 * as the full template. Otherwise, it's plugged into the config template as {title}.
 */
export function buildPageTitle(opts: {
  configTemplate: string;
  seoTitle?: string | null;
  fallbackTitle: string;
  sitename: string;
  page?: number;
  /** Translated "Page" label for the config template fallback (e.g. __('Page')) */
  pageLabel?: string;
}): string {
  const { configTemplate, seoTitle, fallbackTitle, sitename, page, pageLabel } = opts;
  const isTemplate = !!seoTitle?.includes('{');
  return resolveTitleTemplate(
    isTemplate ? seoTitle! : configTemplate,
    { title: isTemplate ? '' : (seoTitle || fallbackTitle), sitename, page, pageLabel },
  );
}

export function resolveTitleTemplate(
  template: string,
  vars: {
    title: string;
    sitename: string;
    page?: number;
    pageLabel?: string;
  },
): string {
  let result = template;

  // Resolve conditional blocks: [...] → only rendered when {page} > 1
  result = result.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    if (inner.includes('{page}') && (!vars.page || vars.page <= 1)) return '';
    return resolveVars(inner, vars);
  });

  // Resolve remaining vars
  result = resolveVars(result, vars);

  return result;
}

function resolveVars(
  text: string,
  vars: { title: string; sitename: string; page?: number; pageLabel?: string },
): string {
  return text
    .replace(/\{title\}/g, vars.title)
    .replace(/\{sitename\}/g, vars.sitename)
    .replace(/\{pageLabel\}/g, vars.pageLabel ?? '')
    .replace(/\{page\}/g, String(vars.page ?? ''));
}
