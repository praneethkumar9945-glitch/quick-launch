import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  MailOpen,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  APP_THEME_STORAGE_KEY,
  applyAppTheme,
  parseAppTheme,
  type AppTheme,
} from "@/lib/app-theme";

const QUICK_TOOLS_STORAGE_KEY = "manager-edu-quick-tools-open";
type ToolName = "profile" | "calendar" | "messages";

export function QuickTools({
  theme,
  onThemeChange,
}: {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();

  useEffect(() => {
    try {
      // The rail only reserves space on screen when it was left open on purpose.
      setCollapsed(localStorage.getItem(QUICK_TOOLS_STORAGE_KEY) !== "false");
    } catch {
      // The rail stays tucked away when browser storage is unavailable.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(QUICK_TOOLS_STORAGE_KEY, String(next));
      } catch {
        // Collapsing still works when browser storage is unavailable.
      }
      return next;
    });
    setActiveTool(null);
  }

  function toolOpen(tool: ToolName, open: boolean) {
    setActiveTool(open ? tool : null);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, next);
    } catch {
      // The theme still changes for this visit when storage is unavailable.
    }
    onThemeChange(next);
  }

  return (
    <aside
      className="quick-tools hidden xl:flex"
      data-collapsed={collapsed}
      aria-label="Quick tools"
    >
      <div className="quick-tools-panel" id="quick-tools-panel" inert={collapsed}>
        <div className="icon-rail">
          <Popover
            open={activeTool === "profile"}
            onOpenChange={(open) => toolOpen("profile", open)}
          >
            <PopoverTrigger asChild>
              <button type="button" aria-label="Profile" title="Profile">
                <CircleUserRound className="size-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={14}
              collisionPadding={16}
              className="quick-tools-popover"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-sm font-bold text-lime-foreground">
                  PR
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">Praneeth</p>
                  <p className="text-sm text-muted-foreground">Administrator</p>
                </div>
              </div>
              <Link
                to="/settings"
                className="ghost-btn mt-4 w-full justify-center"
                onClick={() => setActiveTool(null)}
              >
                <Settings className="size-4" />
                Profile &amp; settings
              </Link>
            </PopoverContent>
          </Popover>

          <Popover
            open={activeTool === "calendar"}
            onOpenChange={(open) => toolOpen("calendar", open)}
          >
            <PopoverTrigger asChild>
              <button type="button" aria-label="Calendar" title="Calendar">
                <CalendarDays className="size-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={14}
              collisionPadding={16}
              className="quick-tools-popover w-auto"
            >
              <p className="px-2 pb-2 text-sm font-bold">Calendar</p>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-xl border"
              />
              <p className="px-2 pt-2 text-center text-xs text-muted-foreground" aria-live="polite">
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "Choose a date"}
              </p>
            </PopoverContent>
          </Popover>

          <Popover
            open={activeTool === "messages"}
            onOpenChange={(open) => toolOpen("messages", open)}
          >
            <PopoverTrigger asChild>
              <button type="button" aria-label="Messages" title="Messages">
                <MailOpen className="size-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={14}
              collisionPadding={16}
              className="quick-tools-popover"
            >
              <p className="font-bold">Messages</p>
              <div className="py-7 text-center">
                <MailOpen className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No new messages</p>
                <p className="mt-1 text-sm text-muted-foreground">You&apos;re all caught up.</p>
              </div>
            </PopoverContent>
          </Popover>

          <span className="my-1 h-px w-6 bg-glass-border" />
          <button
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="quick-tools-toggle"
        aria-label={collapsed ? "Show quick tools" : "Hide quick tools"}
        aria-expanded={!collapsed}
        aria-controls="quick-tools-panel"
        title={collapsed ? "Show quick tools" : "Hide quick tools"}
        onClick={toggleCollapsed}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
    </aside>
  );
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(APP_THEME_STORAGE_KEY);
    } catch {
      // Use the default dark appearance when browser storage is unavailable.
    }
    setTheme(parseAppTheme(saved));
  }, []);

  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  return { theme, setTheme };
}
