import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One entry in a module's sub menu. `search` lets a tab open a page with query params. */
export type ModuleTab = {
  to: string;
  label: string;
  exact?: boolean;
  search?: Record<string, string>;
};

/** Underline tab style shared by every module sub menu (first used by Admission). */
export function moduleTabClass(active: boolean) {
  return cn(
    "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition",
    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
  );
}

export function ModuleTabBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative z-10 overflow-x-auto border-b border-border">
      <nav aria-label={label} className="-mb-px flex min-w-max gap-1">
        {children}
      </nav>
    </div>
  );
}

/** Horizontal sub menu linking to a module's pages, highlighting the open one. */
export function ModuleTabs({ tabs, label }: { tabs: readonly ModuleTab[]; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return (
    <ModuleTabBar label={label}>
      {tabs.map((t) => {
        const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to as "/"}
            search={t.search as never}
            aria-current={active ? "page" : undefined}
            className={moduleTabClass(active)}
          >
            {t.label}
          </Link>
        );
      })}
    </ModuleTabBar>
  );
}
