import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";

export type DockItem = { title: string; url: string; icon: LucideIcon };

const BASE = 40; // resting tile size (px)
const MAX = 64; // tile size directly under the pointer
const RANGE = 130; // how far (px) the magnification reaches either side

const tones: Record<string, string> = {
  "/": "blue",
  "/admission": "green",
  "/finance": "amber",
  "/admin": "red",
  "/academic": "violet",
  "/hr": "teal",
  "/directors": "slate",
  "/workspace": "orange",
  "/settings": "slate",
};

/** macOS Dock style menu: icons magnify under the pointer, labels float on hover, a dot marks the open page. */
export function DockNav({
  items,
  isActive,
  magnify = true,
  className = "",
}: {
  items: readonly DockItem[];
  isActive: (url: string) => boolean;
  magnify?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const frame = useRef(0);
  const pointerX = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bouncing, setBouncing] = useState<string | null>(null);

  // Magnify only for a real mouse and when the user hasn't asked for reduced motion.
  useEffect(() => {
    if (!magnify) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [magnify]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const apply = useCallback(() => {
    frame.current = 0;
    const x = pointerX.current;
    for (const el of refs.current) {
      if (!el) continue;
      let size = BASE;
      if (x !== null) {
        const r = el.getBoundingClientRect();
        const t = Math.max(0, 1 - Math.abs(x - (r.left + r.width / 2)) / RANGE);
        size = BASE + (MAX - BASE) * t * t * (3 - 2 * t);
      }
      el.style.setProperty("--dock-size", `${size.toFixed(1)}px`);
    }
  }, []);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  }, [apply]);

  const onMove = (e: MouseEvent) => {
    if (!enabled) return;
    pointerX.current = e.clientX;
    schedule();
  };
  const onLeave = () => {
    pointerX.current = null;
    schedule();
  };

  return (
    <nav
      aria-label="Main navigation"
      className={`dock-nav ${className}`}
      data-static={magnify ? undefined : "true"}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {items.map((m, i) => {
        const active = isActive(m.url);
        const Icon = m.icon;
        return (
          <Link
            key={m.url}
            to={m.url}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="dock-item"
            data-active={active}
            data-tone={tones[m.url] ?? "slate"}
            data-bounce={bouncing === m.url || undefined}
            aria-current={active ? "page" : undefined}
            aria-label={m.title}
            style={{ "--dock-size": `${BASE}px` } as CSSProperties}
            onClick={() => setBouncing(m.url)}
            onAnimationEnd={() => setBouncing(null)}
          >
            <span className="dock-tile">
              <Icon aria-hidden="true" />
            </span>
            <span className="dock-label">{m.title}</span>
            <span className="dock-dot" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
