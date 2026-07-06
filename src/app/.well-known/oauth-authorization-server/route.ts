/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * MCP clients (Claude Code, claude.ai custom connectors, Cursor) discover the
 * authorize/token/registration endpoints here and drive the browser-popup
 * login flow. Served by Better Auth's `mcp` plugin.
 */

import { oAuthDiscoveryMetadata } from 'better-auth/plugins';
import { auth } from '@/lib/auth';

export const GET = oAuthDiscoveryMetadata(auth);
