import { ADMISSION_FEE_LABEL } from "./labels";
import type { PreparedPaymentConfirmation } from "./delivery";

export type PaymentMethod =
  "Cash" | "UPI" | "Bank Transfer" | "Debit Card" | "Credit Card" | "Cheque" | "Card" | "Other";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "Bank Transfer", "Cheque"];
export const INCOME_PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Debit Card",
  "Credit Card",
  "Cheque",
];
export const TRANSACTION_PAYMENT_METHODS: PaymentMethod[] = [
  ...INCOME_PAYMENT_METHODS,
  "Card",
  "Other",
];
export const PAYMENT_MODES = ["Full Payment", "Partial Payment", "Advance Payment"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface Student {
  id: string;
  applicationId?: string | undefined;
  name: string;
  regNo: string;
  admissionStatus?: AdmissionStatus | undefined;
  course: string;
  department?: string | undefined;
  phone: string;
  email?: string | undefined;
  registeredOn: string;
  totalFee: number;
  installments: StudentInstallment[];
  courseId?: string | undefined;
  track?: "Fast Track" | "Normal Track" | undefined;
  duration?: CourseDuration | undefined;
  batch?: string | undefined;
  applicationDetails?: StudentApplicationDetails | undefined;
}

export interface StudentInstallment {
  label: string;
  due: string;
  amount: number;
  originalAmount?: number | undefined;
  concessionAmount?: number | undefined;
}

export interface StudentApplicationDetails {
  dateOfBirth: string;
  passportPhoto?: { fileName: string; previewUrl: string } | undefined;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  educationWorkExperience: string;
  leadSource: string;
  leadReference: string;
  coursePreference: string;
  installmentPreference: number;
  documents: {
    type: "ID proof" | "Address proof" | "Latest marksheet" | "TC";
    fileName?: string | undefined;
    fileUrl?: string | undefined;
    provided: boolean;
  }[];
  documentsEnclosed?: string[] | undefined;
  declarationAccepted: boolean;
}

export interface InstallmentReminder {
  date: string;
  text: string;
  id?: string | undefined;
}

export interface Installment {
  id: string;
  label: string;
  amountDue: number;
  dueDate: string;
  reminders: InstallmentReminder[];
  originalAmount?: number | undefined;
  concessionAmount?: number | undefined;
}

export const displayInstallmentLabel = (label: string) =>
  label.replaceAll("Instalment", "Installment");

export type ApplicationStatus = "Received" | "Reviewed" | "Payment Recorded" | "Admitted";
export type AdmissionStatus = "Applicant" | "Admitted";
export type FeeWorkflowPaymentStatus = "Unpaid" | "Partially paid" | "Paid";

export interface Person {
  id: string;
  name: string;
  contact: string;
  email: string;
  course: string;
  appliedOn: string;
  applicationId: string;
  admissionNo?: string | undefined;
  applicationStatus: ApplicationStatus;
  accountantVerifiedAt?: string | undefined;
  /** Application-level rejection by Finance; the record and its documents are preserved. */
  applicationRejection?: ApplicationRejection | undefined;
  documentVerifications?: DocumentVerification[] | undefined;
  admissionStatus?: AdmissionStatus | undefined;
  paymentStatus?: FeeWorkflowPaymentStatus | undefined;
  billCreated?: boolean | undefined;
  /** Revised concession payable when paid installments prevent schedule cuts from absorbing the full discount. */
  feePayableOverride?: number | undefined;
  plan: Installment[];
  adminNotifiedOfClearance: boolean;
  applicationDetails?: StudentApplicationDetails | undefined;
}

export interface ApplicationRejection {
  reason: string;
  date: string;
  reviewer: string;
  missingDocuments: string[];
}

export interface DocumentVerificationEvent {
  status: "Approved" | "Rejected";
  decision?: "Approved" | "Rejected" | undefined;
  previousStatus?: "Missing" | "Pending" | "Rejected" | "Approved" | undefined;
  date: string;
  fileName?: string | undefined;
  fileUrl?: string | undefined;
  sourceFingerprint: string;
  reason?: string | undefined;
  reviewer?: string | undefined;
  correctionRequestReference?: string | undefined;
}

export interface DocumentCorrectionHistoryEvent {
  action: "Requested" | "Documents added" | "Request updated" | "Resubmitted";
  date: string;
  actor: string;
  documentTypes: StudentApplicationDetails["documents"][number]["type"][];
}

export interface DocumentCorrectionItem {
  documentType: StudentApplicationDetails["documents"][number]["type"];
  issue: "Missing" | "Rejected";
  reason: string;
  resubmittedAt?: string | undefined;
  resubmittedFileUrl?: string | undefined;
}

export interface DocumentCorrectionRequest {
  id: string;
  personId: string;
  applicationId: string;
  studentName: string;
  studentContact: string;
  documents: DocumentCorrectionItem[];
  requestedAt: string;
  requestedBy: string;
  status: "Awaiting Resubmission" | "Resubmitted";
  resubmittedAt?: string | undefined;
  history?: DocumentCorrectionHistoryEvent[] | undefined;
}

export interface DocumentVerification {
  documentType: StudentApplicationDetails["documents"][number]["type"];
  status: "Approved" | "Rejected";
  date: string;
  fileName?: string | undefined;
  sourceFingerprint: string;
  reason?: string | undefined;
  history: DocumentVerificationEvent[];
}

export interface InstallmentAllocation {
  installmentId: string;
  amount: number;
}

export type DeliveryStatus = "Not Sent" | "Sending…" | "Sent";

export type DeliveryProcessState =
  | {
      status: "Not Sent" | "Sending…";
      attemptStartedAt?: string | undefined;
      latestFailedAttempt?: { at: string; errorDetails: string } | undefined;
      sentAt?: never | undefined;
      providerReference?: never | undefined;
    }
  | {
      status: "Sent";
      sentAt: string;
      providerReference?: string | undefined;
      attemptStartedAt?: never | undefined;
      latestFailedAttempt?: never | undefined;
    };

export interface FeeWorkflowPayment {
  id: string;
  personId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  receiptNo: string;
  allocations: InstallmentAllocation[];
  adminNotified: boolean;
  confirmation: DeliveryProcessState;
  confirmationRequest?: PreparedPaymentConfirmation | undefined;
}

export type HandoffTarget = "Administration";
export type HandoffStatus = "Ready" | "Simulated (not delivered)" | "Completed";

/** Frozen handoff snapshot for the Administration integration boundary. No Admission No. is generated here. */
export interface AdministrationDetailsSnapshot {
  personId: string;
  applicationId: string;
  name: string;
  contact: string;
  email: string;
  course: string;
  appliedOn: string;
  /** Complete application form as received; undefined fields stay undefined. */
  applicationForm: StudentApplicationDetails | undefined;
  paymentSummary: {
    payments: {
      date: string;
      amount: number;
      method: PaymentMethod;
      receiptNo: string;
      installmentsCovered: { label: string; amount: number }[];
    }[];
    totalPaid: number;
    installmentsPaid: number;
    outstanding: number;
  };
}

export interface HandoffHistoryEntry {
  date: string;
  text: string;
  referenceId?: string | undefined;
  /** Frozen copy stored with the local Administration handoff simulation. */
  snapshot?: AdministrationDetailsSnapshot | undefined;
  paymentNotification?:
    | {
        date: string;
        amount: number;
        installmentsCovered: { label: string; amount: number }[];
        remainingBalance: number;
      }
    | undefined;
}

export interface Handoff {
  personId: string;
  target: HandoffTarget;
  status: HandoffStatus;
  history: HandoffHistoryEntry[];
  delivery?: DeliveryProcessState | undefined;
  idempotencyKey?: string | undefined;
}

export type CourseDurationUnit = "days" | "months" | "years";
export interface CourseDuration {
  value: number;
  unit: CourseDurationUnit;
}
export interface Course {
  id: string;
  serialNumber: number;
  name: string;
  department: string;
  fee?: number | undefined;
  fastTrack: CourseDuration;
  normalTrack?: CourseDuration | undefined;
  status: "Active" | "Inactive";
}
export interface CourseChange {
  id: string;
  courseId: string;
  courseName: string;
  field: "Department" | "Fee" | "Duration" | "Status";
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}
export interface CourseCatalog {
  departments: string[];
  courses: Course[];
  history: CourseChange[];
}

/** A student fee payment. Recorded once; bills, receipts, settlements and reports reference it. */
export interface FeePayment {
  id: string;
  studentId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  receiptNo: string;
  allocations?: InstallmentAllocation[] | undefined;
  towards?: PaymentTowards | undefined;
  towardsOther?: string | undefined;
}
export const PAYMENT_TOWARDS = [ADMISSION_FEE_LABEL, "Instalments", "Exam fee", "Other"] as const;
export type PaymentTowards = (typeof PAYMENT_TOWARDS)[number];

export interface FeeReminder {
  id: string;
  sentAt: string;
  studentId: string;
  phone: string;
  email?: string | undefined;
  amountDue: number;
  message: string;
}

export interface Transaction {
  id: string;
  type: "income" | "expense";
  date: string;
  description: string;
  category: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  status: "Posted" | "Pending" | "Approved";
  receiptNo?: string | undefined;
  bankReference?: string | undefined;
  to?: string | undefined;
  paymentMode?: PaymentMode | undefined;
}

export interface PettyEntry {
  id: string;
  date: string;
  kind: "received" | "paid";
  category: string;
  amount: number;
  description: string;
  reference: string;
  to?: string | undefined;
}

export interface Settlement {
  id: string;
  date: string;
  method: PaymentMethod;
  count: number;
  recorded: number;
  actual: number | null;
  notes: string;
  finalized: boolean;
}

export type InstallmentStatus = "Paid" | "Partially Paid" | "Pending" | "Overdue";
export type SettlementStatus = "Matched" | "Difference Found" | "Pending Review" | "Finalized";
