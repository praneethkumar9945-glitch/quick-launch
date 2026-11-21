import { createFileRoute } from "@tanstack/react-router";
import PerformancePage from "@/components/directors/pages/PerformancePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/performance")({
  head: pageHead("Institute Performance", "Review institute performance indicators and leadership goals."),
  component: PerformancePage,
});
