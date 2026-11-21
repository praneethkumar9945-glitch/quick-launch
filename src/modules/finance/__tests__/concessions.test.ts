import "./setup";
import { describe, expect, it } from "vitest";
import {
  CONCESSION_STATUSES,
  adjustPlanForDiscount,
  requestedDiscountAmount,
  validateSubmission,
  applyApprovedConcession,
  forwardToDirector,
  normalizeConcessionRequest,
  recordDirectorDecision,
  receiveSubmission,
  saveReview,
  type ConcessionRequest,
  type ConcessionSubmission,
} from "@/modules/finance/finance/concessions";
import { personTotals } from "@/modules/finance/finance/feeWorkflow";
import type { FeeWorkflowPayment, Installment, Person } from "@/modules/finance/finance/types";

const submission: ConcessionSubmission = {
  studentName: "Test Student",
  branch: "Bengaluru Main Centre",
  applicationNo: "APP-1",
  requestedDate: "2026-11-01",
  contact: "9845000110",
  totalFees: 10000,
  eligibleFees: 8000,
  course: "Tally",
  courseDuration: "3 months",
  startingDate: "2026-11-10",
  amountAlreadyPaid: 500,
  concessionType: "Fixed Amount",
  requestedValue: 2000,
  reason: "Merit scholarship",
  declarationAccepted: true,
};

const plan: Installment[] = [
  { id: "p1-I01", label: "Admission Fee", amountDue: 2000, dueDate: "2026-11-15", reminders: [] },
  { id: "p1-I02", label: "Instalment 1", amountDue: 2000, dueDate: "2026-11-20", reminders: [] },
  { id: "p1-I03", label: "Instalment 2", amountDue: 3000, dueDate: "2026-10-01", reminders: [] },
  { id: "p1-I04", label: "Instalment 3", amountDue: 1500, dueDate: "2026-11-30", reminders: [] },
  { id: "p1-I05", label: "Instalment 4", amountDue: 1500, dueDate: "2026-12-30", reminders: [] },
];

const payment: FeeWorkflowPayment = {
  id: "pay-partial",
  personId: "p1",
  amount: 500,
  date: "2026-10-15",
  method: "UPI",
  reference: "TXN1",
  receiptNo: "RCP-1",
  allocations: [{ installmentId: "p1-I02", amount: 500 }],
  adminNotified: false,
  confirmation: { status: "Not Sent" },
};

const person: Person = {
  id: "p1",
  name: "Test Student",
  contact: "9845000110",
  email: "student@example.test",
  course: "Tally",
  appliedOn: "2026-10-01",
  applicationId: "APP-1",
  applicationStatus: "Reviewed",
  plan,
  adminNotifiedOfClearance: false,
};

