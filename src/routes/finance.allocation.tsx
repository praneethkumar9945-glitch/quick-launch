import { pageHead } from "@/modules/finance/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/finance/components/ui/table";
import {
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  SampleNote,
  SearchBox,
  SectionCard,
  SerialNumberCell,
  SerialNumberHead,
  StatCard,
  StatGrid,
} from "@/modules/finance/components/finance/common";
import { useFinance } from "@/modules/finance/finance/store";
import { studentCourse } from "@/modules/finance/finance/courses";
import { formatINR, studentPaid, sum } from "@/modules/finance/finance/logic";

export const Route = createFileRoute("/finance/allocation")({
  head: pageHead("Allocation", "Manage allocation in your school finance workspace."),
  component: CourseFeesPage,
});

function CourseFeesPage() {
  const { students, payments, courseCatalog } = useFinance();
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const rows = useMemo(
    () =>
      courseCatalog.courses.map((course) => {
        const members = students.filter(
          (student) => studentCourse(student, courseCatalog)?.id === course.id,
        );
        const billed = sum(members.map((student) => student.totalFee));
        const collected = sum(members.map((student) => studentPaid(student.id, payments)));
        return {
          name: course.name,
          enrolments: members.length,
          billed,
          collected,
          outstanding: Math.max(0, billed - collected),
        };
      }),
    [courseCatalog, students, payments],
  );
  const filtered = rows.filter(
    (row) =>
      (courseFilter === "all" || row.name === courseFilter) &&
      (!query || row.name.toLowerCase().includes(query.toLowerCase())),
  );
  const totals = {
    billed: sum(rows.map((row) => row.billed)),
    collected: sum(rows.map((row) => row.collected)),
    outstanding: sum(rows.map((row) => row.outstanding)),
  };
  const rate = totals.billed ? Math.round((totals.collected / totals.billed) * 100) : 0;
  return (
    <>
      <PageHeader
        crumbs={["Course Fees"]}
        title="Course Fees"
        description="Course-wise fees billed, collected and outstanding."
      />
      <SampleNote />
      <StatGrid className="mb-4">
        <StatCard label="Total fees billed" value={formatINR(totals.billed)} />
        <StatCard label="Fees collected" value={formatINR(totals.collected)} tone="success" />
        <StatCard label="Outstanding fees" value={formatINR(totals.outstanding)} tone="danger" />
        <StatCard label="Collection rate" value={`${rate}%`} />
      </StatGrid>
      <SectionCard title="Course fee summary">
        <FilterBar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search course" />
          <FilterSelect
            label="Courses"
            value={courseFilter}
            onChange={setCourseFilter}
            options={courseCatalog.courses.map((course) => course.name)}
          />
        </FilterBar>
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SerialNumberHead />
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Enrolments</TableHead>
                <TableHead className="text-right">Fees billed</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, index) => (
                <TableRow key={row.name}>
                  <SerialNumberCell index={index} />
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="num text-right">{row.enrolments}</TableCell>
                  <TableCell className="num text-right">{formatINR(row.billed)}</TableCell>
                  <TableCell className="num text-right">{formatINR(row.collected)}</TableCell>
                  <TableCell className="num text-right">{formatINR(row.outstanding)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
