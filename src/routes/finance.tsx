import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppShell as FinanceShell } from "@/modules/finance/components/finance/AppShell";
import { FinanceProvider } from "@/modules/finance/finance/store";
import { RecordPaymentProvider } from "@/modules/finance/components/finance/RecordPaymentProvider";
import { Toaster } from "@/modules/finance/components/ui/sonner";
import { pageHead } from "@/modules/finance/lib/seo";
import { ModuleTabs, type ModuleTab } from "@/components/ModuleTabs";
import { NAV } from "@/modules/finance/finance/nav";

const TABS: ModuleTab[] = NAV.map((item) => ({
  to: item.to,
  label: item.title,
  exact: item.to === "/finance",
  ...(item.report ? { search: { report: item.report } } : {}),
}));
export const Route = createFileRoute("/finance")({
 head: pageHead("Finance", "Manage school fees, payments, budgets, ledgers and financial reports."),
 component: FinanceLayout,
});
function FinanceLayout() {
 return <AppShell title="Finance"><div className="space-y-6"><ModuleTabs label="Finance pages" tabs={TABS} /><div className="finance-module"><FinanceProvider><RecordPaymentProvider><FinanceShell><Outlet /></FinanceShell><Toaster richColors position="top-right" /></RecordPaymentProvider></FinanceProvider></div></div></AppShell>;
}
