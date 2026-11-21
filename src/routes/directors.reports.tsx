import { createFileRoute } from "@tanstack/react-router";
import ReportsPage from "@/components/directors/pages/ReportsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/reports")({
  head: pageHead("Leadership Reports", "Review leadership reports and school-wide results."),
  component: ReportsPage,
});
