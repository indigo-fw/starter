'use client';

import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import type { SlashCommandItem } from './slash-commands';

interface SuggestionProps {
  editor: { view: { dom: HTMLElement } };
  clientRect: (() => DOMRect | null) | null;
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

/**
 * Creates the Tiptap suggestion render function for the slash command menu.
 * Uses @floating-ui/dom for positioning (same library as Tiptap's BubbleMenu).
 */
export function createSlashCommandRender() {
  return () => {
    let component: ReactRenderer<SlashCommandMenuHandle> | null = null;
    let popup: HTMLDivElement | null = null;
    let getRect: (() => DOMRect | null) | null = null;

    function updatePosition() {
      if (!popup || !getRect) return;
      const rect = getRect();
      if (!rect) return;

      // Virtual element for floating-ui
      const virtualEl = {
        getBoundingClientRect: () => rect,
      };

      computePosition(virtualEl, popup, {
        placement: 'bottom-start',
        middleware: [
          offset(4),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
        ],
      }).then(({ x, y }) => {
        if (!popup) return;
        Object.assign(popup.style, {
          left: `${x}px`,
          top: `${y}px`,
        });
      });
    }

    return {
      onStart(props: SuggestionProps) {
        component = new ReactRenderer(SlashCommandMenu, {
          props: {
            items: props.items,
            command: props.command,
          },
          editor: props.editor as never,
        });

        popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.zIndex = '50';
        popup.appendChild(component.element);
        document.body.appendChild(popup);

        getRect = props.clientRect;
        updatePosition();
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps({
          items: props.items,
          command: props.command,
        });

        getRect = props.clientRect;
        updatePosition();
      },

      onKeyDown(props: { event: KeyboardEvent }) {
        if (props.event.key === 'Escape') {
          if (popup) popup.style.display = 'none';
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup?.remove();
        component?.destroy();
        popup = null;
        component = null;
        getRect = null;
      },
    };
  };
}
