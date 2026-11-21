import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CircleAlert, FileText } from "lucide-react";
import {
  ApplicationDetail,
  ApplicationDetails,
  ApplicationDetailsPrintButton,
  DocumentVerificationHistory,
} from "@/modules/finance/components/finance/ApplicationDetails";
import { AdministrationHistory } from "@/modules/finance/components/finance/AdministrationHistory";
import { RecordPaymentContext } from "@/modules/finance/components/finance/RecordPaymentContext";
import { Receipt as FeeReceipt } from "@/modules/finance/components/finance/Receipt";
import { Button } from "@/modules/finance/components/ui/button";
import { Badge } from "@/modules/finance/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/finance/components/ui/dialog";
import { Input } from "@/modules/finance/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/modules/finance/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/finance/components/ui/select";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  SectionCard,
  SimpleSelect,
  StatusBadge,
} from "@/modules/finance/components/finance/common";
import { useFinance } from "@/modules/finance/finance/store";
import {
  PAYMENT_METHODS,
  displayInstallmentLabel,
  type DocumentCorrectionItem,
  type DeliveryProcessState,
  type FeeWorkflowPayment,
  type FeePayment,
  type Handoff,
  type PaymentMethod,
  type StudentApplicationDetails,
} from "@/modules/finance/finance/types";
import { ADMISSION_FEE_LABEL } from "@/modules/finance/finance/labels";
import {
  allocatePayment,
  buildAdministrationDetailsPayload,
  areRequiredDocumentsApproved,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  isApplicationVerified,
  markApplicationReviewed,
  personTotals,
  recordDocumentVerification,
} from "@/modules/finance/finance/feeWorkflow";
import { getPaymentReferenceState } from "@/modules/finance/finance/billing";
import { nextAvailableReceiptNumber } from "@/modules/finance/finance/receipt";
import { TODAY, formatDate, formatINR } from "@/modules/finance/finance/logic";

function deliveryStatus(state?: DeliveryProcessState): DeliveryProcessState["status"] {
  if (state?.status === "Sent" && state.sentAt) return "Sent";
  if (state?.status === "Sending…") return "Sending…";
  return "Not Sent";
}

function formatDeliveryTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString("en-IN");
}

function DeliveryAttemptDetails({ state }: { state?: (DeliveryProcessState) | undefined }) {
  const status = deliveryStatus(state);
  if (status === "Sent") {
    return (
      <p className="text-xs text-muted-foreground">
        Delivered {formatDeliveryTimestamp(state!.sentAt!)}
        {state!.providerReference ? ` · Reference ${state!.providerReference}` : ""}
      </p>
    );
  }
  const latestFailedAttempt = state?.latestFailedAttempt;
  return (
    <>
      {status === "Sending…" && state?.attemptStartedAt && (
        <p className="text-xs text-muted-foreground">
          Attempt started {formatDeliveryTimestamp(state.attemptStartedAt)}
        </p>
      )}
      {latestFailedAttempt && (
        <p className="text-xs text-muted-foreground">
          Latest failed attempt {formatDeliveryTimestamp(latestFailedAttempt.at)}:{" "}
          {latestFailedAttempt.errorDetails}
        </p>
      )}
      {status === "Not Sent" && !latestFailedAttempt && (
        <p className="text-xs text-muted-foreground">No delivery attempt recorded.</p>
      )}
    </>
  );
}

