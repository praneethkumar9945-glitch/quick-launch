import { createFileRoute } from "@tanstack/react-router";
import ActivityPage from "@/components/directors/pages/ActivityPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/activity")({
  head: pageHead("Leadership Activity", "Monitor recent school leadership activity and operational updates."),
  component: ActivityPage,
});
