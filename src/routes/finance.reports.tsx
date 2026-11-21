import { pageHead } from "@/modules/finance/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/modules/finance/components/ui/button";
import { Input } from "@/modules/finance/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/modules/finance/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/modules/finance/components/ui/tabs";
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
  SectionCard,
  SerialNumberCell,
  SerialNumberHead,
  downloadCSV,
} from "@/modules/finance/components/finance/common";
import { CashFlowPanel } from "@/modules/finance/components/finance/CashFlowPanel";
import { buildBookStatement } from "@/modules/finance/finance/books";
import { REPORT_GROUPS, REPORT_NAMES, resolveReportKey, type ReportKey } from "@/modules/finance/finance/reports";
import { useFinance, useLedgerEntries } from "@/modules/finance/finance/store";
import { OPENING } from "@/modules/finance/finance/data";
import { formatCourseDuration, studentCourse, studentDepartment } from "@/modules/finance/finance/courses";
import {
  TODAY,
  formatDate,
  formatINR,
  inRange,
  installmentSchedule,
  outstanding,
  settlementStatus,
  studentPaid,
  sum,
  pettyDailyBalances,
} from "@/modules/finance/finance/logic";
import type { Student } from "@/modules/finance/finance/types";
import { ADMISSION_FEE_LABEL, ADMISSION_NO_FULL, ADMISSION_NO_SHORT } from "@/modules/finance/finance/labels";

type ReportPeriod = "daily" | "monthly" | "custom";

function validateReportSearch(search: Record<string, unknown>): {
  report?: string | undefined;
  tab?: string | undefined;
} {
  return {
    report: typeof search["report"] === "string" ? search["report"] : undefined,
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
  };
}

export const Route = createFileRoute("/finance/reports")({
  head: pageHead("Reports", "Manage reports in your school finance workspace."),
  validateSearch: validateReportSearch,
  component: ReportsPage,
});

interface Report {
  columns: string[];
  rows: (string | number)[][];
  numericCols?: number[] | undefined;
  exportColumns?: string[] | undefined;
  printColumns?: string[] | undefined;
  noData?: boolean | undefined;
  emptyMessage?: string | undefined;
  book?: boolean | undefined;
  monthlyFee?: ({
    monthKeys: string[];
    selectedMonth: string;
    departmentRowSpans: Record<number, number>;
  }) | undefined;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10);
}

function reportDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function reportMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthsForMonthlyFeeReport(month: string, earliestInstallmentMonth?: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstMonth = earliestInstallmentMonth && earliestInstallmentMonth < month
    ? earliestInstallmentMonth
    : month;
  const [firstYear, firstMonthNumber] = firstMonth.split("-").map(Number);
  const latestIndex = year! * 12 + monthNumber! - 1;
  const earliestIndex = firstYear! * 12 + firstMonthNumber! - 1;
  const startIndex = Math.min(latestIndex, earliestIndex);
  return Array.from({ length: Math.min(15, latestIndex - startIndex + 1) }, (_, index) => {
    const value = latestIndex - index;
    return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
  });
}

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: "reports" | "cash-flow" = search.tab === "cash-flow" ? "cash-flow" : "reports";
  const report = resolveReportKey(search.report);
  const legacyCashFlowReport = search.report === "cash-flow-statement";

  // Old saved state may still ask for the Cash Flow report: open the Cash Flow tab instead.
  useEffect(() => {
    if (legacyCashFlowReport) {
      navigate({
        search: (prev) => ({
          report: prev.report === "cash-flow-statement" ? undefined : prev.report,
          tab: "cash-flow",
        }),
        replace: true,
      });
      return;
    }
    if (activeTab !== "reports") return;
    if (search.report !== report || search.tab !== undefined) {
      navigate({ search: { report }, replace: true });
    }
  }, [activeTab, legacyCashFlowReport, navigate, report, search.report, search.tab]);

  const crumbs =
    activeTab === "cash-flow"
      ? ["Financial Reports", "Cash Flow"]
      : ["Financial Reports", REPORT_NAMES[report]];

  return (
    <>
      <PageHeader crumbs={crumbs} title="Financial Reports" />
      <SampleNote>
        Illustrative prototype reports generated from sample data — not audited or production-ready
        financial statements.
      </SampleNote>
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          navigate({
            search: (prev) => ({
              report: value === "cash-flow" ? prev.report : resolveReportKey(prev.report),
              tab: value === "cash-flow" ? "cash-flow" : undefined,
            }),
          });
        }}
      >
        <TabsList className="no-print mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Both panels stay mounted so switching tabs never resets the other tab's selections. */}
      <div className={activeTab === "reports" ? "" : "hidden"}>
        <ReportPanel
          reportKey={report}
          onReportChange={(next) => navigate({ search: { report: next } })}
        />
      </div>
      <div className={activeTab === "cash-flow" ? "" : "hidden"}>
        <CashFlowPanel />
      </div>
    </>
  );
}

