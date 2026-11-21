import { addDays, differenceInCalendarDays, format } from "date-fns";
import type {
  AdministrationDetailsSnapshot,
  FeePayment,
  FeeWorkflowPayment,
  Handoff,
  Installment,
  InstallmentAllocation,
  InstallmentStatus,
  DocumentVerification,
  DocumentVerificationEvent,
  DocumentCorrectionRequest,
  Person,
  Student,
  StudentApplicationDetails,
} from "./types";
import type { PreparedPaymentConfirmation } from "./delivery";
import type { ConcessionRequest } from "./concessions";
import { canonicalAdmissionNo, normalizeAdmissionNo } from "./billing";
import { ADMISSION_FEE_LABEL } from "./labels";
import {
  ADMINISTRATION_DETAILS_SENT_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  ADMISSION_NO_RECEIVED_TEXT,
  DEMO_BILLING_SCENARIO_PERSON_IDS,
  DEMO_NEW_APPLICANTS,
  DEMO_APPLICANT_PAYMENTS,
  DEMO_ADMITTED_APPLICATIONS,
  DEMO_SCENARIO_HANDOFF_DATES,
  DEMO_SCENARIO_PAYMENT_SPECS,
  DEMO_SCENARIO_PEOPLE,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
  REQUIRE_APPLICATION_REVIEW,
  newDemoApplicants,
  personFromStudent,
} from "./feeWorkflowConfig";
import { TODAY, sum } from "./logic";

export interface FeeWorkflowState {
  persons: Person[];
  payments: FeeWorkflowPayment[];
  handoffs: Handoff[];
}

export function autoForwardEligibleApplications(
  workflow: FeeWorkflowState,
  at = new Date().toISOString(),
  concessions: ConcessionRequest[] = [],
): FeeWorkflowState {
  let handoffs = workflow.handoffs;
  for (const person of workflow.persons) {
    if (person.admissionNo) continue;
    const payments = workflow.payments.filter((payment) => payment.personId === person.id);
    if (!isEligibleNow(person, payments, handoffs, concessions)) continue;
    handoffs = recordAdministrationDetailsSent(handoffs, person, payments, at, concessions);
  }
  return handoffs === workflow.handoffs ? workflow : { ...workflow, handoffs };
}

export interface PaymentNotificationPayload {
  personId: string;
  applicationId: string;
  name: string;
  contact: string;
  email: string;
  admissionNo: string;
  note: string;
  payments: {
    id: string;
    date: string;
    amount: number;
    installmentsCovered: { label: string; amount: number }[];
    remainingBalance: number;
  }[];
}

export function markApplicationReviewed(person: Person): Person {
  if (person.applicationRejection || !areRequiredDocumentsApproved(person)) {
    return { ...person, accountantVerifiedAt: undefined };
  }
  return {
    ...person,
    applicationStatus:
      person.applicationStatus === "Received" ? "Reviewed" : person.applicationStatus,
    accountantVerifiedAt: person.accountantVerifiedAt ?? new Date().toISOString(),
  };
}

export const DOCUMENT_REVIEWER = "Accountant (Finance)";

