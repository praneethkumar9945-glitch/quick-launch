import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import {
  LayoutDashboard, Megaphone, UserPlus, Wallet, GraduationCap, Users, Briefcase, Settings,
  TrendingUp, Sparkles, MoreHorizontal,
  BarChart3, Activity, CircleDot, ShieldCheck, Landmark,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import backdrop from "@/assets/manager-llp-infinity-logo.png.asset.json";
import brandLogo from "@/assets/manager-edu-logo-m.png.asset.json";
import { DockNav } from "@/components/DockNav";
import { HeaderActions } from "@/components/HeaderActions";
import { WorkspaceWidget, setWorkspaceOpen, useWorkspaceOpen } from "@/components/WorkspaceWidget";
import { QuickTools, useAppTheme } from "@/components/QuickTools";

export const menu = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Admission", url: "/admission", icon: UserPlus },
  { title: "Finance", url: "/finance", icon: Wallet },
  { title: "Admin", url: "/admin", icon: ShieldCheck },
  { title: "Academic", url: "/academic", icon: GraduationCap },
  { title: "HR", url: "/hr", icon: Users },
  { title: "Directors", url: "/directors", icon: Landmark },
  { title: "Workspace", url: "/workspace", icon: Briefcase },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

/** Settings and Workspace stay available in Search; Workspace opens from its header button. */
const navItems = menu.filter((m) => m.url !== "/settings" && m.url !== "/workspace");

function isActive(path: string, url: string) {
  return url === "/" ? path === "/" : path === url || path.startsWith(`${url}/`);
}

export function BrandMark() {
  return (
    <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10 shadow-glow">
      <img
        src={brandLogo.url}
        alt=""
        aria-hidden="true"
        className="size-7 drop-shadow-[0_3px_10px_rgba(0,90,255,0.35)]"
      />
    </span>
  );
}

/** Shared horizontal frame so header, quick-tools gutter and page content line up. */
const frame = "app-frame mx-auto w-full max-w-[1720px] px-4 sm:px-6 xl:px-8";

export function AppShell({
  title,
  children,
  surface = "glass",
  header,
}: {
  title: string;
  children: ReactNode;
  /** "paper" keeps embedded module workspaces on a light sheet; "glass" renders straight onto the backdrop. */
  surface?: "paper" | "glass";
  /** Replaces the default page title row. */
  header?: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, setTheme } = useAppTheme();
  const workspaceOpen = useWorkspaceOpen();

  const active = (url: string) => isActive(path, url);

  return (
    <div className={`solvik relative min-h-screen w-full font-sans ${theme === "light" ? "light" : ""}`}>
      <div
        className="solvik-backdrop"
        style={{ "--backdrop-img": `url(${backdrop.url})` } as CSSProperties}
        aria-hidden
      >
        <div className="solvik-backdrop-glow" />
        <div className="solvik-backdrop-logo" />
      </div>

      <QuickTools theme={theme} onThemeChange={setTheme} />
      <WorkspaceWidget open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className={`${frame} pt-5`}>
          <div className="app-header-cylinder flex items-center gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <BrandMark />
              <span className="hidden text-xl font-bold tracking-tight min-[420px]:inline">Manager Edu</span>
            </Link>
            <DockNav items={navItems} isActive={active} className="mx-auto hidden lg:flex" />
            <HeaderActions items={menu} workspaceOpen={workspaceOpen} onWorkspaceToggle={() => setWorkspaceOpen((o) => !o)} />
          </div>
          <DockNav items={navItems} isActive={active} magnify={false} className="mt-4 lg:hidden" />
        </header>

        <main key={title} className={`${frame} page-in flex-1 pb-14 pt-8`}>
          {header ?? <h1 className="sr-only">{title}</h1>}
          {surface === "paper" ? <div className="solvik-paper min-w-0">{children}</div> : children}
        </main>
      </div>
    </div>
  );
}

const statIcons = [Users, TrendingUp, BarChart3, Activity];

export function Stat({ label, value, note, i }: { label: string; value: string; note?: string | undefined; i: number }) {
  const Icon = statIcons[i % 4]!;
  return (
    <div className="fade-up card-fx group relative overflow-hidden glass p-5 shadow-card" style={{ animationDelay: `${i * 90}ms` }}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-5" /></div>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight"><CountUp value={value} /></p>
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
        <TrendingUp className="size-3" />{note ?? "Stable"}
      </p>
    </div>
  );
}

function statusTone(v: string) {
  const s = v.toLowerCase();
  if (/(approved|running|enabled|paid)/.test(s)) return "bg-success/10 text-success";
  if (/(pending|scheduled|interview|draft)/.test(s)) return "bg-warning/15 text-warning";
  return "";
}

export function Panel({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="fade-up card-fx glass shadow-card" style={{ animationDelay: "250ms" }}>
      <div className="flex items-center justify-between px-5 py-4">
        <p className="font-bold">{title}</p>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="More"><MoreHorizontal className="size-4" /></button>
      </div>
      <ul className="px-2 pb-2">
        {rows.map(([a, b]) => {
          const tone = statusTone(b);
          return (
            <li key={a} className="row-fx flex items-center gap-3 rounded-xl px-3 py-3 text-sm">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">{a.charAt(0)}</div>
              <span className="flex-1 font-medium">{a}</span>
              {tone ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{b}</span>
              ) : (
                <span className="text-muted-foreground">{b}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function chartData(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 997;
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((m, i) => ({
    m, a: Math.round(55 + Math.sin(i * 0.9 + h) * 14 + i * 4), b: Math.round(40 + Math.cos(i * 0.8 + h) * 10 + i * 2),
  }));
}

export function ModulePage({ title, stats, panels }: { title: string; stats: [string, string, string?][]; panels: { title: string; rows: [string, string][] }[] }) {
  const data = chartData(title);
  return (
    <AppShell title={title} surface="glass">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([l, v, n], i) => <Stat key={l} label={l} value={v} note={n} i={i} />)}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="fade-up card-fx glass p-5 shadow-card xl:col-span-2" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">{title} performance</p>
              <p className="text-xs text-muted-foreground">Last 10 months</p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CircleDot className="size-3 text-primary" />This year</span>
              <span className="flex items-center gap-1"><CircleDot className="size-3 text-chart-2" />Last year</span>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }} />
                <Area isAnimationActive={false} type="monotone" dataKey="b" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
                <Area isAnimationActive={false} type="monotone" dataKey="a" stroke="var(--primary)" strokeWidth={2.5} fill="url(#ga)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fade-up glass glass-lime relative overflow-hidden p-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-lime/10" />
          <div className="absolute -bottom-12 -left-6 size-32 rounded-full bg-lime/10" />
          <Sparkles className="relative size-6 text-lime" />
          <p className="relative mt-4 text-lg font-bold">Smart insights</p>
          <p className="relative mt-2 text-sm text-muted-foreground">
            {title} is trending up this term. Review the latest activity and plan next steps with your team.
          </p>
          <div className="relative mt-6">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Term goal</span><span>78%</span></div>
            <div className="mt-2 h-2 rounded-full bg-lime/20"><div className="h-2 w-[78%] rounded-full bg-lime" /></div>
          </div>
          <button className="lime-btn relative mt-6">View report</button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {panels.map((p) => <Panel key={p.title} {...p} />)}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="fade-up glass p-5 shadow-card">
          <p className="font-bold">Distribution</p>
          <p className="text-xs text-muted-foreground">Share by category</p>
          <div className="relative mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie isAnimationActive={false} data={donut} dataKey="v" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                  {donut.map((d) => <Cell key={d.n} fill={d.c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><p className="text-2xl font-extrabold">100%</p><p className="text-xs text-muted-foreground">Total</p></div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {donut.map((d) => (
              <span key={d.n} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: d.c }} />{d.n} · {d.v}%</span>
            ))}
          </div>
        </div>

        <div className="fade-up glass p-5 shadow-card">
          <p className="font-bold">Recent activity</p>
          <p className="text-xs text-muted-foreground">Live updates from your team</p>
          <ol className="relative mt-4 space-y-4 border-l pl-5">
            {activity.map((a) => (
              <li key={a.t} className="relative">
                <span className="absolute -left-[27px] top-1 grid size-3.5 place-items-center rounded-full bg-primary ring-4 ring-accent" />
                <p className="text-sm font-medium">{a.t}</p>
                <p className="text-xs text-muted-foreground">{a.w}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="fade-up glass p-5 shadow-card">
          <p className="font-bold">Quick actions</p>
          <p className="text-xs text-muted-foreground">Shortcuts for {title}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quick.map((q) => (
              <button key={q.l} className="group flex flex-col items-start gap-2 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:shadow-glow">
                <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground transition group-hover:bg-primary-gradient group-hover:text-primary-foreground"><q.i className="size-4" /></span>
                <span className="text-sm font-semibold">{q.l}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-accent p-3">
            <p className="text-xs font-semibold text-accent-foreground">Upcoming</p>
            <p className="mt-1 text-sm font-medium">Parent-teacher meeting · Nov 5, 10:00 AM</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const donut = [
  { n: "Primary", v: 42, c: "var(--primary)" },
  { n: "Secondary", v: 28, c: "var(--chart-2)" },
  { n: "Higher", v: 18, c: "var(--chart-4)" },
  { n: "Other", v: 12, c: "var(--chart-1)" },
];
const activity = [
  { t: "Fee payment received from Grade 8", w: "2 min ago · Finance" },
  { t: "New admission enquiry submitted", w: "18 min ago · Admission" },
  { t: "Exam timetable published", w: "1 hr ago · Academic" },
  { t: "Leave approved for Arjun Iyer", w: "3 hrs ago · HR" },
];
const quick = [
  { l: "Add student", i: UserPlus },
  { l: "Collect fee", i: Wallet },
  { l: "Send notice", i: Megaphone },
  { l: "Reports", i: BarChart3 },
];

function CountUp({ value }: { value: string }) {
  const m = value.match(/^([^\d]*)([\d,.]+)(.*)$/);
  const [n, setN] = useState(0);
  const target = m ? parseFloat(m[2]!.replace(/,/g, "")) : 0;
  useEffect(() => {
    if (!m) return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 1200); setN(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value]);
  if (!m) return <>{value}</>;
  const dec = (m[2]!.split(".")[1] || "").length;
  return <>{m[1]}{n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{m[3]}</>;
}
