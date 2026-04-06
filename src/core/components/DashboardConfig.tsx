'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Settings2 } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/translations';
import { cn } from '@/lib/utils';
import { SlideOver } from '@/core/components/SlideOver';
import { usePreferencesStore } from '@/core/store/preferences-store';

interface WidgetDef {
  id: string;
  label: string;
  colSpan: number;
  minSpan: number;
  maxSpan: number;
}

interface DashboardConfigProps {
  widgets: WidgetDef[];
  defaultOrder: string[];
  defaultHidden: string[];
}

// ── Common span presets ────────────────────────────────────
const SPAN_OPTIONS = [4, 6, 8, 12] as const;

/** Stable empty object for Zustand selector — avoids infinite re-render from `?? {}` */
const EMPTY_SPANS: Record<string, number> = {};

// ── Sortable widget row ─────────────────────────────────────
function SortableWidgetRow({
  id,
  label,
  isHidden,
  colSpan,
  minSpan,
  maxSpan,
  onToggle,
  onSpanChange,
  __,
}: {
  id: string;
  label: string;
  isHidden: boolean;
  colSpan: number;
  minSpan: number;
  maxSpan: number;
  onToggle: () => void;
  onSpanChange: (span: number) => void;
  __: (s: string) => string;
}) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-(--border-secondary) px-3 py-2.5',
        'bg-(--surface-secondary)',
        isHidden && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab touch-none text-(--text-muted) hover:text-(--text-primary)"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className={cn('flex-1 text-sm font-medium text-(--text-primary)', isHidden && 'line-through')}>
          {label}
        </span>

        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
          title={isHidden ? __('Show widget') : __('Hide widget')}
        >
          {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Column span selector */}
      {!isHidden && (
        <div className="flex items-center gap-2 pl-7">
          <span className="text-xs text-(--text-muted)">{__('Columns')}:</span>
          <div className="flex gap-1">
            {SPAN_OPTIONS.filter((s) => s >= minSpan && s <= maxSpan).map((span) => (
              <button
                key={span}
                type="button"
                onClick={() => onSpanChange(span)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  colSpan === span
                    ? 'bg-(--surface-primary) text-(--text-primary) shadow-sm ring-1 ring-(--border-primary)'
                    : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--surface-inset)'
                )}
              >
                {span}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Config SlideOver content (only mounted when open) ──
function DashboardConfigPanel({
  widgets,
  defaultOrder,
  defaultHidden,
  __,
}: {
  widgets: WidgetDef[];
  defaultOrder: string[];
  defaultHidden: string[];
  __: (s: string) => string;
}) {
  const widgetOrder = usePreferencesStore((s) =>
    (s.data['dashboard.widgetOrder'] as string[] | undefined) ?? defaultOrder
  );
  const hiddenWidgets = usePreferencesStore((s) =>
    (s.data['dashboard.hiddenWidgets'] as string[] | undefined) ?? defaultHidden
  );
  const widgetSpans = usePreferencesStore((s) =>
    (s.data['dashboard.widgetSpans'] as Record<string, number> | undefined) ?? EMPTY_SPANS
  );
  const setPreference = usePreferencesStore((s) => s.set);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Build ordered list — include any widgets not in the saved order at the end
  const allIds = widgets.map((w) => w.id);
  const orderedIds = [
    ...widgetOrder.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !widgetOrder.includes(id)),
  ];

  const widgetMap = Object.fromEntries(widgets.map((w) => [w.id, w]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(active.id as string);
    const newIndex = orderedIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...orderedIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);

    setPreference('dashboard.widgetOrder', newOrder);
  }

  function toggleWidget(id: string) {
    const current = new Set(hiddenWidgets);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    setPreference('dashboard.hiddenWidgets', [...current]);
  }

  function setWidgetSpan(id: string, span: number) {
    setPreference('dashboard.widgetSpans', { ...widgetSpans, [id]: span });
  }

  return (
    <>
      <p className="mb-4 text-sm text-(--text-secondary)">
        {__('Drag to reorder widgets. Toggle visibility with the eye icon.')}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orderedIds.map((id) => {
              const widget = widgetMap[id];
              if (!widget) return null;
              const currentSpan = widgetSpans[id] ?? widget.colSpan;
              return (
                <SortableWidgetRow
                  key={id}
                  id={id}
                  label={__(widget.label)}
                  isHidden={hiddenWidgets.includes(id)}
                  colSpan={currentSpan}
                  minSpan={widget.minSpan}
                  maxSpan={widget.maxSpan}
                  onToggle={() => toggleWidget(id)}
                  onSpanChange={(span) => setWidgetSpan(id, span)}
                  __={__}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

// ── Dashboard Config Button + SlideOver ─────────────────────
export function DashboardConfig({ widgets, defaultOrder, defaultHidden }: DashboardConfigProps) {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
        title={__('Configure dashboard')}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      <SlideOver open={open} onClose={() => setOpen(false)} title={__('Dashboard Layout')} width="sm">
        {open && (
          <DashboardConfigPanel
            widgets={widgets}
            defaultOrder={defaultOrder}
            defaultHidden={defaultHidden}
            __={__}
          />
        )}
      </SlideOver>
    </>
  );
}
