import { pageHead } from "@/modules/finance/lib/seo";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { differenceInCalendarDays } from "date-fns";
import { FeeConcessions } from "@/modules/finance/components/finance/FeeConcessions";
import { DocumentVerificationHistory } from "@/modules/finance/components/finance/ApplicationDetails";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { RadioGroup, RadioGroupItem } from "@/modules/finance/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/modules/finance/components/ui/toggle-group";
import { canonicalAdmissionNo, normalizeAdmissionNo } from "@/modules/finance/finance/billing";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Check } from "lucide-react";
import { Button } from "@/modules/finance/components/ui/button";
import { Input } from "@/modules/finance/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/modules/finance/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/finance/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/finance/components/ui/dialog";
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
  Field,
  FilterBar,
  FilterSelect,
  PageHeader,
  SampleNote,
  SearchBox,
  SectionCard,
  SerialNumberCell,
  SerialNumberHead,
  SerialNumberLabel,
  StatCard,
  StatGrid,
  StatusBadge,
  tabSearch,
} from "@/modules/finance/components/finance/common";
import { Badge } from "@/modules/finance/components/ui/badge";
import { Receipt } from "@/modules/finance/components/finance/Receipt";
import { AdministrationHistory } from "@/modules/finance/components/finance/AdministrationHistory";
import {
  ApplicationDetail,
  ApplicationDetails,
  ApplicationDetailsPrintButton,
} from "@/modules/finance/components/finance/ApplicationDetails";
import { displayInstallmentLabel } from "@/modules/finance/finance/types";
import { ADMISSION_FEE_LABEL } from "@/modules/finance/finance/labels";
import { useRecordPayment } from "@/modules/finance/components/finance/RecordPaymentContext";
import { useFinance } from "@/modules/finance/finance/store";
import {
  buildAdministrationDetailsPayload,
  buildPaymentNotificationPayload,
  appearsInBilling,
  applicationResubmissionForReview,
  applicationListStatus,
  matchesApplicationListFilter,
  hasResubmittedDocumentsAwaitingReview,
  areRequiredDocumentsApproved,
  applicationStage,
  classAccess,
  hasAdministrationDetailsEvent,
  isApplicationVerified,
  installmentDaysOverdue,
  installmentReminderWindowEnd,
  installmentStatus,
  markApplicationReviewed,
  nextAction,
  personTotals,
  recordDocumentVerification,
  type ApplicationStage,
  type ApplicationListFilter,
  type FeeNextAction,
  type PaymentNotificationPayload,
} from "@/modules/finance/finance/feeWorkflow";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
} from "@/modules/finance/finance/feeWorkflowConfig";
import { formatCourseDuration, studentCourse, studentDepartment } from "@/modules/finance/finance/courses";
import {
  TODAY,
  amountInWords,
  billStatus,
  formatDate,
  formatINR,
  installmentSchedule,
  nextDue,
  outstanding,
  studentPaid,
  sum,
} from "@/modules/finance/finance/logic";
import {
  type FeePayment,
  type FeeWorkflowPayment,
  type AdministrationDetailsSnapshot,
  type DocumentCorrectionItem,
  type Person,
  type Student,
} from "@/modules/finance/finance/types";
import { ADMISSION_NO_FULL } from "@/modules/finance/finance/labels";

export const Route = createFileRoute("/finance/fees")({
  head: pageHead("Fees", "Manage fees in your school finance workspace."),
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    tab?: string | undefined;
    admissionPersonId?: string | undefined;
    applicationPersonId?: string | undefined;
    billingPersonId?: string | undefined;
    applicationAction?: string | undefined;
    workflowAction?: string | undefined;
    workflowActionPersonId?: string | undefined;
    workflowActionInstallmentId?: string | undefined;
    todayFilter?: "dueSoon" | "overdue" | undefined;
  } => ({
    ...tabSearch(s),
    admissionPersonId: typeof s["admissionPersonId"] === "string" ? s["admissionPersonId"] : undefined,
    applicationPersonId:
      typeof s["applicationPersonId"] === "string" ? s["applicationPersonId"] : undefined,
    billingPersonId: typeof s["billingPersonId"] === "string" ? s["billingPersonId"] : undefined,
    applicationAction: typeof s["applicationAction"] === "string" ? s["applicationAction"] : undefined,
    workflowAction: typeof s["workflowAction"] === "string" ? s["workflowAction"] : undefined,
    workflowActionPersonId:
      typeof s["workflowActionPersonId"] === "string" ? s["workflowActionPersonId"] : undefined,
    workflowActionInstallmentId:
      typeof s["workflowActionInstallmentId"] === "string" ? s["workflowActionInstallmentId"] : undefined,
    todayFilter:
      s["todayFilter"] === "dueSoon" || s["todayFilter"] === "overdue" ? s["todayFilter"] : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "installments")
      throw redirect({
        to: "/finance/fees",
        search: {
          tab: "billing",
          todayFilter: "overdue",
          billingPersonId: search.workflowActionPersonId,
          workflowAction: search.workflowAction,
          workflowActionPersonId: search.workflowActionPersonId,
          workflowActionInstallmentId: search.workflowActionInstallmentId,
        },
        replace: true,
      });
    if (search.tab === "receipts" || search.tab === "collection" || search.tab === "handoffs")
      throw redirect({ to: "/finance/fees", search: { tab: "billing" }, replace: true });
    if (
      search.tab &&
      search.tab !== "applications" &&
      search.tab !== "billing" &&
      search.tab !== "concessions"
    )
      throw redirect({ to: "/finance/fees", search: { tab: "billing" }, replace: true });
  },
  component: FeesPage,
});

