import "./setup";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordPaymentProvider } from "@/modules/finance/components/finance/RecordPaymentProvider";
import { useRecordPayment } from "@/modules/finance/components/finance/RecordPaymentContext";
import { formatDate, formatINR, TODAY } from "@/modules/finance/finance/logic";
import { allocatePayment, installmentOutstanding, personTotals } from "@/modules/finance/finance/feeWorkflow";
import { displayInstallmentLabel } from "@/modules/finance/finance/types";
import { FinanceProvider, useFinance } from "@/modules/finance/finance/store";

beforeEach(() => {
  window.localStorage.removeItem("finance-concessions-v1");
  window.localStorage.removeItem("finance-document-verifications-v1");
});

function PaymentHarness() {
  const finance = useFinance();
  const { open } = useRecordPayment();
  const approvedRequest = finance.concessions.find((item) => item.status === "Approved");
  const noConcessionPerson = finance.feeWorkflow.persons.find(
    (person) =>
      person.applicationDetails &&
      !person.accountantVerifiedAt &&
      !finance.concessions.some((request) => request.personId === person.id),
  );
  const pendingRequest = finance.concessions.find(
    (item) => item.status === "Pending Accounts Review",
  );
  const rejectedRequest = finance.concessions.find((item) => item.status === "Rejected");
  const historyPayment = finance.feeWorkflow.payments[0];
  const historyPerson = finance.feeWorkflow.persons.find(
    (person) => person.id === historyPayment?.personId,
  );
  const [multiInstallmentPersonId] = useState(
    () =>
      finance.feeWorkflow.persons.find((person) => {
        const personPayments = finance.feeWorkflow.payments.filter(
          (payment) => payment.personId === person.id,
        );
        return (
          !!person.applicationDetails &&
          !!person.accountantVerifiedAt &&
          person.plan.filter(
            (installment) => installmentOutstanding(installment, personPayments) > 0,
          ).length >= 2 &&
          !finance.concessions.some(
            (request) => request.personId === person.id && request.status === "Approved",
          )
        );
      })?.id,
  );
  const multiInstallmentPerson = finance.feeWorkflow.persons.find(
    (person) => person.id === multiInstallmentPersonId,
  );
  const fixtureInstallments = multiInstallmentPerson
    ? multiInstallmentPerson.plan
        .map((installment) => ({
          installment,
          outstanding: installmentOutstanding(
            installment,
            finance.feeWorkflow.payments.filter(
              (payment) => payment.personId === multiInstallmentPerson.id,
            ),
          ),
        }))
        .filter((item) => item.outstanding > 0)
        .slice(0, 2)
    : [];
  const openWithUploadedDocuments = (person: (typeof finance.feeWorkflow.persons)[number]) => {
    const applicationDetails = person.applicationDetails;
    if (!applicationDetails) throw new Error("Expected an application form fixture.");
    const updatedPerson = {
      ...person,
      accountantVerifiedAt: undefined,
      applicationDetails: {
        ...applicationDetails,
        documents: applicationDetails.documents.map((document) => ({
          ...document,
          provided: true,
          fileName: document.fileName ?? `${document.type}.pdf`,
          fileUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
        })),
      },
    };
    finance.updateFeeWorkflowPerson(updatedPerson);
    open(updatedPerson.id);
  };

  return (
    <div>
      {noConcessionPerson && (
        <>
          <output
            data-testid="student-fixture"
            data-name={noConcessionPerson.name}
            data-admission-no={noConcessionPerson.admissionNo ?? "Not issued"}
            data-email={noConcessionPerson.email || "Not provided"}
            data-course={noConcessionPerson.course}
          />
          <button onClick={() => open(noConcessionPerson.id)}>
            Open student without concession
          </button>
          <button onClick={() => openWithUploadedDocuments(noConcessionPerson)}>
            Open student with uploaded documents
          </button>
          <button
            onClick={() => {
              finance.updateFeeWorkflowPerson({
                ...noConcessionPerson,
                applicationStatus: "Reviewed",
                accountantVerifiedAt: new Date().toISOString(),
              });
              open(noConcessionPerson.id);
            }}
          >
            Open verified student without concession
          </button>
          <button
            onClick={() => {
              const personPayments = finance.feeWorkflow.payments.filter(
                (payment) => payment.personId === noConcessionPerson.id,
              );
              const outstanding = personTotals(noConcessionPerson, personPayments).outstanding;
              if (outstanding > 0) {
                finance.recordFeeWorkflowPayment({
                  personId: noConcessionPerson.id,
                  amount: outstanding,
                  date: TODAY,
                  method: "Cash",
                  reference: "",
                  receiptNo: "TEST-REVIEW-FULLY-PAID",
                  allocations: allocatePayment(
                    noConcessionPerson.plan,
                    personPayments,
                    outstanding,
                  ),
                  confirmation: { status: "Not Sent" },
                });
              }
              finance.updateFeeWorkflowPerson({
                ...noConcessionPerson,
                accountantVerifiedAt: undefined,
              });
              open(noConcessionPerson.id);
            }}
          >
            Open fully paid unverified student
          </button>
          <button
            onClick={() => {
              const personPayments = finance.feeWorkflow.payments.filter(
                (payment) => payment.personId === noConcessionPerson.id,
              );
              const amount = Math.min(
                1,
                personTotals(noConcessionPerson, personPayments).outstanding,
              );
              const payment = {
                personId: noConcessionPerson.id,
                amount,
                date: TODAY,
                method: "Cash" as const,
                reference: "",
                receiptNo: `TEST-CONFIRMATION-${noConcessionPerson.id}`,
                allocations: allocatePayment(noConcessionPerson.plan, personPayments, amount),
                confirmation: { status: "Not Sent" as const },
              };
              finance.recordFeeWorkflowPayment(payment);
              finance.recordFeeWorkflowPayment(payment);
            }}
          >
            Record confirmation delivery fixture
          </button>
        </>
      )}
      {approvedRequest && (
        <>
          <button onClick={() => open(approvedRequest.personId)}>Open approved request</button>
          <button
            disabled={!!approvedRequest.applied}
            onClick={() => finance.applyConcession(approvedRequest.id)}
          >
            Apply approved concession
          </button>
        </>
      )}
      {pendingRequest && (
        <button onClick={() => open(pendingRequest.personId)}>Open pending request</button>
      )}
      {rejectedRequest && (
        <button onClick={() => open(rejectedRequest.personId)}>Open rejected request</button>
      )}
      {historyPayment && historyPerson && (
        <>
          <output
            data-testid="payment-history-fixture"
            data-name={historyPerson.name}
            data-receipt={historyPayment.receiptNo}
            data-date={historyPayment.date}
            data-method={historyPayment.method}
          />
          <button onClick={() => open(historyPerson.id)}>Open payment history fixture</button>
        </>
      )}
      {multiInstallmentPerson && (
        <button onClick={() => openWithUploadedDocuments(multiInstallmentPerson)}>
          Open multi-installment student
        </button>
      )}
      <output data-testid="workflow-payment-count">{finance.feeWorkflow.payments.length}</output>
      <output data-testid="confirmation-delivery-record">
        {JSON.stringify(
          finance.feeWorkflow.payments
            .filter((payment) => payment.receiptNo.startsWith("TEST-CONFIRMATION-"))
            .map((payment) => ({
              confirmation: payment.confirmation,
              confirmationRequest: payment.confirmationRequest,
            })),
        )}
      </output>
      <output data-testid="latest-multi-payment-allocations">
        {JSON.stringify(
          multiInstallmentPerson
            ? (finance.feeWorkflow.payments
                .filter((payment) => payment.personId === multiInstallmentPerson.id)
                .at(-1)?.allocations ?? [])
            : [],
        )}
      </output>
      <output data-testid="allocation-fixture">
        {fixtureInstallments.map(({ installment, outstanding }) => (
          <span
            key={installment.id}
            data-testid="allocation-fixture-item"
            data-installment-id={installment.id}
            data-label={displayInstallmentLabel(installment.label)}
            data-outstanding={outstanding}
          />
        ))}
      </output>
      <output data-testid="billing-total">
        {formatINR(
          finance.students.find((student) => student.id === approvedRequest?.personId)?.totalFee ??
            0,
        )}
      </output>
    </div>
  );
}

