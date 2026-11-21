import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Eye, FileText } from "lucide-react";
import { Badge } from "@/modules/finance/components/ui/badge";
import { Button } from "@/modules/finance/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/finance/components/ui/tabs";
import {
  EmptyState,
  FilterBar,
  FilterSelect,
  SearchBox,
  SectionCard,
  SerialNumberCell,
  SerialNumberHead,
  SerialNumberLabel,
} from "@/modules/finance/components/finance/common";
import { ApplicationDetail } from "@/modules/finance/components/finance/ApplicationDetails";
import { useRecordPayment } from "@/modules/finance/components/finance/RecordPaymentContext";
import { useFinance } from "@/modules/finance/finance/store";
import { formatDate, formatINR, TODAY } from "@/modules/finance/finance/logic";
import { installmentPaid, personTotals } from "@/modules/finance/finance/feeWorkflow";
import {
  STUDENT_DECLARATION,
  latestDirectorDecision,
  requestedDiscountAmount,
  type ConcessionAttachment,
  type ConcessionRequest,
  type ConcessionResult,
  type ConcessionStatus,
} from "@/modules/finance/finance/concessions";

const PENDING_STATUSES = ["Pending Director Decision", "Pending Accounts Review"];
const DIRECTOR_DECISIONS = ["Approved", "Rejected"];

function requestDisplayStatus(request: ConcessionRequest) {
  return request.status;
}

function isPendingRequest(request: ConcessionRequest) {
  return (
    request.status === "Pending Accounts Review" || request.status === "Pending Director Decision"
  );
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "Approved") return "success";
  if (status === "Rejected") return "danger";
  if (status === "Pending Director Decision") return "warning";
  if (status === "Pending Accounts Review") return "info";
  return "neutral";
}

function ConcessionStatusBadge({ status }: { status: string }) {
  return <Badge variant={statusTone(status)}>{status}</Badge>;
}

function requestedLabel(request: ConcessionRequest) {
  const amount = formatINR(requestedDiscountAmount(request.submission));
  return request.submission.concessionType === "Percentage"
    ? `${request.submission.requestedValue}% (${amount})`
    : amount;
}

function decisionDate(decisionDateValue?: string) {
  return decisionDateValue ? formatDate(decisionDateValue.slice(0, 10)) : "—";
}

