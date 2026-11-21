import {
  Children,
  Fragment,
  isValidElement,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BadgeCheck,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  Inbox,
  Landmark,
  List,
  Receipt,
  Scale,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/modules/finance/components/ui/badge";
import { Input } from "@/modules/finance/components/ui/input";
import { Label } from "@/modules/finance/components/ui/label";
import { Card } from "@/modules/finance/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/finance/components/ui/select";
import { TableCell, TableHead } from "@/modules/finance/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/modules/finance/components/ui/alert-dialog";
import { cn } from "@/modules/finance/lib/utils";
import { focusNextField, focusPreviousField } from "@/modules/finance/hooks/use-enter-to-next";

export function SerialNumberHead() {
  return <TableHead className="w-12 whitespace-nowrap px-2 text-center">Sl. No.</TableHead>;
}

export function SerialNumberCell({ index }: { index: number }) {
  return (
    <TableCell className="num w-12 px-2 text-center text-muted-foreground">{index + 1}</TableCell>
  );
}

export function SerialNumberLabel({ index }: { index: number }) {
  return (
    <span
      aria-label={`Serial number ${index + 1}`}
      className="mr-2 inline-block w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
    >
      {index + 1}.
    </span>
  );
}

function statIcon(label: string) {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("income") ||
    normalized.includes("collected") ||
    normalized.includes("credit")
  )
    return ArrowDownToLine;
  if (normalized.includes("expense") || normalized.includes("debit")) return ArrowUpFromLine;
  if (normalized.includes("bank")) return Landmark;
  if (
    normalized.includes("petty") ||
    normalized.includes("cash") ||
    normalized.includes("book balance")
  )
    return Wallet;
  if (
    normalized.includes("outstanding") ||
    normalized.includes("remaining") ||
    normalized.includes("overdue") ||
    normalized.includes("difference") ||
    normalized.includes("shortage") ||
    normalized.includes("excess")
  ) {
    return CircleAlert;
  }
  if (normalized.includes("opening") || normalized.includes("closing")) return Scale;
  if (normalized.includes("entry") || normalized.includes("entries")) return List;
  if (normalized.includes("rate")) return ChartNoAxesCombined;
  if (normalized.includes("matched")) return CircleCheck;
  if (normalized.includes("finalized")) return BadgeCheck;
  if (normalized.includes("recorded") || normalized.includes("billed")) return Receipt;
  if (normalized.includes("flow")) return ArrowLeftRight;
  return FileText;
}

function statIconTone(label: string, tone?: "success" | "danger" | "warning") {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("income") ||
    normalized.includes("collected") ||
    normalized.includes("bank")
  ) {
    return "bg-primary/10 text-primary";
  }
  if (
    tone === "danger" ||
    normalized.includes("difference") ||
    normalized.includes("shortage") ||
    normalized.includes("excess") ||
    normalized.includes("outstanding") ||
    normalized.includes("remaining") ||
    normalized.includes("overdue")
  ) {
    return "bg-danger-soft text-destructive";
  }
  if (normalized.includes("expense") || normalized.includes("debit"))
    return "bg-expense-soft text-expense";
  if (tone === "warning" || normalized.includes("pending")) return "bg-warning-soft text-warning";
  if (
    tone === "success" ||
    normalized.includes("petty") ||
    normalized.includes("cash") ||
    normalized.includes("matched") ||
    normalized.includes("finalized") ||
    normalized.includes("recorded")
  ) {
    return "bg-success-soft text-success";
  }
  return "bg-primary/10 text-primary";
}

