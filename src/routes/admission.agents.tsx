import { createFileRoute, Outlet } from "@tanstack/react-router";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/admission/agents")({
  head: pageHead("Admission Agent Workspace", "Browse the admission sales team and open the agent directory."),
  component: AgentsLayout,
});

function AgentsLayout() {
  return <Outlet />;
}