function formatAttachmentSize(sizeBytes: number) {
  return sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function attachmentTypeLabel(fileType: ConcessionAttachment["fileType"]) {
  if (fileType === "application/pdf") return "PDF";
  if (fileType === "image/jpeg") return "JPG";
  return "PNG";
}

function approvedDiscountAmount(decision: ReturnType<typeof latestDirectorDecision>) {
  return decision?.decision === "Approved" &&
    typeof decision.approvedDiscount === "number" &&
    Number.isFinite(decision.approvedDiscount)
    ? decision.approvedDiscount
    : undefined;
}

export function FeeConcessions() {
  const { concessions } = useFinance();
  const [view, setView] = useState("pending");
  const [query, setQuery] = useState("");
  const [pendingStatus, setPendingStatus] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const search = query.trim().toLowerCase();
  const matchesSearch = useCallback(
    (request: ConcessionRequest) =>
      !search ||
      `${request.concessionNo} ${request.submission.studentName} ${request.submission.applicationNo} ${request.submission.course} ${request.submission.reason}`
        .toLowerCase()
        .includes(search),
    [search],
  );

  const pendingRows = useMemo(
    () =>
      concessions.filter((request) => {
        return (
          isPendingRequest(request) &&
          (pendingStatus === "all" || request.status === pendingStatus) &&
          matchesSearch(request)
        );
      }),
    [concessions, pendingStatus, matchesSearch],
  );

  const historyRows = useMemo(
    () =>
      concessions
        .filter((request) => {
          const decision = latestDirectorDecision(request);
          return (
            decision !== undefined &&
            (decisionFilter === "all" || decision.decision === decisionFilter) &&
            matchesSearch(request)
          );
        })
        .sort((left, right) => {
          const leftDate = latestDirectorDecision(left)?.date ?? "";
          const rightDate = latestDirectorDecision(right)?.date ?? "";
          return rightDate.localeCompare(leftDate);
        }),
    [concessions, decisionFilter, matchesSearch],
  );

  const open = concessions.find((request) => request.id === openId) ?? null;

  return (
    <SectionCard title="Fee Concessions">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="mb-3 flex h-auto flex-wrap">
          <TabsTrigger value="pending">Pending Requests</TabsTrigger>
          <TabsTrigger value="history">Decision History</TabsTrigger>
        </TabsList>
        <FilterBar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search concession no., student, application or course"
          />
          {view === "pending" ? (
            <FilterSelect
              label="Request status"
              value={pendingStatus}
              onChange={setPendingStatus}
              options={PENDING_STATUSES}
              allLabel="All Request Status"
            />
          ) : (
            <FilterSelect
              label="Director decision"
              value={decisionFilter}
              onChange={setDecisionFilter}
              options={DIRECTOR_DECISIONS}
              allLabel="All Director Decisions"
            />
          )}
        </FilterBar>
        <TabsContent value="pending">
          <ConcessionTable rows={pendingRows} mode="pending" onOpen={(id) => setOpenId(id)} />
        </TabsContent>
        <TabsContent value="history">
          <ConcessionTable rows={historyRows} mode="history" onOpen={(id) => setOpenId(id)} />
        </TabsContent>
      </Tabs>
      <Dialog open={!!open} onOpenChange={(value) => !value && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {open && <ConcessionDetail request={open} onClose={() => setOpenId(null)} />}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function ConcessionTable({
  rows,
  mode,
  onOpen,
}: {
  rows: ConcessionRequest[];
  mode: "pending" | "history";
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SerialNumberHead />
            <TableHead>Concession No.</TableHead>
            <TableHead>Application No.</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Course</TableHead>
            {mode === "history" && <TableHead>Decision Date</TableHead>}
            <TableHead className="text-right">Requested Amt</TableHead>
            {mode === "history" && <TableHead className="text-right">Approved Amt</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((request, index) => {
            const decision =
              mode === "history" ? latestDirectorDecision(request) : request.directorDecision;
            const requestedAmount = requestedDiscountAmount(request.submission);
            const approvedAmount =
              mode === "history" ? approvedDiscountAmount(decision) : undefined;
            const reducedApproval =
              approvedAmount !== undefined && approvedAmount < requestedAmount;
            return (
              <TableRow key={request.id}>
                <SerialNumberCell index={index} />
                <TableCell className="font-medium">{request.concessionNo}</TableCell>
                <TableCell>{request.submission.applicationNo}</TableCell>
                <TableCell>{request.submission.studentName}</TableCell>
                <TableCell>{request.submission.course}</TableCell>
                {mode === "history" && <TableCell>{decisionDate(decision?.date)}</TableCell>}
                <TableCell className="text-right">{formatINR(requestedAmount)}</TableCell>
                {mode === "history" && (
                  <TableCell
                    className={
                      reducedApproval
                        ? "text-right font-semibold text-amber-700 dark:text-amber-400"
                        : "text-right"
                    }
                  >
                    {approvedAmount !== undefined ? formatINR(approvedAmount) : "—"}
                  </TableCell>
                )}
                <TableCell>
                  <ConcessionStatusBadge
                    status={
                      mode === "history" && decision
                        ? decision.decision
                        : requestDisplayStatus(request)
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(request.id)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ConcessionDetail({
  request,
  onClose,
}: {
  request: ConcessionRequest;
  onClose: () => void;
}) {
  const finance = useFinance();
  const navigate = useNavigate();
  const recordPayment = useRecordPayment();
  const person = finance.feeWorkflow.persons.find((item) => item.id === request.personId);
  const personPayments = finance.feeWorkflow.payments.filter(
    (payment) => payment.personId === request.personId,
  );
  const totals = person ? personTotals(person, personPayments) : null;
  const submission = request.submission;
  const requested = requestedDiscountAmount(submission);
  const decision = latestDirectorDecision(request);
  const approvedAmount = approvedDiscountAmount(decision);
  const applied = request.applied;

  const [review, setReview] = useState({
    reviewedBy: request.review?.reviewedBy ?? "Accounts Officer",
    reviewDate: request.review?.reviewDate ?? TODAY,
    remarks: request.review?.remarks ?? "",
  });

  const run = (result: ConcessionResult<unknown>, success: string) => {
    if (result.ok) toast.success(success);
    else toast.error(result.error);
    return result.ok;
  };

  const status = request.status;
  const canReview = status === "Pending Accounts Review";
  const forwardedWithoutResponse = !decision && status === "Pending Director Decision";
  const activity = request.history
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) => left.entry.date.localeCompare(right.entry.date) || left.index - right.index,
    );
  const verifyAndForward = () => {
    const savedReview = finance.saveConcessionReview(request.id, review);
    if (!savedReview.ok) {
      toast.error(savedReview.error);
      return;
    }
    run(finance.forwardConcessionToDirector(request.id), "Request sent to Director");
  };
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div>
            <DialogTitle>Fee Concession {request.concessionNo}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Admission submission received {formatDate(submission.requestedDate)}
            </p>
          </div>
          <div className="ml-auto">
            <ConcessionStatusBadge status={requestDisplayStatus(request)} />
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {request.previousSubmissions.length > 0 && (
          <Section number="01" title="Earlier Admission Submissions">
            <div className="space-y-3">
              {request.previousSubmissions.map((previous, index) => (
                <div
                  key={`${request.id}-submission-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="mb-2 text-xs font-semibold">
                    Original submission {index + 1} · Read-only
                  </p>
                  <dl className="grid gap-3 md:grid-cols-3">
                    <ApplicationDetail label="Student Name" value={previous.studentName} />
                    <ApplicationDetail label="Branch / Centre Name" value={previous.branch} />
                    <ApplicationDetail label="Application No." value={previous.applicationNo} />
                    <ApplicationDetail
                      label="Requested Date"
                      value={formatDate(previous.requestedDate)}
                    />
                    <ApplicationDetail label="Student Contact No." value={previous.contact} />
                    <ApplicationDetail
                      label="Total Fees (Incl. GST)"
                      value={formatINR(previous.totalFees)}
                    />
                    <ApplicationDetail label="Course / Programme" value={previous.course} />
                    <ApplicationDetail label="Course Duration" value={previous.courseDuration} />
                    <ApplicationDetail
                      label="Starting Date"
                      value={formatDate(previous.startingDate)}
                    />
                    <ApplicationDetail
                      label="Amount Already Paid"
                      value={formatINR(previous.amountAlreadyPaid)}
                    />
                    <ApplicationDetail label="Concession Type" value={previous.concessionType} />
                    <ApplicationDetail
                      label="Requested Discount"
                      value={requestedLabel({ ...request, submission: previous })}
                    />
                    <ApplicationDetail label="Admission Remarks / Reason" value={previous.reason} />
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Student declaration:{" "}
                    {previous.declarationAccepted ? "Accepted" : "Not accepted"}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section
          number={request.previousSubmissions.length > 0 ? "02" : "01"}
          title="Original Admission Submission"
        >
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <ApplicationDetail label="Student Name" value={submission.studentName} />
            <ApplicationDetail label="Branch / Centre Name" value={submission.branch} />
            <ApplicationDetail label="Application No." value={submission.applicationNo} />
            <ApplicationDetail
              label="Requested Date"
              value={formatDate(submission.requestedDate)}
            />
            <ApplicationDetail label="Student Contact No." value={submission.contact} />
            <ApplicationDetail
              label="Total Fees (Incl. GST)"
              value={formatINR(submission.totalFees)}
            />
            <ApplicationDetail label="Course / Programme" value={submission.course} />
            <ApplicationDetail label="Course Duration" value={submission.courseDuration} />
            <ApplicationDetail label="Starting Date" value={formatDate(submission.startingDate)} />
            <ApplicationDetail
              label="Amount Already Paid at Submission"
              value={formatINR(submission.amountAlreadyPaid)}
            />
            <ApplicationDetail label="Requested Discount" value={requestedLabel(request)} />
            <ApplicationDetail
              label="Net Payable if Approved as Requested"
              value={formatINR(Math.max(0, submission.eligibleFees - requested))}
            />
            <ApplicationDetail label="Reason for Concession" value={submission.reason} />
          </dl>
          <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium">Student Declaration: </span>
            {STUDENT_DECLARATION}
            <span className="ml-2 text-xs text-muted-foreground">
              {submission.declarationAccepted
                ? "Accepted as received from Admission"
                : "Not accepted"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Read-only. Finance cannot create or change Admission's original submission.
          </p>
        </Section>

        <Section
          number={request.previousSubmissions.length > 0 ? "03" : "02"}
          title="Supporting Documents"
        >
          {request.attachments?.length ? (
            <div className="space-y-2">
              {request.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium">{attachment.fileName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {attachmentTypeLabel(attachment.fileType)} ·{" "}
                      {formatAttachmentSize(attachment.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={attachment.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Preview ${attachment.fileName}`}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Preview
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={attachment.previewUrl}
                        download={attachment.fileName}
                        aria-label={`Download ${attachment.fileName}`}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No supporting documents were attached by Admission.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Admission (Sales) attachments are read-only for Finance.
          </p>
        </Section>

        <Section
          number={request.previousSubmissions.length > 0 ? "04" : "03"}
          title="Accounts Review &amp; Forwarding"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <ApplicationDetail label="Review Date" value={formatDate(review.reviewDate)} />
            <ApplicationDetail
              label="Forwarded to Director"
              value={request.forwardedAt ? "Yes" : "No"}
            />
            <ApplicationDetail
              label="Forwarding Date"
              value={request.forwardedAt ? formatDate(request.forwardedAt.slice(0, 10)) : "—"}
            />
          </div>
          {canReview && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={verifyAndForward}>Send to Director</Button>
            </div>
          )}
        </Section>

        <Section
          number={request.previousSubmissions.length > 0 ? "05" : "04"}
          title="Director Response"
        >
          <dl className="grid gap-4 md:grid-cols-2">
            <ApplicationDetail label="Requested Amount" value={formatINR(requested)} />
            <ApplicationDetail
              label="Approved Amount"
              value={approvedAmount !== undefined ? formatINR(approvedAmount) : "—"}
            />
            <ApplicationDetail label="Director's Decision" value={decision?.decision ?? "—"} />
            <ApplicationDetail label="Decision Date" value={decisionDate(decision?.date)} />
            <ApplicationDetail
              label="Director's Comments"
              value={decision?.remarks.trim() || "—"}
            />
          </dl>
          {!decision && forwardedWithoutResponse ? (
            <p className="text-sm font-medium">Pending Director Decision</p>
          ) : !decision ? (
            <p className="text-sm text-muted-foreground">
              "No Director response is recorded for this request."
            </p>
          ) : null}
          {decision?.decision === "Rejected" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Rejected. Fees remain unchanged and payable as billed.
            </p>
          )}
        </Section>

        <Section
          number={request.previousSubmissions.length > 0 ? "06" : "05"}
          title="Billing Information"
        >
          {person ? (
            <div className="space-y-3">
              <dl className="grid gap-3 md:grid-cols-4">
                <ApplicationDetail
                  label="Admission No."
                  value={person.admissionNo ?? "Not issued by Administration"}
                />
                <ApplicationDetail label="Bill Created" value={person.billCreated ? "Yes" : "No"} />
                <ApplicationDetail label="Fee Status" value={person.paymentStatus ?? "Unpaid"} />
                <ApplicationDetail
                  label="Current Outstanding"
                  value={formatINR(totals?.outstanding ?? 0)}
                />
              </dl>
              <div>
                <h4 className="mb-1.5 text-sm font-semibold">Installment Schedule</h4>
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="border-border/70">
                      <SerialNumberHead />
                      <TableHead>Installment</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right text-xs font-medium text-muted-foreground">
                        Original Amount
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium text-muted-foreground">
                        Fee Concession
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium text-muted-foreground">
                        Revised Payable
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium text-muted-foreground">
                        Paid
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium text-muted-foreground">
                        Outstanding
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {person.plan.map((installment, index) => {
                      const paid = installmentPaid(installment.id, personPayments);
                      const originalAmount = installment.originalAmount ?? installment.amountDue;
                      const concessionAmount = installment.concessionAmount ?? 0;
                      return (
                        <TableRow key={installment.id} className="border-border/50">
                          <SerialNumberCell index={index} />
                          <TableCell>{installment.label}</TableCell>
                          <TableCell>{formatDate(installment.dueDate)}</TableCell>
                          <TableCell className="text-right">{formatINR(originalAmount)}</TableCell>
                          <TableCell className="text-right">
                            {concessionAmount > 0
                              ? `Fee Concession −${formatINR(concessionAmount)}`
                              : formatINR(0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatINR(installment.amountDue)}
                          </TableCell>
                          <TableCell className="text-right">{formatINR(paid)}</TableCell>
                          <TableCell className="text-right">
                            {formatINR(Math.max(0, installment.amountDue - paid))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payments & Receipts
                </h4>
                {personPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SerialNumberHead />
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Receipt No.</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...personPayments]
                        .sort((left, right) => right.date.localeCompare(left.date))
                        .map((payment, index) => (
                          <TableRow key={payment.id}>
                            <SerialNumberCell index={index} />
                            <TableCell>{formatDate(payment.date)}</TableCell>
                            <TableCell>{payment.receiptNo}</TableCell>
                            <TableCell>{payment.method}</TableCell>
                            <TableCell>{payment.reference || "—"}</TableCell>
                            <TableCell className="text-right">
                              {formatINR(payment.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No linked billing record is available.</p>
          )}
        </Section>

        <Section
          number={request.previousSubmissions.length > 0 ? "07" : "06"}
          title="Director Decision & Activity History"
        >
          <ol className="space-y-3 border-l border-border pl-4">
            {activity.map(({ entry, index }, displayIndex) => (
              <li key={`${request.id}-activity-${index}`} className="text-sm">
                <SerialNumberLabel index={displayIndex} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.date.slice(0, 10))} ·{" "}
                  {entry.date.includes("T")
                    ? new Date(entry.date).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Time not recorded"}{" "}
                  · {entry.actor}
                </span>
                <div className="text-xs text-muted-foreground">
                  Status: {entry.fromStatus ?? "Not submitted"} → {entry.toStatus ?? "—"}
                </div>
                <div>{entry.text}</div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {status === "Approved" && !applied && (
            <Button
              onClick={() =>
                run(
                  finance.applyConcession(request.id),
                  "Director-approved concession applied to eligible installments",
                )
              }
            >
              Apply Director-Approved Concession
            </Button>
          )}
          {((status === "Approved" && !!applied) || status === "Rejected") && (
            <>
              {totals && totals.outstanding > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onClose();
                    recordPayment.open(request.personId);
                  }}
                >
                  Payment Procedure
                </Button>
              )}
              <Button
                onClick={() => {
                  onClose();
                  void navigate({
                    to: "/finance/fees",
                    search: { tab: "billing", billingPersonId: request.personId },
                  });
                }}
              >
                Continue to Billing
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </>
  );
}

export function useConcessionCount() {
  const { concessions } = useFinance();
  return useMemo(() => concessions.filter(isPendingRequest).length, [concessions]);
}
