"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  getActiveSectionId,
  getNavItem,
  isNavGroup,
} from "@/core/config/admin-nav";
import type { NavItem } from "@/core/config/admin-nav";
import { useSidebarStore } from "@/core/store/sidebar-store";

const DEFAULT_KNOWN_ACTIONS = new Set(["edit", "new"]);

interface DashboardShellProps {
  navigation: NavItem[];
  children: React.ReactNode;
  /** Extra URL segments (beyond "edit"/"new") to keep as section tokens */
  extraSectionActions?: string[];
}

function deriveSectionTokens(pathname: string, knownActions: Set<string>): string {
  // Strip /dashboard prefix → space-separated tokens for CSS [attr~="token"] matching.
  // /dashboard                        → "home"
  // /dashboard/cms/pages              → "cms pages"
  // /dashboard/cms/pages/new          → "cms pages new"
  // /dashboard/cms/blog/edit/abc-123  → "cms blog edit"
  // /dashboard/users                  → "users"
  // /dashboard/settings/billing       → "settings billing"
  const stripped = pathname.replace(/^\/dashboard\/?/, "");
  if (!stripped) return "home";
  const meaningful = stripped
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s))
    .slice(0, 3);
  // Cap at 2 segments unless the 3rd is a known action (edit, new)
  if (meaningful.length === 3 && !knownActions.has(meaningful[2]!)) {
    meaningful.length = 2;
  }
  return meaningful.join(" ") || "home";
}

export function DashboardShell({ navigation, children, extraSectionActions }: DashboardShellProps) {
  const pathname = usePathname();
  const isL2Collapsed = useSidebarStore((s) => s.isL2Collapsed);
  const activeSectionId = getActiveSectionId(navigation, pathname);
  const activeItem = activeSectionId
    ? getNavItem(navigation, activeSectionId)
    : undefined;
  const hasLevel2 = activeItem && isNavGroup(activeItem);
  const knownActions = extraSectionActions
    ? new Set([...DEFAULT_KNOWN_ACTIONS, ...extraSectionActions])
    : DEFAULT_KNOWN_ACTIONS;
  const sectionTokens = deriveSectionTokens(pathname, knownActions);

  return (
    <div
      className={cn(
        "min-h-dvh pt-12 xl:pt-0 transition-[margin-left] duration-300 ease-in-out",
        hasLevel2 ? (isL2Collapsed ? "xl:ml-24" : "xl:ml-67") : "xl:ml-[48px]",
      )}
    >
      <div className="dash-container" data-section={sectionTokens}>
        {children}
      </div>
    </div>
  );
}
