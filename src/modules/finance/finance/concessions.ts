import { installmentPaid } from "./feeWorkflow";
import { sum, TODAY } from "./logic";
import { ADMISSION_FEE_LABEL } from "./labels";
import type { FeeWorkflowPayment, Installment, Person } from "./types";

/**
 * Fee Concessions: Admission (Sales) submits a completed concession form,
 * Accounts reviews and forwards it, the Director decides, Accounts applies an
 * approved discount. Every rule lives here so the store and tests share it.
 */

export const CONCESSION_TYPES = ["Percentage", "Fixed Amount", "Special Case"] as const;
export type ConcessionType = (typeof CONCESSION_TYPES)[number];

export const CONCESSION_STATUSES = [
  "Pending Accounts Review",
  "Pending Director Decision",
  "Approved",
  "Rejected",
] as const;
export type ConcessionStatus = (typeof CONCESSION_STATUSES)[number];

export const STUDENT_DECLARATION =
  "I request consideration of the above concession and confirm that the information provided is true and complete.";
export const CONFIDENTIALITY_STATEMENT = "Confidential • For Internal Administrative Use Only";

/** Exactly what Admission submitted. Accounts never edits this. */
export interface ConcessionSubmission {
  studentName: string;
  branch: string;
  applicationNo: string;
  requestedDate: string;
  contact: string;
  totalFees: number;
  eligibleFees: number;
  course: string;
  courseDuration: string;
  startingDate: string;
  amountAlreadyPaid: number;
  concessionType: ConcessionType;
  /** Percent for "Percentage", rupees otherwise. */
  requestedValue: number;
  reason: string;
  declarationAccepted: boolean;
}

export interface ConcessionAttachment {
  id: string;
  fileName: string;
  fileType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  previewUrl: string;
}

export interface AccountsReview {
  reviewedBy: string;
  reviewDate: string;
  remarks?: string | undefined;
}

export type DirectorDecisionKind = "Approved" | "Rejected";
export interface DirectorDecision {
  decision: DirectorDecisionKind;
  date: string;
  approvedDiscount?: number | undefined;
  remarks: string;
  simulated: true;
}

export interface InstallmentAdjustment {
  installmentId: string;
  label: string;
  before: number;
  after: number;
}

export interface AppliedConcession {
  date: string;
  appliedBy: string;
  originalFees: number;
  approvedDiscount: number;
  netPayable: number;
  paidAtApply: number;
  outstanding: number;
  excessCredit: number;
  adjustments: InstallmentAdjustment[];
  /** Full installment plan as it stood after the concession was applied. */
  planAfter: Installment[];
}

export type ConcessionActor = "Admission" | "Accounts" | "Director";
export interface ConcessionHistoryEntry {
  date: string;
  actor: ConcessionActor;
  text: string;
  /** The request has no prior status when its original submission is received. */
  fromStatus?: ConcessionStatus | "Not submitted" | undefined;
  toStatus?: ConcessionStatus | undefined;
  simulated?: boolean | undefined;
}

export interface ConcessionRequest {
  id: string;
  concessionNo: string;
  personId: string;
  submission: ConcessionSubmission;
  attachments?: ConcessionAttachment[] | undefined;
  /** Earlier submissions retained from older workflow records. */
  previousSubmissions: ConcessionSubmission[];
  status: ConcessionStatus;
  review?: AccountsReview | undefined;
  forwardedAt?: string | undefined;
  directorDecision?: DirectorDecision | undefined;
  directorDecisions?: DirectorDecision[] | undefined;
  applied?: AppliedConcession | undefined;
  /** Simulated intake for testing; never a genuine Admission submission. */
  simulated: boolean;
  history: ConcessionHistoryEntry[];
}

export function directorDecisionHistory(request: ConcessionRequest): DirectorDecision[] {
  const decisions = request.directorDecisions?.length
    ? request.directorDecisions
    : request.directorDecision
      ? [request.directorDecision]
      : [];
  return [...decisions].sort((left, right) => left.date.localeCompare(right.date));
}

