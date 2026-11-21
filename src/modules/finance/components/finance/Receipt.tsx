import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/modules/finance/components/ui/button";
import { useFinance } from "@/modules/finance/finance/store";
import { personTotals } from "@/modules/finance/finance/feeWorkflow";
import { amountInWords, formatDate, formatINR } from "@/modules/finance/finance/logic";
import { studentCourse } from "@/modules/finance/finance/courses";
import { receiptFigures } from "@/modules/finance/finance/receipt";
import type { FeeWorkflowPayment } from "@/modules/finance/finance/types";
import {
  displayInstallmentLabel,
  PAYMENT_TOWARDS,
  type FeePayment,
  type PaymentMethod,
} from "@/modules/finance/finance/types";
const skillAiReceiptLogoUrl = "/skill-ai-logo-transparent.png";

const MODES: { label: string; methods: PaymentMethod[] }[] = [
  { label: "Cash", methods: ["Cash"] },
  { label: "UPI", methods: ["UPI"] },
  { label: "Cheque", methods: ["Cheque"] },
  { label: "Bank transfer", methods: ["Bank Transfer"] },
];

function Box({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="receipt-option">
      <span className="receipt-box" aria-hidden>
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
      <span className="sr-only">{checked ? "(selected)" : ""}</span>
    </span>
  );
}

function Row({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean | undefined;
}) {
  return (
    <div className={`receipt-row${wide ? " receipt-row--wide" : ""}`}>
      <span className="receipt-label">{label}</span>
      <span className="receipt-value">{children}</span>
    </div>
  );
}

function printReceipt() {
  const root = document.documentElement;
  const done = () => {
    root.classList.remove("printing-fee-receipt");
    window.removeEventListener("afterprint", done);
  };
  root.classList.add("printing-fee-receipt");
  window.addEventListener("afterprint", done);
  window.print();
}

function ReceiptHeader() {
  return (
    <div className="receipt-header">
      <img src={skillAiReceiptLogoUrl} alt="Skill AI" className="receipt-logo" />
      <h2 className="receipt-title">FEE RECEIPT</h2>
    </div>
  );
}

function ReceiptOfficer({ date }: { date: string }) {
  return (
    <>
      <div className="receipt-officer">
        <span className="receipt-officer-line" aria-hidden />
        <span className="receipt-officer-name">Accounts Officer</span>
        <span className="receipt-officer-date">{date}</span>
      </div>
      <div className="receipt-footer">
        <span className="receipt-footer-line" aria-hidden />
        <span>
          Paradigm Plaza, Near A.B Shetty Circle, Pandeshwar, Mangalore, Dakshina Kannada - 575001
        </span>
        <span className="receipt-footer-contact">
          <span className="receipt-footer-icon">☎</span> 8792239090 |{" "}
          <span className="receipt-footer-icon">✉</span>{" "}
          <a href="mailto:enquiry@themgr.in">enquiry@themgr.in</a>
        </span>
      </div>
    </>
  );
}

