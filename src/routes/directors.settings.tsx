import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/components/directors/pages/SettingsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/settings")({
  head: pageHead("Director Settings", "Manage director and institute settings."),
  component: SettingsPage,
});
