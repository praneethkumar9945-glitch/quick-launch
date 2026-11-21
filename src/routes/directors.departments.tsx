import { createFileRoute } from "@tanstack/react-router";
import DepartmentsPage from "@/components/directors/pages/DepartmentsPage";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/directors/departments")({
  head: pageHead("School Departments", "Review departments, responsibilities, and institutional structure."),
  component: DepartmentsPage,
});
