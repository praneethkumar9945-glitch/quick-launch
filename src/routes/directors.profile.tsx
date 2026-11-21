import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "@/components/directors/pages/ProfilePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/profile")({
  head: pageHead("Director Profile", "View and update the director profile and preferences."),
  component: ProfilePage,
});