function receivedRequest(): ConcessionRequest {
  const result = receiveSubmission([], {
    id: "r1",
    personId: "p1",
    submission,
    date: "2026-11-01T10:00:00Z",
    simulated: true,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function forwardedRequest(): ConcessionRequest {
  const reviewed = saveReview(
    receivedRequest(),
    { reviewedBy: "Accounts Officer", reviewDate: "2026-11-02", remarks: "Fee record checked." },
    "2026-11-02T10:00:00Z",
  );
  if (!reviewed.ok) throw new Error(reviewed.error);
  const forwarded = forwardToDirector(reviewed.value, "2026-11-02T11:00:00Z");
  if (!forwarded.ok) throw new Error(forwarded.error);
  return forwarded.value;
}

describe("Fee Concession workflow", () => {
  it("validates concession caps against eligible fees and de-duplicates by application number", () => {
    expect(
      requestedDiscountAmount({
        ...submission,
        concessionType: "Percentage",
        requestedValue: 10,
      }),
    ).toBe(800);
    expect(validateSubmission({ ...submission, requestedValue: 8001 })).toContain("eligible fees");
    const otherPersonSameApplication = receiveSubmission([receivedRequest()], {
      id: "r2",
      personId: "different-person",
      submission: { ...submission, applicationNo: " app-1 " },
      date: "2026-11-02",
      simulated: false,
    });
    expect(otherPersonSameApplication).toMatchObject({ ok: false });
  });

  it("uses only the four workflow statuses and records Admission submission", () => {
    expect(CONCESSION_STATUSES).toEqual([
      "Pending Accounts Review",
      "Pending Director Decision",
      "Approved",
      "Rejected",
    ]);
    const request = receivedRequest();
    expect(request.status).toBe("Pending Accounts Review");
    expect(request.history[0]).toMatchObject({
      actor: "Admission",
      toStatus: "Pending Accounts Review",
      text: expect.stringContaining("Admission (Sales)"),
    });
  });

  it("lets Accounts review and forward once, without an approval transition", () => {
    const request = receivedRequest();
    const reviewed = saveReview(
      request,
      { reviewedBy: "Accounts Officer", reviewDate: "2026-11-02" },
      "2026-11-02T10:00:00Z",
    );
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) return;

    const forwarded = forwardToDirector(reviewed.value, "2026-11-02T11:00:00Z");
    expect(forwarded.ok).toBe(true);
    if (!forwarded.ok) return;
    expect(forwarded.value.status).toBe("Pending Director Decision");
    expect(forwarded.value.history.at(-1)).toMatchObject({
      actor: "Accounts",
      toStatus: "Pending Director Decision",
      text: "Accounts forwarded the request to the Director",
    });
    expect(forwardToDirector(forwarded.value, "2026-11-02T11:01:00Z")).toMatchObject({
      ok: false,
    });
    expect(
      recordDirectorDecision(request, {
        decision: "Rejected",
        date: "2026-11-03",
        remarks: "Not eligible.",
      }),
    ).toMatchObject({ ok: false });
  });

  it("records an immutable Director decision and keeps the approved amount exact", () => {
    const forwarded = forwardedRequest();
    const result = recordDirectorDecision(forwarded, {
      decision: "Approved",
      date: "2026-11-03T09:00:00Z",
      approvedDiscount: 1234.5,
      remarks: "Approved as submitted.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("Approved");
    expect(result.value.directorDecision?.approvedDiscount).toBe(1234.5);
    expect(result.value.history.at(-1)).toMatchObject({
      actor: "Director",
      toStatus: "Approved",
      simulated: true,
    });
    expect(
      recordDirectorDecision(result.value, {
        decision: "Rejected",
        date: "2026-11-04",
        remarks: "Changing decision.",
      }),
    ).toMatchObject({ ok: false });
  });

  it("allocates only to eligible future unpaid course installments, last first", () => {
    const payments = [payment];
    const result = adjustPlanForDiscount(plan, payments, 2000, "2026-11-10");
    expect(result.unabsorbed).toBe(0);
    expect(result.plan.map((item) => item.amountDue)).toEqual([2000, 2000, 3000, 1000, 0]);
    expect(result.plan[3]).toMatchObject({ originalAmount: 1500, concessionAmount: 500 });
    expect(result.plan[4]).toMatchObject({ originalAmount: 1500, concessionAmount: 1500 });
    expect(result.adjustments.map((item) => item.installmentId)).toEqual(["p1-I05", "p1-I04"]);

    const insufficient = adjustPlanForDiscount(plan, payments, 3001, "2026-11-10");
    expect(insufficient.unabsorbed).toBe(1);
    expect(insufficient.plan[0]?.amountDue).toBe(2000);
    expect(insufficient.plan[1]?.amountDue).toBe(2000);
    expect(insufficient.plan[2]?.amountDue).toBe(3000);
  });

  it("applies the approved amount once and preserves payments and revised fee totals", () => {
    const approved = recordDirectorDecision(forwardedRequest(), {
      decision: "Approved",
      date: "2026-11-03T09:00:00Z",
      approvedDiscount: 2000,
      remarks: "Approved for the eligible course fees.",
    });
    if (!approved.ok) throw new Error(approved.error);

    const applied = applyApprovedConcession(approved.value, person, [payment], "2026-11-10");
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.request.status).toBe("Approved");
    expect(applied.value.request.applied?.approvedDiscount).toBe(2000);
    expect(
      applied.value.request.history.some((entry) => entry.text.includes("applied by Accounts")),
    ).toBe(true);
    expect(applied.value.plan.map((item) => item.amountDue)).toEqual([2000, 2000, 3000, 1000, 0]);
    expect(applied.value.plan[0]?.concessionAmount).toBeUndefined();
    expect(applied.value.plan[1]?.amountDue).toBe(2000);
    expect(applied.value.plan[2]?.amountDue).toBe(3000);
    expect(
      personTotals({ ...person, plan: applied.value.plan, feePayableOverride: 8000 }, [payment]),
    ).toMatchObject({ payable: 8000, paid: 500, outstanding: 7500 });
    expect(
      applyApprovedConcession(applied.value.request, person, [payment], "2026-11-11"),
    ).toMatchObject({ ok: false });
    expect(applied.value.request.applied?.planAfter).toEqual(applied.value.plan);
  });

  it("does not apply rejected requests or migrate old states into decision authority", () => {
    const rejected = recordDirectorDecision(forwardedRequest(), {
      decision: "Rejected",
      date: "2026-11-03T09:00:00Z",
      remarks: "Supporting documents do not meet the criteria.",
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.status).toBe("Rejected");
    expect(rejected.value.applied).toBeUndefined();
    expect(applyApprovedConcession(rejected.value, person, [payment], "2026-11-10")).toMatchObject({
      ok: false,
    });

    const legacy = normalizeConcessionRequest(
      JSON.parse(
        JSON.stringify({
          ...receivedRequest(),
          status: "Approved Concession Applied",
          directorDecision: {
            decision: "Approved",
            date: "2026-11-03",
            approvedDiscount: 2000,
            remarks: "Legacy decision",
            simulated: true,
          },
        }),
      ) as ConcessionRequest,
    );
    expect(legacy.status).toBe("Approved");
  });
});
