import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';

const DRAG_HANDLE_WIDTH = 22;
const DRAG_HANDLE_GAP = 4;

/**
 * Adds a drag handle (grip icon) to the left of top-level blocks.
 * On hover near the left edge, a handle appears. Dragging it reorders blocks
 * via ProseMirror's built-in DnD (NodeSelection + slice).
 */
export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let handle: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;
    let handleHovered = false;
    let editorHovered = false;
    let throttleFrame: number | null = null;

    function createHandle() {
      const el = document.createElement('div');
      el.className = 'editor-drag-handle';
      el.contentEditable = 'false';
      el.draggable = true;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
        <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
        <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
      </svg>`;
      return el;
    }

    function getTopLevelBlockAtCoords(view: EditorView, y: number) {
      const editorRect = view.dom.getBoundingClientRect();
      const pos = view.posAtCoords({ left: editorRect.left + 10, top: y });
      if (!pos) return null;

      const resolved = view.state.doc.resolve(pos.pos);
      if (resolved.depth < 1) return null;
      const topPos = resolved.before(1);
      const node = view.state.doc.nodeAt(topPos);
      if (!node) return null;

      return { pos: topPos, node };
    }

    function hideHandle() {
      if (handle) {
        handle.style.opacity = '0';
        handle.style.pointerEvents = 'none';
      }
      currentBlockPos = null;
    }

    function showHandle() {
      if (handle) {
        handle.style.opacity = '1';
        handle.style.pointerEvents = 'auto';
      }
    }

    function maybeHide() {
      // Only hide if neither the editor left edge nor the handle is hovered
      if (!handleHovered && !editorHovered) {
        hideHandle();
      }
    }

    const plugin = new Plugin({
      key: new PluginKey('dragHandle'),
      view(view) {
        handle = createHandle();
        hideHandle();

        // The handle lives inside the editor's scroll container (parent)
        // but is positioned absolutely relative to it
        const container = view.dom.parentElement;
        if (container) {
          container.style.position = 'relative';
          container.appendChild(handle);
        }

        function positionHandle(view: EditorView, y: number) {
          if (!handle) return;

          const block = getTopLevelBlockAtCoords(view, y);
          if (!block) {
            maybeHide();
            return;
          }

          currentBlockPos = block.pos;

          const domNode = view.nodeDOM(block.pos) as HTMLElement | null;
          if (!domNode) return;

          const editorRect = view.dom.getBoundingClientRect();
          const blockRect = domNode.getBoundingClientRect();

          // Position relative to the editor's scroll container
          const top = blockRect.top - editorRect.top + view.dom.scrollTop;
          const left = -(DRAG_HANDLE_WIDTH + DRAG_HANDLE_GAP);

          handle.style.top = `${top + 2}px`;
          handle.style.left = `${left}px`;
          showHandle();
        }

        function onMouseMove(e: MouseEvent) {
          if (!handle) return;
          const editorRect = view.dom.getBoundingClientRect();

          // Only respond when cursor is near the left padding area
          const distFromLeft = e.clientX - editorRect.left;
          if (distFromLeft > 60 || distFromLeft < -(DRAG_HANDLE_WIDTH + DRAG_HANDLE_GAP + 10)) {
            editorHovered = false;
            maybeHide();
            return;
          }

          editorHovered = true;

          // Throttle via rAF
          if (throttleFrame !== null) return;
          throttleFrame = requestAnimationFrame(() => {
            throttleFrame = null;
            positionHandle(view, e.clientY);
          });
        }

        function onMouseLeave() {
          editorHovered = false;
          maybeHide();
        }

        function onHandleMouseEnter() {
          handleHovered = true;
        }

        function onHandleMouseLeave() {
          handleHovered = false;
          maybeHide();
        }

        function onDragStart(e: DragEvent) {
          if (currentBlockPos == null) return;
          const node = view.state.doc.nodeAt(currentBlockPos);
          if (!node) return;

          // Create a NodeSelection so ProseMirror handles the drop
          const selection = NodeSelection.create(view.state.doc, currentBlockPos);
          view.dispatch(view.state.tr.setSelection(selection));

          // Set up ProseMirror's internal DnD — the drop handler reads view.dragging
          const slice = selection.content();
          view.dragging = { slice, move: true };

          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // dataTransfer needs some data to enable the drag
            e.dataTransfer.setData('text/plain', '');

            const blockDom = view.nodeDOM(currentBlockPos) as HTMLElement | null;
            if (blockDom) {
              e.dataTransfer.setDragImage(blockDom, 0, 0);
            }
          }

          hideHandle();
        }

        view.dom.addEventListener('mousemove', onMouseMove);
        view.dom.addEventListener('mouseleave', onMouseLeave);
        handle.addEventListener('mouseenter', onHandleMouseEnter);
        handle.addEventListener('mouseleave', onHandleMouseLeave);
        handle.addEventListener('dragstart', onDragStart);

        return {
          update() {
            // If a block is being tracked, reposition (handles doc changes)
            if (currentBlockPos !== null && handle && handle.style.opacity === '1') {
              const node = view.state.doc.nodeAt(currentBlockPos);
              if (!node) {
                hideHandle();
              }
            }
          },
          destroy() {
            if (throttleFrame !== null) cancelAnimationFrame(throttleFrame);
            view.dom.removeEventListener('mousemove', onMouseMove);
            view.dom.removeEventListener('mouseleave', onMouseLeave);
            if (handle) {
              handle.removeEventListener('mouseenter', onHandleMouseEnter);
              handle.removeEventListener('mouseleave', onHandleMouseLeave);
              handle.removeEventListener('dragstart', onDragStart);
              handle.remove();
              handle = null;
            }
          },
        };
      },
    });

    return [plugin];
  },
});
