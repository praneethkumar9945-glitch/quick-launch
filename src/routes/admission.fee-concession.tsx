import { createFileRoute } from "@tanstack/react-router";
import { FeeConcessionForm } from "@/components/sales/admissions/fee-concession";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/admission/fee-concession")({
  head: pageHead("Admission Fee Concessions", "Review and record fee concession requests for admissions."),
  component: FeeConcessionPage,
});

function FeeConcessionPage() {
  return <FeeConcessionForm />;
}