function DeliveryStatusSection({
  email,
  payment,
  handoff,
}: {
  email: string;
  payment?: FeeWorkflowPayment | undefined;
  handoff?: Handoff | undefined;
}) {
  const emailStatus = deliveryStatus(payment?.confirmation);
  const handoffStatus = deliveryStatus(handoff?.delivery);
  return (
    <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <h3 className="text-xs font-semibold">Delivery Status</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Student Payment Confirmation</p>
          <p className="break-all text-xs text-muted-foreground">
            Recipient: {email || "No registered email address"}
          </p>
          <p className="text-xs text-muted-foreground">
            {payment?.confirmationRequest
              ? `Receipt PDF reference: ${payment.confirmationRequest.receipt.fileName}`
              : "Receipt PDF attachment information has not been prepared"}
          </p>
          {payment && (
            <p className="text-xs text-muted-foreground">Receipt No.: {payment.receiptNo}</p>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={emailStatus} />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Administration Application Handoff</p>
          <p className="text-xs text-muted-foreground">Verified student and application details</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={handoffStatus} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DeliveryAttemptInformationSection({
  payment,
  handoff,
}: {
  payment?: FeeWorkflowPayment | undefined;
  handoff?: Handoff | undefined;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <h3 className="text-xs font-semibold">Delivery Attempt Information</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Student Confirmation Attempts</p>
          <DeliveryAttemptDetails state={payment?.confirmation} />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Administration Handoff Attempts</p>
          <DeliveryAttemptDetails state={handoff?.delivery} />
        </div>
      </div>
    </section>
  );
}
import { useEnterToNext } from "@/modules/finance/hooks/use-enter-to-next";

export function RecordPaymentProvider({ children }: { children: ReactNode }) {
  const { feeWorkflow } = useFinance();
  const [personId, setPersonId] = useState<string | null | undefined>(null);
  const [initialAmount, setInitialAmount] = useState<number | undefined>();
  const [billingStudentId, setBillingStudentId] = useState<string | undefined>();
  const open = useCallback(
    (requestedPersonId?: string | undefined, requestedAmount?: number | undefined, requestedBillingStudentId?: string) => {
      if (
        requestedPersonId &&
        !feeWorkflow.persons.some((person) => person.id === requestedPersonId)
      ) {
        toast.error("Select a person before recording payment.");
        return;
      }
      setInitialAmount(requestedAmount);
      setBillingStudentId(requestedBillingStudentId);
      setPersonId(requestedPersonId);
    },
    [feeWorkflow.persons],
  );
  const close = useCallback(() => {
    setPersonId(null);
    setInitialAmount(undefined);
    setBillingStudentId(undefined);
  }, []);

  return (
    <RecordPaymentContext.Provider value={{ open }}>
      {children}
      <RecordPaymentDialog
        personId={personId}
        billingStudentId={billingStudentId}
        initialAmount={initialAmount}
        onSelectPerson={setPersonId}
        onClose={close}
      />
    </RecordPaymentContext.Provider>
  );
}

function RecordPaymentDialog({
  personId,
  billingStudentId,
  initialAmount,
  onSelectPerson,
  onClose,
}: {
  personId: string | null | undefined;
  billingStudentId?: string | undefined;
  initialAmount?: number | undefined;
  onSelectPerson: (personId: string) => void;
  onClose: () => void;
}) {
  const {
    feeWorkflow,
    concessions,
    payments: billingPayments,
    transactions,
    settings,
    recordFeeWorkflowPayment,
    updateFeeWorkflowPerson,
    saveDocumentVerifications,
    documentCorrections,
    sendDocumentCorrectionRequest,
  } = useFinance();
  const usedReceiptNumbers = new Set([
    ...billingPayments.map((payment) => payment.receiptNo),
    ...feeWorkflow.payments.map((payment) => payment.receiptNo),
    ...transactions.flatMap((transaction) =>
      [transaction.receiptNo, transaction.reference].filter(
        (receiptNo): receiptNo is string => !!receiptNo,
      ),
    ),
  ]);
  const receiptNo = nextAvailableReceiptNumber(
    settings.receipt.prefix,
    settings.receipt.next,
    usedReceiptNumbers,
  );
  const [form, setForm] = useState({
    amount: "",
    date: TODAY,
    method: "" as PaymentMethod | "",
    reference: "",
  });
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<FeeWorkflowPayment | FeePayment | null>(null);
  const [reviewApplicationOpen, setReviewApplicationOpen] = useState(false);
  const recording = useRef(false);
  const onEnterKeyDown = useEnterToNext();
  const paymentDetailsRef = useRef<HTMLElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const person = feeWorkflow.persons.find((item) => item.id === personId);
  const payments = feeWorkflow.payments.filter((payment) => payment.personId === personId);
  const latestPayment = [...payments].sort(
    (left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
  )[0];
  const administrationHandoff = feeWorkflow.handoffs.find(
    (handoff) => handoff.personId === personId && handoff.target === "Administration",
  );
  const studentPayments = billingPayments.filter(
    (payment) => payment.studentId === (billingStudentId ?? personId),
  );
  const workflowPaymentIds = new Set(payments.map((payment) => payment.id));
  const paymentHistory = [
    ...payments,
    ...studentPayments.filter((payment) => !workflowPaymentIds.has(payment.id)),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const totals = person ? personTotals(person, payments) : null;
  const needsApplicationReview =
    !!person && (totals?.outstanding ?? 0) > 0 && !isApplicationVerified(person);
  useEffect(() => {
    if (!needsApplicationReview) setReviewApplicationOpen(false);
  }, [needsApplicationReview]);
  const oldestOutstandingInstallment =
    person?.plan.find((installment) => installmentOutstanding(installment, payments) > 0) ?? null;
  const oldestOutstandingAmount = oldestOutstandingInstallment
    ? installmentOutstanding(oldestOutstandingInstallment, payments)
    : 0;
  const concession = person
    ? concessions
        .filter((request) => request.personId === person.id)
        .sort((left, right) =>
          (left.history[0]?.date ?? left.submission.requestedDate).localeCompare(
            right.history[0]?.date ?? right.submission.requestedDate,
          ),
        )
        .at(-1)
    : undefined;
  const concessionDecision = concession?.directorDecision;
  const concessionApplied = concession?.status === "Approved" && !!concession.applied;
  const concessionApprovedAwaitingApplication =
    concession?.status === "Approved" && !concession.applied;
  const blockPaymentForUnappliedApproval = concessionApprovedAwaitingApplication;
  const concessionOriginalFees =
    concession?.applied?.originalFees ?? concession?.submission.totalFees ?? 0;
  const concessionApprovedDiscount =
    concessionDecision?.decision === "Approved" ? concessionDecision.approvedDiscount : undefined;
  const concessionRevisedPayable = concessionApplied
    ? concession.applied!.netPayable
    : concessionApprovedAwaitingApplication && concessionApprovedDiscount !== undefined
      ? Math.max(0, concessionOriginalFees - concessionApprovedDiscount)
      : concessionOriginalFees;
  const concessionApplicationStatus = concessionApplied ? "Applied" : "Not applied";
  const hasAppliedConcession = concessions.some(
    (request) => request.personId === personId && request.status === "Approved" && request.applied,
  );
  const oldestOutstandingAmountRef = useRef(oldestOutstandingAmount);
  oldestOutstandingAmountRef.current = oldestOutstandingAmount;
  useEffect(() => {
    setForm({
      amount: String(initialAmount ?? (oldestOutstandingAmountRef.current || "")),
      date: TODAY,
      method: "",
      reference: "",
    });
    setReceipt(null);
    setConfirm(false);
    setError("");
  }, [initialAmount, personId]);
  const amount = Number(form.amount) || 0;
  const outstandingInstallments =
    person?.plan.filter((installment) => installmentOutstanding(installment, payments) > 0) ?? [];
  const preview =
    person && amount > 0 && amount <= (totals?.outstanding ?? 0)
      ? allocatePayment(person.plan, payments, amount)
      : [];
  const previewText =
    person && preview.length > 0
      ? preview
          .map((allocation) => {
            const installment = person.plan.find((item) => item.id === allocation.installmentId);
            const wasOutstanding = installment ? installmentOutstanding(installment, payments) : 0;
            return `${displayInstallmentLabel(installment?.label ?? "Installment")} ${formatINR(allocation.amount)}${allocation.amount >= wasOutstanding ? " (settles it)" : ""}`;
          })
          .join(" + ")
      : "Enter an amount to preview allocation.";
  const paymentReferenceState = getPaymentReferenceState({
    method: form.method,
    reference: form.reference,
    personId: person?.id,
    recordedPayments: [...billingPayments, ...feeWorkflow.payments].map((payment) => ({
      personId: "personId" in payment ? payment.personId : payment.studentId,
      method: payment.method,
      reference: payment.reference,
    })),
  });
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "method" && value === "Cash") next.reference = "";
      return next;
    });
    setError("");
  };
  const prepareReceiptForInstallment = (installmentId: string) => {
    const installment = outstandingInstallments.find((item) => item.id === installmentId);
    if (!installment) return;
    setForm((current) => ({
      ...current,
      amount: String(installmentOutstanding(installment, payments)),
    }));
    setError("");
    paymentDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    amountInputRef.current?.focus({ preventScroll: true });
  };
  const validate = () => {
    if (!person || !totals) return "Select a person.";
    if (person.applicationRejection)
      return "This application was rejected. Payment is unavailable.";
    if (needsApplicationReview) return "Review this application before recording payment.";
    if (blockPaymentForUnappliedApproval)
      return "Apply the Director-approved concession through Accounts before recording a payment.";
    if (!(amount > 0)) return "Enter an amount greater than zero.";
    if (amount > totals.outstanding)
      return `Amount cannot exceed the outstanding balance (${formatINR(totals.outstanding)}).`;
    if (!form.date || form.date > TODAY) return "Choose a valid payment date.";
    if (!form.method) return "Choose a payment method.";
    if (paymentReferenceState.error) return paymentReferenceState.error;
    return "";
  };
  const submitDisabledReason = validate();
  const submitDisabled = !!submitDisabledReason;
  const studentInitials =
    person?.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ?? "";
  const paymentStatus =
    !totals || totals.outstanding <= 0
      ? "Paid"
      : totals.daysOverdue > 0
        ? `Overdue ${totals.daysOverdue}d`
        : totals.paid > 0
          ? "Partially Paid"
          : "Pending";
  const paymentStatusClass =
    paymentStatus === "Paid"
      ? "border-success/30 bg-success/10 text-success"
      : paymentStatus.startsWith("Overdue")
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : paymentStatus === "Partially Paid"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground";
  const startSave = (event: FormEvent) => {
    event.preventDefault();
    const message = validate();
    setError(message);
    if (!message) setConfirm(true);
  };
  const save = () => {
    if (!person || recording.current) return;
    if (needsApplicationReview) return;
    const message = validate();
    if (message) {
      setError(message);
      setConfirm(false);
      return;
    }
    recording.current = true;
    setSaving(true);
    try {
      const created = recordFeeWorkflowPayment({
        personId: person.id,
        amount,
        date: form.date,
        method: form.method as PaymentMethod,
        reference: form.method === "Cash" ? "" : form.reference.trim(),
        receiptNo,
        allocations: allocatePayment(person.plan, payments, amount),
        confirmation: { status: "Not Sent" },
      });
      setReceipt(created);
      setConfirm(false);
      const remainingPayments = [...payments, created];
      const nextOutstanding = person.plan.find(
        (installment) => installmentOutstanding(installment, remainingPayments) > 0,
      );
      setForm((current) => ({
        ...current,
        amount: nextOutstanding
          ? String(installmentOutstanding(nextOutstanding, remainingPayments))
          : "",
        reference: "",
      }));
      setError("");
      toast.success(`Payment recorded · ${created.receiptNo}`);
      window.setTimeout(() => {
        recording.current = false;
        setSaving(false);
      }, 0);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Unable to record the payment.";
      recording.current = false;
      setSaving(false);
      setConfirm(false);
      setError(message);
      toast.error(message);
    }
  };
  const selectedReceipt = receipt
    ? "personId" in receipt
      ? (feeWorkflow.payments.find((item) => item.id === receipt.id) ?? receipt)
      : (billingPayments.find((item) => item.id === receipt.id) ?? receipt)
    : null;
  const recordDocumentDecision = (
    document: StudentApplicationDetails["documents"][number],
    status: "Approved" | "Rejected",
    reason?: string | undefined,
  ) => {
    if (!person) return;
    const openCorrectionRequest = documentCorrections.find(
      (request) =>
        request.applicationId === person.applicationId &&
        request.status === "Awaiting Resubmission",
    );
    const result = recordDocumentVerification(
      person,
      document,
      status,
      reason,
      status === "Rejected" ? openCorrectionRequest?.id : undefined,
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (!result.changed) return;
    if (
      !saveDocumentVerifications(
        person.id,
        result.person.documentVerifications ?? [],
        status === "Rejected"
          ? {
              documentType: document.type,
              issue: "Rejected",
              reason: reason?.trim() ?? "",
            }
          : undefined,
      )
    ) {
      toast.error("Could not save the document decision in this browser.");
      return;
    }
    updateFeeWorkflowPerson(result.person);
    if (status === "Rejected") {
      toast.success(
        openCorrectionRequest
          ? "Document rejected and added to the open correction request."
          : "Document rejected and eligible for a correction request.",
      );
      return;
    }
    if (result.allRequiredDocumentsApproved) {
      toast.success("All required documents are approved. Verify the application to continue.");
    } else {
      toast.success("Document approved. Review the remaining required documents.");
    }
  };

  const sendReviewCorrectionRequest = (documents: DocumentCorrectionItem[]) => {
    if (!person) return false;
    if (!sendDocumentCorrectionRequest(person, documents)) {
      toast.error(
        "Could not save the correction request. The documents may already be included or the request could not be saved.",
      );
      return false;
    }
    toast.success("Consolidated correction request sent to Admission (Sales) (simulated).");
    return true;
  };
  const verifyApplication = () => {
    if (!person || person.accountantVerifiedAt) return;
    if (!areRequiredDocumentsApproved(person)) {
      toast.error("Approve every required uploaded document before verifying the application.");
      return;
    }
    updateFeeWorkflowPerson(markApplicationReviewed(person));
    setReviewApplicationOpen(false);
    toast.success("Application reviewed and verified.");
  };

  const resetAndClose = () => {
    onClose();
    setForm({ amount: "", date: TODAY, method: "", reference: "" });
    setReceipt(null);
    setReviewApplicationOpen(false);
    setConfirm(false);
    setError("");
  };

  return (
    <>
      <Dialog
        open={personId !== null}
        onOpenChange={(open) => {
          if (!open) resetAndClose();
        }}
      >
        <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-2rem)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-xl border-border/80 bg-background p-0 shadow-xl [&_label]:text-xs [&_label]:font-medium [&_label]:normal-case [&_label]:tracking-normal [&_label]:text-muted-foreground">
          <DialogHeader className="shrink-0 border-b border-border/70 bg-background px-5 py-3.5 pr-14 text-left">
            {person ? (
              <div className="flex min-w-0 items-center gap-3">
                <div
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                >
                  {studentInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-xs text-muted-foreground">Payment Procedure</p>
                  <DialogTitle className="truncate text-base font-semibold leading-tight">
                    {person.name}
                  </DialogTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {person.admissionNo
                      ? `Admission No. ${person.admissionNo}`
                      : `Application No. ${person.applicationId}`}
                    <span aria-hidden="true"> · </span>
                    {person.course}
                    <span aria-hidden="true"> · </span>
                    {person.email || "Email not provided"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${paymentStatusClass}`}
                >
                  {paymentStatus}
                </span>
              </div>
            ) : (
              <DialogTitle>Payment Procedure</DialogTitle>
            )}
          </DialogHeader>
          {personId === undefined ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <SectionCard title="Select person">
                  <Select onValueChange={onSelectPerson}>
                    <SelectTrigger aria-label="Select person" className="h-11 w-full">
                      <SelectValue placeholder="Choose a person" />
                    </SelectTrigger>
                    <SelectContent>
                      {feeWorkflow.persons.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ·{" "}
                          {item.admissionStatus === "Admitted" ||
                          item.applicationStatus === "Admitted"
                            ? `Admission No.: ${item.admissionNo ?? "Pending"}`
                            : item.applicationId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SectionCard>
              </div>
              <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
                <Button variant="outline" onClick={resetAndClose}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          ) : !person || !totals ? (
            <div className="p-6">
              <EmptyState message="Person was not found." />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <dl className="grid grid-cols-4 divide-x divide-border/70 border-b border-border/70 pb-3">
                  <div className="min-w-0 pr-3">
                    <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                      Fee payable
                    </dt>
                    <dd className="num mt-1 text-lg font-semibold tabular-nums">
                      {formatINR(totals.payable)}
                    </dd>
                  </div>
                  <div className="min-w-0 px-3">
                    <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
                      Paid
                    </dt>
                    <dd className="num mt-1 text-lg font-semibold tabular-nums text-success">
                      {formatINR(totals.paid)}
                    </dd>
                  </div>
                  <div className="min-w-0 px-3">
                    <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CircleAlert
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-destructive"
                      />
                      Outstanding
                    </dt>
                    <dd
                      className={`num mt-1 text-lg font-semibold tabular-nums ${
                        totals.outstanding > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatINR(totals.outstanding)}
                    </dd>
                  </div>
                  <div className="min-w-0 pl-3">
                    <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                      Next due
                    </dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">
                        {totals.nextDueInstallment
                          ? formatDate(totals.nextDueInstallment.dueDate)
                          : "—"}
                      </span>
                      {totals.nextDueInstallment &&
                        installmentStatus(totals.nextDueInstallment, payments) === "Overdue" && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            Overdue
                          </span>
                        )}
                    </dd>
                    <dd className="truncate text-xs text-muted-foreground">
                      {displayInstallmentLabel(
                        totals.nextDueInstallment?.label ?? "No balance due",
                      )}
                    </dd>
                  </div>
                </dl>
                <section className="space-y-1.5">
                  <h2 className="text-sm font-semibold">Installment Schedule</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-[13px]">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border/70 text-left">
                          <th className="w-12 px-2 py-1.5 text-center font-medium">Sl. No.</th>
                          <th className="px-2 py-1.5 font-medium">Installment</th>
                          <th className="px-2 py-1.5 text-right font-medium">Original amount</th>
                          <th className="px-2 py-1.5 text-right font-medium">Fee Concession</th>
                          <th className="px-2 py-1.5 text-right font-medium">Revised payable</th>
                          <th className="px-2 py-1.5 text-right font-medium">Paid</th>
                          <th className="px-2 py-1.5 text-right font-medium">Outstanding</th>
                          <th className="px-2 py-1.5 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {person.plan.map((installment, index) => {
                          const status = installmentStatus(installment, payments);
                          const isAdmissionFee =
                            installment.label.trim().toLowerCase() ===
                            ADMISSION_FEE_LABEL.toLowerCase();
                          const concessionAmount =
                            hasAppliedConcession && !isAdmissionFee
                              ? (installment.concessionAmount ?? 0)
                              : 0;
                          const originalAmount =
                            hasAppliedConcession && !isAdmissionFee
                              ? (installment.originalAmount ?? installment.amountDue)
                              : installment.amountDue;
                          return (
                            <tr
                              key={installment.id}
                              className={`h-10 border-b border-border/50 last:border-0 ${
                                status === "Overdue"
                                  ? "bg-destructive/[0.06] dark:bg-destructive/[0.12]"
                                  : status === "Paid"
                                    ? "text-muted-foreground"
                                    : ""
                              }`}
                            >
                              <td className="w-12 px-2 py-1 text-center text-muted-foreground">
                                {index + 1}
                              </td>
                              <td className="px-2 py-1">
                                <span className="block font-medium leading-4">
                                  {displayInstallmentLabel(installment.label)}
                                </span>
                                <span className="block text-xs leading-4 text-muted-foreground">
                                  {formatDate(installment.dueDate)}
                                </span>
                              </td>
                              <td className="num whitespace-nowrap px-2 py-1 text-right tabular-nums">
                                {formatINR(originalAmount)}
                              </td>
                              <td className="num whitespace-nowrap px-2 py-1 text-right tabular-nums">
                                {formatINR(concessionAmount)}
                              </td>
                              <td className="num whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums">
                                {formatINR(installment.amountDue)}
                              </td>
                              <td className="num whitespace-nowrap px-2 py-1 text-right tabular-nums">
                                {formatINR(installmentPaid(installment.id, payments))}
                              </td>
                              <td className="num whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums">
                                {formatINR(installmentOutstanding(installment, payments))}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                  <StatusBadge status={status} />
                                  {oldestOutstandingInstallment?.id === installment.id && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => prepareReceiptForInstallment(installment.id)}
                                    >
                                      Generate Receipt
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section
                  ref={paymentDetailsRef}
                  className="space-y-3 border-t border-border/70 pt-3"
                >
                  <h2 className="text-sm font-semibold">Payment Details</h2>
                  <h3 className="text-xs font-semibold">Payment Fields</h3>
                  {needsApplicationReview ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {person?.applicationRejection
                          ? "This application was rejected. Payment is unavailable."
                          : "Review this application before recording payment."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReviewApplicationOpen(true)}
                      >
                        Review Application
                      </Button>
                    </div>
                  ) : blockPaymentForUnappliedApproval ? (
                    <p className="text-sm text-warning">
                      Payment is disabled until Accounts applies the Director-approved concession to
                      this student’s Billing record.
                    </p>
                  ) : totals.outstanding <= 0 ? (
                    <p className="text-sm text-success">This fee plan is fully paid.</p>
                  ) : (
                    <form
                      id="record-payment-form"
                      onSubmit={startSave}
                      onKeyDown={onEnterKeyDown}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Receipt No." htmlFor="record-payment-receipt">
                          <Input
                            id="record-payment-receipt"
                            value={receiptNo}
                            readOnly
                            aria-readonly="true"
                            tabIndex={-1}
                            className="h-10 rounded-lg bg-muted/30 tabular-nums"
                          />
                        </Field>
                        <Field label="Date" htmlFor="record-payment-date">
                          <Input
                            id="record-payment-date"
                            type="text"
                            value={formatDate(form.date)}
                            readOnly
                            aria-readonly="true"
                            tabIndex={-1}
                            className="h-10 rounded-lg bg-muted/30"
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_1.2fr]">
                        <Field label="Method" htmlFor="record-payment-method">
                          <>
                            <div className="[&>button]:h-10 [&>button]:rounded-lg">
                              <SimpleSelect
                                id="record-payment-method"
                                value={form.method}
                                onChange={(value) => set("method")(value)}
                                options={PAYMENT_METHODS.filter(
                                  (method) => settings.paymentMethods[method],
                                )}
                              />
                            </div>
                            {!form.method && amount > 0 && (
                              <p role="alert" className="text-xs text-destructive">
                                Choose a payment method.
                              </p>
                            )}
                          </>
                        </Field>
                        <Field label="Amount (₹)" htmlFor="record-payment-amount">
                          <>
                            <div className="relative">
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
                              >
                                ₹
                              </span>
                              <Input
                                id="record-payment-amount"
                                ref={amountInputRef}
                                type="number"
                                step="0.01"
                                value={form.amount}
                                onChange={(event) => set("amount")(event.target.value)}
                                onWheel={(event) => event.currentTarget.blur()}
                                className="h-10 rounded-lg pl-8 tabular-nums"
                              />
                            </div>
                          </>
                        </Field>
                        <Field label="Pay Toward">
                          <div
                            id="record-payment-target"
                            role="status"
                            className="flex h-10 items-center rounded-lg border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground"
                          >
                            Automatic · oldest outstanding first
                          </div>
                        </Field>
                      </div>
                      {paymentReferenceState.rule && (
                        <div className="max-w-md">
                          <Field
                            label={paymentReferenceState.label}
                            htmlFor="record-payment-reference"
                          >
                            <>
                              <Input
                                id="record-payment-reference"
                                value={form.reference}
                                onChange={(event) => set("reference")(event.target.value)}
                                placeholder={
                                  form.method === "Bank Transfer"
                                    ? "NEFT, RTGS or IMPS reference"
                                    : undefined
                                }
                                aria-invalid={!!paymentReferenceState.error}
                                className="h-10 rounded-lg"
                              />
                              {paymentReferenceState.helperText && (
                                <p className="text-xs text-muted-foreground">
                                  {paymentReferenceState.helperText}
                                </p>
                              )}
                              {paymentReferenceState.error && (
                                <p role="alert" className="text-xs text-destructive">
                                  {paymentReferenceState.error}
                                </p>
                              )}
                            </>
                          </Field>
                        </div>
                      )}
                    </form>
                  )}
                  {!needsApplicationReview &&
                    !blockPaymentForUnappliedApproval &&
                    totals.outstanding > 0 && (
                      <div className="space-y-2 border-t border-border/70 pt-3">
                        <h3 className="text-xs font-semibold">Allocation Summary</h3>
                        {preview.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Enter an amount to preview the automatic allocation.
                          </p>
                        ) : (
                          <>
                            <ul className="space-y-1 text-xs">
                              {preview.map((allocation, index) => {
                                const installment = person.plan.find(
                                  (item) => item.id === allocation.installmentId,
                                );
                                if (!installment) return null;
                                const outstandingBefore = installmentOutstanding(
                                  installment,
                                  payments,
                                );
                                const remainingAfter = Math.max(
                                  0,
                                  outstandingBefore - allocation.amount,
                                );
                                return (
                                  <li
                                    key={allocation.installmentId}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="flex min-w-0 items-center">
                                      <span className="mr-2 text-muted-foreground">
                                        {index + 1}.
                                      </span>
                                      <span className="font-medium">
                                        {displayInstallmentLabel(installment.label)}
                                      </span>
                                      <span className="ml-2 text-muted-foreground">
                                        {remainingAfter === 0 ? "Fully settled" : "Partially paid"}
                                        {" · Remaining "}
                                        {formatINR(remainingAfter)}
                                      </span>
                                    </span>
                                    <span className="num shrink-0 font-medium tabular-nums">
                                      {formatINR(allocation.amount)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-xs font-medium">
                              <span>Balance after this payment</span>
                              <span className="num tabular-nums">
                                {formatINR(Math.max(0, totals.outstanding - amount))}
                              </span>
                            </div>
                          </>
                        )}
                        {error && error !== "Choose a payment method." && (
                          <p role="alert" className="text-xs text-destructive">
                            {error}
                          </p>
                        )}
                      </div>
                    )}
                  <section className="space-y-1.5 border-t border-border/70 pt-3">
                    <h3 className="text-xs font-semibold">Payment History</h3>
                    {paymentHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-[13px]">
                          <thead className="text-xs text-muted-foreground">
                            <tr className="border-b border-border/70 text-left">
                              <th className="px-2 py-1.5 font-medium">Date</th>
                              <th className="px-2 py-1.5 font-medium">Receipt number</th>
                              <th className="px-2 py-1.5 font-medium">Payment method</th>
                              <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                              <th className="px-2 py-1.5 font-medium">Installment / allocation</th>
                              <th className="px-2 py-1.5 font-medium">Receipt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentHistory.map((payment) => (
                              <tr
                                key={payment.id}
                                className="border-b border-border/50 last:border-0"
                              >
                                <td className="whitespace-nowrap px-2 py-1.5">
                                  {formatDate(payment.date)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5">
                                  {payment.receiptNo}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5">{payment.method}</td>
                                <td className="num whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                                  {formatINR(payment.amount)}
                                </td>
                                <td className="px-2 py-1.5">
                                  {payment.allocations?.length
                                    ? payment.allocations
                                        .map((allocation) => {
                                          const installment = person.plan.find(
                                            (item) => item.id === allocation.installmentId,
                                          );
                                          return `${displayInstallmentLabel(installment?.label ?? "Installment")} ${formatINR(allocation.amount)}`;
                                        })
                                        .join(" · ")
                                    : "towards" in payment && payment.towards
                                      ? displayInstallmentLabel(payment.towards)
                                      : "Allocation not recorded"}
                                </td>
                                <td className="px-2 py-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setReceipt(payment)}
                                  >
                                    View receipt
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <DeliveryStatusSection
                    email={person.email}
                    payment={latestPayment}
                    handoff={administrationHandoff}
                  />
                  <DeliveryAttemptInformationSection
                    payment={latestPayment}
                    handoff={administrationHandoff}
                  />
                </section>
                {concession && (
                  <section className="space-y-2 border-t border-border/70 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold">Fee concession summary</h2>
                        <p className="text-xs text-muted-foreground">{concession.concessionNo}</p>
                      </div>
                      <Badge
                        variant={
                          concession.status === "Approved"
                            ? "success"
                            : concession.status === "Rejected"
                              ? "danger"
                              : concession.status === "Pending Director Decision"
                                ? "warning"
                                : "info"
                        }
                      >
                        {concession.status}
                      </Badge>
                    </div>
                    <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Director Decision</dt>
                        <dd className="font-medium">
                          {concessionDecision?.decision ??
                            (concession.status === "Pending Director Decision"
                              ? "Pending Director Decision"
                              : concession.status === "Pending Accounts Review"
                                ? "Not yet decided"
                                : "Not yet decided")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Request Status</dt>
                        <dd className="font-medium">{concession.status}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Original Fees</dt>
                        <dd className="font-medium">{formatINR(concessionOriginalFees)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Director-approved Discount</dt>
                        <dd className="font-medium">
                          {concessionApprovedDiscount !== undefined
                            ? formatINR(concessionApprovedDiscount)
                            : "Not approved"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Revised Fee Payable</dt>
                        <dd className="font-medium">
                          {concessionApprovedDiscount !== undefined
                            ? formatINR(concessionRevisedPayable)
                            : formatINR(concessionOriginalFees)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Accounts Application Status</dt>
                        <dd className="font-medium">{concessionApplicationStatus}</dd>
                      </div>
                    </dl>
                    {concession.applied?.excessCredit ? (
                      <p className="text-xs text-muted-foreground">
                        Student Credit: {formatINR(concession.applied.excessCredit)}. No automatic
                        refund is issued.
                      </p>
                    ) : null}
                    {blockPaymentForUnappliedApproval && (
                      <p role="alert" className="text-xs text-warning">
                        Apply the approved concession in Fee Concessions before recording any
                        payment. Payments are blocked until Accounts applies the revised installment
                        schedule.
                      </p>
                    )}
                  </section>
                )}
              </div>
              <DialogFooter className="shrink-0 border-t border-border/70 bg-background px-5 py-3">
                {person && totals && totals.outstanding > 0 && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={saving || submitDisabled || needsApplicationReview ? 0 : -1}
                        >
                          <Button
                            type="submit"
                            form="record-payment-form"
                            className="h-10 rounded-lg px-5"
                            disabled={saving || submitDisabled || needsApplicationReview}
                          >
                            Payment Procedure · {formatINR(amount)}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(saving || submitDisabled || needsApplicationReview) && (
                        <TooltipContent>
                          {saving ? "Payment is being recorded." : submitDisabledReason}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={reviewApplicationOpen && needsApplicationReview}
        onOpenChange={setReviewApplicationOpen}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b bg-background px-4 py-4 pr-12 text-left sm:px-6">
            <DialogTitle>Review application</DialogTitle>
            {person && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs text-muted-foreground">
                  Application No. {person.applicationId}
                </span>
                <span className="text-xs text-muted-foreground">
                  Applied Date {formatDate(person.appliedOn)}
                </span>
                <StatusBadge status={person.applicationStatus} />
                <StatusBadge
                  status={
                    person.admissionNo
                      ? `Admission No. ${person.admissionNo}`
                      : "Admission No. Pending"
                  }
                />
                <div className="ml-auto">
                  <ApplicationDetailsPrintButton />
                </div>
              </div>
            )}
          </DialogHeader>
          {person && (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails
                snapshot={buildAdministrationDetailsPayload(person, payments)}
                plan={person.plan}
                documentVerifications={person.documentVerifications}
                onVerifyDocument={recordDocumentDecision}
                onSendCorrectionRequest={sendReviewCorrectionRequest}
                correctionRequests={documentCorrections}
              />
              <section className="space-y-3">
                <h3 className="font-semibold">Fee summary</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ApplicationDetail label="Fee payable" value={formatINR(totals?.payable ?? 0)} />
                  <ApplicationDetail label="Paid so far" value={formatINR(totals?.paid ?? 0)} />
                  <ApplicationDetail
                    label="Outstanding"
                    value={formatINR(totals?.outstanding ?? 0)}
                  />
                </div>
              </section>
              <DocumentVerificationHistory documentVerifications={person.documentVerifications} />
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-semibold">For office use only</h3>
                <div className="grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2">
                  <ApplicationDetail
                    label="Accountant verification"
                    value={
                      isApplicationVerified(person) && person.accountantVerifiedAt
                        ? `Verified · ${formatDate(person.accountantVerifiedAt.slice(0, 10))}`
                        : "Pending"
                    }
                    layout="inline"
                  />
                </div>
              </section>
              <AdministrationHistory personId={person.id} handoffs={feeWorkflow.handoffs} />
            </div>
          )}
          <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setReviewApplicationOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={verifyApplication}
              disabled={
                !person ||
                !!person.applicationRejection ||
                !!person.accountantVerifiedAt ||
                !areRequiredDocumentsApproved(person)
              }
            >
              Verify application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Record this payment?"
        confirmLabel="Confirm payment"
        description={
          person && (
            <span>
              {formatINR(amount)} from {person.name} via {form.method}. {previewText}
            </span>
          )
        }
        onConfirm={save}
      />
      <Dialog
        open={!!selectedReceipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="no-print shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>Receipt {selectedReceipt?.receiptNo}</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <FeeReceipt
              workflowPayment={"personId" in selectedReceipt ? selectedReceipt : undefined}
              payment={"studentId" in selectedReceipt ? selectedReceipt : undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
