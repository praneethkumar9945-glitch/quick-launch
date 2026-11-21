import { Link } from "@tanstack/react-router";
import { Bell, Briefcase, Check, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { DockItem } from "@/components/DockNav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HeaderActions({
  items,
  workspaceOpen = false,
  onWorkspaceToggle,
}: {
  items: readonly DockItem[];
  workspaceOpen?: boolean;
  onWorkspaceToggle?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? items.filter((item) => item.title.toLowerCase().includes(search))
      : items;
  }, [items, query]);

  // Zoho-style shortcut: Ctrl/Cmd + K opens the search box from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSearchOpenChange(open: boolean) {
    setSearchOpen(open);
    if (!open) setQuery("");
  }

  function handleSave() {
    try {
      localStorage.setItem("manager-edu-last-saved", new Date().toISOString());
    } catch {
      // Saving feedback still works when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent("manager-edu:save"));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="header-actions ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className="header-search-field" aria-label="Search" title="Search (Ctrl K)">
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="header-search-kbd">Ctrl K</kbd>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={10}
          collisionPadding={16}
          className="header-search-popover w-80"
        >
          <label className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages..."
              aria-label="Search pages"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <nav aria-label="Search results" className="mt-2 grid gap-1">
            {results.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => onSearchOpenChange(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {item.title}
                </Link>
              );
            })}
            {results.length === 0 && (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">No pages found</p>
            )}
          </nav>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        className="header-save-btn"
        data-saved={saved ? "" : undefined}
        aria-label={saved ? "Saved" : "Save"}
        title={saved ? "Saved" : "Save"}
        onClick={handleSave}
      >
        {saved ? <Check className="size-4" /> : <Save className="size-4" />}
        <span>{saved ? "Saved" : "Save"}</span>
      </button>

      <button type="button" className="glass-icon relative" aria-label="Notifications" title="Notifications">
        <Bell className="size-[18px]" />
        <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-salmon ring-2 ring-background" />
      </button>

      <button
        type="button"
        className="glass-icon header-workspace-btn"
        data-open={workspaceOpen ? "" : undefined}
        aria-label="Workspace"
        aria-pressed={workspaceOpen}
        title="Workspace"
        onClick={onWorkspaceToggle}
      >
        <Briefcase className="size-[18px]" />
      </button>
    </div>
  );
}
