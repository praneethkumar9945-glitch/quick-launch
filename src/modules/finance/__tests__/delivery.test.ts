import "./setup";
import { describe, expect, it } from "vitest";
import {
  applyDeliveryConfirmation,
  createAdministrationHandoffRequest,
  createEmailProviderRequest,
  type PreparedPaymentConfirmation,
} from "@/modules/finance/finance/delivery";

const prepared: PreparedPaymentConfirmation = {
  idempotencyKey: "student-payment-confirmation:payment-1",
  paymentId: "payment-1",
  personId: "person-1",
  recipient: "student@example.com",
  subject: "Payment confirmation",
  body: "Payment recorded",
  receipt: {
    paymentId: "payment-1",
    receiptNo: "RCP-1",
    fileName: "Receipt-RCP-1.pdf",
    contentType: "application/pdf",
  },
};

describe("delivery integration contracts", () => {
  it("builds a provider email request with the associated PDF attachment", () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70]);
    const request = createEmailProviderRequest(prepared, pdfContent);

    expect(request.idempotencyKey).toBe(prepared.idempotencyKey);
    expect(request.paymentId).toBe(prepared.paymentId);
    expect(request.attachments).toEqual([
      {
        fileName: "Receipt-RCP-1.pdf",
        contentType: "application/pdf",
        content: pdfContent,
      },
    ]);
  });

  it("builds an Administration request with its stable idempotency key and snapshot", () => {
    const application = {
      personId: "person-1",
      applicationId: "APP-1",
      name: "Student",
      contact: "123",
      email: "student@example.com",
      course: "Course",
      appliedOn: "2026-10-01",
      applicationForm: undefined,
      paymentSummary: {
        payments: [],
        totalPaid: 0,
        installmentsPaid: 0,
        outstanding: 0,
      },
    };

    expect(
      createAdministrationHandoffRequest("administration-handoff:person-1:APP-1", application),
    ).toEqual({
      idempotencyKey: "administration-handoff:person-1:APP-1",
      application,
    });
  });

  it("changes delivery state only for a matching confirmed callback", () => {
    const notSent = { status: "Not Sent" } as const;
    const mismatched = applyDeliveryConfirmation(
      notSent,
      prepared.idempotencyKey,
      "student-payment-confirmation",
      {
        idempotencyKey: "another-payment",
        process: "student-payment-confirmation",
        status: "delivered",
        occurredAt: "2026-10-03T10:00:00.000Z",
      },
    );
    expect(mismatched).toBe(notSent);
    const wrongProcess = applyDeliveryConfirmation(
      notSent,
      prepared.idempotencyKey,
      "student-payment-confirmation",
      {
        idempotencyKey: prepared.idempotencyKey,
        process: "administration-handoff",
        status: "delivered",
        occurredAt: "2026-10-03T10:00:00.000Z",
      },
    );
    expect(wrongProcess).toBe(notSent);

    const failed = applyDeliveryConfirmation(
      notSent,
      prepared.idempotencyKey,
      "student-payment-confirmation",
      {
        idempotencyKey: prepared.idempotencyKey,
        process: "student-payment-confirmation",
        status: "failed",
        occurredAt: "2026-10-03T10:00:00.000Z",
        errorDetails: "Provider unavailable",
      },
    );
    expect(failed).toEqual({
      status: "Not Sent",
      latestFailedAttempt: {
        at: "2026-10-03T10:00:00.000Z",
        errorDetails: "Provider unavailable",
      },
    });
    const retriedFailure = applyDeliveryConfirmation(
      { status: "Sending…", attemptStartedAt: "2026-10-03T10:04:00.000Z" },
      prepared.idempotencyKey,
      "student-payment-confirmation",
      {
        idempotencyKey: prepared.idempotencyKey,
        process: "student-payment-confirmation",
        status: "failed",
        occurredAt: "2026-10-03T10:05:00.000Z",
        errorDetails: "Provider still unavailable",
      },
    );
    expect(retriedFailure).toEqual({
      status: "Not Sent",
      latestFailedAttempt: {
        at: "2026-10-03T10:05:00.000Z",
        errorDetails: "Provider still unavailable",
      },
    });

    const sent = applyDeliveryConfirmation(
      failed,
      prepared.idempotencyKey,
      "student-payment-confirmation",
      {
        idempotencyKey: prepared.idempotencyKey,
        process: "student-payment-confirmation",
        status: "delivered",
        occurredAt: "2026-10-03T10:05:00.000Z",
        providerReference: "provider-ref-1",
      },
    );
    expect(sent).toEqual({
      status: "Sent",
      sentAt: "2026-10-03T10:05:00.000Z",
      providerReference: "provider-ref-1",
    });
    expect(
      applyDeliveryConfirmation(sent, prepared.idempotencyKey, "student-payment-confirmation", {
        idempotencyKey: prepared.idempotencyKey,
        process: "student-payment-confirmation",
        status: "failed",
        occurredAt: "2026-10-03T10:06:00.000Z",
        errorDetails: "Delayed failure callback",
      }),
    ).toBe(sent);
  });
});
