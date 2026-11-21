import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/modules/admin/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/modules/admin/components/ui/sheet";
import { cn } from "@/modules/admin/lib/utils";
import { RibbonFolderIcon } from "@/modules/admin/components/app/RibbonFolderIcon";

type NavigationTarget =
  "/admin" | "/admin/batches" | "/admin/exam-requests" | "/admin/attendance" | "/admin/leave" | "/admin/certificates";
type NavigationItem = { to?: NavigationTarget; label: string; icon: LucideIcon };

const PRIMARY_NAV: NavigationItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/batches", label: "Batch Allocation", icon: CalendarClock },
  { to: "/admin/attendance", label: "Academic Information", icon: CalendarCheck },
  { to: "/admin/exam-requests", label: "Examination", icon: ClipboardCheck },
];

const MORE_NAV: NavigationItem[] = [
  { to: "/admin/leave", label: "Leave Approvals", icon: CheckCircle2 },
  { to: "/admin/certificates", label: "Certificates", icon: FileCheck2 },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  const renderItem = (item: NavigationItem) => {
    const active = item.to === "/admin" ? ((path === "/admin" || path === "/admin/") || path === "/admin/") : item.to ? path.startsWith(item.to) : false;
    const itemClass = cn("es-nav-item", active && "is-active");
    const content = (
      <>
        <item.icon className="es-nav-icon" aria-hidden="true" />
        <span className="es-nav-label">{item.label}</span>
      </>
    );

    return item.to ? (
      <Link
        key={item.label}
        to={item.to}
        onClick={onNavigate}
        className={itemClass}
        title={item.label}
      >
        {content}
      </Link>
    ) : (
      <button
        key={item.label}
        type="button"
        className={itemClass}
        title={`${item.label} · Coming soon`}
      >
        {content}
      </button>
    );
  };

  return (
    <nav className="es-nav" aria-label="Main navigation">
      <div className="es-nav-group">{PRIMARY_NAV.map(renderItem)}</div>
      <div className="es-nav-group">{MORE_NAV.map(renderItem)}</div>
    </nav>
  );
}

function Brand() {
  return (
    <div className="es-brand">
      <span className="es-brand-mark">
        <GraduationCap size={24} strokeWidth={2.2} />
      </span>
      <div className="es-brand-copy">
        <p>Administration</p>
      </div>
    </div>
  );
}

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return (
    <div className={cn("es-sidebar-inner", mobile && "es-sidebar-mobile")}>
      <Brand />
      <NavList onNavigate={onNavigate} />
      <button type="button" className="es-logout">
        <LogOut size={18} />
        <span className="es-nav-label">Log out</span>
      </button>
    </div>
  );
}

function NavigationToggle({
  open,
  expanded = open,
  closing = false,
  onToggle,
}: {
  open: boolean;
  expanded?: boolean;
  closing?: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={expanded}
      aria-controls="edu-sidebar"
      onClick={onToggle}
      className="es-menu-button"
      data-navigation-open={open}
      data-navigation-closing={closing}
    >
      <RibbonFolderIcon />
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [folderClosing, setFolderClosing] = useState(false);
  const folderClosingTimer = useRef<number | undefined>(undefined);
  const path = useRouterState({ select: (s) => s.location.pathname });



  useEffect(
    () => () => {
      if (folderClosingTimer.current !== undefined) {
        window.clearTimeout(folderClosingTimer.current);
      }
    },
    [],
  );

  const setNavigationState = (open: boolean) => {
    if (folderClosingTimer.current !== undefined) {
      window.clearTimeout(folderClosingTimer.current);
      folderClosingTimer.current = undefined;
    }

    setNavigationOpen(open);
    if (open) {
      setFolderClosing(false);
      return;
    }

    setFolderClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    folderClosingTimer.current = window.setTimeout(
      () => {
        setFolderClosing(false);
        folderClosingTimer.current = undefined;
      },
      reducedMotion ? 1 : 360,
    );
  };

  return (
    <div className="es-app-shell">

      <div className="es-app-content">
        <main className={cn("es-main", path === "/admin" && "es-dashboard-main")}>{children}</main>
      </div>
    </div>
  );
}