export function documentSourceFingerprint(fileName: string | undefined, fileUrl: string): string {
  const source = `${fileName ?? ""}\u0000${fileUrl}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return `doc-${(hash >>> 0).toString(16)}`;
}

export function documentVerificationStatus(
  document: StudentApplicationDetails["documents"][number],
  verifications: DocumentVerification[] | undefined,
): "Pending" | "Approved" | "Rejected" {
  if (!document.provided || !document.fileUrl) return "Pending";
  const verification = verifications?.find((item) => item.documentType === document.type);
  const sourceFingerprint = documentSourceFingerprint(document.fileName, document.fileUrl);
  return verification?.sourceFingerprint === sourceFingerprint ? verification.status : "Pending";
}

export function areRequiredDocumentsApproved(person: Person): boolean {
  const details = person.applicationDetails;
  if (!details) return true;
  const documents = details.documents ?? [];
  return (
    documents.length > 0 &&
    documents.every(
      (document) =>
        document.provided &&
        !!document.fileUrl &&
        documentVerificationStatus(document, person.documentVerifications) === "Approved",
    )
  );
}

export function isApplicationVerified(person: Person): boolean {
  return (
    !person.applicationRejection &&
    !!person.accountantVerifiedAt &&
    areRequiredDocumentsApproved(person)
  );
}

/** Required documents that have not been uploaded. */
export function missingRequiredDocuments(person: Person): string[] {
  return (person.applicationDetails?.documents ?? [])
    .filter((document) => !document.provided || !document.fileUrl)
    .map((document) => document.type);
}

/** True while a required document is missing or a current upload awaits correction. */
export function hasDocumentsAwaitingResubmission(person: Person): boolean {
  return (person.applicationDetails?.documents ?? []).some(
    (document) =>
      !document.provided ||
      !document.fileUrl ||
      documentVerificationStatus(document, person.documentVerifications) === "Rejected",
  );
}

export type ApplicationRejectionResult =
  { ok: true; person: Person } | { ok: false; error: string };

/** Finance rejects the whole application. Nothing is deleted; payment becomes unavailable. */
export function rejectApplication(
  person: Person,
  reason: string,
  now = new Date().toISOString(),
): ApplicationRejectionResult {
  if (!reason.trim()) return { ok: false, error: "Enter a reason for rejecting the application." };
  if (person.applicationRejection)
    return { ok: false, error: "This application is already rejected." };
  if (person.admissionNo) return { ok: false, error: "Admitted applications cannot be rejected." };
  return {
    ok: true,
    person: {
      ...person,
      accountantVerifiedAt: undefined,
      applicationRejection: {
        reason: reason.trim(),
        date: now,
        reviewer: DOCUMENT_REVIEWER,
        missingDocuments: missingRequiredDocuments(person),
      },
    },
  };
}

export type DocumentVerificationResult =
  | {
      ok: true;
      person: Person;
      changed: boolean;
      allRequiredDocumentsApproved: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export function recordDocumentVerification(
  person: Person,
  document: StudentApplicationDetails["documents"][number],
  status: "Approved" | "Rejected",
  reason?: string | undefined,
  correctionRequestReference?: string | undefined,
): DocumentVerificationResult {
  const currentDocument = person.applicationDetails?.documents.find(
    (item) => item.type === document.type,
  );
  if (
    !currentDocument?.provided ||
    !currentDocument.fileUrl ||
    currentDocument.fileUrl !== document.fileUrl
  ) {
    return { ok: false, error: "This document is unavailable for verification." };
  }
  if (status === "Rejected" && !reason?.trim()) {
    return { ok: false, error: "Enter a rejection reason before continuing." };
  }
  const sourceFingerprint = documentSourceFingerprint(
    currentDocument.fileName,
    currentDocument.fileUrl,
  );
  const previous = person.documentVerifications?.find(
    (verification) => verification.documentType === currentDocument.type,
  );
  const currentStatus = documentVerificationStatus(currentDocument, person.documentVerifications);
  const previousStatus =
    !currentDocument.provided || !currentDocument.fileUrl ? "Missing" : currentStatus;
  if (status === "Approved" && currentStatus === "Rejected") {
    return {
      ok: false,
      error: "Admission (Sales) must resubmit a corrected document before approval.",
    };
  }
  if (status === "Rejected" && currentStatus === "Approved") {
    return { ok: false, error: "Approved documents cannot be changed." };
  }
  if (status === "Rejected" && currentStatus === "Rejected") {
    return {
      ok: true,
      person,
      changed: false,
      allRequiredDocumentsApproved: areRequiredDocumentsApproved(person),
    };
  }
  if (status === "Approved" && currentStatus === "Approved") {
    return {
      ok: true,
      person,
      changed: false,
      allRequiredDocumentsApproved: areRequiredDocumentsApproved(person),
    };
  }
  const date = new Date().toISOString();
  const event: DocumentVerificationEvent = {
    status,
    decision: status,
    previousStatus,
    date,
    fileName: currentDocument.fileName,
    fileUrl: currentDocument.fileUrl,
    sourceFingerprint,
    reviewer: DOCUMENT_REVIEWER,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
    ...(correctionRequestReference ? { correctionRequestReference } : {}),
  };
  const documentVerifications = [
    ...(person.documentVerifications ?? []).filter(
      (verification) => verification.documentType !== currentDocument.type,
    ),
    {
      documentType: currentDocument.type,
      ...event,
      history: [...(previous?.history ?? []), event],
    },
  ];
  const updatedPerson = {
    ...person,
    documentVerifications,
    accountantVerifiedAt: undefined,
  };
  return {
    ok: true,
    person: updatedPerson,
    changed: true,
    allRequiredDocumentsApproved: areRequiredDocumentsApproved(updatedPerson),
  };
}

export function appearsInBilling(person: Person, payments: FeeWorkflowPayment[]): boolean {
  return (
    person.billCreated === true ||
    isApplicationVerified(person) ||
    payments.some((payment) => payment.personId === person.id)
  );
}

export function createNewFeeWorkflowPayment(
  payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">,
  id: string,
): FeeWorkflowPayment {
  return { ...payment, id, adminNotified: false };
}

export function areAllPaymentsAdministrationNotified(payments: FeeWorkflowPayment[]): boolean {
  return payments.length > 0 && payments.every((payment) => payment.adminNotified);
}

export function markPaymentsAdministrationNotified(
  payments: FeeWorkflowPayment[],
  paymentIds: string[],
): FeeWorkflowPayment[] {
  const ids = new Set(paymentIds);
  let changed = false;
  const updated = payments.map((payment) => {
    if (!ids.has(payment.id) || payment.adminNotified) return payment;
    changed = true;
    return { ...payment, adminNotified: true };
  });
  return changed ? updated : payments;
}

function wasPaymentAdministrationNotified(payment: FeeWorkflowPayment, handoffs: Handoff[]) {
  return (
    payment.adminNotified ||
    handoffs.some(
      (handoff) =>
        handoff.personId === payment.personId &&
        handoff.target === "Administration" &&
        handoff.history.some(
          (entry) =>
            entry.referenceId === payment.id && entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
        ),
    )
  );
}

export function studentFromAdmittedPerson(person: Person, admissionNo: string): Student {
  return {
    id: person.id,
    applicationId: person.applicationId,
    name: person.name,
    regNo: admissionNo,
    admissionStatus: "Admitted",
    course: person.course,
    phone: person.contact,
    email: person.email,
    registeredOn: person.appliedOn,
    totalFee: sum(person.plan.map((installment) => installment.amountDue)),
    installments: person.plan.map((installment) => ({
      label: installment.label,
      due: installment.dueDate,
      amount: installment.amountDue,
      originalAmount: installment.originalAmount,
      concessionAmount: installment.concessionAmount,
    })),
    applicationDetails: person.applicationDetails,
  };
}

export function validateAdmissionNo(
  admissionNo: string,
  personId: string,
  persons: Person[],
  students: Student[],
): "valid" | "invalid" | "duplicate" {
  const normalized = normalizeAdmissionNo(admissionNo);
  if (!/^ADM2026\d{4}$/.test(normalized)) return "invalid";
  const canonical = canonicalAdmissionNo(admissionNo);
  const duplicatePerson = persons.some(
    (person) =>
      person.id !== personId &&
      !!person.admissionNo &&
      canonicalAdmissionNo(person.admissionNo) === canonical,
  );
  const duplicateStudent = students.some(
    (student) =>
      student.id !== personId &&
      !!student.regNo &&
      canonicalAdmissionNo(student.regNo) === canonical,
  );
  return duplicatePerson || duplicateStudent ? "duplicate" : "valid";
}

export function mergeBillingPayments(
  existing: FeePayment[],
  workflowPayments: FeeWorkflowPayment[],
  personId: string,
): FeePayment[] {
  const existingIds = new Set(existing.map((payment) => payment.id));
  const merged = [...existing];
  for (const payment of workflowPayments) {
    if (payment.personId !== personId || existingIds.has(payment.id)) continue;
    existingIds.add(payment.id);
    merged.push({
      id: payment.id,
      studentId: personId,
      date: payment.date,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      receiptNo: payment.receiptNo,
      allocations: payment.allocations,
    });
  }
  return merged;
}

export function feeWorkflowPaymentStatus(
  person: Person,
  payments: FeeWorkflowPayment[],
): Person["paymentStatus"] {
  const totals = personTotals(person, payments);
  if (totals.outstanding <= 0) return "Paid";
  return totals.paid > 0 ? "Partially paid" : "Unpaid";
}

export function installmentPaid(installmentId: string, payments: FeeWorkflowPayment[]): number {
  return sum(
    payments.flatMap((payment) =>
      payment.allocations
        .filter((allocation) => allocation.installmentId === installmentId)
        .map((allocation) => allocation.amount),
    ),
  );
}

export function installmentOutstanding(
  installment: Installment,
  payments: FeeWorkflowPayment[],
): number {
  return Math.max(0, installment.amountDue - installmentPaid(installment.id, payments));
}

export function installmentStatus(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
): InstallmentStatus {
  const outstanding = installmentOutstanding(installment, payments);
  if (outstanding === 0) return "Paid";
  if (installment.dueDate < today) return "Overdue";
  if (outstanding < installment.amountDue) return "Partially Paid";
  return "Pending";
}

export function installmentDaysOverdue(installment: Installment, today = TODAY): number {
  if (installment.dueDate >= today) return 0;
  return differenceInCalendarDays(
    new Date(`${today}T00:00:00`),
    new Date(`${installment.dueDate}T00:00:00`),
  );
}

export type InstallmentFollowUpStatus = "Reminder Due" | "Reminder Sent" | null;

export function installmentReminderWindowEnd(today = TODAY): string {
  return format(addDays(new Date(`${today}T00:00:00`), REMINDER_LEAD_DAYS), "yyyy-MM-dd");
}

export function installmentFollowUpStatus(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
): InstallmentFollowUpStatus {
  if (installmentOutstanding(installment, payments) <= 0) return null;
  if (installment.reminders.length > 0) return "Reminder Sent";
  const reminderDueDate = installmentReminderWindowEnd(today);
  if (installment.dueDate <= reminderDueDate) return "Reminder Due";
  return null;
}

export function isRecentlyPaidInstallment(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
  recentDays = 7,
): boolean {
  if (installmentOutstanding(installment, payments) > 0) return false;
  const cutoff = addDays(new Date(`${today}T00:00:00`), -recentDays)
    .toISOString()
    .slice(0, 10);
  return payments.some(
    (payment) =>
      payment.date >= cutoff &&
      payment.allocations.some(
        (allocation) => allocation.installmentId === installment.id && allocation.amount > 0,
      ),
  );
}

export function personTotals(person: Person, payments: FeeWorkflowPayment[], today = TODAY) {
  const payable =
    person.feePayableOverride ?? sum(person.plan.map((installment) => installment.amountDue));
  const paid = sum(person.plan.map((installment) => installmentPaid(installment.id, payments)));
  const outstanding = sum(
    person.plan.map((installment) => installmentOutstanding(installment, payments)),
  );
  const nextDueInstallment =
    person.plan.find((installment) => installmentOutstanding(installment, payments) > 0) ?? null;
  const daysOverdue = person.plan.reduce((maximum, installment) => {
    if (installmentOutstanding(installment, payments) <= 0 || installment.dueDate >= today)
      return maximum;
    return Math.max(
      maximum,
      differenceInCalendarDays(
        new Date(`${today}T00:00:00`),
        new Date(`${installment.dueDate}T00:00:00`),
      ),
    );
  }, 0);
  return { payable, paid, outstanding, nextDueInstallment, daysOverdue };
}

export function buildPaymentNotificationPayload(
  person: Person,
  payments: FeeWorkflowPayment[],
): PaymentNotificationPayload {
  const personPayments = payments
    .filter((payment) => payment.personId === person.id)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const includedPayments = personPayments.filter((payment) => !payment.adminNotified);
  const note = "Payment details prepared for Administration.";
  return {
    personId: person.id,
    applicationId: person.applicationId,
    name: person.name,
    contact: person.contact,
    email: person.email,
    admissionNo: person.admissionNo ?? "",
    note,
    payments: includedPayments.map((payment) => {
      const throughPayment = personPayments.filter(
        (item) => item.date < payment.date || (item.date === payment.date && item.id <= payment.id),
      );
      return {
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        installmentsCovered: payment.allocations.map((allocation) => ({
          label:
            person.plan.find((installment) => installment.id === allocation.installmentId)?.label ??
            allocation.installmentId,
          amount: allocation.amount,
        })),
        remainingBalance: personTotals(person, throughPayment).outstanding,
      };
    }),
  };
}

export function allocatePayment(
  plan: Installment[],
  payments: FeeWorkflowPayment[],
  amount: number,
  targetInstallmentId?: string | string[] | undefined,
): InstallmentAllocation[] {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new RangeError("Payment amount must be greater than zero.");
  const outstanding = sum(plan.map((installment) => installmentOutstanding(installment, payments)));
  if (amount > outstanding) throw new RangeError("Payment amount exceeds the outstanding balance.");

  if (Array.isArray(targetInstallmentId)) {
    const selectedIds = new Set(targetInstallmentId);
    const selected = plan.filter((installment) => selectedIds.has(installment.id));
    if (selected.length !== selectedIds.size)
      throw new RangeError("Target installment was not found.");
    const selectedOutstanding = sum(
      selected.map((installment) => installmentOutstanding(installment, payments)),
    );
    if (selectedOutstanding <= 0)
      throw new RangeError("Select an installment with an outstanding balance.");
    if (amount > selectedOutstanding)
      throw new RangeError(
        "Payment amount exceeds the selected installments' outstanding balance.",
      );
    let remaining = amount;
    return selected.flatMap((installment) => {
      const allocated = Math.min(remaining, installmentOutstanding(installment, payments));
      remaining -= allocated;
      return allocated > 0 ? [{ installmentId: installment.id, amount: allocated }] : [];
    });
  }

  const targetIndex = targetInstallmentId
    ? plan.findIndex((installment) => installment.id === targetInstallmentId)
    : -1;
  if (targetInstallmentId && targetIndex < 0)
    throw new RangeError("Target installment was not found.");
  const order =
    targetIndex < 0 ? plan : [...plan.slice(targetIndex), ...plan.slice(0, targetIndex)];

  let remaining = amount;
  const allocations: InstallmentAllocation[] = [];
  for (const installment of order) {
    const due = installmentOutstanding(installment, payments);
    const allocated = Math.min(remaining, due);
    if (allocated > 0) allocations.push({ installmentId: installment.id, amount: allocated });
    remaining -= allocated;
    if (remaining === 0) break;
  }
  return allocations;
}

export function fullyPaidInstallmentCount(person: Person, payments: FeeWorkflowPayment[]): number {
  return person.plan.filter(
    (installment) =>
      installment.amountDue > 0 && installmentOutstanding(installment, payments) === 0,
  ).length;
}

export function canSendToAdministration(
  person: Person,
  payments: FeeWorkflowPayment[],
  concessions: ConcessionRequest[] = [],
): boolean {
  const personConcessions = concessions.filter((request) => request.personId === person.id);
  const unresolvedConcession = personConcessions.some(
    (request) =>
      request.status === "Pending Accounts Review" ||
      request.status === "Pending Director Decision" ||
      (request.status === "Approved" &&
        (request.directorDecision?.decision !== "Approved" || !request.applied)) ||
      (request.status === "Rejected" && request.directorDecision?.decision !== "Rejected"),
  );
  if (unresolvedConcession) return false;
  const admissionFee = person.plan.find(
    (installment) => installment.label.trim().toLowerCase() === ADMISSION_FEE_LABEL.toLowerCase(),
  );
  const eligibleInstallment = admissionFee ?? person.plan[0];
  return (
    !!eligibleInstallment &&
    eligibleInstallment.amountDue > 0 &&
    installmentOutstanding(eligibleInstallment, payments) === 0
  );
}

export function hasAdministrationDetailsEvent(personId: string, handoffs: Handoff[]): boolean {
  return handoffs.some(
    (handoff) =>
      handoff.personId === personId &&
      handoff.target === "Administration" &&
      handoff.history.some(
        (entry) =>
          entry.text === ADMINISTRATION_DETAILS_SENT_TEXT ||
          entry.text === "Application handoff prepared (simulation only; not delivered)",
      ),
  );
}

export type ApplicationStage =
  | "Admitted"
  | "Handoff prepared"
  | "Ready to send"
  | "To review"
  | "Awaiting Resubmission"
  | "Resubmitted for Review"
  | "Awaiting payment"
  | "Rejected";

export type ApplicationListStatus = "New" | "Pending";
export type ApplicationListFilter = "All" | ApplicationListStatus;

export function matchesApplicationListFilter(
  status: ApplicationListStatus | null,
  hasResubmission: boolean,
  filter: ApplicationListFilter,
): boolean {
  if (status === null) return false;
  if (filter === "All") return true;
  return status === filter && !hasResubmission;
}

export interface ApplicationResubmissionEvent {
  correctionRequestId: string;
  date: string;
  documentTypes: string[];
}

export function hasResubmittedDocumentsAwaitingReview(
  person: Person,
  correctionRequests: DocumentCorrectionRequest[] = [],
): boolean {
  if (person.admissionNo || person.applicationRejection || isApplicationVerified(person))
    return false;

  return correctionRequests.some(
    (request) =>
      request.applicationId === person.applicationId &&
      request.status === "Resubmitted" &&
      request.documents.some((requested) => {
        const document = person.applicationDetails?.documents.find(
          (item) => item.type === requested.documentType,
        );
        return (
          !!requested.resubmittedFileUrl &&
          !!document &&
          document.fileUrl === requested.resubmittedFileUrl &&
          documentVerificationStatus(document, person.documentVerifications) === "Pending"
        );
      }),
  );
}

export function applicationResubmissionForReview(
  person: Person,
  correctionRequests: DocumentCorrectionRequest[] = [],
  payments: FeeWorkflowPayment[] = [],
  handoffs: Handoff[] = [],
  concessions: ConcessionRequest[] = [],
): ApplicationResubmissionEvent | null {
  if (person.admissionNo || person.applicationRejection || isApplicationVerified(person))
    return null;

  const stage = applicationStage(person, payments, handoffs, true, correctionRequests, concessions);
  if (stage !== "To review" && stage !== "Resubmitted for Review") return null;

  const latestRequest = correctionRequests
    .filter((request) => request.personId === person.id)
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
    .at(-1);
  if (latestRequest?.status !== "Resubmitted") return null;

  const event = latestRequest.history
    ?.filter((entry) => entry.action === "Resubmitted")
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  if (!event) return null;

  return {
    correctionRequestId: latestRequest.id,
    date: event.date,
    documentTypes: event.documentTypes,
  };
}

export function applicationListStatus(
  person: Person,
  payments: FeeWorkflowPayment[] = [],
  handoffs: Handoff[] = [],
  correctionRequests: DocumentCorrectionRequest[] = [],
  concessions: ConcessionRequest[] = [],
): ApplicationListStatus | null {
  if (person.admissionNo || person.applicationRejection || isApplicationVerified(person))
    return null;

  const stage = applicationStage(person, payments, handoffs, true, correctionRequests, concessions);
  if (stage === "Awaiting Resubmission") return "Pending";
  if (stage === "Resubmitted for Review") return "Pending";
  if (stage === "To review")
    return applicationResubmissionForReview(
      person,
      correctionRequests,
      payments,
      handoffs,
      concessions,
    )
      ? "Pending"
      : "New";
  return null;
}

export function applicationStage(
  person: Person,
  payments: FeeWorkflowPayment[] = [],
  handoffs: Handoff[] = [],
  requireApplicationReview = REQUIRE_APPLICATION_REVIEW,
  correctionRequests: DocumentCorrectionRequest[] = [],
  concessions: ConcessionRequest[] = [],
): ApplicationStage {
  if (person.admissionNo) return "Admitted";
  if (person.applicationRejection) return "Rejected";
  const applicationRequests = correctionRequests.filter(
    (request) => request.applicationId === person.applicationId,
  );
  if (
    requireApplicationReview &&
    applicationRequests.some((request) => request.status === "Awaiting Resubmission")
  )
    return "Awaiting Resubmission";
  if (
    requireApplicationReview &&
    hasResubmittedDocumentsAwaitingReview(person, applicationRequests)
  )
    return "Resubmitted for Review";
  if (hasAdministrationDetailsEvent(person.id, handoffs)) return "Handoff prepared";
  if (requireApplicationReview && !isApplicationVerified(person)) return "To review";
  if (canSendToAdministration(person, payments, concessions)) return "Ready to send";
  return "Awaiting payment";
}

export function filterApplicationsByStage(
  people: Person[],
  payments: FeeWorkflowPayment[],
  handoffs: Handoff[],
  stage: ApplicationStage | "All" | null,
  correctionRequests: DocumentCorrectionRequest[] = [],
  concessions: ConcessionRequest[] = [],
): Person[] {
  return people.filter((person) => {
    const personPayments = payments.filter((payment) => payment.personId === person.id);
    const currentStage = applicationStage(
      person,
      personPayments,
      handoffs,
      true,
      correctionRequests,
      concessions,
    );
    if (stage === "All") return true;
    if (stage) return currentStage === stage;
    return currentStage !== "Admitted";
  });
}

/** Eligible and no details event yet; used for prompts. */
export function isEligibleNow(
  person: Person,
  payments: FeeWorkflowPayment[],
  handoffs: Handoff[],
  concessions: ConcessionRequest[] = [],
): boolean {
  return (
    !person.admissionNo &&
    isApplicationVerified(person) &&
    canSendToAdministration(person, payments, concessions) &&
    !hasAdministrationDetailsEvent(person.id, handoffs)
  );
}

function hadOverdueInstallment(person: Person, payments: FeeWorkflowPayment[]): boolean {
  return person.plan.some((installment) =>
    payments.some(
      (payment) =>
        payment.date > installment.dueDate &&
        payment.allocations.some(
          (allocation) => allocation.installmentId === installment.id && allocation.amount > 0,
        ),
    ),
  );
}

export function classAccess(
  person: Person,
  payments: FeeWorkflowPayment[] = [],
  today = TODAY,
): "On Hold" | "Payment Cleared" | null {
  if (
    person.plan.some((installment) => installmentStatus(installment, payments, today) === "Overdue")
  )
    return "On Hold";
  return hadOverdueInstallment(person, payments) ? "Payment Cleared" : null;
}

export type FeeFollowUpStatus = "Reminder sent" | null;

export function followUpStatus(person: Person, payments: FeeWorkflowPayment[], today = TODAY) {
  const overdue = person.plan.filter(
    (installment) => installmentStatus(installment, payments, today) === "Overdue",
  );
  if (overdue.some((installment) => installment.reminders.length > 0)) return "Reminder sent";
  return null;
}

export type FeeNextAction =
  | "Review Application"
  | "Record Payment"
  | "Send Reminder"
  | "Enter Admission No."
  | "Notify Administration";

export function nextAction(
  person: Person,
  payments: FeeWorkflowPayment[],
  handoffs: Handoff[] = [],
  today = TODAY,
  requireApplicationReview = REQUIRE_APPLICATION_REVIEW,
): FeeNextAction | null {
  const firstInstallment = person.plan[0];
  const statuses = person.plan.map((installment) => ({
    installment,
    status: installmentStatus(installment, payments, today),
  }));
  const overdue = statuses.filter(({ status }) => status === "Overdue");
  const handoff = handoffs.find(
    (item) => item.personId === person.id && item.target === "Administration",
  );

  // Applicant steps come first; overdue follow-up outranks handoff steps.
  if (requireApplicationReview && person.applicationStatus === "Received")
    return "Review Application";
  if (
    !person.admissionNo &&
    firstInstallment &&
    installmentOutstanding(firstInstallment, payments) > 0
  )
    return "Record Payment";
  const overdueReminderDue = overdue.some(
    ({ installment }) => installment.reminders.length < MAX_REMINDERS,
  );
  const dueSoon = statuses.some(
    ({ installment, status }) =>
      installmentOutstanding(installment, payments) > 0 &&
      status !== "Paid" &&
      installment.dueDate >= today &&
      installment.dueDate <= installmentReminderWindowEnd(today) &&
      installment.reminders.length === 0,
  );
  if (overdueReminderDue || dueSoon) return "Send Reminder";
  if (
    (handoff?.status === "Ready" || handoff?.status === "Simulated (not delivered)") &&
    !person.admissionNo
  )
    return "Enter Admission No.";
  if (
    person.admissionNo &&
    classAccess(person, payments, today) === "Payment Cleared" &&
    person.plan.some((installment) =>
      payments.some(
        (payment) =>
          payment.date > installment.dueDate &&
          payment.allocations.some(
            (allocation) =>
              allocation.installmentId === installment.id &&
              allocation.amount > 0 &&
              !wasPaymentAdministrationNotified(payment, handoffs),
          ),
      ),
    )
  )
    return "Notify Administration";
  return null;
}

export function taskPriority(
  person: Person,
  payments: FeeWorkflowPayment[],
  _handoffs: Handoff[] = [],
  today = TODAY,
): number {
  const overdue = person.plan.filter(
    (installment) => installmentStatus(installment, payments, today) === "Overdue",
  );
  if (overdue.some((installment) => installment.reminders.length >= MAX_REMINDERS)) return 0;
  if (overdue.length > 0) return 1;
  const reminderDueDate = installmentReminderWindowEnd(today);
  if (
    person.plan.some(
      (installment) =>
        installmentOutstanding(installment, payments) > 0 &&
        installment.dueDate >= today &&
        installment.dueDate <= reminderDueDate,
    )
  )
    return 2;
  if (person.applicationStatus === "Received") return 3;
  return 4;
}

export function createDemoFeeWorkflow(
  students: Student[],
  payments: FeePayment[],
): FeeWorkflowState {
  const persons = [
    ...students.map((student, index) => personFromStudent(student, index)),
    ...newDemoApplicants(),
    ...DEMO_SCENARIO_PEOPLE,
  ];
  const workflowPayments: FeeWorkflowPayment[] = [];
  for (const payment of [...payments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const person = persons.find((candidate) => candidate.id === payment.studentId);
    if (!person) continue;
    workflowPayments.push({
      id: payment.id,
      personId: person.id,
      amount: payment.amount,
      date: payment.date,
      method: payment.method,
      reference: payment.reference,
      receiptNo: payment.receiptNo,
      adminNotified: true,
      confirmation: { status: "Not Sent" },
      allocations: allocatePayment(
        person.plan,
        workflowPayments.filter((item) => item.personId === person.id),
        payment.amount,
      ),
    });
  }
  const admittedApplicants = DEMO_ADMITTED_APPLICATIONS.map((applicant) =>
    persons.find(
      (person) =>
        !!person.admissionNo &&
        canonicalAdmissionNo(person.admissionNo) ===
          canonicalAdmissionNo(applicant.admissionNo ?? ""),
    ),
  );
  if (admittedApplicants.some((person) => !person)) {
    throw new Error("Demo admitted applicants must match seeded students.");
  }
  const allWorkflowPayments: FeeWorkflowPayment[] = [
    ...workflowPayments,
    ...DEMO_APPLICANT_PAYMENTS.map((payment) => ({ ...payment, adminNotified: true })),
  ];
  for (const spec of DEMO_SCENARIO_PAYMENT_SPECS) {
    const person = persons.find((candidate) => candidate.id === spec.personId);
    if (!person) throw new Error(`Missing demo scenario person ${spec.personId}.`);
    const personPayments = allWorkflowPayments.filter((payment) => payment.personId === person.id);
    allWorkflowPayments.push({
      id: `DEMO-PAY-${person.applicationId}-${spec.receiptNo}`,
      personId: person.id,
      amount: spec.amount,
      date: spec.date,
      method: "UPI",
      reference: spec.reference,
      receiptNo: spec.receiptNo,
      allocations: allocatePayment(person.plan, personPayments, spec.amount),
      confirmation: spec.confirmation,
      adminNotified: spec.adminNotified,
    });
  }
  const handoffs: Handoff[] = [];
  for (const [personId, dates] of Object.entries(DEMO_SCENARIO_HANDOFF_DATES)) {
    const person = persons.find((candidate) => candidate.id === personId);
    if (!person) throw new Error(`Missing demo handoff person ${personId}.`);
    const handoff = createAdministrationHandoffRecord(
      [],
      person,
      allWorkflowPayments,
      dates.detailsSent,
    );
    if (dates.admissionReceived) {
      handoff.status = "Completed";
      handoff.history.push({
        date: dates.admissionReceived,
        text: ADMISSION_NO_RECEIVED_TEXT,
      });
    }
    handoffs.push(handoff);
  }
  return {
    persons: persons.map((person) => ({
      ...person,
      admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
      adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
        allWorkflowPayments.filter((payment) => payment.personId === person.id),
      ),
      paymentStatus: feeWorkflowPaymentStatus(
        person,
        allWorkflowPayments.filter((payment) => payment.personId === person.id),
      ),
    })),
    payments: allWorkflowPayments,
    handoffs,
  };
}

export function createDemoBillingStudents(workflow: FeeWorkflowState): Student[] {
  const demoApplicantIds = new Set<string>(DEMO_NEW_APPLICANTS.map((applicant) => applicant.id));
  return workflow.persons
    .filter(
      (person) =>
        DEMO_BILLING_SCENARIO_PERSON_IDS.includes(person.id) ||
        (demoApplicantIds.has(person.id) && appearsInBilling(person, workflow.payments)),
    )
    .map((person) => ({
      id: person.id,
      applicationId: person.applicationId,
      name: person.name,
      regNo: person.admissionNo ?? "",
      admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
      course: person.course,
      phone: person.contact,
      email: person.email,
      registeredOn: person.appliedOn,
      totalFee: sum(person.plan.map((installment) => installment.amountDue)),
      installments: person.plan.map((installment) => ({
        label: installment.label,
        due: installment.dueDate,
        amount: installment.amountDue,
        originalAmount: installment.originalAmount,
        concessionAmount: installment.concessionAmount,
      })),
      applicationDetails: person.applicationDetails,
    }));
}

export function createDemoBillingPayments(
  existing: FeePayment[],
  workflow: FeeWorkflowState,
): FeePayment[] {
  return workflow.persons
    .filter((person) => appearsInBilling(person, workflow.payments))
    .map((person) => person.id)
    .reduce(
      (payments, personId) => mergeBillingPayments(payments, workflow.payments, personId),
      existing,
    );
}

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

export function buildPaymentConfirmationEmail(
  person: Person,
  payment: FeeWorkflowPayment,
  allPayments: FeeWorkflowPayment[],
): { to: string; subject: string; body: string } {
  const emailINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  const emailDate = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const personPayments = allPayments.filter((item) => item.personId === person.id);
  const covered = payment.allocations.map((allocation) => {
    const installment = person.plan.find((item) => item.id === allocation.installmentId);
    return `${installment?.label.replaceAll("Instalment", "Installment") ?? "Installment covered"}: ${emailINR(allocation.amount)}`;
  });
  const totals = personTotals(person, personPayments);
  const nextDue = totals.nextDueInstallment;
  const subject = `Payment confirmation - ${person.name} - ${payment.receiptNo}`;
  const body = [
    `Dear ${person.name},`,
    `Amount received: ${emailINR(payment.amount)}. Mode: ${payment.method}. Date: ${emailDate(payment.date)}.`,
    `Receipt no.: ${payment.receiptNo}`,
    `Installment(s) covered: ${covered.join(", ") || "None"}`,
    `Balance remaining: ${emailINR(totals.outstanding)}`,
    nextDue
      ? `Next installment due: ${nextDue.label.replaceAll("Instalment", "Installment")}, ${emailINR(installmentOutstanding(nextDue, personPayments))} on ${emailDate(nextDue.dueDate)}`
      : "Next installment due: None",
    person.admissionNo
      ? `Admission No.: ${person.admissionNo}`
      : `Application No.: ${person.applicationId}`,
    "Please keep your printed, signed receipt for your records.",
  ].join("\n");
  return { to: person.email, subject, body };
}

export function preparePaymentConfirmation(
  person: Person,
  payment: FeeWorkflowPayment,
  allPayments: FeeWorkflowPayment[],
): PreparedPaymentConfirmation | undefined {
  const email = buildPaymentConfirmationEmail(person, payment, allPayments);
  if (!email.to.trim()) return undefined;
  return {
    idempotencyKey: `student-payment-confirmation:${payment.id}`,
    paymentId: payment.id,
    personId: person.id,
    recipient: email.to,
    subject: email.subject,
    body: email.body,
    receipt: {
      paymentId: payment.id,
      receiptNo: payment.receiptNo,
      fileName: `Receipt-${payment.receiptNo}.pdf`,
      contentType: "application/pdf",
    },
  };
}

export function buildPaymentReminderEmail(
  student: Pick<Student, "name" | "email" | "course">,
  installment: string,
  amountDue: number,
  dueDate: string,
  institution: string,
): { to: string; subject: string; body: string } {
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueDate}T00:00:00Z`));
  const dueWording = dueDate < TODAY ? `which was due on ${date}` : `by ${date}`;
  return {
    to: student.email ?? "",
    subject: `Fee reminder - ${student.name} - ${installment.replaceAll("Instalment", "Installment")}`,
    body: `Dear ${student.name}, ${institution} records ${inr(amountDue)} outstanding for ${installment.replaceAll("Instalment", "Installment")} in ${student.course}, ${dueWording}. Please pay through the institute's accepted payment methods and share the transaction reference with Accounts.`,
  };
}

