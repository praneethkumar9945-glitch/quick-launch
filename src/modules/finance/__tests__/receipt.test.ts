import "./setup";
import { describe, expect, it } from "vitest";
import { nextAvailableReceiptNumber, receiptFigures } from "@/modules/finance/finance/receipt";
import { seedPayments, seedTransactions } from "@/modules/finance/finance/data";
import { DEMO_SCENARIO_PAYMENT_SPECS } from "@/modules/finance/finance/feeWorkflowConfig";
import type { FeePayment, Student } from "@/modules/finance/finance/types";

const s = {
  id: "s1",
  name: "A",
  regNo: "R1",
  course: "C",
  phone: "",
  registeredOn: "2026-01-01",
  totalFee: 30000,
  installments: [
    { label: "I1", due: "2026-01-10", amount: 10000 },
    { label: "I2", due: "2026-02-10", amount: 10000 },
    { label: "I3", due: "2026-03-10", amount: 10000 },
  ],
} as Student;
const p = (id: string, date: string, amount: number, receiptNo: string): FeePayment => ({
  id,
  studentId: "s1",
  date,
  amount,
  method: "Cash",
  reference: "",
  receiptNo,
});
const later = p("b", "2026-02-01", 12000, "RC-2");
const first = p("a", "2026-01-05", 10000, "RC-1");
const all = [later, first];

describe("receipt figures", () => {
  it("balance counts payments up to this one by date, not today's outstanding", () => {
    expect(receiptFigures(s, first, all).balance).toBe(20000);
    expect(receiptFigures(s, later, all).balance).toBe(8000);
  });
  it("next due is the first installment not fully covered", () => {
    expect(receiptFigures(s, first, all).nextDue).toBe("2026-02-10");
    expect(receiptFigures(s, later, all).nextDue).toBe("2026-03-10");
  });
  it("no next due when fully paid", () => {
    expect(
      receiptFigures(s, p("c", "2026-03-01", 8000, "RC-3"), [
        ...all,
        p("c", "2026-03-01", 8000, "RC-3"),
      ]).nextDue,
    ).toBeNull();
  });

  it("allocates the next unused receipt number across existing receipt records", () => {
    expect(
      nextAvailableReceiptNumber("RCP-2026-", 1048, [
        "RCP-2026-1048",
        "RCP-2026-1049",
        "RCP-2026-1051",
      ]),
    ).toBe("RCP-2026-1050");
  });

  it("keeps seeded payment and transaction receipt numbers unique", () => {
    const receiptNumbers = [
      ...seedPayments.map((payment) => payment.receiptNo),
      ...seedTransactions.flatMap((transaction) =>
        transaction.receiptNo ? [transaction.receiptNo] : [],
      ),
      ...DEMO_SCENARIO_PAYMENT_SPECS.map((payment) => payment.receiptNo),
    ];
    expect(new Set(receiptNumbers).size).toBe(receiptNumbers.length);
  });
});
