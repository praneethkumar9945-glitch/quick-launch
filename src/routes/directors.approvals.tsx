import { createFileRoute } from "@tanstack/react-router";
import ApprovalsPage from "@/components/directors/pages/ApprovalsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/approvals")({
  head: pageHead("Leadership Approvals", "Review decisions and requests awaiting leadership approval."),
  component: ApprovalsPage,
});
