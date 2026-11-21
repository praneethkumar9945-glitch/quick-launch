import { createFileRoute } from "@tanstack/react-router";
import NotificationsPage from "@/components/directors/pages/NotificationsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/notifications")({
  head: pageHead("Leadership Notifications", "Review leadership alerts and important school updates."),
  component: NotificationsPage,
});
