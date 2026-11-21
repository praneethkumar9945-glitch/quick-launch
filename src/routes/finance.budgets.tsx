import { pageHead } from "@/modules/finance/lib/seo";
import { createFileRoute, redirect } from "@tanstack/react-router";

// Cash Flow moved into Financial Reports as the "Cash Flow" tab. The old
// standalone page now lands there with that tab pre-selected.
export const Route = createFileRoute("/finance/budgets")({
  head: pageHead("Budgets", "Manage budgets in your school finance workspace."),
  beforeLoad: () => {
    throw redirect({ to: "/finance/reports", search: { tab: "cash-flow" }, replace: true });
  },
});
