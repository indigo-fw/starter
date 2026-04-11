/**
 * Title template system — resolves %VAR% placeholders in SEO titles.
 *
 * Template syntax:
 *   %TITLE%       — page/section title
 *   %SITENAME%    — site name from config
 *   %PAGE%        — page number (only for paginated lists)
 *   %PAGE_LABEL%  — translated "Page" word (e.g. "Page", "Seite", "Página")
 *   [...]         — conditional block, only rendered when %PAGE% > 1
 *
 * Examples:
 *   '%TITLE%[ - %PAGE_LABEL% %PAGE%] | %SITENAME%'
 *   Page 1: 'Blog | Indigo'
 *   Page 2: 'Blog - Page 2 | Indigo'
 *
 * Uses the same %VAR% syntax as content variables (%VAR% is being replaced).
 * The difference: title vars are resolved at title-build time with explicit values,
 * content vars are resolved at render time from site.ts/DB.
 */

/**
 * Build a page title from a content type config + optional DB seoTitle override.
 *
 * If the DB seoTitle contains %VAR% template vars, it's used as the full template.
 * Otherwise, it's plugged into the config template as %TITLE%.
 */
export function buildPageTitle(opts: {
  configTemplate: string;
  seoTitle?: string | null;
  fallbackTitle: string;
  sitename: string;
  page?: number;
  /** Translated "Page" label (e.g. __('Page')) */
  pageLabel?: string;
}): string {
  const { configTemplate, seoTitle, fallbackTitle, sitename, page, pageLabel } = opts;
  const isTemplate = !!seoTitle?.includes('%');
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

  // Resolve conditional blocks: [...] → only rendered when %PAGE% > 1
  result = result.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    if (inner.includes('%PAGE%') && (!vars.page || vars.page <= 1)) return '';
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
    .replace(/%TITLE%/g, vars.title)
    .replace(/%SITENAME%/g, vars.sitename)
    .replace(/%PAGE_LABEL%/g, vars.pageLabel ?? '')
    .replace(/%PAGE%/g, String(vars.page ?? ''));
}
