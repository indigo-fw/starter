'use client';

import { useCallback, useRef, useState } from 'react';

/** Imperative handle for programmatic editor control. */
export interface EditorHandle {
  replaceSelection: (text: string) => void;
  insertImage?: (src: string, alt?: string) => void;
}

/** Shared link picker state for CMS editor forms (PostForm, CategoryForm). */
export function useLinkPicker() {
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const editorRef = useRef<EditorHandle | null>(null);

  const handleLinkSelect = useCallback((title: string, url: string) => {
    editorRef.current?.replaceSelection(`[${title}](${url})`);
    setLinkPickerOpen(false);
  }, []);

  const openLinkPicker = useCallback(() => setLinkPickerOpen(true), []);
  const closeLinkPicker = useCallback(() => setLinkPickerOpen(false), []);

  return {
    linkPickerOpen,
    openLinkPicker,
    closeLinkPicker,
    handleLinkSelect,
    editorRef,
  };
}