function ReportPanel({
  reportKey,
  onReportChange,
}: {
  reportKey: ReportKey;
  onReportChange: (report: ReportKey) => void;
}) {
  const { students, payments, transactions, settlements, settings, courseCatalog, petty } =
    useFinance();
  const ledgerEntries = useLedgerEntries();
  const [period, setPeriod] = useState<ReportPeriod>(
    reportKey === "monthly-fee-report" ? "monthly" : "daily",
  );
  const [day, setDay] = useState(TODAY);
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [customFrom, setCustomFrom] = useState(settings.financialYear.start);
  const [customTo, setCustomTo] = useState(TODAY);
  const [course, setCourse] = useState("all");
  const [department, setDepartment] = useState("all");
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (reportKey === "monthly-fee-report") {
      setPeriod("monthly");
    }
  }, [reportKey]);

  const from = period === "daily" ? day : period === "monthly" ? `${month}-01` : customFrom;
  const to = period === "daily" ? day : period === "monthly" ? lastDayOfMonth(month) : customTo;
  const asOn = period === "daily" ? day : period === "monthly" ? to : customTo;
  const asOnReport = reportKey === "balance-sheet" || reportKey === "outstanding-overdue-fees";
  const periodLine = asOnReport
    ? `As on: ${reportDateLabel(asOn)}`
    : period === "daily"
      ? `Date: ${reportDateLabel(day)}`
      : period === "monthly"
        ? `Month: ${new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
        : `Period: ${reportDateLabel(customFrom)} to ${reportDateLabel(customTo)}`;

  const studentMatches = (student: Student | undefined) => {
    if (!student) return false;
    const selected = studentCourse(student, courseCatalog);
    return (
      (department === "all" || studentDepartment(student, courseCatalog) === department) &&
      (course === "all" || (selected?.name ?? student.course) === course)
    );
  };
  const byId = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const courses = [...new Set(courseCatalog.courses.map((item) => item.name))];
  const showDepartment = [
    "income-report",
    "expense-report",
    "student-fee-collection",
    "monthly-fee-report",
    "department-wise-enrolment-fees",
    "course-wise-enrolment-fees",
    "outstanding-overdue-fees",
  ].includes(reportKey);
  const showCourse = [
    "income-report",
    "student-fee-collection",
    "monthly-fee-report",
    "department-wise-enrolment-fees",
    "course-wise-enrolment-fees",
    "outstanding-overdue-fees",
  ].includes(reportKey);

  const reportData: Report = (() => {
    const money = formatINR;
    const addTotal = (rows: (string | number)[][], total: (string | number)[]) => [...rows, total];
    switch (reportKey) {
      case "income-report":
      case "expense-report": {
        const want = reportKey === "income-report" ? "income" : "expense";
        const tx = transactions.filter(
          (transaction) => transaction.type === want && inRange(transaction.date, from, to),
        );
        const fees =
          want === "income"
            ? payments
                .filter(
                  (payment) =>
                    inRange(payment.date, from, to) && studentMatches(byId.get(payment.studentId)),
                )
                .map((payment) => ({
                  date: payment.date,
                  description: `Fee payment – ${byId.get(payment.studentId)?.name ?? payment.studentId}`,
                  category: "Student Fees",
                  method: payment.method,
                  reference: payment.reference || payment.receiptNo,
                  amount: payment.amount,
                }))
            : [];
        const entries = [...tx, ...fees].sort((a, b) => a.date.localeCompare(b.date));
        const rows = entries.map((entry) => [
          formatDate(entry.date),
          entry.description,
          entry.category,
          entry.method,
          entry.reference || "—",
          money(entry.amount),
        ]);
        return {
          columns: ["Date", "Description", "Category", "Method", "Reference", "Amount"],
          rows: entries.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                money(sum(entries.map((entry) => entry.amount))),
              ])
            : rows,
          numericCols: [5],
          noData: entries.length === 0,
        };
      }
      case "income-expenditure-summary": {
        const months = new Map<string, { income: number; expense: number }>();
        const bump = (date: string, key: "income" | "expense", amount: number) => {
          const id = date.slice(0, 7);
          const current = months.get(id) ?? { income: 0, expense: 0 };
          current[key] += amount;
          months.set(id, current);
        };
        payments
          .filter((payment) => inRange(payment.date, from, to))
          .forEach((payment) => bump(payment.date, "income", payment.amount));
        transactions
          .filter((transaction) => inRange(transaction.date, from, to))
          .forEach((transaction) => bump(transaction.date, transaction.type, transaction.amount));
        const values = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
        const income = sum(values.map(([, value]) => value.income));
        const expense = sum(values.map(([, value]) => value.expense));
        const rows = values.map(([id, value]) => [
          new Date(`${id}-01T00:00:00`).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          }),
          money(value.income),
          money(value.expense),
          money(value.income - value.expense),
        ]);
        return {
          columns: ["Month", "Income", "Expenditure", "Net"],
          rows: values.length
            ? addTotal(rows, ["Total", money(income), money(expense), money(income - expense)])
            : rows,
          numericCols: [1, 2, 3],
          noData: values.length === 0,
        };
      }
      case "student-fee-collection":
      {
        const entries = payments
          .filter(
            (payment) =>
              inRange(payment.date, from, to) && studentMatches(byId.get(payment.studentId)),
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        const rows = entries.map((payment) => {
          const student = byId.get(payment.studentId);
          const linkedCourse = student ? studentCourse(student, courseCatalog) : undefined;
          return [
            formatDate(payment.date),
            payment.receiptNo,
            student?.name ?? payment.studentId,
            student ? studentDepartment(student, courseCatalog) : "—",
            linkedCourse?.name ?? student?.course ?? "—",
            student?.track ?? "—",
            student?.duration ? `${student.duration.value} ${student.duration.unit}` : "—",
            payment.method,
            money(payment.amount),
          ];
        });
        return {
          columns: [
            "Date",
            "Receipt",
            "Student",
            "Department",
            "Course",
            "Track",
            "Duration",
            "Method",
            "Amount",
          ],
          rows: entries.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                money(sum(entries.map((payment) => payment.amount))),
              ])
            : rows,
          numericCols: [8],
          noData: entries.length === 0,
        };
      }
      case "monthly-fee-report": {
        const selectedStudents = students.filter(studentMatches);
        const earliestInstallmentMonth = selectedStudents
          .flatMap((student) => student.installments.map((installment) => installment.due.slice(0, 7)))
          .filter((installmentMonth) => installmentMonth <= month)
          .sort()[0];
        const monthKeys = monthsForMonthlyFeeReport(month, earliestInstallmentMonth);
        const monthLabels = monthKeys.map(reportMonthLabel);
        const grouped = new Map<string, Student[]>();
        for (const student of selectedStudents) {
          const departmentName = studentDepartment(student, courseCatalog) || "—";
          const group = grouped.get(departmentName) ?? [];
          group.push(student);
          grouped.set(departmentName, group);
        }
        const sortedGroups = [...grouped.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([departmentName, group]) => ({
            departmentName,
            students: group.sort((left, right) => {
              const leftCourse = studentCourse(left, courseCatalog)?.name ?? left.course;
              const rightCourse = studentCourse(right, courseCatalog)?.name ?? right.course;
              return (
                leftCourse.localeCompare(rightCourse) || left.name.localeCompare(right.name)
              );
            }),
          }));

        const rows: (string | number)[][] = [];
        const departmentRowSpans: Record<number, number> = {};
        const total = {
          fee: 0,
          admissionFee: 0,
          paid: 0,
          balance: 0,
          months: monthKeys.map(() => 0),
        };
        for (const group of sortedGroups) {
          const startIndex = rows.length;
          departmentRowSpans[startIndex] = group.students.length;
          for (const student of group.students) {
            const studentPayments = payments.filter((payment) => payment.studentId === student.id);
            const paid = studentPaid(student.id, studentPayments);
            const balance = Math.max(0, student.totalFee - paid);
            const schedule = installmentSchedule(student, paid, TODAY, studentPayments);
            const admissionFee =
              student.installments.find(
                (installment) =>
                  installment.label.trim().toLowerCase() === ADMISSION_FEE_LABEL.toLowerCase(),
              )?.amount ?? 0;
            const monthAmounts = monthKeys.map((monthKey) =>
              sum(
                schedule
                  .filter((installment) => installment.due.slice(0, 7) === monthKey)
                  .map((installment) => Math.max(0, installment.balance)),
              ),
            );
            const lastPaidDate = studentPayments
              .map((payment) => payment.date)
              .sort()
              .at(-1);
            total.fee += student.totalFee;
            total.admissionFee += admissionFee;
            total.paid += paid;
            total.balance += balance;
            monthAmounts.forEach((amount, index) => {
              total.months[index] = (total.months[index] ?? 0) + amount;
            });
            rows.push([
              group.departmentName,
              student.name,
              student.regNo || "—",
              student.track ?? "—",
              studentCourse(student, courseCatalog)?.name ?? student.course,
              money(student.totalFee),
              money(admissionFee),
              lastPaidDate ? formatDate(lastPaidDate) : "—",
              money(paid),
              money(balance),
              ...monthAmounts.map((amount) => (amount > 0 ? money(amount) : "—")),
            ]);
          }
        }
        if (rows.length) {
          const totalRowIndex = rows.length;
          departmentRowSpans[totalRowIndex] = 1;
          rows.push([
            "Total",
            "",
            "",
            "",
            "",
            money(total.fee),
            money(total.admissionFee),
            "",
            money(total.paid),
            money(total.balance),
            ...total.months.map((amount) => (amount > 0 ? money(amount) : "—")),
          ]);
        }
        return {
          columns: [
            "Department",
            "Student Name",
            ADMISSION_NO_FULL,
            "Track",
            "Course",
            "Total Fee",
            ADMISSION_FEE_LABEL,
            "Last Paid Date",
            "Total Paid",
            "Balance",
            ...monthLabels,
          ],
          rows,
          numericCols: [5, 6, 7, 8, 9, ...monthKeys.map((_, index) => index + 10)],
          noData: selectedStudents.length === 0,
          monthlyFee: { monthKeys, selectedMonth: month, departmentRowSpans },
        };
      }
      case "department-wise-enrolment-fees": {
        const values = courseCatalog.departments.map((name) => {
          const group = students.filter(
            (student) =>
              inRange(student.registeredOn, from, to) &&
              studentMatches(student) &&
              studentDepartment(student, courseCatalog) === name,
          );
          const ids = new Set(group.map((student) => student.id));
          const billed = sum(group.map((student) => student.totalFee));
          const collected = sum(
            payments
              .filter((payment) => ids.has(payment.studentId) && inRange(payment.date, from, to))
              .map((payment) => payment.amount),
          );
          const due = sum(
            group.map((student) =>
              Math.max(
                0,
                student.totalFee -
                  sum(
                    payments
                      .filter((payment) => payment.studentId === student.id && payment.date <= to)
                      .map((payment) => payment.amount),
                  ),
              ),
            ),
          );
          return { name, enrolments: group.length, billed, collected, due };
        });
        const totals = values.reduce(
          (result, value) => ({
            enrolments: result.enrolments + value.enrolments,
            billed: result.billed + value.billed,
            collected: result.collected + value.collected,
            due: result.due + value.due,
          }),
          { enrolments: 0, billed: 0, collected: 0, due: 0 },
        );
        return {
          columns: ["Department", "Enrolments", "Billed", "Collected", "Outstanding"],
          rows: addTotal(
            values.map((value) => [
              value.name,
              value.enrolments,
              money(value.billed),
              money(value.collected),
              money(value.due),
            ]),
            [
              "Total",
              totals.enrolments,
              money(totals.billed),
              money(totals.collected),
              money(totals.due),
            ],
          ),
          numericCols: [1, 2, 3, 4],
        };
      }
      case "course-wise-enrolment-fees": {
        const values = courseCatalog.courses.map((item) => {
          const group = students.filter(
            (student) =>
              inRange(student.registeredOn, from, to) &&
              studentMatches(student) &&
              studentCourse(student, courseCatalog)?.id === item.id,
          );
          const ids = new Set(group.map((student) => student.id));
          const billed = sum(group.map((student) => student.totalFee));
          const collected = sum(
            payments
              .filter((payment) => ids.has(payment.studentId) && inRange(payment.date, from, to))
              .map((payment) => payment.amount),
          );
          const due = sum(
            group.map((student) =>
              Math.max(
                0,
                student.totalFee -
                  sum(
                    payments
                      .filter((payment) => payment.studentId === student.id && payment.date <= to)
                      .map((payment) => payment.amount),
                  ),
              ),
            ),
          );
          return {
            department: item.department,
            name: item.name,
            enrolments: group.length,
            billed,
            collected,
            due,
          };
        });
        const totals = values.reduce(
          (result, value) => ({
            enrolments: result.enrolments + value.enrolments,
            billed: result.billed + value.billed,
            collected: result.collected + value.collected,
            due: result.due + value.due,
          }),
          { enrolments: 0, billed: 0, collected: 0, due: 0 },
        );
        return {
          columns: ["Department", "Course", "Enrolments", "Billed", "Collected", "Outstanding"],
          rows: addTotal(
            values.map((value) => [
              value.department,
              value.name,
              value.enrolments,
              money(value.billed),
              money(value.collected),
              money(value.due),
            ]),
            [
              "Total",
              "",
              totals.enrolments,
              money(totals.billed),
              money(totals.collected),
              money(totals.due),
            ],
          ),
          numericCols: [2, 3, 4, 5],
        };
      }
      case "outstanding-overdue-fees": {
        const paymentsAsOn = payments.filter((payment) => payment.date <= asOn);
        const values = students
          .filter((student) => studentMatches(student))
          .map((student) => {
            const paid = studentPaid(student.id, paymentsAsOn);
            const due = Math.max(0, student.totalFee - paid);
            const overdue = installmentSchedule(student, paid, asOn, paymentsAsOn).some(
              (installment) => installment.status === "Overdue" && installment.balance > 0,
            );
            return { student, paid, due, overdue };
          })
          .filter((value) => value.due > 0);
        const rows = values.map(({ student, paid, due, overdue }) => {
          const linkedCourse = studentCourse(student, courseCatalog);
          return [
            student.name,
            student.regNo,
            studentDepartment(student, courseCatalog),
            linkedCourse?.name ?? student.course,
            student.track ?? "—",
            student.duration ? formatCourseDuration(student.duration) : "—",
            money(student.totalFee),
            money(paid),
            money(due),
            overdue ? "Yes" : "No",
          ];
        });
        return {
          columns: [
            "Student",
            ADMISSION_NO_SHORT,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          exportColumns: [
            "Student",
            ADMISSION_NO_FULL,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          printColumns: [
            "Student",
            ADMISSION_NO_FULL,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          rows: values.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                "",
                money(sum(values.map(({ student }) => student.totalFee))),
                money(sum(values.map((value) => value.paid))),
                money(sum(values.map((value) => value.due))),
                "",
              ])
            : rows,
          numericCols: [6, 7, 8],
          noData: values.length === 0,
        };
      }
      case "settlement-report": {
        const values = settlements
          .filter((settlement) => inRange(settlement.date, from, to))
          .sort((a, b) => a.date.localeCompare(b.date));
        const recorded = sum(values.map((value) => value.recorded));
        const actualValues = values.filter((value) => value.actual !== null);
        const actual = sum(actualValues.map((value) => value.actual ?? 0));
        const difference = sum(actualValues.map((value) => (value.actual ?? 0) - value.recorded));
        const rows = values.map((settlement) => [
          formatDate(settlement.date),
          settlement.method,
          settlement.count,
          money(settlement.recorded),
          settlement.actual === null ? "—" : money(settlement.actual),
          settlement.actual === null ? "—" : money(settlement.actual - settlement.recorded),
          settlementStatus(settlement),
        ]);
        return {
          columns: ["Date", "Method", "Receipts", "Recorded", "Actual", "Difference", "Status"],
          rows: values.length
            ? addTotal(rows, [
                "Total",
                "",
                sum(values.map((value) => value.count)),
                money(recorded),
                money(actual),
                money(difference),
                "",
              ])
            : rows,
          numericCols: [2, 3, 4, 5],
          noData: values.length === 0,
        };
      }
      case "cash-book":
      case "bank-book": {
        const kind = reportKey === "cash-book" ? "cash" : "bank";
        const book = buildBookStatement(ledgerEntries, kind, from, to);
        const isCashBook = kind === "cash";
        const rows = [
          ["", "Opening balance", "", "—", "—", "—", money(book.opening)],
          ...book.rows.map((entry) => [
            formatDate(entry.date),
            entry.description,
            entry.category,
            entry.receiptNo || entry.reference || "—",
            entry.type === "income" ? money(entry.amount) : "—",
            entry.type === "expense" ? money(entry.amount) : "—",
            money(entry.balance),
          ]),
          ["", "Total", "", "—", money(book.totalReceived), money(book.totalPaid), "—"],
          ["", "Closing balance", "", "—", "—", "—", money(book.closing)],
        ];
        return {
          columns: [
            "Date",
            "Particulars",
            "Ledger Name",
            "Receipt No.",
            `${isCashBook ? "Cash" : "Bank"} Received (₹)`,
            `${isCashBook ? "Cash" : "Bank"} Paid (₹)`,
            "Balance (₹)",
          ],
          rows,
          numericCols: [4, 5, 6],
          book: true,
          noData: book.rows.length === 0,
          emptyMessage: `No ${kind} entries in the selected period.`,
        };
      }
      case "balance-sheet": {
        const cash = buildBookStatement(ledgerEntries, "cash", "0000-01-01", asOn).closing;
        const bank = buildBookStatement(ledgerEntries, "bank", "0000-01-01", asOn).closing;
        const pettyBalance =
          pettyDailyBalances(petty, OPENING.petty, asOn).at(-1)?.closing ?? OPENING.petty;
        const paymentsAsOn = payments.filter((payment) => payment.date <= asOn);
        const feeOutstanding = sum(students.map((student) => outstanding(student, paymentsAsOn)));
        return {
          columns: ["Item", "Amount"],
          rows: [
            ["Cash in hand", money(cash)],
            ["Bank balance", money(bank)],
            ["Petty cash", money(pettyBalance)],
            ["Outstanding student fees (receivable)", money(feeOutstanding)],
            ["Total assets (illustrative)", money(cash + bank + pettyBalance + feeOutstanding)],
          ],
          numericCols: [1],
        };
      }
    }
  })();

  const filename = [settings.institution.name, REPORT_NAMES[reportKey], periodLine]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const csvRows = reportData.rows.map((row, index) => [
    reportData.monthlyFee && index === reportData.rows.length - 1 ? "Total" : String(index + 1),
    ...row.map(String),
  ]);

  return (
    <SectionCard>
      <FilterBar>
        <Select
          value={reportKey}
          onValueChange={(value) => {
            onReportChange(value as ReportKey);
            if (value === "monthly-fee-report") setPeriod("monthly");
            setGenerated(false);
          }}
        >
          <SelectTrigger aria-label="Report" className="w-full sm:w-[280px]">
            <SelectValue placeholder="Report" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.reports.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={period}
          disabled={reportKey === "monthly-fee-report"}
          onValueChange={(value) => {
            setPeriod(value as ReportPeriod);
            setGenerated(false);
          }}
        >
          <SelectTrigger aria-label="Period" className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {period === "daily" && (
          <Input
            aria-label="Date"
            type="date"
            className="w-[160px]"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
              setGenerated(false);
            }}
          />
        )}
        {period === "monthly" && (
          <Input
            aria-label="Month"
            type="month"
            className="w-[160px]"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setGenerated(false);
            }}
          />
        )}
        {period === "custom" && (
          <>
            <Input
              aria-label="From date"
              type="date"
              className="w-[160px]"
              value={customFrom}
              onChange={(event) => {
                setCustomFrom(event.target.value);
                setGenerated(false);
              }}
            />
            <Input
              aria-label="To date"
              type="date"
              className="w-[160px]"
              value={customTo}
              onChange={(event) => {
                setCustomTo(event.target.value);
                setGenerated(false);
              }}
            />
          </>
        )}
        {showDepartment && (
          <FilterSelect
            label="Department"
            value={department}
            onChange={(value) => {
              setDepartment(value);
              setGenerated(false);
            }}
            options={courseCatalog.departments}
          />
        )}
        {showCourse && (
          <FilterSelect
            label="Course"
            value={course}
            onChange={(value) => {
              setCourse(value);
              setGenerated(false);
            }}
            options={courses}
          />
        )}
        <Button onClick={() => setGenerated(true)}>Generate report</Button>
        {generated && (
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(
                  filename,
                  ["Sl. No.", ...(reportData.exportColumns ?? reportData.columns)],
                  csvRows,
                )
              }
            >
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </>
        )}
      </FilterBar>
      {!generated ? (
        <EmptyState message="Choose a period and generate the selected report." />
      ) : (
        <div
          className={`print-area financial-report-print${reportData.book ? " financial-report-book" : ""}${reportData.monthlyFee ? " monthly-fee-report-print" : ""}`}
        >
          <header className="financial-report-header">
            <p className="font-semibold">{settings.institution.name}</p>
            <h2 className="text-lg font-bold">{REPORT_NAMES[reportKey]}</h2>
            <p>{periodLine}</p>
          </header>
          {reportKey === "balance-sheet" && (
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Illustrative preview only — not audited or production-ready.
            </p>
          )}
          {reportData.noData && !reportData.book ? (
            <EmptyState
              message={reportData.emptyMessage ?? "No data for this report in the selected period."}
            />
          ) : (
            <>
              {reportData.noData && reportData.book && (
                <p className="mb-2 text-sm text-muted-foreground">{reportData.emptyMessage}</p>
              )}
              {reportData.monthlyFee ? (
                <>
                  <div className="monthly-fee-report-scroll w-full overflow-x-auto">
                    <Table className="monthly-fee-report-table w-max text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="monthly-fee-serial sticky left-0 z-30 w-12 whitespace-nowrap bg-background">
                            SL No.
                          </TableHead>
                          {reportData.columns.map((column, index) => (
                            <TableHead
                              key={column}
                              className={[
                                "whitespace-nowrap",
                                reportData.numericCols?.includes(index) ? "text-right" : "",
                                index === 1
                                  ? "monthly-fee-student sticky left-48 z-30 bg-background text-left"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {column}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.rows.map((row, rowIndex) => {
                          const departmentRowSpan =
                            reportData.monthlyFee?.departmentRowSpans[rowIndex];
                          const isTotal = rowIndex === reportData.rows.length - 1;
                          return (
                            <TableRow key={rowIndex}>
                              {isTotal ? (
                                <TableCell className="monthly-fee-serial sticky left-0 z-20 whitespace-nowrap bg-background font-semibold">
                                  Total
                                </TableCell>
                              ) : (
                                <TableCell className="monthly-fee-serial sticky left-0 z-20 whitespace-nowrap bg-background text-center text-muted-foreground">
                                  {rowIndex + 1}
                                </TableCell>
                              )}
                              {row.map((cell, cellIndex) => {
                                if (cellIndex === 0 && departmentRowSpan === undefined) {
                                  return null;
                                }
                                if (cellIndex === 0 && reportData.monthlyFee) {
                                  return (
                                    <TableCell
                                      key={cellIndex}
                                      rowSpan={departmentRowSpan}
                                      className="w-36 whitespace-nowrap align-top"
                                    >
                                      {cell}
                                    </TableCell>
                                  );
                                }
                                const isOverdueMonth =
                                  cellIndex >= 10 &&
                                  (reportData.monthlyFee?.monthKeys[cellIndex - 10] ?? "") <
                                    (reportData.monthlyFee?.selectedMonth ?? "") &&
                                  cell !== "—";
                                return (
                                  <TableCell
                                    key={cellIndex}
                                    className={[
                                      "whitespace-nowrap",
                                      reportData.numericCols?.includes(cellIndex)
                                        ? "num text-right"
                                        : "",
                                      cellIndex === 1
                                        ? "monthly-fee-student sticky left-48 z-10 w-44 bg-background"
                                        : "",
                                      isOverdueMonth ? "text-red-600 dark:text-red-400" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {cell}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Month columns show the amount still to be collected for that month.
                  </p>
                </>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SerialNumberHead />
                      {reportData.columns.map((column, index) => (
                        <TableHead
                          key={column}
                          className={reportData.numericCols?.includes(index) ? "text-right" : ""}
                        >
                          <span className="print:hidden">{column}</span>
                          {reportData.printColumns?.[index] && (
                            <span className="hidden print:inline">
                              {reportData.printColumns[index]}
                            </span>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        <SerialNumberCell index={rowIndex} />
                        {row.map((cell, cellIndex) => (
                          <TableCell
                            key={cellIndex}
                            className={[
                              reportData.numericCols?.includes(cellIndex) ? "num text-right" : "",
                              reportData.book && cellIndex === 1
                                ? "whitespace-normal break-words"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {reportData.book && (
                <div className="financial-report-signatures">
                  <div>Prepared by</div>
                  <div>Authorised signature</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
