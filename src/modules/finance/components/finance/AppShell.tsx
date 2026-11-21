import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Landmark } from "lucide-react";
import { TooltipProvider } from "@/modules/finance/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/modules/finance/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle } from "@/modules/finance/components/ui/sheet";
import { Button } from "@/modules/finance/components/ui/button";
import { HeaderActions } from "@/modules/finance/components/finance/HeaderActions";
import { NAV } from "@/modules/finance/finance/nav";
import { REPORT_NAMES, resolveReportKey } from "@/modules/finance/finance/reports";
import { cn } from "@/modules/finance/lib/utils";

const SECTION_LABELS: Record<string, Record<string, string>> = {
  "/finance/transactions": { income: "Income", expense: "Expenses" },
  "/finance/petty-cash": {
    overview: "Cash Overview",
    count: "Denomination Counting",
    history: "Petty Cash History",
  },
  "/finance/ledgers": { cash: "Cash Book", bank: "Bank Book", general: "General Ledger" },
  "/finance/fees": {
    applications: "Applications",
    billing: "Billing",
    concessions: "Fee Concessions",
  },
  "/finance/settlements": {
    overview: "Settlement Overview",
    reconciliation: "Reconciliation",
    history: "Settlement History",
  },
  "/finance/settings": {
    institution: "Institution Details",
    courses: "Course Catalog & Fee Structure",
    categories: "Income & Expense Categories",
    accounts: "Account Categories",
    payments: "Payment Methods",
    receipts: "Receipt Settings",
    year: "Financial Year",
  },
};

const DEFAULT_SECTION_TABS: Record<string, string> = {
  "/finance/transactions": "income",
  "/finance/petty-cash": "overview",
  "/finance/ledgers": "cash",
  "/finance/fees": "billing",
  "/finance/settlements": "overview",
  "/finance/settings": "institution",
};

function getSectionTitle(pathname: string, search: Record<string, unknown>) {
  const tab = typeof search["tab"] === "string" ? search["tab"] : undefined;
  if (pathname === "/finance/reports") {
    return tab === "cash-flow"
      ? "Cash Flow"
      : REPORT_NAMES[resolveReportKey(
          typeof search["report"] === "string" ? search["report"] : undefined,
          tab,
        )];
  }
  const sectionTab = tab ?? DEFAULT_SECTION_TABS[pathname];
  return sectionTab ? SECTION_LABELS[pathname]?.[sectionTab] : undefined;
}