const LABEL: Record<string, string> = {
  applications: "Applications",
  billing: "Billing",
  concessions: "Fee Concessions",
};
const STATUSES = ["Paid", "Partially Paid", "Pending", "Overdue"];
type BillingSort = {
  field: "nextDue" | "outstanding";
  direction: "asc" | "desc";
};

function billingStatusLabel(
  student: Student,
  payments: FeePayment[],
  person?: Person | undefined,
  personPayments: FeeWorkflowPayment[] = [],
) {
  const status = billStatus(student, payments);
  if (status !== "Overdue") return status;
  const hasAdmissionNo = !!(person?.admissionNo || student.regNo);
  if (!hasAdmissionNo) return studentPaid(student.id, payments) > 0 ? "Partially Paid" : "Pending";
  if (person) {
    const oldestOverdue = person.plan
      .filter((installment) => installmentStatus(installment, personPayments) === "Overdue")
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
    return `Overdue ${oldestOverdue ? installmentDaysOverdue(oldestOverdue) : 0}d`;
  }
  const oldestOverdue = installmentSchedule(
    student,
    studentPaid(student.id, payments),
    TODAY,
    payments,
  )
    .filter((installment) => installment.status === "Overdue")
    .sort((left, right) => left.due.localeCompare(right.due))[0];
  return `Overdue ${
    oldestOverdue
      ? differenceInCalendarDays(
          new Date(`${TODAY}T00:00:00`),
          new Date(`${oldestOverdue.due}T00:00:00`),
        )
      : 0
  }d`;
}

function FeesPage() {
  const { tab = "billing" } = Route.useSearch();
  const activeTab =
    tab === "applications" ? "applications" : tab === "concessions" ? "concessions" : "billing";
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        crumbs={["Student Fees", LABEL[activeTab] ?? "Billing"]}
        title={LABEL[activeTab] ?? "Billing"}
      />
      {tab !== "applications" && tab !== "concessions" && <SampleNote />}
      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ search: { tab: v } })}
        className="mb-4"
      >
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="concessions">Fee Concessions</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === "applications" && <Applications />}
      {activeTab === "billing" && <Billing />}
      {activeTab === "concessions" && <FeeConcessions />}
    </>
  );
}

function useStudentFilters(studentList?: Student[]) {
  const { students, payments, courseCatalog } = useFinance();
  const sourceStudents = studentList ?? students;
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const courses = courseCatalog.courses.map((item) => item.name);
  const departments = courseCatalog.departments;
  const search = query.trim().toLowerCase();
  const normalizedSearch = normalizeAdmissionNo(query);
  const rows = sourceStudents.filter(
    (student) =>
      (!search ||
        `${student.name} ${student.regNo} ${student.applicationId ?? ""} ${student.phone}`
          .toLowerCase()
          .includes(search) ||
        (!!normalizedSearch && normalizeAdmissionNo(student.regNo).includes(normalizedSearch)) ||
        payments.some(
          (payment) =>
            payment.studentId === student.id && payment.receiptNo.toLowerCase().includes(search),
        )) &&
      (department === "all" || studentDepartment(student, courseCatalog) === department) &&
      (course === "all" || studentCourse(student, courseCatalog)?.name === course) &&
      (status === "all" || billStatus(student, payments) === status),
  );
  const bar = (
    <FilterBar>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search student, admission no. or receipt no."
      />
      <FilterSelect
        label="Departments"
        value={department}
        onChange={setDepartment}
        options={departments}
      />
      <FilterSelect label="Courses" value={course} onChange={setCourse} options={courses} />
      <FilterSelect label="Statuses" value={status} onChange={setStatus} options={STATUSES} />
    </FilterBar>
  );
  return { rows, bar };
}

