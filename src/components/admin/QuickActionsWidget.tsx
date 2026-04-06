'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  FileText, Layers, FolderOpen, Briefcase, Image as ImageIcon, ExternalLink,
} from 'lucide-react';

import { adminPanel } from '@/config/routes';
import { useAdminTranslations } from '@/lib/translations';

export default function QuickActionsWidget({ dragHandle }: { dragHandle?: ReactNode }) {
  const __ = useAdminTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2">{__('Quick Actions')}</h2>
        </div>
      </div>
      <div className="quick-actions-grid p-4 grid grid-cols-2 gap-2">
        <Link href={adminPanel.cmsNew('pages')} className="btn btn-secondary justify-center">
          <FileText className="h-4 w-4" />
          {__('New Page')}
        </Link>
        <Link href={adminPanel.cmsNew('blog')} className="btn btn-secondary justify-center">
          <Layers className="h-4 w-4" />
          {__('New Post')}
        </Link>
        <Link href={adminPanel.cmsNew('categories')} className="btn btn-secondary justify-center">
          <FolderOpen className="h-4 w-4" />
          {__('New Category')}
        </Link>
        <Link href={adminPanel.cmsNew('portfolio')} className="btn btn-secondary justify-center">
          <Briefcase className="h-4 w-4" />
          {__('New Project')}
        </Link>
        <Link href={adminPanel.media} className="btn btn-secondary justify-center">
          <ImageIcon className="h-4 w-4" />
          {__('Media Library')}
        </Link>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary justify-center">
          <ExternalLink className="h-4 w-4" />
          {__('View Site')}
        </a>
      </div>
    </div>
  );
}
