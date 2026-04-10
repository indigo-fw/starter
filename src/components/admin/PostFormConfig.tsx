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
import { GripVertical, Eye, EyeOff, Settings2, ArrowRight } from 'lucide-react';

import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { SlideOver } from '@/core/components/overlays/SlideOver';
import { usePreferencesStore } from '@/core/store/preferences-store';
import {
  ALL_PANELS,
  DEFAULT_MAIN_ORDER,
  DEFAULT_SIDEBAR_ORDER,
  DEFAULT_HIDDEN_PANELS,
} from '@/config/post-form-panels';

// ── Sortable panel row ───────────────────────────────────────
function SortablePanelRow({
  id,
  label,
  isHidden,
  onToggle,
  onMoveColumn,
  moveLabel,
}: {
  id: string;
  label: string;
  isHidden: boolean;
  onToggle: () => void;
  onMoveColumn: () => void;
  moveLabel: string;
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

  const __ = useAdminTranslations();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-(--border-secondary) px-3 py-2.5',
        'bg-(--surface-secondary)',
        isHidden && 'opacity-50',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-(--text-muted) hover:text-(--text-primary)"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          'flex-1 text-sm font-medium text-(--text-primary)',
          isHidden && 'line-through',
        )}
      >
        {label}
      </span>

      <button
        type="button"
        onClick={onMoveColumn}
        className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
        title={moveLabel}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
        title={isHidden ? __('Show panel') : __('Hide panel')}
      >
        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Panel group (one DnD context per column) ──────────────────
function PanelGroup({
  title,
  orderedIds,
  hiddenPanels,
  preferenceKey,
  onToggle,
  onMoveColumn,
  moveLabel,
  __,
}: {
  title: string;
  orderedIds: string[];
  hiddenPanels: string[];
  preferenceKey: 'postForm.mainPanelOrder' | 'postForm.sidebarPanelOrder';
  onToggle: (id: string) => void;
  onMoveColumn: (id: string) => void;
  moveLabel: string;
  __: (s: string) => string;
}) {
  const setPreference = usePreferencesStore((s) => s.set);
  const panelMap = Object.fromEntries(ALL_PANELS.map((p) => [p.id, p]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(active.id as string);
    const newIndex = orderedIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...orderedIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);

    setPreference(preferenceKey, newOrder);
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
        {title}
      </h4>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orderedIds.length === 0 && (
              <div className="rounded-lg border border-dashed border-(--border-secondary) px-3 py-4 text-center text-xs text-(--text-muted)">
                {__('No panels')}
              </div>
            )}
            {orderedIds.map((id) => {
              const panel = panelMap[id];
              if (!panel) return null;
              return (
                <SortablePanelRow
                  key={id}
                  id={id}
                  label={__(panel.label)}
                  isHidden={hiddenPanels.includes(id)}
                  onToggle={() => onToggle(id)}
                  onMoveColumn={() => onMoveColumn(id)}
                  moveLabel={moveLabel}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── Config panel content ─────────────────────────────────────
function PostFormConfigPanel({ __ }: { __: (s: string) => string }) {
  const mainOrder = usePreferencesStore((s) =>
    (s.data['postForm.mainPanelOrder'] as string[] | undefined) ?? DEFAULT_MAIN_ORDER,
  );
  const sidebarOrder = usePreferencesStore((s) =>
    (s.data['postForm.sidebarPanelOrder'] as string[] | undefined) ?? DEFAULT_SIDEBAR_ORDER,
  );
  const hiddenPanels = usePreferencesStore((s) =>
    (s.data['postForm.hiddenPanels'] as string[] | undefined) ?? DEFAULT_HIDDEN_PANELS,
  );
  const setPreference = usePreferencesStore((s) => s.set);

  // Build effective ordered lists
  const allIds = ALL_PANELS.map((p) => p.id);

  const effectiveMainOrder = [
    ...mainOrder.filter((id) => allIds.includes(id)),
    ...DEFAULT_MAIN_ORDER.filter((id) => !mainOrder.includes(id) && !sidebarOrder.includes(id)),
  ];
  const effectiveSidebarOrder = [
    ...sidebarOrder.filter((id) => allIds.includes(id)),
    ...DEFAULT_SIDEBAR_ORDER.filter((id) => !sidebarOrder.includes(id) && !mainOrder.includes(id)),
  ];

  function togglePanel(id: string) {
    const current = new Set(hiddenPanels);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    setPreference('postForm.hiddenPanels', [...current]);
  }

  function moveToSidebar(id: string) {
    const newMain = effectiveMainOrder.filter((i) => i !== id);
    const newSidebar = [...effectiveSidebarOrder.filter((i) => i !== id), id];
    setPreference('postForm.mainPanelOrder', newMain);
    setPreference('postForm.sidebarPanelOrder', newSidebar);
  }

  function moveToMain(id: string) {
    const newSidebar = effectiveSidebarOrder.filter((i) => i !== id);
    const newMain = [...effectiveMainOrder.filter((i) => i !== id), id];
    setPreference('postForm.mainPanelOrder', newMain);
    setPreference('postForm.sidebarPanelOrder', newSidebar);
  }

  return (
    <>
      <p className="mb-4 text-sm text-(--text-secondary)">
        {__('Drag to reorder panels. Toggle visibility with the eye icon.')}
      </p>

      <div className="space-y-6">
        <PanelGroup
          title={__('Content Panels')}
          orderedIds={effectiveMainOrder}
          hiddenPanels={hiddenPanels}
          preferenceKey="postForm.mainPanelOrder"
          onToggle={togglePanel}
          onMoveColumn={moveToSidebar}
          moveLabel={__('Move to sidebar')}
          __={__}
        />
        <PanelGroup
          title={__('Sidebar Panels')}
          orderedIds={effectiveSidebarOrder}
          hiddenPanels={hiddenPanels}
          preferenceKey="postForm.sidebarPanelOrder"
          onToggle={togglePanel}
          onMoveColumn={moveToMain}
          moveLabel={__('Move to content')}
          __={__}
        />
      </div>
    </>
  );
}

// ── Config button + SlideOver ────────────────────────────────
export function PostFormConfig() {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary"
        title={__('Configure panels')}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      <SlideOver open={open} onClose={() => setOpen(false)} title={__('Editor Layout')} width="sm">
        {open && <PostFormConfigPanel __={__} />}
      </SlideOver>
    </>
  );
}