/** Complete frozen snapshot for the Administration integration boundary; never includes an Admission No. */
export function buildAdministrationDetailsPayload(
  person: Person,
  allPayments: FeeWorkflowPayment[],
  asOfDate?: string | undefined,
): AdministrationDetailsSnapshot {
  const payments = allPayments
    .filter(
      (item) =>
        item.personId === person.id &&
        (asOfDate === undefined || item.date <= asOfDate.slice(0, 10)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const totals = personTotals(person, payments);
  const snapshot: AdministrationDetailsSnapshot = {
    personId: person.id,
    applicationId: person.applicationId,
    name: person.name,
    contact: person.contact,
    email: person.email,
    course: person.course,
    appliedOn: person.appliedOn,
    applicationForm: person.applicationDetails,
    paymentSummary: {
      payments: payments.map((payment) => ({
        date: payment.date,
        amount: payment.amount,
        method: payment.method,
        receiptNo: payment.receiptNo,
        installmentsCovered: payment.allocations.map((allocation) => ({
          label:
            person.plan.find((item) => item.id === allocation.installmentId)?.label ??
            allocation.installmentId,
          amount: allocation.amount,
        })),
      })),
      totalPaid: sum(payments.map((payment) => payment.amount)),
      installmentsPaid: fullyPaidInstallmentCount(person, payments),
      outstanding: totals.outstanding,
    },
  };
  // Deep copy so later edits to the person or payments never change the stored snapshot.
  return structuredClone(snapshot);
}

/**
 * Records the local Administration handoff simulation with a frozen snapshot.
 * Idempotent: if the event already exists, handoffs are returned unchanged.
 */
export function recordAdministrationDetailsSent(
  handoffs: Handoff[],
  person: Person,
  payments: FeeWorkflowPayment[],
  sentAt: string,
  concessions: ConcessionRequest[] = [],
): Handoff[] {
  const personPayments = payments.filter((payment) => payment.personId === person.id);
  if (!isEligibleNow(person, personPayments, handoffs, concessions)) return handoffs;
  const existing = handoffs.find(
    (item) => item.personId === person.id && item.target === "Administration",
  );
  const updated = createAdministrationHandoffRecord(handoffs, person, personPayments, sentAt);
  return [...handoffs.filter((item) => item !== existing), updated];
}

function createAdministrationHandoffRecord(
  handoffs: Handoff[],
  person: Person,
  payments: FeeWorkflowPayment[],
  sentAt: string,
): Handoff {
  const existing = handoffs.find(
    (item) => item.personId === person.id && item.target === "Administration",
  );
  return {
    personId: person.id,
    target: "Administration",
    status: "Ready",
    idempotencyKey:
      existing?.idempotencyKey ?? `administration-handoff:${person.id}:${person.applicationId}`,
    delivery: existing?.delivery ?? { status: "Not Sent" },
    history: [
      ...(existing?.history ?? []),
      {
        date: sentAt,
        text: ADMINISTRATION_DETAILS_SENT_TEXT,
        snapshot: buildAdministrationDetailsPayload(person, payments, sentAt),
      },
    ],
  };
}

export function hasDuplicatePaymentReference(
  personId: string,
  reference: string,
  payments: FeeWorkflowPayment[],
): boolean {
  const normalized = reference.trim().toLowerCase();
  return (
    !!normalized &&
    payments.some(
      (payment) =>
        payment.personId === personId && payment.reference.trim().toLowerCase() === normalized,
    )
  );
}