function normalizeContact(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function workflowPersonForStudent(student: Student, persons: Person[]) {
  return persons.find(
    (person) =>
      person.id === student.id ||
      (!!student.applicationId && person.applicationId === student.applicationId) ||
      (!!person.admissionNo &&
        !!student.regNo &&
        canonicalAdmissionNo(person.admissionNo) === canonicalAdmissionNo(student.regNo)) ||
      normalizeContact(person.contact) === normalizeContact(student.phone),
  );
}

function Applications() {
  const {
    feeWorkflow,
    concessions,
    updateFeeWorkflowPerson,
    saveDocumentVerifications,
    documentCorrections,
    sendDocumentCorrectionRequest,
  } = useFinance();
  const navigate = Route.useNavigate();
  const { open: openRecordPayment } = useRecordPayment();
  const { applicationPersonId, applicationAction } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationListFilter>("All");
  const [view, setView] = useState<Person | null>(null);
  useEffect(() => {
    const linkedPerson = feeWorkflow.persons.find((person) => person.id === applicationPersonId);
    if (linkedPerson) {
      setView(linkedPerson);
      if (applicationAction) navigate({ search: { tab: "applications" } });
    }
  }, [applicationAction, applicationPersonId, feeWorkflow.persons, navigate]);
  const submitted = feeWorkflow.persons.filter((person) => person.applicationDetails);
  const personPayments = (person: Person) =>
    feeWorkflow.payments.filter((payment) => payment.personId === person.id);
  const statusForList = (person: Person) =>
    applicationListStatus(
      person,
      personPayments(person),
      feeWorkflow.handoffs,
      documentCorrections,
      concessions,
    );
  const resubmissionFor = (person: Person) =>
    applicationResubmissionForReview(
      person,
      documentCorrections,
      personPayments(person),
      feeWorkflow.handoffs,
      concessions,
    );
  const statusFor = (person: Person) =>
    applicationStage(
      person,
      personPayments(person),
      feeWorkflow.handoffs,
      true,
      documentCorrections,
      concessions,
    );
  const search = query.trim().toLowerCase();
  const receivedAt = (person: Person) => resubmissionFor(person)?.date ?? person.appliedOn;
  const rows = submitted
    .filter((person) => {
      const status = statusForList(person);
      const resubmission = resubmissionFor(person);
      const matchesStatus = matchesApplicationListFilter(status, !!resubmission, statusFilter);
      return (
        matchesStatus &&
        (!search ||
          `${person.name} ${person.applicationId} ${person.contact}`.toLowerCase().includes(search))
      );
    })
    .sort((left, right) => {
      const statusPriority = (person: Person) => (statusForList(person) === "New" ? 0 : 1);
      return (
        statusPriority(left) - statusPriority(right) ||
        receivedAt(right).localeCompare(receivedAt(left))
      );
    });
  const actionForStage = (stage: ApplicationStage) =>
    ({
      "To review": "Review",
      "Awaiting Resubmission": "Waiting for corrected documents from Admission (Sales)",
      "Resubmitted for Review": "Review resubmitted documents",
      Rejected: "Application rejected · payment unavailable",
      "Awaiting payment": "Record payment",
      "Ready to send": "Eligible for handoff",
      "Handoff prepared": "Application handoff prepared",
      Admitted: "Admission No. recorded in Billing",
    })[stage];
  const payments = view
    ? feeWorkflow.payments.filter((payment) => payment.personId === view.id)
    : [];
  const totals = view ? personTotals(view, payments) : undefined;
  const snapshot = view ? buildAdministrationDetailsPayload(view, payments) : undefined;
  const administratorVerifiedAt = view
    ? feeWorkflow.handoffs
        .find((handoff) => handoff.personId === view.id && handoff.target === "Administration")
        ?.history.find((entry) => entry.text === ADMISSION_NO_RECEIVED_TEXT)?.date
    : undefined;
  const accountantVerifiedAt =
    view && isApplicationVerified(view) ? view.accountantVerifiedAt : undefined;
  const accountantVerified = !!accountantVerifiedAt;
  const alreadySent = !!view && hasAdministrationDetailsEvent(view.id, feeWorkflow.handoffs);
  const overallVerificationStatus = !accountantVerified
    ? "Pending"
    : administratorVerifiedAt
      ? "Verified"
      : alreadySent
        ? "Handoff prepared"
        : "Pending";
  const viewStage = view ? statusFor(view) : null;
  const recordApplicationDocumentDecision = (
    document: NonNullable<Person["applicationDetails"]>["documents"][number],
    status: "Approved" | "Rejected",
    reason?: string | undefined,
  ) => {
    if (!view) return;
    const currentPerson = feeWorkflow.persons.find((person) => person.id === view.id) ?? view;
    const result = recordDocumentVerification(currentPerson, document, status, reason);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.changed) return;
    if (!saveDocumentVerifications(result.person.id, result.person.documentVerifications ?? [])) {
      toast.error("Could not save the document decision in this browser.");
      return;
    }
    updateFeeWorkflowPerson(result.person);
    setView(result.person);
    if (status === "Rejected") {
      toast.success("Document rejected. Include it in the consolidated correction request.");
    } else if (result.allRequiredDocumentsApproved) {
      toast.success("All required documents are approved. Verify the application to continue.");
    } else {
      toast.success("Document approved. Review the remaining required documents.");
    }
  };

  const sendApplicationCorrectionRequest = (documents: DocumentCorrectionItem[]) => {
    if (!view) return false;
    const currentPerson = feeWorkflow.persons.find((person) => person.id === view.id) ?? view;
    if (!sendDocumentCorrectionRequest(currentPerson, documents)) {
      toast.error(
        "Could not send the correction request. Check for an unresolved request and try again.",
      );
      return false;
    }
    toast.success("Consolidated correction request sent to Admission (Sales) (simulated).");
    return true;
  };

  return (
    <>
      <SectionCard>
        <div className="no-print mb-4 flex w-full items-center gap-3">
          <div className="min-w-0 flex-1 [&>div]:!min-w-0">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search name, application ID or contact"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="application-status-filter" className="text-sm font-medium">
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(value: ApplicationListFilter) => setStatusFilter(value)}
            >
              <SelectTrigger
                id="application-status-filter"
                aria-label="Status"
                className="h-9 w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState message="No applications found" />
        ) : (
          <div>
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[17%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <SerialNumberHead />
                  <TableHead className="whitespace-nowrap">Applied On</TableHead>
                  <TableHead className="whitespace-nowrap">Application ID</TableHead>
                  <TableHead className="whitespace-nowrap">Applicant</TableHead>
                  <TableHead className="whitespace-nowrap">Contact</TableHead>
                  <TableHead className="whitespace-nowrap">Course</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Fee payable</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Adm. Fee</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person, index) => {
                  const admissionFee = person.plan.find(
                    (installment) => installment.label === ADMISSION_FEE_LABEL,
                  )?.amountDue;
                  const applicationStatus = statusForList(person);
                  const resubmission = resubmissionFor(person);
                  const hasPendingResubmission = hasResubmittedDocumentsAwaitingReview(
                    person,
                    documentCorrections,
                  );
                  return (
                    <TableRow
                      key={person.id}
                      onRowClick={() => {
                        setView(person);
                      }}
                      rowLabel={`View application for ${person.name}`}
                    >
                      <SerialNumberCell index={index} />
                      <TableCell className="whitespace-nowrap">
                        {formatDate(person.appliedOn)}
                      </TableCell>
                      <TableCell className="break-all">{person.applicationId}</TableCell>
                      <TableCell className="break-words">{person.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{person.contact}</TableCell>
                      <TableCell className="break-words">{person.course}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {formatINR(
                          personTotals(
                            person,
                            feeWorkflow.payments.filter(
                              (payment) => payment.personId === person.id,
                            ),
                          ).payable,
                        )}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {admissionFee !== undefined ? formatINR(admissionFee) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {hasPendingResubmission && (
                            <span
                              className="h-2 w-2 rounded-full bg-success"
                              aria-label="Resubmitted documents awaiting Accounts review"
                              title="Resubmitted documents awaiting Accounts review"
                            />
                          )}
                          <Badge
                            variant={applicationStatus === "Pending" ? "warning" : "success"}
                            className="gap-1.5 whitespace-nowrap"
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${
                                applicationStatus === "Pending" ? "bg-warning" : "bg-success"
                              }`}
                            />
                            {applicationStatus}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={!!view}
        onOpenChange={(open) => {
          if (!open) {
            setView(null);
            if (applicationPersonId) navigate({ search: { tab: "applications" } });
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-4 pr-14 text-left sm:px-6">
            {view && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <DialogTitle className="sr-only">Application details</DialogTitle>
                <span className="text-xs text-muted-foreground">
                  Application No. {view.applicationId}
                </span>
                <span className="text-xs text-muted-foreground">
                  Applied Date {formatDate(view.appliedOn)}
                </span>
                <StatusBadge status={statusFor(view)} />
                <StatusBadge
                  status={
                    view.admissionNo ? `Admission No. ${view.admissionNo}` : "Admission No. Pending"
                  }
                />
                <div className="ml-auto">
                  <ApplicationDetailsPrintButton />
                </div>
              </div>
            )}
          </DialogHeader>
          {view && snapshot && (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails
                snapshot={snapshot}
                plan={view.plan}
                documentVerifications={view.documentVerifications}
                onVerifyDocument={recordApplicationDocumentDecision}
                onSendCorrectionRequest={sendApplicationCorrectionRequest}
                correctionRequests={documentCorrections}
              />
              <DocumentVerificationHistory documentVerifications={view.documentVerifications} />
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">For office use only</h3>
                  <StatusBadge status={overallVerificationStatus} />
                </div>
                <div className="grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2">
                  <ApplicationDetail
                    label="Accountant verification"
                    value={
                      accountantVerifiedAt
                        ? `Verified · ${formatDate(accountantVerifiedAt.slice(0, 10))}`
                        : "Pending"
                    }
                    layout="inline"
                  />
                  <ApplicationDetail
                    label="Administrator verification"
                    value={
                      administratorVerifiedAt
                        ? `Verified · ${formatDate(administratorVerifiedAt.slice(0, 10))}`
                        : "Pending"
                    }
                    layout="inline"
                  />
                </div>
              </section>
            </div>
          )}
          {view && viewStage && (
            <DialogFooter className="sticky bottom-0 z-10 flex-wrap gap-2 border-t bg-background px-4 py-3 sm:px-6">
              {(viewStage === "To review" || viewStage === "Resubmitted for Review") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!areRequiredDocumentsApproved(view)) {
                      toast.error(
                        "Approve every required uploaded document before verifying the application.",
                      );
                      return;
                    }
                    const reviewed = markApplicationReviewed(view);
                    updateFeeWorkflowPerson(reviewed);
                    setView(reviewed);
                  }}
                  disabled={!areRequiredDocumentsApproved(view)}
                >
                  {areRequiredDocumentsApproved(view)
                    ? "Verify application"
                    : actionForStage(viewStage)}
                </Button>
              )}
              {viewStage === "Awaiting payment" && (
                <Button variant="outline" onClick={() => openRecordPayment(view.id)}>
                  Payment Procedure
                </Button>
              )}
              {(viewStage === "Ready to send" ||
                viewStage === "Handoff prepared" ||
                viewStage === "Admitted" ||
                viewStage === "Awaiting Resubmission" ||
                viewStage === "Resubmitted for Review" ||
                viewStage === "Rejected") && (
                <span className="text-sm text-muted-foreground">{actionForStage(viewStage)}</span>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Billing() {
  const { admissionPersonId: linkedAdmissionPersonId, billingPersonId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { open: openRecordPayment } = useRecordPayment();
  const {
    students,
    payments,
    courseCatalog,
    feeWorkflow,
    receiveFeeWorkflowAdmissionNo,
    saveFeeWorkflowHandoff,
  } = useFinance();
  const workflowStudents = useMemo(
    () =>
      feeWorkflow.persons
        .filter((person) => appearsInBilling(person, feeWorkflow.payments))
        .filter(
          (person) => !students.some((student) => !!workflowPersonForStudent(student, [person])),
        )
        .map((person): Student => ({
          id: person.id,
          applicationId: person.applicationId,
          name: person.name,
          regNo: person.admissionNo ?? "",
          admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
          course: person.course,
          phone: person.contact,
          email: person.email,
          registeredOn: person.appliedOn,
          totalFee:
            person.feePayableOverride ??
            sum(person.plan.map((installment) => installment.amountDue)),
          installments: person.plan.map((installment) => ({
            label: installment.label,
            due: installment.dueDate,
            amount: installment.amountDue,
            originalAmount: installment.originalAmount,
            concessionAmount: installment.concessionAmount,
          })),
          applicationDetails: person.applicationDetails,
        })),
    [feeWorkflow.persons, feeWorkflow.payments, students],
  );
  const billingStudents = useMemo(
    () => [...students, ...workflowStudents],
    [students, workflowStudents],
  );
  const billingStudentIds = new Set(billingStudents.map((student) => student.id));
  const billingPayments = payments.filter((payment) => billingStudentIds.has(payment.studentId));
  const { rows, bar } = useStudentFilters(billingStudents);
  const [admissionPersonId, setAdmissionPersonId] = useState<string | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [admissionError, setAdmissionError] = useState("");
  const [notifyPersonId, setNotifyPersonId] = useState<string | null>(null);
  const { todayFilter: requestedTodayFilter } = Route.useSearch();
  const [todayFilter, setTodayFilter] = useState<"all" | "dueSoon" | "overdue">(
    requestedTodayFilter ?? "all",
  );
  const [billingSort, setBillingSort] = useState<BillingSort | null>(null);
  useEffect(() => {
    if (linkedAdmissionPersonId) {
      const person = feeWorkflow.persons.find(
        (candidate) => candidate.id === linkedAdmissionPersonId,
      );
      if (person && !person.admissionNo) setAdmissionPersonId(person.id);
    }
    if (billingPersonId) {
      const linkedPerson = feeWorkflow.persons.find(
        (candidate) => candidate.id === billingPersonId,
      );
      const student = billingStudents.find(
        (candidate) =>
          candidate.id === billingPersonId ||
          (!!linkedPerson && workflowPersonForStudent(candidate, [linkedPerson]) !== undefined),
      );
      if (student && linkedPerson) {
        openRecordPayment(linkedPerson.id, undefined, student.id);
        navigate({ search: { tab: "billing" } });
      } else {
        toast.error("This student's Payment Procedure could not be opened.");
      }
    }
  }, [
    billingPersonId,
    billingStudents,
    feeWorkflow.persons,
    linkedAdmissionPersonId,
    navigate,
    openRecordPayment,
  ]);
  const personForStudent = (student: Student) =>
    workflowPersonForStudent(student, feeWorkflow.persons);
  const selectedNotifyPerson = feeWorkflow.persons.find((person) => person.id === notifyPersonId);
  const notificationPayload = selectedNotifyPerson
    ? buildPaymentNotificationPayload(selectedNotifyPerson, feeWorkflow.payments)
    : null;
  const paymentsForPerson = (person: Person) =>
    feeWorkflow.payments.filter((payment) => payment.personId === person.id);
  const dueSoonCutoff = installmentReminderWindowEnd(TODAY);
  const actionFor = (person: Person) =>
    nextAction(person, paymentsForPerson(person), feeWorkflow.handoffs);
  const reviewTasks = feeWorkflow.persons.filter(
    (person) => actionFor(person) === "Review Application",
  );
  const isDueSoonPerson = (person: Person) => {
    const personPayments = paymentsForPerson(person);
    return person.plan.some((installment) => {
      const installmentState = installmentStatus(installment, personPayments);
      return (
        installmentState !== "Paid" &&
        installmentState !== "Overdue" &&
        installment.dueDate >= TODAY &&
        installment.dueDate <= dueSoonCutoff
      );
    });
  };
  const isOverduePerson = (person: Person) =>
    !!person.admissionNo &&
    person.plan.some(
      (installment) => installmentStatus(installment, paymentsForPerson(person)) === "Overdue",
    );
  const runNextAction = (person: Person, action: FeeNextAction) => {
    if (action === "Review Application") {
      navigate({
        search: {
          tab: "applications",
          applicationPersonId: person.id,
        },
      });
      return;
    }
    if (action === "Record Payment") {
      openRecordPayment(person.id);
      return;
    }
    if (action === "Enter Admission No.") {
      setAdmissionNumber("");
      setAdmissionError("");
      setAdmissionPersonId(person.id);
      return;
    }
    if (action === "Notify Administration") {
      setNotifyPersonId(person.id);
      return;
    }
    if (action === "Send Reminder") return;
  };
  const matchesTodayFilter = (student: Student, filter: typeof todayFilter) => {
    if (filter === "all") return true;
    const person = personForStudent(student);
    if (!person) return false;
    if (filter === "dueSoon") return isDueSoonPerson(person);
    return isOverduePerson(person);
  };
  const todayFilterCounts = {
    dueSoon: rows.filter((student) => matchesTodayFilter(student, "dueSoon")).length,
    overdue: rows.filter((student) => matchesTodayFilter(student, "overdue")).length,
  };
  const taskFilteredRows = rows.filter((student) => matchesTodayFilter(student, todayFilter));
  const clearTodayFilter = () => {
    setTodayFilter("all");
    navigate({ search: { tab: "billing" } });
  };
  const toggleTodayFilter = (filter: Exclude<typeof todayFilter, "all">) => {
    const nextFilter = todayFilter === filter ? "all" : filter;
    setTodayFilter(nextFilter);
    navigate({
      search: {
        tab: "billing",
        todayFilter: nextFilter === "all" ? undefined : nextFilter,
      },
    });
  };
  const defaultSort: BillingSort | null =
    todayFilter === "dueSoon" || todayFilter === "overdue"
      ? { field: "nextDue", direction: "asc" }
      : null;
  const activeSort = billingSort ?? defaultSort;
  const sortedTaskFilteredRows = activeSort
    ? [...taskFilteredRows].sort((left, right) => {
        if (activeSort.field === "nextDue") {
          const leftDue = nextDue(left, billingPayments);
          const rightDue = nextDue(right, billingPayments);
          if (!leftDue || !rightDue) return leftDue ? -1 : rightDue ? 1 : 0;
          const comparison = leftDue.localeCompare(rightDue);
          return activeSort.direction === "asc" ? comparison : -comparison;
        }
        const comparison = outstanding(left, billingPayments) - outstanding(right, billingPayments);
        return activeSort.direction === "asc" ? comparison : -comparison;
      })
    : taskFilteredRows;
  const toggleBillingSort = (field: BillingSort["field"]) => {
    const current = billingSort ?? defaultSort;
    setBillingSort({
      field,
      direction: current?.field === field && current.direction === "asc" ? "desc" : "asc",
    });
  };
  const saveAdmissionNumber = () => {
    if (!admissionPersonId) return;
    const result = receiveFeeWorkflowAdmissionNo(admissionPersonId, admissionNumber);
    if (result !== true) {
      setAdmissionError(
        result === "invalid"
          ? "Enter a number in the format ADM-2026-0517."
          : result === "duplicate"
            ? "This Admission No. is already assigned."
            : "This handoff is no longer awaiting an Admission No.",
      );
      return;
    }
    setAdmissionError("");
    setAdmissionNumber("");
    setAdmissionPersonId(null);
    if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
    toast.success(ADMISSION_NO_RECEIVED_TEXT);
  };
  const confirmPaymentNotification = () => {
    if (!selectedNotifyPerson || !notificationPayload?.payments.length) {
      toast.error("There are no unnotified payments to report.");
      setNotifyPersonId(null);
      return;
    }
    const sentAt = new Date().toISOString();
    const existing = feeWorkflow.handoffs.find(
      (handoff) =>
        handoff.personId === selectedNotifyPerson.id && handoff.target === "Administration",
    );
    saveFeeWorkflowHandoff({
      personId: selectedNotifyPerson.id,
      target: "Administration",
      status: existing?.status ?? "Completed",
      history: notificationPayload.payments.map((payment) => ({
        date: sentAt,
        text: ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
        referenceId: payment.id,
        paymentNotification: {
          date: payment.date,
          amount: payment.amount,
          installmentsCovered: payment.installmentsCovered,
          remainingBalance: payment.remainingBalance,
        },
      })),
    });
    setNotifyPersonId(null);
    toast.success("Payment notification prepared");
  };
  const billed = sum(billingStudents.map((s) => s.totalFee));
  const paid = sum(billingPayments.map((p) => p.amount));
  return (
    <>
      <StatGrid className="mb-4">
        <StatCard label="Total billed" value={formatINR(billed)} caption="All bills" />
        <StatCard
          label="Recorded payments"
          value={formatINR(paid)}
          tone="success"
          caption="Collected so far"
        />
        <StatCard
          label="Outstanding"
          value={formatINR(
            sum(billingStudents.map((student) => outstanding(student, billingPayments))),
          )}
          tone="danger"
          caption="Billed − recorded payments"
        />
      </StatGrid>
      <h2 className="mb-2 text-sm font-semibold">Today</h2>
      <StatGrid className="mb-3 gap-2">
        <button
          type="button"
          className="w-full min-w-0 text-left"
          onClick={() => {
            const first = reviewTasks[0];
            if (first) runNextAction(first, "Review Application");
            else navigate({ search: { tab: "applications" } });
          }}
        >
          <StatCard
            label="Applications to review"
            value={String(reviewTasks.length)}
            caption="Open Applications"
          />
        </button>
        <button
          type="button"
          aria-pressed={todayFilter === "dueSoon"}
          className={`w-full min-w-0 rounded-2xl text-left ${todayFilter === "dueSoon" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          onClick={() => toggleTodayFilter("dueSoon")}
        >
          <StatCard
            label="Payments due soon"
            value={String(todayFilterCounts.dueSoon)}
            caption="Filter Billing table"
          />
        </button>
        <button
          type="button"
          aria-pressed={todayFilter === "overdue"}
          className={`w-full min-w-0 rounded-2xl text-left ${todayFilter === "overdue" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          onClick={() => toggleTodayFilter("overdue")}
        >
          <StatCard
            label="Overdue fees"
            value={String(todayFilterCounts.overdue)}
            tone={todayFilterCounts.overdue ? "danger" : undefined}
            caption="Filter Billing table"
          />
        </button>
      </StatGrid>
      <SectionCard>
        {bar}
        {todayFilter !== "all" && (
          <div className="mb-3">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Clear ${todayFilter === "overdue" ? "Overdue" : "Payments due soon"} filter`}
              onClick={clearTodayFilter}
            >
              {todayFilter === "overdue"
                ? `Overdue ${taskFilteredRows.length}`
                : `Payments due soon ${taskFilteredRows.length}`}
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        )}
        {taskFilteredRows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <SerialNumberHead />
                <TableHead className="sticky left-12 z-20 min-w-[190px] bg-background">
                  Student
                </TableHead>
                <TableHead className="w-48 min-w-40 max-w-48">Course</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={
                    activeSort?.field === "outstanding"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-end gap-1 whitespace-nowrap"
                    onClick={() => toggleBillingSort("outstanding")}
                  >
                    Outstanding
                    {activeSort?.field === "outstanding" ? (
                      activeSort.direction === "asc" ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead
                  aria-sort={
                    activeSort?.field === "nextDue"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    onClick={() => toggleBillingSort("nextDue")}
                  >
                    Next due
                    {activeSort?.field === "nextDue" ? (
                      activeSort.direction === "asc" ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTaskFilteredRows.map((s, index) => {
                const nd = nextDue(s, billingPayments);
                const person = personForStudent(s);
                const personPayments = person
                  ? feeWorkflow.payments.filter((payment) => payment.personId === person.id)
                  : [];
                const status = billingStatusLabel(s, billingPayments, person, personPayments);
                return (
                  <TableRow
                    key={s.id}
                    className="group h-[68px]"
                    onRowClick={() => {
                      if (person) openRecordPayment(person.id, undefined, s.id);
                      else toast.error("This student's Payment Procedure could not be opened.");
                    }}
                    rowLabel={`Open Payment Procedure for ${s.name}`}
                  >
                    <SerialNumberCell index={index} />
                    <TableCell className="sticky left-12 z-10 min-w-[190px] bg-background group-hover:bg-muted/50">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.regNo || s.applicationId || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="w-48 min-w-40 max-w-48">
                      <div className="line-clamp-2">
                        {studentCourse(s, courseCatalog)?.name ?? s.course}
                      </div>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right tabular-nums">
                      {formatINR(s.totalFee)}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right tabular-nums">
                      {formatINR(studentPaid(s.id, billingPayments))}
                    </TableCell>
                    <TableCell
                      className={`num whitespace-nowrap text-right font-medium tabular-nums ${outstanding(s, billingPayments) > 0 ? "text-destructive" : ""}`}
                    >
                      {formatINR(outstanding(s, billingPayments))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{nd ? formatDate(nd) : "—"}</TableCell>
                    <TableCell>
                      {status.startsWith("Overdue ") ? (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-destructive/30 bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-destructive">
                          {status}
                        </span>
                      ) : (
                        <StatusBadge status={status} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <Dialog
        open={!!admissionPersonId}
        onOpenChange={(open) => {
          if (!open) {
            setAdmissionPersonId(null);
            setAdmissionError("");
            if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admission No. received from Administration</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Record the number provided by Administration. No number is generated here.
            </p>
            <Field label="Admission No." htmlFor="billing-admission-no" error={admissionError}>
              <Input
                id="billing-admission-no"
                value={admissionNumber}
                onChange={(event) => {
                  setAdmissionNumber(event.target.value);
                  setAdmissionError("");
                }}
                placeholder="ADM-2026-0517"
                maxLength={13}
                aria-invalid={!!admissionError}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdmissionPersonId(null);
                if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveAdmissionNumber}>Save Admission No.</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PaymentNotificationDialog
        open={!!notifyPersonId}
        payload={notificationPayload}
        onOpenChange={(open) => !open && setNotifyPersonId(null)}
        onConfirm={confirmPaymentNotification}
      />
    </>
  );
}

function PaymentsTable({
  rows,
  onView,
  showTowards = false,
}: {
  rows: FeePayment[];
  onView?: (p: FeePayment) => void | undefined;
  showTowards?: boolean | undefined;
}) {
  const { students } = useFinance();
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SerialNumberHead />
            <TableHead>Receipt</TableHead>
            <TableHead>Date</TableHead>
            {onView && <TableHead>Student</TableHead>}
            {showTowards && <TableHead>Towards</TableHead>}
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {onView && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, index) => (
            <TableRow
              key={p.id}
              onRowClick={onView ? () => onView(p) : undefined}
              rowLabel={onView ? `View receipt ${p.receiptNo}` : undefined}
            >
              <SerialNumberCell index={index} />
              <TableCell className="num whitespace-nowrap text-xs tabular-nums">
                {p.receiptNo}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
              {onView && <TableCell>{students.find((s) => s.id === p.studentId)?.name}</TableCell>}
              {showTowards && (
                <TableCell>
                  {p.towards
                    ? p.towards === "Other"
                      ? `Other – ${p.towardsOther ?? ""}`
                      : p.towards
                    : "—"}
                </TableCell>
              )}
              <TableCell>{p.method}</TableCell>
              <TableCell className="num text-xs">{p.reference || "—"}</TableCell>
              <TableCell className="num whitespace-nowrap text-right">
                {formatINR(p.amount)}
              </TableCell>
              {onView && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => onView(p)}>
                    <Eye className="mr-1 h-4 w-4" />
                    View receipt
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PaymentNotificationDialog({
  open,
  payload,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  payload: PaymentNotificationPayload | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prepare payment notification</DialogTitle>
        </DialogHeader>
        {payload && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Student: </span>
                {payload.name}
              </p>
              <p>
                <span className="text-muted-foreground">Application ID: </span>
                {payload.applicationId}
              </p>
              <p>
                <span className="text-muted-foreground">{ADMISSION_NO_FULL}: </span>
                {payload.admissionNo}
              </p>
              <p>
                <span className="text-muted-foreground">Contact: </span>
                {payload.contact}
              </p>
              <p>
                <span className="text-muted-foreground">Email: </span>
                {payload.email || "Not provided"}
              </p>
            </div>
            <p className="rounded-md bg-muted p-3 text-muted-foreground">{payload.note}</p>
            <div className="space-y-2">
              <p className="font-medium">Payments being reported</p>
              {payload.payments.map((payment) => (
                <div key={payment.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{formatDate(payment.date)}</span>
                    <span className="num font-medium">{formatINR(payment.amount)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {payment.installmentsCovered
                      .map(
                        ({ label, amount }) =>
                          `${displayInstallmentLabel(label)} ${formatINR(amount)}`,
                      )
                      .join(" · ") || "Installment details not available"}
                  </p>
                  <p className="mt-1">
                    Remaining balance:{" "}
                    <span className="num">{formatINR(payment.remainingBalance)}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!payload?.payments.length}>
            Prepare notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
