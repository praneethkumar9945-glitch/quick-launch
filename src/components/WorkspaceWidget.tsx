import { Link } from "@tanstack/react-router";
import { Briefcase, Check, FolderOpen, GripHorizontal, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";

const WIDTH = 360;
const MARGIN = 12;

type Task = { id: number; text: string; due: string; done: boolean };

const initialTasks: Task[] = [
  { id: 1, text: "Finalize report cards", due: "Today", done: false },
  { id: 2, text: "Review budget draft", due: "Nov 3", done: false },
  { id: 3, text: "Plan sports week", due: "Nov 8", done: false },
];

const folders = [
  ["Curriculum 2026-27", "64 files"],
  ["Board Meetings", "22 files"],
] as const;

const stats = [
  ["Projects", "9"],
  ["Tasks Due", "23"],
  ["Documents", "418"],
  ["Members", "52"],
] as const;

// Each page mounts its own AppShell, so the window's open state, position and
// tasks live at module level to survive page changes.
let isOpen = false;
let savedPos: { x: number; y: number } | null = null;
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setWorkspaceOpen(next: boolean | ((open: boolean) => boolean)) {
  isOpen = typeof next === "function" ? next(isOpen) : next;
  listeners.forEach((fn) => fn());
}
export function useWorkspaceOpen() {
  return useSyncExternalStore(subscribe, () => isOpen, () => false);
}
let savedTasks = initialTasks;

/** Floating, draggable Workspace window opened from the header (chat-widget style). */
export function WorkspaceWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPosState] = useState(savedPos);
  const setPos = useCallback((next: typeof savedPos | ((p: typeof savedPos) => typeof savedPos)) => {
    setPosState((p) => {
      savedPos = typeof next === "function" ? next(p) : next;
      return savedPos;
    });
  }, []);
  const [minimized, setMinimized] = useState(false);
  const [tasks, setTasksState] = useState(savedTasks);
  const setTasks = (fn: (t: Task[]) => Task[]) =>
    setTasksState((t) => {
      savedTasks = fn(t);
      return savedTasks;
    });
  const [draft, setDraft] = useState("");

  const clamp = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    const w = el?.offsetWidth ?? WIDTH;
    const h = el?.offsetHeight ?? 400;
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    };
  }, []);

  // First open: dock it bottom-right like a chat window.
  useEffect(() => {
    if (open && !pos) {
      setPos(clamp(window.innerWidth - WIDTH - 24, window.innerHeight - 560));
    }
  }, [open, pos, clamp, setPos]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, clamp, onClose, setPos]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function addTask() {
    const text = draft.trim();
    if (!text) return;
    setTasks((t) => [...t, { id: Date.now(), text, due: "New", done: false }]);
    setDraft("");
  }

  if (!open || !pos) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Workspace"
      className="workspace-widget"
      style={{ left: pos.x, top: pos.y, width: WIDTH }}
    >
      <div
        className="workspace-widget-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to move"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Briefcase className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Workspace</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <GripHorizontal className="size-3" /> Drag to move
          </p>
        </div>
        <button type="button" className="glass-icon glass-icon-sm" aria-label={minimized ? "Expand" : "Minimize"} onClick={() => setMinimized((m) => !m)}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="glass-icon glass-icon-sm" aria-label="Close workspace" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      {!minimized && (
        <div className="workspace-widget-body">
          <div className="grid grid-cols-4 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/60 bg-accent/40 px-2 py-2 text-center">
                <p className="text-base font-extrabold">{value}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Tasks</p>
          <ul className="grid gap-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${t.done ? "border-success bg-success text-primary-foreground" : "border-border"}`}>
                    {t.done && <Check className="size-3" />}
                  </span>
                  <span className={`flex-1 ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.text}</span>
                  <span className="text-xs text-muted-foreground">{t.due}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared Folders</p>
          <ul className="grid gap-1">
            {folders.map(([name, count]) => (
              <li key={name} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm">
                <FolderOpen className="size-4 text-primary" />
                <span className="flex-1">{name}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </li>
            ))}
          </ul>

          <Link to="/workspace" onClick={onClose} className="mt-3 block text-center text-xs font-semibold text-primary hover:underline">
            Open full workspace
          </Link>
        </div>
      )}

      {!minimized && (
        <form
          className="workspace-widget-foot"
          onSubmit={(e) => {
            e.preventDefault();
            addTask();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task..."
            aria-label="New task"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Add task">
            <Plus className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}