function renderPaymentHarness() {
  return render(
    <FinanceProvider>
      <RecordPaymentProvider>
        <PaymentHarness />
      </RecordPaymentProvider>
    </FinanceProvider>,
  );
}

describe("Record Payment concession integration", () => {
  it.each([
    ["Open pending request", "pending"],
    ["Open rejected request", "rejected"],
  ])("does not display an unapplied %s concession as a discount", async (buttonName) => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    const dialog = await screen.findByRole("dialog");
    const schedule = within(dialog).getAllByRole("table")[0]!;
    const rows = Array.from(schedule.querySelectorAll("tbody tr"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows as HTMLTableRowElement[]) {
      expect(row.cells[3]?.textContent).toBe(formatINR(0));
    }
  });

  it("reviews an unverified application and resumes payment in the same modal", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open student with uploaded documents" }));

    const studentFixture = screen.getByTestId("student-fixture");
    const dialog = await screen.findByRole("dialog", { name: studentFixture.dataset["name"]! });
    expect(dialog).toHaveTextContent("Fee payable");
    expect(dialog).toHaveTextContent("Paid");
    expect(dialog).toHaveTextContent("Outstanding");
    expect(dialog).toHaveTextContent("Next due");
    expect(dialog).toHaveTextContent("Installment Schedule");
    expect(dialog).toHaveTextContent("Payment Details");
    expect(dialog).toHaveTextContent(studentFixture.dataset["name"]!);
    expect(dialog).toHaveTextContent(studentFixture.dataset["email"]!);
    expect(dialog).toHaveTextContent(studentFixture.dataset["course"]!);
    expect(dialog).not.toHaveTextContent("Fee concession summary");
    expect(dialog).toHaveTextContent("Review this application before recording payment.");
    expect(screen.queryByLabelText("Amount (₹)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review Application" }));

    const reviewDialog = await screen.findByRole("dialog", { name: "Review application" });
    expect(reviewDialog).toHaveTextContent("Application No.");
    expect(reviewDialog).not.toHaveTextContent("STUDENT DETAILS");
    const previewButtons = within(reviewDialog).getAllByRole("button", { name: /^Preview / });
    expect(previewButtons.length).toBeGreaterThan(0);
    for (const previewButton of previewButtons) {
      fireEvent.click(previewButton);
      expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    }

    const verifyDialog = await screen.findByRole("dialog", { name: "Review application" });
    expect(within(verifyDialog).getByText("Pending")).toBeInTheDocument();
    expect(within(verifyDialog).getByRole("button", { name: "Verify application" })).toBeEnabled();
    expect(screen.queryByLabelText("Amount (₹)")).not.toBeInTheDocument();
    fireEvent.click(within(verifyDialog).getByRole("button", { name: "Verify application" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Review application" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Amount (₹)")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Receipt No.")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Receipt No.").getAttribute("value")).toMatch(/^RCP-/);
    expect(screen.getByLabelText("Date")).toHaveValue(formatDate(TODAY));
    expect(screen.getByLabelText("Date")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Date")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Date")).toHaveClass("bg-muted/30");
    expect(screen.getByLabelText("Method")).toBeInTheDocument();
    expect(document.getElementById("record-payment-target")).toHaveTextContent(
      "Automatic · oldest outstanding first",
    );
    expect(screen.getAllByRole("button", { name: "Generate Receipt" })).toHaveLength(1);
    expect(dialog).not.toHaveTextContent(/Auto \(.*unpaid\)/);
    expect(
      Array.from(document.querySelectorAll("#record-payment-form label"))
        .slice(0, 5)
        .map((label) => label.textContent?.trim()),
    ).toEqual(["Receipt No.", "Date", "Method", "Amount (₹)", "Pay Toward"]);

    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "100" } });
    document.getElementById("record-payment-form")!.setAttribute("data-enter-nav", "off");
    fireEvent.click(screen.getByLabelText("Method"));
    fireEvent.click(await screen.findByRole("option", { name: "Bank Transfer" }));
    expect(screen.getByLabelText("Bank Reference / UTR No.")).toHaveAttribute(
      "placeholder",
      "NEFT, RTGS or IMPS reference",
    );
    expect(screen.getByText("Bank reference / UTR no. is required.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Method"));
    fireEvent.click(await screen.findByRole("option", { name: "Cash" }));
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeEnabled();
  }, 30000);

  it("shows previous payment dates, methods, receipt numbers and allocations in Payment Procedure", async () => {
    renderPaymentHarness();
    const fixture = screen.getByTestId("payment-history-fixture");
    fireEvent.click(screen.getByRole("button", { name: "Open payment history fixture" }));

    const dialog = await screen.findByRole("dialog", { name: fixture.dataset["name"]! });
    const history = within(dialog).getByRole("heading", { name: "Payment History" }).parentElement!;
    expect(within(history).getByText(fixture.dataset["receipt"]!)).toBeInTheDocument();
    expect(within(history).getByText(fixture.dataset["method"]!)).toBeInTheDocument();
    expect(within(history).getByText(formatDate(fixture.dataset["date"]!))).toBeInTheDocument();
    expect(within(history).getByText(/Installment|Admission Fee/)).toBeInTheDocument();
    expect(within(history).getByRole("button", { name: "View receipt" })).toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "View receipt" }));
    expect(
      await screen.findByRole("dialog", { name: `Receipt ${fixture.dataset["receipt"]}` }),
    ).toBeInTheDocument();
  });

  it("automatically allocates one payment across oldest outstanding installments", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open multi-installment student" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Application" }));
    const reviewDialog = await screen.findByRole("dialog", { name: "Review application" });
    const previewButtons = within(reviewDialog).getAllByRole("button", { name: /^Preview / });
    for (const previewButton of previewButtons) {
      fireEvent.click(previewButton);
      expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    }
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Verify application" }));
    await screen.findByLabelText("Amount (₹)");

    const fixtures = screen.getAllByTestId("allocation-fixture-item");
    expect(fixtures).toHaveLength(2);
    const [first, second] = fixtures as [HTMLOutputElement, HTMLOutputElement];
    const firstLabel = first.dataset["label"]!;
    const secondLabel = second.dataset["label"]!;
    const firstBalance = Number(first.dataset["outstanding"]);
    const secondBalance = Number(second.dataset["outstanding"]);

    expect(screen.getByLabelText("Amount (₹)")).toHaveValue(firstBalance);
    const paymentCountBeforeReceipt = Number(
      screen.getByTestId("workflow-payment-count").textContent,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate Receipt" }));
    expect(screen.getByLabelText("Amount (₹)")).toHaveValue(firstBalance);
    expect(Number(screen.getByTestId("workflow-payment-count").textContent)).toBe(
      paymentCountBeforeReceipt,
    );

    fireEvent.change(screen.getByLabelText("Amount (₹)"), {
      target: { value: String(firstBalance + secondBalance) },
    });
    document.getElementById("record-payment-form")!.setAttribute("data-enter-nav", "off");
    fireEvent.click(screen.getByLabelText("Method"));
    fireEvent.click(await screen.findByRole("option", { name: "Cash" }));

    const allocationSummary = screen.getByText("Allocation Summary").closest("section")!;
    expect(within(allocationSummary).getByText(firstLabel).closest("li")).toHaveTextContent(
      formatINR(firstBalance),
    );
    expect(within(allocationSummary).getByText(secondLabel).closest("li")).toHaveTextContent(
      formatINR(secondBalance),
    );
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeEnabled();

    const paymentCount = Number(screen.getByTestId("workflow-payment-count").textContent);
    fireEvent.click(screen.getByRole("button", { name: /Payment Procedure/ }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Record this payment?",
    });
    expect(confirmation).toHaveTextContent(firstLabel);
    expect(confirmation).toHaveTextContent(secondLabel);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm payment" }));
    await screen.findByRole("dialog", { name: /Receipt/ });
    await waitFor(() =>
      expect(Number(screen.getByTestId("workflow-payment-count").textContent)).toBe(
        paymentCount + 1,
      ),
    );
    expect(JSON.parse(screen.getByTestId("latest-multi-payment-allocations").textContent!)).toEqual(
      [
        { installmentId: first.dataset["installmentId"], amount: firstBalance },
        { installmentId: second.dataset["installmentId"], amount: secondBalance },
      ],
    );
  }, 30000);

  it("stores rejected document reasons and continues to block payment", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open student with uploaded documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Application" }));
    const reviewDialog = await screen.findByRole("dialog", { name: "Review application" });
    const documentType = "ID Proof";
    fireEvent.click(within(reviewDialog).getByRole("button", { name: `Preview ${documentType}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "The document is unreadable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject Document" }));

    expect(reviewDialog).toHaveTextContent("Rejected: The document is unreadable.");
    expect(screen.queryByLabelText("Amount (₹)")).not.toBeInTheDocument();
    const stored = JSON.parse(
      window.localStorage.getItem("finance-document-verifications-v1") ?? "{}",
    ) as Record<string, { history: { reason?: (string) | undefined }[] }[]>;
    const histories = Object.values(stored).flat();
    expect(
      histories.some((verification) =>
        verification.history.some((entry) => entry.reason === "The document is unreadable."),
      ),
    ).toBe(true);
    fireEvent.click(within(reviewDialog).getByRole("button", { name: `Preview ${documentType}` }));
    expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeDisabled();
  }, 30000);

  it("requires document approvals even when the legacy accountant flag is present", async () => {
    renderPaymentHarness();
    const studentName = screen.getByTestId("student-fixture").dataset["name"]!;
    fireEvent.click(
      screen.getByRole("button", { name: "Open verified student without concession" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: studentName,
    });
    expect(dialog).toHaveTextContent("Review this application before recording payment.");
    expect(screen.getByRole("button", { name: "Review Application" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount (₹)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeDisabled();
  });

  it("hides application review for an unverified fully paid application", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open fully paid unverified student" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This fee plan is fully paid.");
    expect(screen.queryByRole("button", { name: "Review Application" })).not.toBeInTheDocument();
  });

  it("shows separate delivery statuses without implying that delivery has started", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open payment history fixture" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("heading")
        .map((heading) => heading.textContent)
        .filter((heading) =>
          [
            "Payment Fields",
            "Payment History",
            "Delivery Status",
            "Delivery Attempt Information",
          ].includes(heading ?? ""),
        ),
    ).toEqual([
      "Payment Fields",
      "Payment History",
      "Delivery Status",
      "Delivery Attempt Information",
    ]);
    expect(within(dialog).getByRole("heading", { name: "Delivery Status" })).toBeInTheDocument();
    expect(within(dialog).getByText("Student Payment Confirmation")).toBeInTheDocument();
    expect(within(dialog).getByText("Administration Application Handoff")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Receipt PDF attachment information has not been prepared"),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Not Sent")).toHaveLength(2);
    expect(within(dialog).getAllByText("No delivery attempt recorded.")).toHaveLength(2);
  });

  it("prepares one independent student confirmation record per saved payment", async () => {
    renderPaymentHarness();
    const before = Number(screen.getByTestId("workflow-payment-count").textContent);
    fireEvent.click(screen.getByRole("button", { name: "Record confirmation delivery fixture" }));

    await waitFor(() => {
      expect(screen.getByTestId("confirmation-delivery-record")).toHaveTextContent(
        '"status":"Not Sent"',
      );
    });
    expect(Number(screen.getByTestId("workflow-payment-count").textContent)).toBe(before + 1);
    expect(screen.getByTestId("confirmation-delivery-record")).toHaveTextContent(
      '"contentType":"application/pdf"',
    );
    expect(screen.getByTestId("confirmation-delivery-record")).toHaveTextContent(
      '"receiptNo":"TEST-CONFIRMATION-',
    );
  });

  it("shows pending and rejected states while leaving original fees payable", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open pending request" }));
    let dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Pending Accounts Review");
    expect(dialog).toHaveTextContent("Not approved");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);

    fireEvent.click(screen.getByRole("button", { name: "Open rejected request" }));
    dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rejected");
    expect(dialog).toHaveTextContent("Rejected");
  });

  it("blocks payments until the exact Director approval is applied and immediately updates Billing", async () => {
    renderPaymentHarness();
    fireEvent.click(screen.getByRole("button", { name: "Open approved request" }));
    let dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Approved");
    expect(dialog).toHaveTextContent("Not applied");
    expect(dialog).toHaveTextContent(
      "Payments are blocked until Accounts applies the revised installment schedule.",
    );
    expect(screen.getByRole("button", { name: /Payment Procedure/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);

    const originalBillingTotal = screen.getByTestId("billing-total").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Apply approved concession" }));
    await waitFor(() =>
      expect(screen.getByTestId("billing-total").textContent).not.toBe(originalBillingTotal),
    );
    const updatedBillingTotal = screen.getByTestId("billing-total").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Open approved request" }));
    dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Approved");
    expect(dialog).toHaveTextContent("Applied");
    expect(dialog).toHaveTextContent("Director-approved Discount");
    expect(screen.getByText("Fee payable").parentElement).toHaveTextContent(
      updatedBillingTotal ?? "",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Apply approved concession" })).toBeDisabled();
  });
});
