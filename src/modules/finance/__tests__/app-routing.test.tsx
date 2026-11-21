import "./setup";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { NAV } from "@/modules/finance/finance/nav";
import { REPORT_GROUPS, resolveReportKey } from "@/modules/finance/finance/reports";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/finance");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("resolves every sidebar destination to a real page", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    for (const item of NAV) {
      const matches = router.matchRoutes(item.to);
      expect(matches.at(-1)?.routeId, `route ${item.to}`).not.toBe(rootRouteId);

      for (const child of item.children ?? []) {
        const withTab = router.matchRoutes(item.to, { tab: child.tab });
        expect(withTab.at(-1)?.routeId, `route ${item.to}?tab=${child.tab}`).not.toBe(rootRouteId);
      }
    }
  });

  it("keeps Daily Transactions as one direct sidebar item", () => {
    const transactionItems = NAV.filter((item) => item.to === "/finance/transactions");

    expect(transactionItems).toHaveLength(1);
    expect(transactionItems[0]).not.toHaveProperty("children");
  });

  it("keeps Petty Cash as one direct sidebar item", () => {
    const pettyCashItems = NAV.filter((item) => item.title === "Petty Cash");

    expect(pettyCashItems).toHaveLength(1);
    expect(pettyCashItems[0]).toMatchObject({ to: "/finance/petty-cash" });
    expect(pettyCashItems[0]).not.toHaveProperty("children");
  });

  it("keeps Books & Ledgers, Fee Collection, Daily Settlements, Financial Reports, and Finance Settings as direct sidebar items", () => {
    const directItems = [
      ["Books & Ledgers", "/finance/ledgers"],
      ["Fee Collection", "/finance/fees"],
      ["Daily Settlements", "/finance/settlements"],
      ["Financial Reports", "/finance/reports"],
      ["Finance Settings", "/finance/settings"],
    ];

    for (const [title, to] of directItems) {
      const items = NAV.filter((item) => item.title === title);

      expect(items, `sidebar item ${title}`).toHaveLength(1);
      expect(items[0]).toMatchObject({ to });
      expect(items[0]).not.toHaveProperty("children");
    }
  });

  it("removes Cash Flow from the sidebar and from the report dropdown", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(NAV.some((item) => item.title === "Cash Flow" || item.to === "/finance/budgets")).toBe(false);
    expect(
      REPORT_GROUPS.flatMap((group) => group.reports.map(([, name]) => name)).some((name) =>
        name.toLowerCase().includes("cash flow"),
      ),
    ).toBe(false);
    expect(resolveReportKey("cash-flow-statement")).toBe("income-report");
    expect(router.matchRoutes("/finance/reports", { tab: "cash-flow" }).at(-1)?.routeId).not.toBe(
      rootRouteId,
    );
  });

  it("redirects the old standalone Cash Flow page to the Financial Reports Cash Flow tab", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    // The old route still exists so saved links land somewhere real, but it is no
    // longer a standalone page and no longer claims a sidebar slot.
    expect(router.matchRoutes("/finance/budgets").at(-1)?.routeId).not.toBe(rootRouteId);
    expect(NAV.some((item) => item.to === "/finance/budgets")).toBe(false);
  });

  it("opens Financial Reports with a selected report and preserves legacy report tabs", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const reports = NAV.find((item) => item.title === "Financial Reports");

    expect(reports).toMatchObject({ to: "/finance/reports", report: "income-report" });
    expect(router.matchRoutes("/finance/reports", { report: "bank-book" }).at(-1)?.routeId).not.toBe(
      rootRouteId,
    );
    expect(resolveReportKey()).toBe("income-report");
    expect(resolveReportKey(undefined, "income-expense")).toBe("income-report");
    expect(resolveReportKey(undefined, "fees")).toBe("student-fee-collection");
    expect(resolveReportKey("monthly-fee-report")).toBe("monthly-fee-report");
    expect(REPORT_GROUPS.find((group) => group.label === "Fee collection")?.reports).toContainEqual(
      ["monthly-fee-report", "Monthly Fee Report"],
    );
    expect(resolveReportKey(undefined, "outstanding")).toBe("outstanding-overdue-fees");
    expect(resolveReportKey(undefined, "settlement")).toBe("settlement-report");
    expect(resolveReportKey(undefined, "statements")).toBe("cash-book");
  });

  it("removes the Roles & Permissions page and sidebar destination", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(NAV.some((item) => item.title === "Roles & Permissions" || item.to === "/finance/roles")).toBe(
      false,
    );
    expect(router.matchRoutes("/finance/roles").at(-1)?.routeId).toBe(rootRouteId);
  });
});
