'use client';

import type { ReactNode } from 'react';

interface CmsFormShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export default function CmsFormShell({ toolbar, children }: CmsFormShellProps) {
  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          {toolbar}
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-inner">
          {children}
        </div>
      </main>
    </>
  );
}
