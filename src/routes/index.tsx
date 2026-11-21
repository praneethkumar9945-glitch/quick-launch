import { createFileRoute } from "@tanstack/react-router";
import { SchoolOverview } from "@/components/dashboard/SchoolOverview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "School Overview — Manager Edu" },
      { name: "description", content: "Fee collections, admissions funnel, hot admissions and today's tasks for your institute at a glance." },
      { property: "og:title", content: "School Overview — Manager Edu" },
      { property: "og:description", content: "Fee collections, admissions funnel, hot admissions and today's tasks for your institute at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchoolOverview,
});
