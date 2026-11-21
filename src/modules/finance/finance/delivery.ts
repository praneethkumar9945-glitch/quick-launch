import type { DeliveryProcessState, AdministrationDetailsSnapshot } from "./types";

export interface ReceiptPdfReference {
  paymentId: string;
  receiptNo: string;
  fileName: string;
  contentType: "application/pdf";
}

export interface PreparedPaymentConfirmation {
  idempotencyKey: string;
  paymentId: string;
  personId: string;
  recipient: string;
  subject: string;
  body: string;
  receipt: ReceiptPdfReference;
}

export interface EmailProviderAttachment {
  fileName: string;
  contentType: "application/pdf";
  content: Uint8Array;
}

export interface EmailProviderRequest {
  idempotencyKey: string;
  paymentId: string;
  recipient: string;
  subject: string;
  body: string;
  attachments: EmailProviderAttachment[];
}

// Provider acceptance is not final delivery; only a delivery callback confirms Sent.
export type EmailProviderResponse =
  | { accepted: true; providerReference?: (string) | undefined }
  | { accepted: false; providerReference?: string | undefined; errorDetails: string };

export interface AdministrationHandoffRequest {
  idempotencyKey: string;
  application: AdministrationDetailsSnapshot;
}

export type AdministrationHandoffResponse =
  | { accepted: true; admissionNo: string; providerReference?: (string) | undefined }
  | { accepted: false; providerReference?: string | undefined; errorDetails: string };

export function createEmailProviderRequest(
  prepared: PreparedPaymentConfirmation,
  pdfContent: Uint8Array,
): EmailProviderRequest {
  return {
    idempotencyKey: prepared.idempotencyKey,
    paymentId: prepared.paymentId,
    recipient: prepared.recipient,
    subject: prepared.subject,
    body: prepared.body,
    attachments: [
      {
        fileName: prepared.receipt.fileName,
        contentType: prepared.receipt.contentType,
        content: pdfContent,
      },
    ],
  };
}

export function createAdministrationHandoffRequest(
  idempotencyKey: string,
  application: AdministrationDetailsSnapshot,
): AdministrationHandoffRequest {
  return { idempotencyKey, application };
}

export type DeliveryProcess = "student-payment-confirmation" | "administration-handoff";

export type DeliveryConfirmationCallback = {
  idempotencyKey: string;
  process: DeliveryProcess;
  occurredAt: string;
} & (
  | { status: "delivered"; providerReference?: (string) | undefined }
  | { status: "failed"; errorDetails: string; providerReference?: (string) | undefined }
);

export interface PersistentDeliveryRecord<TPayload> {
  id: string;
  process: DeliveryProcess;
  idempotencyKey: string;
  payload: TPayload;
  state: DeliveryProcessState;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
}

export interface DeliveryRecordRepository {
  getByIdempotencyKey<TPayload>(key: string): Promise<PersistentDeliveryRecord<TPayload> | null>;
  save<TPayload>(record: PersistentDeliveryRecord<TPayload>): Promise<void>;
}

export interface EmailProviderAdapter {
  sendPaymentConfirmation(request: EmailProviderRequest): Promise<EmailProviderResponse>;
}

export interface AdministrationApiAdapter {
  sendApplicationHandoff(
    request: AdministrationHandoffRequest,
  ): Promise<AdministrationHandoffResponse>;
}

export function applyDeliveryConfirmation(
  current: DeliveryProcessState,
  expectedIdempotencyKey: string,
  expectedProcess: DeliveryProcess,
  callback: DeliveryConfirmationCallback,
): DeliveryProcessState {
  if (
    callback.idempotencyKey !== expectedIdempotencyKey ||
    callback.process !== expectedProcess ||
    current.status === "Sent"
  ) {
    return current;
  }
  if (callback.status === "delivered") {
    return {
      status: "Sent",
      sentAt: callback.occurredAt,
      providerReference: callback.providerReference,
    };
  }
  return {
    status: "Not Sent",
    latestFailedAttempt: {
      at: callback.occurredAt,
      errorDetails: callback.errorDetails,
    },
  };
}
