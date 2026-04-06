import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export interface RenderProps {
  slug: string;
  preview?: string;
  currentPage: number;
  locale: string;
}

export interface MetadataProps {
  slug: string;
  locale: string;
  baseUrl: string;
}

export interface ContentRendererConfig {
  render(props: RenderProps): Promise<ReactNode> | ReactNode;
  generateMetadata(props: MetadataProps): Promise<Metadata>;
}

const registry = new Map<string, ContentRendererConfig>();

export function registerContentRenderer(
  contentTypeId: string,
  config: ContentRendererConfig
): void {
  registry.set(contentTypeId, config);
}

export function getContentRenderer(
  contentTypeId: string
): ContentRendererConfig | undefined {
  return registry.get(contentTypeId);
}
