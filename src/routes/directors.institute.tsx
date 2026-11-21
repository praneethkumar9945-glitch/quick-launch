import { createFileRoute } from "@tanstack/react-router";
import InstitutePage from "@/components/directors/pages/InstitutePage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/institute")({
  head: pageHead("Institute Profile", "Manage institute profile, locations, and organizational details."),
  component: InstitutePage,
});
