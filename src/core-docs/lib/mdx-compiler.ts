/**
 * Re-exports from core MDX compiler for backwards compatibility.
 * The compiler now lives in @/core/lib/mdx-compiler with a component registry.
 */
export { compileMdx as compileMarkdownToHtml, invalidateCompileCache } from '@/core/lib/mdx-compiler';
