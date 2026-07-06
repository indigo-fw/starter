/**
 * /llms.txt — the AI agent's entry point to this site (llmstxt.org convention).
 *
 * Served live rather than generated to a static file: the content derives from
 * the deployment's canonical URL and installed modules at request time, so it
 * can never drift across domains or module changes. No regen command needed.
 */

import { LOCALES } from '@/lib/constants';
import { siteConfig } from '@/config/site';
import { moduleRouters } from '@/generated/module-routers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // Canonical URL: site config first (env-driven, deploy-overridable),
  // request origin as the fallback for previews / unusual setups.
  const origin = (siteConfig.url || new URL(request.url).origin).replace(/\/$/, '');
  const hasDocs = 'docs' in moduleRouters;

  const body = `# ${siteConfig.name}

> ${siteConfig.description}
>
> This site is built on Indigo — an AI-agent-friendly SaaS framework. It
> exposes a live Model Context Protocol (MCP) endpoint so agents can operate
> the application directly, without rendering its HTML UI.

## For AI agents

**MCP endpoint:** \`${origin}/api/mcp\` (Streamable HTTP)

Two ways to authenticate:

1. **OAuth 2.1 (interactive)** — just add the endpoint to your MCP client; an
   unauthenticated request returns a \`WWW-Authenticate\` challenge and the
   client opens a browser login popup. Works with claude.ai custom connectors,
   Claude Code, and any OAuth-capable MCP client. Discovery metadata:
   \`${origin}/.well-known/oauth-protected-resource\`.
2. **API key (headless/CI)** — an organisation-scoped key in the
   \`Authorization: Bearer <key>\` header. Provisioned at
   \`${origin}/dashboard/settings/api-keys\`; must carry the \`mcp:invoke\`
   scope.

The tool surface is hybrid. \`tools/list\` shows a small curated set of
first-class tools plus four built-ins: \`search_tools\` (find any API action
by keyword), \`describe_tool\` (get its input schema), \`invoke_tool\` (call
it), and \`view_image\` (fetch a same-origin image as actual image content —
for visually verifying uploads). Every API action of this app is reachable
through search → describe → invoke; tool names mirror the dotted router path
(e.g. \`users.me\`, \`cms.list\`). Authorisation is enforced per call; actions
your credential can't perform fail with a clear FORBIDDEN error.

## Identity model

API keys are organisation-scoped: each call acts as the user who minted the
key, inside that key's organisation, with that user's role and permissions.
OAuth tokens act as the logged-in user in their personal organisation.
There is no privilege escalation — a member-role credential cannot perform
admin actions.

## Conventions

- All IDs are UUIDs.
- Timestamps are ISO 8601 strings.
- Soft-deleted records are filtered out of user-facing reads.
- Multi-tenant data is scoped by the credential's organisation implicitly —
  no need to pass organisation IDs in tool arguments.
- Content locales: ${LOCALES.join(', ')}.

## Documentation
${hasDocs ? `\n- Site docs: \`${origin}/docs\`` : ''}
- Framework: https://indigo-fw.dev
- Source / starter: https://github.com/indigo-fw/starter

## For humans

The same functionality is available through the web UI at \`${origin}\`. The
MCP endpoint is purely additive — it parallels the HTML surface, it does not
replace it.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
