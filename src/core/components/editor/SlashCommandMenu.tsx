'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,

  useRef,
  useState,
} from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  Table,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SlashCommandItem } from './slash-commands';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  H1: Heading1,
  H2: Heading2,
  H3: Heading3,
  list: List,
  'list-ordered': ListOrdered,
  quote: Quote,
  code: Code2,
  minus: Minus,
  table: Table,
  image: ImageIcon,
};

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [prevItems, setPrevItems] = useState(items);
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset selection when items change (adjust state during render)
    if (prevItems !== items) {
      setPrevItems(items);
      setSelectedIndex(0);
    }

    // Scroll selected item into view
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const selected = container.querySelector('[data-selected="true"]');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="slash-command-menu rounded-lg border border-(--border-primary) bg-(--surface-primary) p-3 text-sm text-(--text-muted) shadow-lg">
          No results
        </div>
      );
    }

    // Group items
    const groups: { label: string; items: { item: SlashCommandItem; globalIndex: number }[] }[] = [];
    let globalIndex = 0;
    for (const item of items) {
      let group = groups.find((g) => g.label === item.group);
      if (!group) {
        group = { label: item.group, items: [] };
        groups.push(group);
      }
      group.items.push({ item, globalIndex });
      globalIndex++;
    }

    return (
      <div
        ref={containerRef}
        className="slash-command-menu max-h-80 overflow-y-auto rounded-lg border border-(--border-primary) bg-(--surface-primary) shadow-lg w-64"
      >
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
              {group.label}
            </div>
            {group.items.map(({ item, globalIndex: idx }) => {
              const Icon = ICON_MAP[item.icon];
              return (
                <button
                  key={item.title}
                  type="button"
                  data-selected={idx === selectedIndex}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                    idx === selectedIndex
                      ? 'bg-(--surface-secondary) text-(--text-primary)'
                      : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
                  )}
                  onClick={() => selectItem(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--border-primary) bg-(--surface-inset)">
                    {Icon ? (
                      <Icon className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">{item.icon}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-(--text-muted)">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);
