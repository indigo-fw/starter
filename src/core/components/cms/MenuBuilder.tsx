'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { GripVertical, Plus, Trash2, Loader2, ChevronRight } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { toast } from '@/core/store/toast-store';

interface MenuItem {
  id: string;
  parentId: string | null;
  label: string;
  url: string;
  contentType: string | null;
  contentId: string | null;
  openInNewTab: boolean;
  order: number;
}

interface Props {
  menuId: string;
}

let nextTempId = 1;

// ── Sortable row ────────────────────────────────────────
function SortableItem({
  item,
  depth,
  onUpdate,
  onRemove,
  onIndent,
  onOutdent,
  __,
}: {
  item: MenuItem;
  depth: number;
  onUpdate: (id: string, updates: Partial<MenuItem>) => void;
  onRemove: (id: string) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  __: (s: string) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: depth * 24,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="menu-builder-item card flex items-center gap-2 p-3"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab text-(--text-muted) hover:text-(--text-secondary) touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        type="text"
        value={item.label}
        onChange={(e) => onUpdate(item.id, { label: e.target.value })}
        placeholder={__('Label')}
        className="flex-1 rounded-md border border-(--border-primary) px-2 py-1.5 text-sm"
      />

      <input
        type="text"
        value={item.url}
        onChange={(e) => onUpdate(item.id, { url: e.target.value })}
        placeholder={__('URL')}
        className="flex-1 rounded-md border border-(--border-primary) px-2 py-1.5 text-sm"
      />

      <label className="flex items-center gap-1 text-xs text-(--text-muted) whitespace-nowrap">
        <input
          type="checkbox"
          checked={item.openInNewTab}
          onChange={(e) => onUpdate(item.id, { openInNewTab: e.target.checked })}
          className="rounded border-(--border-primary)"
        />
        {__('New tab')}
      </label>

      <div className="flex gap-0.5">
        <button
          type="button"
          onClick={() => onIndent(item.id)}
          className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary)"
          title={__('Indent')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onOutdent(item.id)}
          className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary)"
          title={__('Outdent')}
        >
          <ChevronRight className="h-3.5 w-3.5 rotate-180" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="rounded p-1 text-(--text-muted) hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main builder ────────────────────────────────────────
export function MenuBuilder({ menuId }: Props) {
  const __ = useAdminTranslations();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const itemsQuery = trpc.menus.getItems.useQuery(
    { menuId },
    { enabled: !!menuId }
  );

  if (itemsQuery.data && !loaded) {
    setItems(
      itemsQuery.data.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        label: item.label,
        url: item.url ?? '',
        contentType: item.contentType,
        contentId: item.contentId,
        openInNewTab: item.openInNewTab,
        order: item.order,
      }))
    );
    setLoaded(true);
  }

  const saveItems = trpc.menus.saveItems.useMutation({
    onSuccess: () => toast.success(__('Menu saved')),
    onError: (err) => toast.error(err.message),
  });

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  // Depth map for indentation
  const depthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item.parentId) {
        map.set(item.id, 0);
      } else {
        map.set(item.id, (map.get(item.parentId) ?? 0) + 1);
      }
    }
    return map;
  }, [items]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const copy = [...prev];
      const [moved] = copy.splice(oldIndex, 1);
      copy.splice(newIndex, 0, moved);
      return copy;
    });
  }

  const updateItem = useCallback((id: string, updates: Partial<MenuItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const toRemove = new Set<string>();
      function collectChildren(parentId: string) {
        toRemove.add(parentId);
        for (const item of prev) {
          if (item.parentId === parentId) collectChildren(item.id);
        }
      }
      collectChildren(id);
      return prev.filter((item) => !toRemove.has(item.id));
    });
  }, []);

  const indentItem = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const prevSibling = prev[idx - 1];
      return prev.map((item) =>
        item.id === id ? { ...item, parentId: prevSibling.id } : item
      );
    });
  }, []);

  const outdentItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item?.parentId) return prev;
      const parent = prev.find((i) => i.id === item.parentId);
      const grandparentId = parent?.parentId ?? null;
      return prev.map((i) =>
        i.id === id ? { ...i, parentId: grandparentId } : i
      );
    });
  }, []);

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `temp-${nextTempId++}`,
        parentId: null,
        label: '',
        url: '',
        contentType: null,
        contentId: null,
        openInNewTab: false,
        order: prev.length,
      },
    ]);
  }

  function handleSave() {
    saveItems.mutate({
      menuId,
      items: items.map((item, idx) => ({
        clientId: item.id,
        parentClientId: item.parentId,
        label: item.label || 'Untitled',
        url: item.url || null,
        contentType: item.contentType,
        contentId: item.contentId,
        openInNewTab: item.openInNewTab,
        order: idx,
      })),
    });
  }

  if (itemsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div className="menu-builder space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="menu-builder-items space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                depth={depthMap.get(item.id) ?? 0}
                onUpdate={updateItem}
                onRemove={removeItem}
                onIndent={indentItem}
                onOutdent={outdentItem}
                __={__}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-(--text-muted)">
          {__('No menu items yet. Add one below.')}
        </p>
      )}

      <div className="menu-builder-actions flex gap-2">
        <button type="button" onClick={addItem} className="btn btn-secondary">
          <Plus className="h-4 w-4" />
          {__('Add Item')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveItems.isPending}
          className="btn btn-primary disabled:opacity-50"
        >
          {saveItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {__('Save Menu')}
        </button>
      </div>
    </div>
  );
}
