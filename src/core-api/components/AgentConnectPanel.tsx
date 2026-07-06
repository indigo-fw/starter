'use client';

import { useState } from 'react';

/**
 * Agent Access panel — ready-to-paste snippets for connecting AI agents
 * (Claude Code, Cursor, claude.ai, any MCP client) to this site's MCP endpoint.
 *
 * Rendered on the API-keys settings page. When a freshly minted key is passed,
 * the snippets embed it directly; otherwise they show a placeholder so users
 * can still copy the shape.
 */

interface AgentConnectPanelProps {
  __: (s: string) => string;
  /** The just-created key. Falls back to a placeholder when absent. */
  apiKey?: string | null;
}

type SnippetTab = 'claude-code' | 'mcp-json' | 'generic';

export function AgentConnectPanel({ __, apiKey }: AgentConnectPanelProps) {
  const [tab, setTab] = useState<SnippetTab>('claude-code');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-site.com';
  const mcpUrl = `${origin}/api/mcp`;
  const key = apiKey ?? 'indigo_YOUR_API_KEY';

  const snippets: Record<SnippetTab, { label: string; code: string; hint: string }> = {
    'claude-code': {
      label: __('Claude Code'),
      code: `claude mcp add --transport http ${hostSlug(origin)} ${mcpUrl} --header "Authorization: Bearer ${key}"`,
      hint: __('Run in any terminal. The agent can then operate this site directly — no browser needed.'),
    },
    'mcp-json': {
      label: '.mcp.json',
      code: JSON.stringify(
        {
          mcpServers: {
            [hostSlug(origin)]: {
              type: 'http',
              url: mcpUrl,
              headers: { Authorization: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      ),
      hint: __('Drop into a project root — Claude Code, Cursor and most MCP clients pick it up automatically.'),
    },
    generic: {
      label: __('Any MCP client'),
      code: `${__('Endpoint')}:  ${mcpUrl}\n${__('Transport')}: Streamable HTTP\n${__('Auth')}:      Authorization: Bearer ${key}`,
      hint: __('Works with any client that speaks MCP over Streamable HTTP with bearer auth.'),
    },
  };

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-1">{__('Agent Access (MCP)')}</h2>
      <p className="text-sm text-muted mb-4">
        {__('AI agents can operate this site directly through the MCP endpoint — every API action is available as a tool, scoped to your account and organization. Keys need the mcp:invoke scope (or full access).')}
      </p>

      <div className="flex gap-1 mb-3">
        {(Object.keys(snippets) as SnippetTab[]).map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}
            onClick={() => setTab(t)}
          >
            {snippets[t].label}
          </button>
        ))}
      </div>

      <CodeBlock __={__} code={snippets[tab].code} />
      <p className="text-xs text-muted mt-2">{snippets[tab].hint}</p>

      {!apiKey && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          {__('Create a key above with the mcp:invoke scope, and these snippets will include it automatically.')}
        </p>
      )}
    </div>
  );
}

function hostSlug(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, '').replace(/\./g, '-');
  } catch {
    return 'indigo-site';
  }
}

function CodeBlock({ __, code }: { __: (s: string) => string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <pre className="p-3 bg-muted/50 dark:bg-black/30 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        className="btn btn-sm btn-secondary absolute top-2 right-2"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? __('Copied!') : __('Copy')}
      </button>
    </div>
  );
}
