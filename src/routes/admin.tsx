import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppShell as AdminShell } from "@/modules/admin/components/app/AppShell";
import { StoreProvider } from "@/modules/admin/lib/store";
import { Toaster } from "@/modules/admin/components/ui/sonner";
import { pageHead } from "@/modules/admin/lib/seo";
import { ModuleTabs, type ModuleTab } from "@/components/ModuleTabs";

const TABS: ModuleTab[] = [
  { to: "/admin", label: "Dashboard", exact: true },
  { to: "/admin/batches", label: "Batch Allocation" },
  { to: "/admin/attendance", label: "Academic Information" },
  { to: "/admin/exam-requests", label: "Examination" },
  { to: "/admin/leave", label: "Leave Approvals" },
  { to: "/admin/certificates", label: "Certificates" },
];
export const Route = createFileRoute("/admin")({
 head: pageHead("Administration", "Manage school administration, students, fees, attendance and examinations."),
 component: AdminLayout,
});
function AdminLayout() { return <AppShell title="Admin"><div className="space-y-6"><ModuleTabs label="Admin pages" tabs={TABS} /><div className="admin-module"><StoreProvider><AdminShell><Outlet /></AdminShell><Toaster richColors position="top-right" /></StoreProvider></div></div></AppShell>; }
