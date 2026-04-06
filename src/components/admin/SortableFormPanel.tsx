'use client';

import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface SortableFormPanelProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function SortableFormPanel({ id, title, children }: SortableFormPanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/panel card">
      <div className="widget-header rounded-t-[var(--radius-lg)]">
        <h3 className="h2">{title}</h3>
        <button
          type="button"
          className={cn(
            'touch-none text-(--text-muted) hover:text-(--text-primary)',
            'opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100 transition-opacity',
            'shrink-0',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

/** Non-sortable panel (for fixed panels like Title, Content, Status) */
export function FormPanel({ title, headerActions, children }: { title?: string; headerActions?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {title && (
        <div className="widget-header rounded-t-[var(--radius-lg)]">
          <h3 className="h2">{title}</h3>
          {headerActions}
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Thin sortable wrapper — adds dnd-kit sorting without adding card/header styling.
 * Used for components that render their own `.card` wrapper internally
 * (e.g. SeoPreviewCard, CustomFieldsEditor, RevisionHistory, PostAttachments).
 */
export function SortableFormWrapper({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/panel relative">
      {/* Floating drag handle */}
      <button
        type="button"
        className={cn(
          'absolute -left-2 top-2 z-10 rounded p-1',
          'touch-none text-(--text-muted) hover:text-(--text-primary) hover:bg-(--surface-secondary)',
          'opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100 transition-opacity',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
