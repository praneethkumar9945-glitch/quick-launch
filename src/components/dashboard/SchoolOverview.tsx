import { Link } from "@tanstack/react-router";
import { useState, type ComponentType, type ReactNode } from "react";
import { ArrowUpRight, BarChart3, Check, MoreHorizontal, PieChart, Plus, Trophy } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";

/* ---------- sample data (demo figures, replace with live data later) ---------- */

const collections = [
  { m: "Dec", v: 38 }, { m: "Jan", v: 31 }, { m: "Feb", v: 39 }, { m: "Mar", v: 46 },
  { m: "Apr", v: 37 }, { m: "May", v: 44 }, { m: "Jun", v: 22 }, { m: "Jul", v: 39 },
  { m: "Aug", v: 48 }, { m: "Sep", v: 41 }, { m: "Oct", v: 47 }, { m: "Nov", v: 46 },
];
const MONTHLY_TARGET = 52; // ₹ lakh

const hotAdmissions = [
  { joins: "Joins Dec 27", course: "Full Stack Development", who: "Aarav Sharma", fee: "₹1,24,000", paid: 90, team: ["PR", "AK", "LB"] },
  { joins: "Joins Dec 25", course: "Data Science, 12 mo", who: "Diya Kapoor", fee: "₹1,18,500", paid: 85, team: ["AN", "IV", "TH"] },
  { joins: "Joins Jan 06", course: "UI/UX Design Pro", who: "Rohan Mehta", fee: "₹96,000", paid: 75, team: ["IV", "AK", "TH"] },
  { joins: "Joins Dec 15", course: "Cloud & DevOps", who: "Sneha Iyer", fee: "₹88,400", paid: 90, team: ["PR", "TH", "KA"] },
  { joins: "Joins Jan 12", course: "AI & Machine Learning", who: "Kabir Nair", fee: "₹1,32,000", paid: 60, team: ["IV", "LB", "TH"] },
  { joins: "Joins Nov 30", course: "Digital Marketing", who: "Meera Pillai", fee: "₹64,900", paid: 95, team: ["AN", "TH", "IV"] },
];

const funnel = [
  { stage: "Enquiry", count: 164, value: "₹28.1L", pct: 20, tone: "bg-sky" },
  { stage: "Counselling", count: 112, value: "₹26.3L", pct: 19, tone: "bg-lime" },
  { stage: "Application", count: 86, value: "₹36.4L", pct: 26, tone: "bg-salmon" },
  { stage: "Admitted", count: 58, value: "₹51.2L", pct: 35, tone: "bg-cream" },
];

const leaderboard = [
  { name: "Ananya Rao", role: "Senior counsellor", admits: 18, amount: "₹21.4L" },
  { name: "Ishaan Verma", role: "Counsellor", admits: 14, amount: "₹16.9L" },
  { name: "Tara Hegde", role: "Call centre lead", admits: 11, amount: "₹12.2L" },
  { name: "Karthik A.", role: "Counsellor", admits: 9, amount: "₹10.1L" },
];

const activity = [
  { t: "Fee payment received — Aarav S.", w: "10 min ago", tone: "bg-lime" },
  { t: "Application approved — Diya K.", w: "1 hr ago", tone: "bg-sky" },
  { t: "Exam schedule published", w: "3 hr ago", tone: "bg-salmon" },
  { t: "Leave approved — Arjun Iyer", w: "Yesterday", tone: "bg-cream" },
];

const avatarTones = ["bg-sky", "bg-lime", "bg-salmon", "bg-cream"];

/* ---------- small building blocks ---------- */