export function latestDirectorDecision(request: ConcessionRequest): DirectorDecision | undefined {
  const decisions = directorDecisionHistory(request);
  return decisions.at(-1);
}

/** Backend boundary for the existing workflow; current callers remain backed by local persistence. */
export interface ConcessionFeeInformation {
  applicationNo: string;
  personId: string;
  totalFees: number;
  eligibleFees: number;
  paid: number;
  outstanding: number;
  studentCredit: number;
  installments: Installment[];
}

export interface ConcessionBackendOperations {
  receiveRequest(input: {
    id: string;
    personId: string;
    submission: ConcessionSubmission;
    date: string;
  }): Promise<ConcessionRequest>;
  reviewRequest(id: string, review: AccountsReview): Promise<ConcessionRequest>;
  forwardRequestToDirector(id: string): Promise<ConcessionRequest>;
  receiveDirectorDecision(
    id: string,
    decision: Omit<DirectorDecision, "simulated">,
  ): Promise<ConcessionRequest>;
  applyApprovedConcession(id: string): Promise<ConcessionRequest>;
  retrieveFeeInformation(applicationNo: string): Promise<ConcessionFeeInformation | null>;
  retrieveActivityHistory(requestId: string): Promise<ConcessionHistoryEntry[]>;
}

export type ConcessionResult<T = ConcessionRequest> =
  { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const ok = <T>(value: T) => ({ ok: true as const, value });

export const roundRupees = (value: number) => Math.round(value);

/** Discount in rupees implied by a submission (never applied by itself). */
export function requestedDiscountAmount(submission: ConcessionSubmission): number {
  const applicableFees = submission.eligibleFees;
  if (submission.concessionType === "Percentage")
    return roundRupees((applicableFees * submission.requestedValue) / 100);
  return roundRupees(submission.requestedValue);
}

export function eligibleFeeTotal(plan: Installment[]): number {
  return sum(
    plan
      .filter((item) => item.label.trim().toLowerCase() !== ADMISSION_FEE_LABEL.toLowerCase())
      .map((item) => item.amountDue),
  );
}

export function validateSubmission(submission: ConcessionSubmission): string | null {
  const applicableFees = submission.eligibleFees;
  if (
    !Number.isFinite(submission.totalFees) ||
    !Number.isFinite(applicableFees) ||
    applicableFees < 0 ||
    applicableFees > submission.totalFees
  )
    return "Eligible fees must be valid and cannot exceed total fees.";
  if (!(applicableFees > 0)) return "Eligible fees must be greater than zero.";
  if (!(submission.requestedValue > 0)) return "Requested discount must be greater than zero.";
  if (submission.concessionType === "Percentage" && submission.requestedValue > 100)
    return "Percentage discount cannot exceed 100%.";
  if (
    submission.concessionType !== "Percentage" &&
    submission.requestedValue > applicableFees
  )
    return "Requested discount cannot exceed eligible fees.";
  if (!submission.reason.trim()) return "A reason for the discount is required.";
  if (!submission.declarationAccepted) return "The student declaration must be accepted.";
  return null;
}

/** Active requests prevent a second request for the same application. */
export function isActiveConcession(request: ConcessionRequest) {
  return request.status !== "Rejected" && !(request.status === "Approved" && request.applied);
}

export function hasActiveConcession(
  requests: ConcessionRequest[],
  applicationNo: string,
  excludeId?: string | undefined,
) {
  const key = applicationNo.trim().toLocaleLowerCase();
  return requests.some(
    (request) =>
      request.submission.applicationNo.trim().toLocaleLowerCase() === key &&
      request.id !== excludeId &&
      isActiveConcession(request),
  );
}

const LEGACY_STATUS: Record<string, ConcessionStatus> = {
  "Received from Admission": "Pending Accounts Review",
  "Under Finance Review": "Pending Accounts Review",
  "Returned to Admission": "Pending Accounts Review",
  "Resubmitted by Admission": "Pending Accounts Review",
  "Forwarded to Director": "Pending Director Decision",
  "Awaiting Director Decision": "Pending Director Decision",
  "Approved by Director": "Approved",
  "Approved Concession Applied": "Approved",
  "Rejected by Director": "Rejected",
  "Returned by Director for Clarification": "Pending Accounts Review",
};

function currentStatus(request: ConcessionRequest): ConcessionStatus {
  if (request.applied) return "Approved";
  if (request.directorDecision?.decision === "Approved") return "Approved";
  if (request.directorDecision?.decision === "Rejected") return "Rejected";
  const status = LEGACY_STATUS[request.status] ?? request.status;
  return status === "Approved" || status === "Rejected" ? "Pending Director Decision" : status;
}

/** Migrates requests saved by earlier prototype versions to the four-state workflow. */
export function normalizeConcessionRequest(request: ConcessionRequest): ConcessionRequest {
  const normalizeDecision = (decision: DirectorDecision | undefined) =>
    decision &&
    ((decision.decision === "Approved" &&
      Number.isFinite(decision.approvedDiscount) &&
      (decision.approvedDiscount ?? 0) > 0) ||
      decision.decision === "Rejected")
      ? decision
      : undefined;
  const directorDecision = normalizeDecision(request.directorDecision);
  const directorDecisions = (request.directorDecisions ?? []).filter((decision) =>
    normalizeDecision(decision),
  );
  const applied = request.applied
    ? {
        ...request.applied,
        planAfter: request.applied.planAfter.map((installment) => {
          const adjustment = request.applied!.adjustments.find(
            (item) => item.installmentId === installment.id,
          );
          return adjustment
            ? {
                ...installment,
                originalAmount: installment.originalAmount ?? adjustment.before,
                concessionAmount:
                  installment.concessionAmount ?? adjustment.before - adjustment.after,
              }
            : installment;
        }),
      }
    : undefined;
  const status = currentStatus({ ...request, directorDecision, applied });
  const normalizeHistoryStatus = (value: string | undefined) => {
    if (value === undefined || value === "Not submitted") return value;
    if ((CONCESSION_STATUSES as readonly string[]).includes(value))
      return value as ConcessionStatus;
    return LEGACY_STATUS[value] ?? "Pending Accounts Review";
  };
  return {
    ...request,
    status,
    directorDecision,
    directorDecisions,
    applied,
    history: request.history.map((entry) => {
      const toStatus = normalizeHistoryStatus(entry.toStatus);
      return {
        ...entry,
        actor: String(entry.actor) === "Finance" ? "Accounts" : entry.actor,
        fromStatus: normalizeHistoryStatus(entry.fromStatus),
        toStatus: toStatus === "Not submitted" ? undefined : toStatus,
      };
    }),
  };
}

export function nextConcessionNo(requests: ConcessionRequest[], year = 2026) {
  const max = Math.max(
    0,
    ...requests.map((request) => Number(request.concessionNo.split("-").at(-1)) || 0),
  );
  return `FC-${year}-${String(max + 1).padStart(3, "0")}`;
}

function withEntry(
  request: ConcessionRequest,
  patch: Partial<ConcessionRequest>,
  entries: ConcessionHistoryEntry[],
): ConcessionRequest {
  const nextStatus = patch.status ?? request.status;
  const stamped = entries.map((entry) => ({
    ...entry,
    fromStatus: entry.fromStatus ?? request.status,
    toStatus: entry.toStatus ?? nextStatus,
  }));
  return { ...request, ...patch, history: [...request.history, ...stamped] };
}

/** Admission intake (simulated). Enforces validation and the one-active-request rule. */
export function receiveSubmission(
  requests: ConcessionRequest[],
  input: {
    id: string;
    personId: string;
    submission: ConcessionSubmission;
    attachments?: ConcessionAttachment[] | undefined;
    date: string;
    simulated: boolean;
  },
): ConcessionResult {
  const error = validateSubmission(input.submission);
  if (error) return fail(error);
  if (hasActiveConcession(requests, input.submission.applicationNo))
    return fail("This application already has an active concession request.");
  return ok({
    id: input.id,
    concessionNo: nextConcessionNo(requests),
    personId: input.personId,
    submission: input.submission,
    attachments: input.attachments,
    previousSubmissions: [],
    status: "Pending Accounts Review",
    simulated: input.simulated,
    history: [
      {
        date: input.date,
        actor: "Admission",
        text: `Fee Concession request submitted by Admission (Sales): ${input.submission.reason}`,
        fromStatus: "Not submitted",
        toStatus: "Pending Accounts Review",
        simulated: input.simulated,
      },
    ],
  });
}

export function saveReview(
  request: ConcessionRequest,
  review: AccountsReview,
  date: string,
): ConcessionResult {
  if (request.status !== "Pending Accounts Review")
    return fail("Only requests pending Accounts review can be reviewed.");
  if (!review.reviewedBy.trim()) return fail("Enter who reviewed the request.");
  if (!review.reviewDate) return fail("Enter the review date.");
  return ok(
    withEntry(request, { review }, [
      {
        date,
        actor: "Accounts",
        text: `Accounts review recorded by ${review.reviewedBy}${review.remarks?.trim() ? `: ${review.remarks.trim()}` : ""}`,
      },
    ]),
  );
}

export function forwardToDirector(request: ConcessionRequest, date: string): ConcessionResult {
  if (request.status !== "Pending Accounts Review")
    return fail("Only requests pending Accounts review can be forwarded.");
  const requiredFields: (keyof ConcessionSubmission)[] = [
    "studentName",
    "branch",
    "applicationNo",
    "requestedDate",
    "contact",
    "course",
    "courseDuration",
    "startingDate",
  ];
  if (
    requiredFields.some((field) => {
      const value = request.submission[field];
      return typeof value !== "string" || !value.trim();
    })
  )
    return fail("Request is incomplete: Admission submission is missing required details.");
  const submissionError = validateSubmission(request.submission);
  if (submissionError) return fail(`Request is incomplete: ${submissionError}`);
  if (!request.review) return fail("Record the Accounts review before forwarding.");
  return ok(
    withEntry(request, { status: "Pending Director Decision", forwardedAt: date }, [
      { date, actor: "Accounts", text: "Accounts forwarded the request to the Director" },
    ]),
  );
}

export function recordDirectorDecision(
  request: ConcessionRequest,
  decision: Omit<DirectorDecision, "simulated">,
): ConcessionResult {
  if (request.status !== "Pending Director Decision")
    return fail("The Director can only decide on forwarded requests.");
  if (!decision.date) return fail("Enter the decision date.");
  const fees = request.submission.eligibleFees;
  let approvedDiscount: number | undefined;
  if (!decision.remarks.trim()) return fail("Add remarks explaining the Director's decision.");
  if (decision.decision === "Approved") {
    const approvedValue = decision.approvedDiscount;
    if (
      typeof approvedValue !== "number" ||
      !Number.isFinite(approvedValue) ||
      !(approvedValue > 0)
    )
      return fail("Approved discount must be greater than zero.");
    approvedDiscount = approvedValue;
    if (approvedDiscount > fees)
      return fail("Approved discount cannot exceed the applicable fees.");
  }
  const status: ConcessionStatus = decision.decision;
  return ok(
    withEntry(
      request,
      {
        status,
        directorDecision: { ...decision, approvedDiscount, simulated: true },
        directorDecisions: [
          ...directorDecisionHistory(request),
          {
            ...decision,
            approvedDiscount,
            simulated: true,
          },
        ],
      },
      [
        {
          date: decision.date,
          actor: "Director",
          text:
            decision.decision === "Approved"
              ? `Director approved a Fee Concession of ₹${approvedDiscount!.toLocaleString("en-IN")}: ${decision.remarks.trim()}`
              : `Director rejected the Fee Concession: ${decision.remarks.trim()}`,
          simulated: true,
        },
      ],
    ),
  );
}

/**
 * Allocate last installment first, excluding Admission Fee, paid/part-paid,
 * overdue, and otherwise ineligible installments.
 */
export function adjustPlanForDiscount(
  plan: Installment[],
  payments: FeeWorkflowPayment[],
  discount: number,
  today = TODAY,
) {
  let remaining = Math.max(0, discount);
  const adjustments: InstallmentAdjustment[] = [];
  const next = [...plan];
  for (let index = next.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const installment = next[index]!;
    const paid = installmentPaid(installment.id, payments);
    const admissionFee =
      installment.label.trim().toLowerCase() === ADMISSION_FEE_LABEL.toLowerCase();
    if (admissionFee || paid > 0 || installment.dueDate < today) continue;
    const reducible = Math.max(0, installment.amountDue);
    const cut = Math.min(reducible, remaining);
    if (cut <= 0) continue;
    next[index] = {
      ...installment,
      amountDue: installment.amountDue - cut,
      originalAmount: installment.originalAmount ?? installment.amountDue,
      concessionAmount: (installment.concessionAmount ?? 0) + cut,
    };
    adjustments.push({
      installmentId: installment.id,
      label: installment.label,
      before: installment.amountDue,
      after: installment.amountDue - cut,
    });
    remaining -= cut;
  }
  return { plan: next, adjustments, unabsorbed: remaining };
}

export function concessionFinancials(originalFees: number, approvedDiscount: number, paid: number) {
  const netPayable = Math.max(0, originalFees - approvedDiscount);
  return {
    originalFees,
    approvedDiscount,
    netPayable,
    paid,
    outstanding: Math.max(0, netPayable - paid),
    excessCredit: Math.max(0, paid - netPayable),
  };
}

export function applyApprovedConcession(
  request: ConcessionRequest,
  person: Person,
  payments: FeeWorkflowPayment[],
  date: string,
): ConcessionResult<{ request: ConcessionRequest; plan: Installment[] }> {
  if (request.status !== "Approved")
    return fail("Only Director-approved concessions can be applied.");
  if (request.applied) return fail("This approved concession has already been applied.");
  const approved = request.directorDecision?.approvedDiscount ?? 0;
  if (!(approved > 0)) return fail("No approved discount was recorded by the Director.");
  const personPayments = payments.filter((payment) => payment.personId === person.id);
  const originalFees = sum(person.plan.map((installment) => installment.amountDue));
  if (approved > eligibleFeeTotal(person.plan))
    return fail("Approved discount exceeds current eligible fees.");
  const paid = sum(
    person.plan.map((installment) => installmentPaid(installment.id, personPayments)),
  );
  const { plan, adjustments } = adjustPlanForDiscount(
    person.plan,
    personPayments,
    approved,
    date.slice(0, 10),
  );
  const allocated = adjustments.reduce((total, item) => total + item.before - item.after, 0);
  if (Math.abs(allocated - approved) > 1e-7) {
    return fail("The approved amount exceeds eligible unpaid, not-yet-due course installments.");
  }
  const totals = concessionFinancials(originalFees, approved, paid);
  const appliedBy = request.review?.reviewedBy.trim() || "Accounts";
  const applied: AppliedConcession = {
    date,
    appliedBy,
    originalFees,
    approvedDiscount: approved,
    netPayable: totals.netPayable,
    paidAtApply: paid,
    outstanding: totals.outstanding,
    excessCredit: totals.excessCredit,
    adjustments,
    planAfter: plan,
  };
  const entries: ConcessionHistoryEntry[] = [
    {
      date,
      actor: "Accounts",
      text: `Director-approved Fee Concession of ₹${approved.toLocaleString("en-IN")} applied by Accounts (${appliedBy}) – net payable ₹${totals.netPayable.toLocaleString("en-IN")}`,
    },
    ...adjustments.map((item) => ({
      date,
      actor: "Accounts" as const,
      text: `${item.label}: ₹${item.before.toLocaleString("en-IN")} → ₹${item.after.toLocaleString("en-IN")}`,
    })),
  ];
  if (totals.excessCredit > 0)
    entries.push({
      date,
      actor: "Accounts",
      text: `Student credit / excess payment of ₹${totals.excessCredit.toLocaleString("en-IN")} – no automatic refund`,
    });
  return ok({
    request: withEntry(request, { applied }, entries),
    plan,
  });
}