export function PageHeader({
  description,
  center,
  actions,
}: {
  crumbs: string[];
  title: string;
  description?: string | undefined;
  center?: ReactNode | undefined;
  actions?: ReactNode | undefined;
}) {
  if (!description && !center && !actions) return null;

  return (
    <div
      className={
        center
          ? "page-header page-header-centered mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"
          : "page-header mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : center ? (
        <div aria-hidden="true" />
      ) : null}
      {center && <div className="flex justify-center">{center}</div>}
      {actions && (
        <div
          className={
            center ? "no-print flex flex-wrap justify-end gap-2" : "no-print flex flex-wrap gap-2"
          }
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export type StatColor = "blue" | "green" | "orange" | "red" | "purple" | "gray";
const statColorVar: Record<StatColor, string> = {
  blue: "var(--chart-1)",
  green: "var(--chart-2)",
  orange: "var(--chart-3)",
  purple: "var(--chart-4)",
  red: "var(--chart-danger)",
  gray: "var(--muted-foreground)",
};

/** The single shared KPI card. Place cards inside a StatGrid wrapper. */
export function StatCard({
  label,
  value,
  hint,
  caption,
  tone,
  icon,
  color,
  empty,
  compact = false,
}: {
  label: string;
  value: string | null;
  hint?: string | undefined;
  caption?: string | undefined;
  tone?: "success" | "danger" | "warning" | undefined;
  icon?: LucideIcon | undefined;
  color?: StatColor | undefined;
  empty?: string | undefined;
  compact?: boolean | undefined;
}) {
  const Icon = icon ?? statIcon(label);
  const sub = caption ?? hint;
  const isEmpty = value === null || value === "—" || value === "Not counted";
  const shown = value ?? empty ?? "—";
  return (
    <Card className="stat-card relative min-w-0 rounded-2xl p-4 shadow-soft">
      <p
        title={label}
        className="min-w-0 pr-10 text-[11px] font-semibold uppercase leading-[12px] tracking-wide text-muted-foreground"
      >
        {label}
      </p>
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-4 top-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
          !color && statIconTone(label, tone),
        )}
        style={
          color
            ? {
                backgroundColor: `color-mix(in oklab, ${statColorVar[color]} 12%, transparent)`,
                color: statColorVar[color],
              }
            : undefined
        }
      >
        <Icon className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      </span>
      <p
        className={cn(
          "num stat-value mt-1 min-w-0 whitespace-nowrap font-bold tabular-nums leading-tight",
          isEmpty && "text-muted-foreground",
          shown === "Not counted" && "!text-base",
          !isEmpty && tone === "success" && "text-success",
          !isEmpty && tone === "danger" && "text-destructive",
          !isEmpty && tone === "warning" && "text-warning",
        )}
      >
        {shown}
      </p>
      <p
        title={compact ? sub : undefined}
        className="mt-1 min-w-0 text-xs leading-[12px] text-muted-foreground"
      >
        {sub || "\u00A0"}
      </p>
    </Card>
  );
}

function countStatChildren(children: ReactNode): number {
  return Children.toArray(children).reduce<number>((count, child) => {
    if (isValidElement<{ children?: (ReactNode) | undefined }>(child) && child.type === Fragment) {
      return count + countStatChildren(child.props.children);
    }
    return count + 1;
  }, 0);
}

export function StatGrid({ children, className }: { children: ReactNode; className?: (string) | undefined }) {
  const columns = Math.max(1, countStatChildren(children));
  return (
    <div
      className={cn("stat-grid", className)}
      style={{ "--stat-columns": columns } as CSSProperties}
    >
      {children}
    </div>
  );
}

const toneOf: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  Sent: "success",
  "Sending…": "info",
  "Not Sent": "neutral",
  Paid: "success",
  Matched: "success",
  Posted: "success",
  Approved: "success",
  Finalized: "info",
  Excess: "warning",
  "Partially Paid": "warning",
  Pending: "neutral",
  "Pending Review": "warning",
  "Pending approval": "warning",
  Overdue: "danger",
  Rejected: "danger",
  "Awaiting Resubmission": "warning",
  "Difference Found": "danger",
  Shortage: "danger",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={toneOf[status] ?? "neutral"}>{status}</Badge>;
}