function HeaderStat({ icon: Icon, value, label, chip }: { icon: ComponentType<{ className?: string }>; value: string; label: string; chip?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="glass-icon size-12"><Icon className="size-[18px]" /></span>
      <div>
        <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {value}
          {chip && <span className="delta-chip">{chip}</span>}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CardHead({ title, to, children }: { title: string; to?: "/finance" | "/admission" | "/hr" | "/academic"; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        {to && (
          <Link to={to} className="glass-icon" aria-label={`Open ${title}`}>
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function MoreButton({ label, small }: { label: string; small?: boolean }) {
  return (
    <button type="button" className={`glass-icon ${small ? "glass-icon-sm" : ""}`} aria-label={label}>
      <MoreHorizontal className="size-4" />
    </button>
  );
}

function Avatars({ initials }: { initials: string[] }) {
  return (
    <span className="avatar-stack">
      {initials.map((i, n) => (
        <span key={i} className={avatarTones[n % avatarTones.length]}>{i}</span>
      ))}
    </span>
  );
}

/* ---------- cards ---------- */

function CollectionsCard() {
  const [range, setRange] = useState<"6M" | "12M">("12M");
  const data = range === "6M" ? collections.slice(-6) : collections;
  const total = data.reduce((s, d) => s + d.v, 0);
  const hit = data.filter((d) => d.v >= MONTHLY_TARGET).length;

  return (
    <section className="glass solvik-rise p-5 sm:p-6">
      <CardHead title="Fee collections" to="/finance">
        <div className="segmented" role="group" aria-label="Range">
          {(["6M", "12M"] as const).map((r) => (
            <button key={r} type="button" data-active={range === r} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <MoreButton label="Collection options" />
      </CardHead>
      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-semibold tracking-tight sm:text-5xl">₹{total.toFixed(1)}L</span>
        <span className="text-sm text-muted-foreground">
          collected in {data.length} months · <b className="text-foreground">{hit}</b> of {data.length} at target
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-5 text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-salmon" />Collected</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-4 border-t-2 border-dashed border-foreground/70" />Monthly target · ₹{MONTHLY_TARGET}L</span>
      </div>
      <div className="mt-4 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -12, right: 6, top: 8 }}>
            <defs>
              <linearGradient id="collect-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--salmon)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--salmon)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
            <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" tickFormatter={(v) => `₹${v}L`} domain={[0, 70]} ticks={[0, 35, 70]} />
            <Tooltip
              cursor={{ stroke: "var(--glass-border)" }}
              formatter={(v: number) => [`₹${v}L`, "Collected"]}
              contentStyle={{ borderRadius: 14, border: "1px solid var(--glass-border)", background: "var(--popover)", color: "var(--foreground)" }}
            />
            <ReferenceLine y={MONTHLY_TARGET} stroke="var(--foreground)" strokeOpacity={0.7} strokeDasharray="6 6" />
            <Area isAnimationActive={false} type="monotone" dataKey="v" stroke="var(--salmon)" strokeWidth={2.5} fill="url(#collect-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TargetCard() {
  const pct = 43;
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <section className="glass glass-lime solvik-rise flex flex-col p-5 sm:p-6" style={{ animationDelay: "80ms" }}>
      <CardHead title="Term fee target"><MoreButton label="Target options" /></CardHead>
      <div className="relative mx-auto my-4 size-44">
        <svg viewBox="0 0 160 160" className="size-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--glass-border)" strokeWidth="10" />
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--lime)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-4xl font-semibold tracking-tight">{pct}%</p>
            <p className="text-xs text-muted-foreground">of term target</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 text-center">
        {[["Collected", "₹20.2L"], ["Target", "₹47L"], ["Days left", "46"]].map(([l, v]) => (
          <div key={l}>
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-glass-strong px-4 py-2.5 text-center text-sm">
        Needs <b>₹58K</b> a day to land it
      </p>
    </section>
  );
}

function FunnelCard() {
  return (
    <section className="glass solvik-rise p-5 sm:p-6" style={{ animationDelay: "140ms" }}>
      <CardHead title="Admission funnel" to="/admission" />
      <p className="mt-5 flex flex-wrap items-baseline gap-x-3">
        <span className="text-3xl font-semibold tracking-tight">₹1.42Cr</span>
        <span className="text-sm text-muted-foreground">potential fees across 420 students</span>
      </p>
      <div className="mt-5 flex h-11 gap-1.5">
        {funnel.map((f) => (
          <span key={f.stage} className={`${f.tone} rounded-xl`} style={{ width: `${f.pct}%` }} title={f.stage} />
        ))}
      </div>
      <ul className="mt-5 divide-y divide-border text-sm">
        {funnel.map((f) => (
          <li key={f.stage} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 py-2.5">
            <span className="flex items-center gap-2.5"><span className={`size-2.5 rounded-full ${f.tone}`} />{f.stage}</span>
            <b className="font-semibold">{f.count}</b>
            <span className="w-16 text-right">{f.value}</span>
            <span className="w-10 text-right text-muted-foreground">{f.pct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HotAdmissionsCard() {
  return (
    <section className="glass solvik-rise flex flex-col p-5 sm:p-6" style={{ animationDelay: "60ms" }}>
      <CardHead title="Hot admissions" to="/admission">
        <span className="hidden text-sm text-muted-foreground sm:inline">by fee value</span>
        <button type="button" className="glass-icon" aria-label="Add admission"><Plus className="size-4" /></button>
      </CardHead>
      <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-2">
        {hotAdmissions.map((a) => (
          <article key={a.who} className="glass-tile flex min-h-44 flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">{a.joins}</span>
              <MoreButton label={`Options for ${a.who}`} small />
            </div>
            <h3 className="mt-2 text-lg font-semibold leading-tight">{a.course}</h3>
            <p className="text-sm text-muted-foreground">{a.who}</p>
            <div className="mt-auto flex items-end justify-between pt-4">
              <div>
                <p className="text-xl font-semibold tracking-tight">{a.fee}</p>
                <p className="text-xs text-muted-foreground">Fee paid · {a.paid}%</p>
              </div>
              <Avatars initials={a.team} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LeaderboardCard() {
  return (
    <section className="glass p-5 sm:p-6">
      <CardHead title="Counsellor leaderboard" to="/admission">
        <span className="hidden text-sm text-muted-foreground sm:inline">Admits this month</span>
      </CardHead>
      <ol className="mt-4 space-y-2">
        {leaderboard.map((p, i) => (
          <li key={p.name} className="glass-tile flex items-center gap-3 px-4 py-3">
            <span className="w-4 text-sm text-muted-foreground">{i + 1}</span>
            <span className={`grid size-9 place-items-center rounded-full text-xs font-bold text-lime-foreground ${avatarTones[i % 4]}`}>
              {p.name.split(" ").map((w) => w[0]).join("")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.role}</span>
            </span>
            <span className="text-right">
              <span className="block font-semibold">{p.amount}</span>
              <span className="block text-xs text-muted-foreground">{p.admits} admits</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TodayCard() {
  const [tasks, setTasks] = useState([
    { id: 1, t: "Call back 12 warm enquiries", at: "10:00", done: true },
    { id: 2, t: "Approve fee concessions", at: "12:30", done: false },
    { id: 3, t: "Parent–teacher meeting, Grade 8", at: "15:00", done: false },
    { id: 4, t: "Review Q4 marketing budget", at: "17:00", done: false },
  ]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setTasks((cur) => [...cur, { id: Date.now(), t, at: "Today", done: false }]);
    setDraft("");
    setAdding(false);
  };

  return (
    <section className="glass p-5 sm:p-6">
      <CardHead title="Today">
        <button type="button" className="lime-btn" onClick={() => setAdding((v) => !v)}><Plus className="size-4" />Add</button>
      </CardHead>
      <p className="mt-1 text-sm text-muted-foreground">{tasks.filter((t) => t.done).length} of {tasks.length} done</p>
      {adding && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New task…"
            aria-label="New task"
            className="min-w-0 flex-1 rounded-full border border-glass-border bg-glass px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-lime"
          />
          <button type="submit" className="ghost-btn">Save</button>
        </form>
      )}
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => setTasks((cur) => cur.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)))}
              className="glass-tile flex w-full items-center gap-3 px-4 py-3 text-left"
              aria-pressed={task.done}
            >
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${task.done ? "border-lime bg-lime text-lime-foreground" : "border-glass-border"}`}>
                {task.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={`flex-1 text-sm ${task.done ? "text-muted-foreground line-through" : ""}`}>{task.t}</span>
              <span className="text-xs text-muted-foreground">{task.at}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityCard() {
  return (
    <section className="glass p-5 sm:p-6">
      <CardHead title="Recent activity"><MoreButton label="Activity options" /></CardHead>
      <ol className="mt-5 space-y-5">
        {activity.map((a) => (
          <li key={a.t} className="flex items-start gap-3">
            <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${a.tone}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{a.t}</span>
              <span className="block text-xs text-muted-foreground">{a.w}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- page ---------- */

export function SchoolOverview() {
  return (
    <AppShell
      title="Dashboard"
      surface="glass"
      header={
        <div className="mb-8 flex flex-wrap items-center gap-x-12 gap-y-6">
          <h1 className="solvik-title">School<br />Overview</h1>
          <HeaderStat icon={Trophy} value="₹48.2L" label="Fees collected this month" chip="−2% vs last month" />
          <HeaderStat icon={BarChart3} value="2,480" label="Students enrolled" />
          <HeaderStat icon={PieChart} value="68%" label="Enquiry → admission rate" />
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <CollectionsCard />
          <div className="grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <TargetCard />
            <FunnelCard />
          </div>
        </div>
        <HotAdmissionsCard />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2 2xl:grid-cols-[1.2fr_1fr_1fr]">
        <LeaderboardCard />
        <TodayCard />
        <ActivityCard />
      </div>
    </AppShell>
  );
}
