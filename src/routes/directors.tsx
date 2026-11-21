import { createFileRoute } from "@tanstack/react-router";
import DirectorsLayout from "@/components/directors/components/Layout";
import { AppShell } from "@/components/AppShell";
import { AppProvider } from "@/components/directors/store/AppContext";
import { ModuleTabs, type ModuleTab } from "@/components/ModuleTabs";
import { pageHead } from "@/lib/page-head";

const TABS: ModuleTab[] = [
  { to: "/directors", label: "Dashboard", exact: true },
  { to: "/directors/institute", label: "Institute" },
  { to: "/directors/departments", label: "Employees" },
  { to: "/directors/approvals", label: "Approvals" },
  { to: "/directors/tasks", label: "Schedule" },
  { to: "/directors/performance", label: "Performance" },
  { to: "/directors/reports", label: "Reports" },
  { to: "/directors/activity", label: "Activity" },
  { to: "/directors/skillai", label: "SkillAI" },
  { to: "/directors/settings", label: "Settings" },
];

// Directors module shell (skillai dashboard): sidebar + topbar + content outlet.
// AppProvider must wrap the layout: the sidebar and all directors pages read useApp().
export const Route = createFileRoute("/directors")({
  head: pageHead("Directors Workspace", "Directors dashboard for approvals, staff, schedule and reports."),
  component: DirectorsRoute,
});

function DirectorsRoute() {
  return (
    <AppShell title="Directors">
      <div className="space-y-6">
        <ModuleTabs label="Directors pages" tabs={TABS} />
        <AppProvider>
          <DirectorsLayout />
        </AppProvider>
      </div>
    </AppShell>
  );
}