export function Receipt({
  payment,
  workflowPayment,
}: {
  payment?: FeePayment | undefined;
  workflowPayment?: FeeWorkflowPayment | undefined;
}) {
  const finance = useFinance();
  if (workflowPayment) return <WorkflowReceipt payment={workflowPayment} />;
  if (!payment) return null;
  const mirroredWorkflowPayment = finance.feeWorkflow.payments.find(
    (item) => item.id === payment.id,
  );
  if (mirroredWorkflowPayment) return <WorkflowReceipt payment={mirroredWorkflowPayment} />;
  const { students, payments, courseCatalog } = finance;
  const s = students.find((x) => x.id === payment.studentId);
  if (!s) return null;
  const { balance, nextDue } = receiptFigures(s, payment, payments);
  const course = studentCourse(s, courseCatalog)?.name ?? s.course;
  const courseLine = [s.track ? `${course} · ${s.track}` : course, s.batch]
    .filter(Boolean)
    .join(" / ");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="print-area fee-receipt-print receipt-paper">
          <ReceiptHeader />
          <div className="receipt-top">
            <span>
              <span className="receipt-accent">Receipt No.:</span>{" "}
              <span className="num">{payment.receiptNo}</span>
            </span>
            <span>
              <span className="receipt-accent">Date:</span> {formatDate(payment.date)}
            </span>
          </div>
          <div className="receipt-grid">
            <Row label="Student Name">{s.name}</Row>
            <Row label="Course / Batch">{courseLine}</Row>
            <Row label="Application No.">{s.applicationId || "—"}</Row>
            <Row label="Admission No.">{s.regNo || "Not Yet Assigned"}</Row>
          </div>
          <div className="receipt-grid">
            <Row label="Payment towards" wide>
              <span className="receipt-options">
                {PAYMENT_TOWARDS.map((t) => (
                  <Box key={t} label={displayInstallmentLabel(t)} checked={payment.towards === t} />
                ))}
                {payment.towards === "Other" && payment.towardsOther ? (
                  <span>: {payment.towardsOther}</span>
                ) : null}
              </span>
            </Row>
          </div>
          <h3 className="receipt-section receipt-accent">PAYMENT DETAILS</h3>
          <div className="receipt-grid">
            <Row label="Amount received (Rs.)">
              <span className="num">{formatINR(payment.amount)}</span>
            </Row>
            <Row label="Amount in words" wide>
              {amountInWords(payment.amount)}
            </Row>
            <Row label="Payment mode">
              <span className="receipt-options">
                {MODES.map((m) => (
                  <Box key={m.label} label={m.label} checked={m.methods.includes(payment.method)} />
                ))}
              </span>
            </Row>
            {payment.reference && <Row label="Transaction reference">{payment.reference}</Row>}
            <Row label="Balance fee after this payment (Rs.)">
              <span className="num">{formatINR(balance)}</span>
            </Row>
            {nextDue ? <Row label="Next due date">{formatDate(nextDue)}</Row> : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Note: Fees once paid are non-refundable.</p>
          <ReceiptOfficer date={formatDate(payment.date)} />
        </div>
      </div>
      <div className="no-print flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        <Button onClick={printReceipt}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  );
}

function WorkflowReceipt({ payment }: { payment: FeeWorkflowPayment }) {
  const { feeWorkflow } = useFinance();
  const person = feeWorkflow.persons.find((item) => item.id === payment.personId);
  if (!person) return null;
  const allPayments = feeWorkflow.payments
    .filter((item) => item.personId === person.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const paymentIndex = allPayments.findIndex((item) => item.id === payment.id);
  const paymentsThroughReceipt =
    paymentIndex < 0 ? [...allPayments, payment] : allPayments.slice(0, paymentIndex + 1);
  const figures = personTotals(person, paymentsThroughReceipt);
  const covered = payment.allocations.map((allocation) => ({
    ...allocation,
    label:
      person.plan.find((installment) => installment.id === allocation.installmentId)?.label ??
      "Installment",
  }));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="print-area fee-receipt-print receipt-paper">
          <ReceiptHeader />
          <div className="receipt-top">
            <span>
              <span className="receipt-accent">Receipt No.:</span>{" "}
              <span className="num">{payment.receiptNo}</span>
            </span>
            <span>
              <span className="receipt-accent">Date:</span> {formatDate(payment.date)}
            </span>
          </div>
          <div className="receipt-grid">
            <Row label="Student Name">{person.name}</Row>
            <Row label="Course / Batch">{person.course}</Row>
            <Row label="Application No.">{person.applicationId || "—"}</Row>
            <Row label="Admission No.">
              {person.admissionNo || "Not Yet Assigned"}
            </Row>
          </div>
          <h3 className="receipt-section receipt-accent">PAYMENT DETAILS</h3>
          <div className="receipt-grid">
            <Row label="Amount received (Rs.)">
              <span className="num">{formatINR(payment.amount)}</span>
            </Row>
            <Row label="Amount in words" wide>
              {amountInWords(payment.amount)}
            </Row>
            <Row label="Payment mode">{payment.method}</Row>
            {payment.reference && <Row label="Transaction reference">{payment.reference}</Row>}
            <Row label="Balance fee after this payment (Rs.)">
              <span className="num">{formatINR(figures.outstanding)}</span>
            </Row>
            {covered.length > 0 ? (
              <Row label="Installment(s) covered" wide>
                <span>
                  {covered
                    .map(
                      (allocation) =>
                        `${displayInstallmentLabel(allocation.label)}: ${formatINR(allocation.amount)}`,
                    )
                    .join(" · ")}
                </span>
              </Row>
            ) : null}
            {figures.nextDueInstallment ? (
              <Row label="Next installment due">
                {`${displayInstallmentLabel(figures.nextDueInstallment.label)} · ${formatDate(figures.nextDueInstallment.dueDate)}`}
              </Row>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Note: Fees once paid are non-refundable.</p>
          <ReceiptOfficer date={formatDate(payment.date)} />
        </div>
      </div>
      <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-6">
        <Button onClick={printReceipt}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  );
}