function NavList({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { pathname, tab } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, tab: (s.location.search as { tab?: (string) | undefined }).tab }),
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav className="finance-menu-nav text-[14px]">
      {NAV.map((item) => {
        const active = item.to === "/finance" ? pathname === "/finance" : pathname.startsWith(item.to);
        const Icon = item.icon;
        const base = "finance-menu-item flex w-full items-center gap-[10px] rounded-xl px-[12px] transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50";
        const activeClasses = "bg-sidebar-accent font-semibold text-sidebar-accent-foreground";
        const idleClasses = "text-sidebar-foreground hover:text-white";
        if (!item.children) {
          if (item.report) {
            return (
              <Link key={item.to} to="/finance/reports" search={{ report: item.report }} onClick={onNavigate}
                data-active={active ? "true" : undefined}
                className={cn(base, active ? activeClasses : idleClasses)}>
                <Icon className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/90" />{item.title}
              </Link>
            );
          }
          return (
            <Link key={item.to} to={item.to as "/finance"} onClick={onNavigate}
              data-active={active ? "true" : undefined}
              className={cn(base, active ? activeClasses : idleClasses)}>
              <Icon className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/90" />{item.title}
            </Link>
          );
        }
        const isOpen = open[item.to] ?? active;
        return (
          <Collapsible key={item.to} open={isOpen} onOpenChange={(o) => setOpen((x) => ({ ...x, [item.to]: o }))}>
            <CollapsibleTrigger data-active={active ? "true" : undefined}
              className={cn(base, active ? activeClasses : idleClasses)}>
              <Icon className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/90" />
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-[26px] mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                {item.children.map((c, i) => {
                  const childActive = active && (tab ? tab === c.tab : i === 0);
                  return (
                    <Link key={c.tab} to={item.to as "/finance/transactions"} search={{ tab: c.tab }} onClick={onNavigate}
                      className={cn("block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
                        childActive ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/85 hover:text-white")}>
                      {c.title}
                    </Link>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}

function CompassEmblem({ open }: { open?: (boolean) | undefined }) {
  return (
    <svg className="compass" data-open={open ? "true" : "false"} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="compass-north" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.11 188)" />
          <stop offset="100%" stopColor="oklch(0.55 0.1 195)" />
        </linearGradient>
      </defs>
      <g className="compass-ring">
        <circle className="compass-ring-fill" cx="16" cy="16" r="13.5" fill="oklch(0.97 0.015 190)" stroke="oklch(0.36 0.07 205)" strokeWidth="1.6" />
        <circle cx="16" cy="16" r="10.6" fill="none" stroke="oklch(0.72 0.09 190 / 0.45)" strokeWidth="0.7" />
      </g>
      {[0, 90, 180, 270].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 16 16)`}>
          <path className="compass-tick" d="M16 1.2 L17.3 3.6 L14.7 3.6 Z" fill="oklch(0.36 0.07 205)" />
        </g>
      ))}
      <g className="compass-needle">
        <g className="compass-needle-idle">
          {/* East / west short points */}
          <path d="M16 16 L25 16 L16 17.6 Z" fill="oklch(0.42 0.07 205)" />
          <path d="M16 16 L25 16 L16 14.4 Z" fill="oklch(0.6 0.09 195)" />
          <path d="M16 16 L7 16 L16 14.4 Z" fill="oklch(0.42 0.07 205)" />
          <path d="M16 16 L7 16 L16 17.6 Z" fill="oklch(0.6 0.09 195)" />
          {/* North: long, aqua */}
          <path d="M16 3.8 L18.1 16 L16 16 Z" fill="url(#compass-north)" />
          <path d="M16 3.8 L13.9 16 L16 16 Z" fill="oklch(0.86 0.08 185)" />
          {/* South: shorter, deep teal */}
          <path d="M16 26.2 L17.8 16 L16 16 Z" fill="oklch(0.28 0.05 210)" />
          <path d="M16 26.2 L14.2 16 L16 16 Z" fill="oklch(0.38 0.07 205)" />
          <circle cx="16" cy="16" r="1.9" fill="oklch(0.99 0 0)" stroke="oklch(0.36 0.07 205)" strokeWidth="0.9" />
        </g>
      </g>
    </svg>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <>
      <div className="finance-menu-header border-b border-sidebar-border px-[10px]">
        <div className="flex items-center gap-3">
          <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-white shadow-sm">
            <Landmark className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-white">Finance &amp; Accounts</p>
          </div>
        </div>
      </div>
      <NavList onNavigate={onNavigate} />
      <p className="finance-menu-footer border-t border-sidebar-border px-[10px] text-[11px] text-sidebar-foreground/60">
        FY 2026-27
      </p>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 24, y: -34, r: 1200, top: 70, left: 14, w: 330 });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { pathname, search } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as Record<string, unknown>,
    }),
  });
  const navItem = NAV.find((item) => item.to === pathname);
  const routeTitle = navItem?.title ?? "Finance & Accounts";
  const sectionTitle = getSectionTitle(pathname, search);
  const tabIsPageTitle = ["/finance/fees", "/finance/ledgers", "/finance/settlements", "/finance/settings"].includes(pathname);
  const pageTitle =
    pathname === "/finance"
      ? "Dashboard"
      : tabIsPageTitle && sectionTitle
        ? sectionTitle
        : routeTitle;
  const breadcrumb =
    tabIsPageTitle && sectionTitle
      ? `Finance & Accounts / ${routeTitle}`
      : `Finance & Accounts${sectionTitle ? ` / ${sectionTitle}` : ""}`;
  const handleOpenChange = (open: boolean) => {
    const rect = toggleRef.current?.getBoundingClientRect();
    if (rect) {
      const left = 14;
      const top = Math.round(rect.bottom + 10);
      const w = Math.min(330, window.innerWidth - left * 2);
      const h = window.innerHeight - top - 14;
      const x = rect.left + rect.width / 2 - left;
      const y = rect.top + rect.height / 2 - top;
      const r = Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)));
      setOrigin({ x, y, r, top, left, w });
    }
    setMenuOpen(open);
  };
  return (
    <TooltipProvider delayDuration={150}>
    <Sheet open={menuOpen} onOpenChange={handleOpenChange}>
    <div className="relative flex min-h-[70vh] w-full flex-col">

      <header
        data-menu-open={menuOpen ? "true" : undefined}
        className={cn(
          "relative w-full border-b no-print transition-colors",
          menuOpen ? "pointer-events-none z-[60] border-transparent bg-transparent" : "z-40 border-border bg-card",
        )}
      >
        <div className="app-shell-header-inner flex h-[72px] items-center gap-1 px-4 sm:px-6 lg:px-12">
          <div
            aria-hidden={menuOpen || undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 transition-[filter,opacity] duration-300",
              menuOpen && "opacity-40 blur-[3px]",
            )}
          >
            <div className="min-w-0">
              <h1
                className="truncate text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg"
              >
                {pageTitle}
              </h1>
              <p className="app-shell-breadcrumb truncate text-xs text-muted-foreground">
                {breadcrumb}
              </p>
            </div>
            {pathname !== "/finance" && (
              <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => router.history.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <HeaderActions />
          </div>
        </div>
      </header>
      <main className="app-shell-main w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-12 lg:py-8">
        {children}
      </main>
    </div>
    </Sheet>
    </TooltipProvider>
  );
}
