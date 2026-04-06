import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

interface ResizePluginState {
  selectedImagePos: number | null;
}

/**
 * Extends the default Image extension with click-to-select and drag-to-resize handles.
 * When an image is selected, a wrapper with side handles is rendered via decorations.
 * Drag on any handle resizes the image proportionally.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width') || el.style.width || null,
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: attrs.width, style: `width: ${attrs.width}` };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? [];
    const editor = this.editor;

    const pluginKey = new PluginKey<ResizePluginState>('imageResize');

    const resizePlugin = new Plugin<ResizePluginState>({
      key: pluginKey,
      state: {
        init(): ResizePluginState {
          return { selectedImagePos: null };
        },
        apply(tr, value): ResizePluginState {
          const meta = tr.getMeta(pluginKey) as number | null | undefined;
          if (meta !== undefined) return { selectedImagePos: meta };
          // Revalidate on doc changes — selection may have shifted
          if (tr.docChanged && value.selectedImagePos !== null) {
            const mapped = tr.mapping.map(value.selectedImagePos);
            const node = tr.doc.nodeAt(mapped);
            if (node?.type.name === 'image') return { selectedImagePos: mapped };
            return { selectedImagePos: null };
          }
          return value;
        },
      },
      props: {
        decorations(state) {
          const pluginState = pluginKey.getState(state);
          if (pluginState?.selectedImagePos == null) return DecorationSet.empty;
          const pos = pluginState.selectedImagePos;
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'image') return DecorationSet.empty;

          const nodeDeco = Decoration.node(pos, pos + node.nodeSize, {
            class: 'image-resizable-selected',
          });

          return DecorationSet.create(state.doc, [nodeDeco]);
        },
        handleClick(view, pos) {
          const node = view.state.doc.nodeAt(pos);
          if (node?.type.name === 'image') {
            view.dispatch(view.state.tr.setMeta(pluginKey, pos));
            return true;
          }
          // Clicking elsewhere deselects
          const pluginState = pluginKey.getState(view.state);
          if (pluginState?.selectedImagePos !== null) {
            view.dispatch(view.state.tr.setMeta(pluginKey, null));
          }
          return false;
        },
        handleDOMEvents: {
          mousedown(view, event) {
            const target = event.target as HTMLElement;
            if (!target.classList?.contains('image-resize-handle')) return false;

            event.preventDefault();
            const pluginState = pluginKey.getState(view.state);
            if (pluginState?.selectedImagePos == null) return false;

            const pos = pluginState.selectedImagePos;
            const node = view.state.doc.nodeAt(pos);
            if (!node) return false;

            // Find the image DOM element
            const domNode = view.nodeDOM(pos) as HTMLElement | null;
            const imgEl = domNode?.querySelector?.('img') ?? domNode;
            if (!imgEl) return false;

            const startX = event.clientX;
            const startWidth = imgEl.getBoundingClientRect().width;
            const direction = target.dataset.direction;

            function onMouseMove(e: MouseEvent) {
              const diff = direction === 'left' ? startX - e.clientX : e.clientX - startX;
              const newWidth = Math.max(100, Math.round(startWidth + diff));
              (imgEl as HTMLElement).style.width = `${newWidth}px`;
            }

            function onMouseUp(e: MouseEvent) {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              const diff = direction === 'left' ? startX - e.clientX : e.clientX - startX;
              const newWidth = Math.max(100, Math.round(startWidth + diff));
              const currentNode = view.state.doc.nodeAt(pos);
              if (!currentNode) return;
              const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                width: `${newWidth}px`,
              });
              view.dispatch(tr);
              editor.commands.focus();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            return true;
          },
        },
      },
      view(editorView) {
        let lastPos: number | null = null;

        function removeHandles() {
          editorView.dom.querySelectorAll('.image-resize-handle').forEach((el) => el.remove());
        }

        function addHandles(pos: number) {
          const domNode = editorView.nodeDOM(pos) as HTMLElement | null;
          if (!domNode) return;

          const wrapper = domNode.closest?.('.image-resizable-selected') ?? domNode;
          if (!wrapper || !(wrapper as HTMLElement).style) return;
          (wrapper as HTMLElement).style.position = 'relative';
          (wrapper as HTMLElement).style.display = 'inline-block';

          for (const dir of ['left', 'right'] as const) {
            const handle = document.createElement('div');
            handle.className = `image-resize-handle image-resize-handle-${dir}`;
            handle.dataset.direction = dir;
            handle.contentEditable = 'false';
            wrapper.appendChild(handle);
          }
        }

        function updateHandles() {
          const pluginState = pluginKey.getState(editorView.state);
          const newPos = pluginState?.selectedImagePos ?? null;

          // Skip if position hasn't changed
          if (newPos === lastPos) return;
          lastPos = newPos;

          removeHandles();
          if (newPos !== null) {
            addHandles(newPos);
          }
        }

        return {
          update: updateHandles,
          destroy() {
            removeHandles();
          },
        };
      },
    });

    return [...parentPlugins, resizePlugin];
  },
});