export function SampleNote({ children }: { children?: (ReactNode) | undefined }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-accent px-2.5 py-1.5 text-[11px] leading-4 text-accent-foreground no-print">
      <Info className="h-3 w-3 shrink-0" />
      <span className="flex-1">
        {children ??
          "Illustrative sample data. This prototype does not store real financial records — changes reset on refresh."}
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setHidden(true)}
        className="rounded-md p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function EmptyState({ message = "No records match your filters." }: { message?: (string) | undefined }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" />
      {message}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        className="pl-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  all = "All",
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  all?: string | undefined;
  allLabel?: string | undefined;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full sm:w-[170px]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel ?? `${all} ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateRange({
  from,
  to,
  onChange,
  quickRange,
  onQuickRangeChange,
  financialYearStart,
}: {
  from: string;
  to: string;
  financialYearStart?: string | undefined;
  onChange: (f: string, t: string) => void;
  quickRange?: string | undefined;
  onQuickRangeChange?: (range: string) => void | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        aria-label="From date"
        className="h-9 w-[150px]"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="h-9 w-[150px]"
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
      />
      {quickRange !== undefined && onQuickRangeChange && (
        <Select value={quickRange} onValueChange={onQuickRangeChange}>
          <SelectTrigger aria-label="Quick range" className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This financial year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  htmlFor?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select",
}: {
  id?: string | undefined;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string | undefined;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectionMade = useRef(false);
  const selectionDirection = useRef<"next" | "previous">("next");
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        selectionMade.current = true;
        onChange(next);
      }}
    >
      <SelectTrigger ref={triggerRef} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLElement &&
            event.target.closest("[role='option']")
          ) {
            selectionMade.current = true;
            selectionDirection.current = event.shiftKey ? "previous" : "next";
          }
        }}
        onCloseAutoFocus={(event) => {
          if (!selectionMade.current) return;
          selectionMade.current = false;
          const direction = selectionDirection.current;
          selectionDirection.current = "next";
          const trigger = triggerRef.current;
          const form = trigger?.closest("form");
          if (!trigger || !form || form.dataset["enterNav"] === "off") return;
          event.preventDefault();
          window.requestAnimationFrame(() => {
            if (direction === "previous") focusPreviousField(form, trigger);
            else focusNextField(form, trigger);
          });
        }}
      >
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string | undefined;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Faint translucent botanical sprig, inspired by soft watercolour leaves.
 *  Used only as a barely-visible decorative watermark; never behind tables or forms. */
export function BotanicalSprig({
  className,
  stemFrom = "bottom-left",
}: {
  className?: string | undefined;
  stemFrom?: "bottom-left" | "top-right" | undefined;
}) {
  const leaves = [
    { fill: "#A7807F", opacity: 0.4, transform: "translate(118 22) rotate(-24) scale(0.62)" },
    { fill: "#DAB7B6", opacity: 0.45, transform: "translate(96 42) rotate(140) scale(0.55)" },
    { fill: "#BC9294", opacity: 0.35, transform: "translate(84 64) rotate(-42) scale(0.68)" },
    { fill: "#F0D4D3", opacity: 0.5, transform: "translate(66 82) rotate(150) scale(0.6)" },
    { fill: "#A7807F", opacity: 0.3, transform: "translate(52 100) rotate(-58) scale(0.74)" },
    { fill: "#DAB7B6", opacity: 0.4, transform: "translate(38 118) rotate(128) scale(0.66)" },
    { fill: "#BC9294", opacity: 0.28, transform: "translate(24 134) rotate(-70) scale(0.8)" },
  ];
  return (
    <svg
      viewBox="0 0 160 160"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={stemFrom === "top-right" ? { transform: "scaleX(-1) scaleY(-1)" } : undefined}
    >
      <path
        d="M6 154 C 52 128, 92 84, 124 18"
        fill="none"
        stroke="#A7807F"
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <defs>
        <path id="botanical-leaf" d="M0 0 C 9 -15, 28 -17, 38 -4 C 29 9, 10 11, 0 0 Z" />
      </defs>
      {leaves.map((leaf, i) => (
        <use
          key={i}
          href="#botanical-leaf"
          transform={leaf.transform}
          fill={leaf.fill}
          opacity={leaf.opacity}
        />
      ))}
    </svg>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  watermark,
}: {
  title?: string | undefined;
  subtitle?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  watermark?: boolean | undefined;
}) {
  return (
    <Card className={cn("relative p-6", className)}>
      {watermark && <BotanicalSprig className="dashboard-watermark no-print" />}
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          {title && (
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

export const tabSearch = (s: Record<string, unknown>): { tab?: string | undefined } => ({
  tab: typeof s["tab"] === "string" ? s["tab"] : undefined,
});

export function downloadCSV(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${name}.csv`;
  a.click();
}
