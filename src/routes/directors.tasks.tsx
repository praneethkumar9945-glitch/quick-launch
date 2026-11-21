import { createFileRoute } from "@tanstack/react-router";
import TasksPage from "@/components/directors/pages/TasksPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/tasks")({
  head: pageHead("Leadership Tasks", "Review and track leadership action items."),
  component: TasksPage,
});
