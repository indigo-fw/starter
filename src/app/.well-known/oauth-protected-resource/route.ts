/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * Identifies `/api/mcp` as an OAuth-protected resource and points clients at
 * the authorization server above. The MCP endpoint references this document in
 * its `WWW-Authenticate` challenge on 401, which is what makes MCP clients
 * automatically launch the OAuth login flow.
 */

import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import { auth } from '@/lib/auth';

export const GET = oAuthProtectedResourceMetadata(auth);
