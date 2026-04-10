'use client';

import { useEffect, useRef } from 'react';

/**
 * Hydrates static `.docs-code-tabs` HTML with interactive tab switching.
 * Uses event delegation on a parent ref — no per-tab state needed.
 *
 * Progressive enhancement:
 *   - No JS: all tabs visible as stacked sections with label headings
 *   - JS loaded: proper tab bar with switching, only active tab visible
 *
 * Expected HTML structure (produced by mdx-compiler):
 *   .docs-code-tabs
 *     .docs-tab[data-tab-label]
 *       button.docs-tab-button  (inline label, visible in no-JS)
 *       .docs-tab-content
 */
export function MdxTabsHydrator({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const tabGroups = root.querySelectorAll<HTMLElement>('.docs-code-tabs');
    for (const group of tabGroups) {
      initTabGroup(group);
    }

    function handleClick(e: MouseEvent) {
      const button = (e.target as HTMLElement).closest<HTMLElement>('.docs-code-tabs-bar > .docs-tab-button');
      if (!button) return;

      const group = button.closest<HTMLElement>('.docs-code-tabs');
      if (!group) return;

      const label = button.dataset.tabLabel;
      activateTab(group, label);
    }

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount; content is server-rendered and stable
  }, []);

  return <div ref={ref}>{children}</div>;
}

/** Activate a tab by label within a group. */
function activateTab(group: HTMLElement, label: string | undefined) {
  if (!label) return;

  const bar = group.querySelector('.docs-code-tabs-bar');
  if (!bar) return;

  for (const btn of bar.querySelectorAll<HTMLElement>('.docs-tab-button')) {
    btn.classList.toggle('is-active', btn.dataset.tabLabel === label);
  }
  for (const tab of group.querySelectorAll<HTMLElement>('.docs-tab')) {
    tab.classList.toggle('is-active', tab.dataset.tabLabel === label);
  }
}

/**
 * Build a tab bar from the tabs in the group, mark the group as JS-ready,
 * and activate the first tab.
 */
function initTabGroup(group: HTMLElement) {
  const tabs = group.querySelectorAll<HTMLElement>('.docs-tab');
  if (tabs.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'docs-code-tabs-bar';

  for (const tab of tabs) {
    const label = tab.dataset.tabLabel ?? '';
    const barBtn = document.createElement('button');
    barBtn.type = 'button';
    barBtn.className = 'docs-tab-button';
    barBtn.dataset.tabLabel = label;
    barBtn.textContent = label;
    bar.appendChild(barBtn);
  }

  group.insertBefore(bar, group.firstChild);
  group.classList.add('js-tabs-ready');

  const firstLabel = tabs[0]?.dataset.tabLabel;
  if (firstLabel) activateTab(group, firstLabel);
}
