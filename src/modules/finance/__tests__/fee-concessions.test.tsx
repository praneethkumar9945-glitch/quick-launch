import "./setup";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeeConcessions } from "@/modules/finance/components/finance/FeeConcessions";
import { RecordPaymentContext, useRecordPayment } from "@/modules/finance/components/finance/RecordPaymentContext";
import { RecordPaymentProvider } from "@/modules/finance/components/finance/RecordPaymentProvider";
import { FinanceProvider, useFinance } from "@/modules/finance/finance/store";
import { markApplicationReviewed, recordDocumentVerification } from "@/modules/finance/finance/feeWorkflow";
import { formatDate, formatINR, TODAY } from "@/modules/finance/finance/logic";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

beforeEach(() => {
  window.localStorage.removeItem("finance-concessions-v1");
});

function renderConcessions() {
  return render(
    <FinanceProvider>
      <RecordPaymentContext.Provider value={{ open: vi.fn() }}>
        <FeeConcessions />
      </RecordPaymentContext.Provider>
    </FinanceProvider>,
  );
}

describe("Fee Concessions UI", () => {
  it("moves each explicitly verified sample application into Billing once", async () => {
    function BillingLinkProbe() {
      const { feeWorkflow, students, updateFeeWorkflowPerson } = useFinance();
      const samples = ["APP2026-130", "APP2026-131"].map((applicationId) =>
        feeWorkflow.persons.find((person) => person.applicationId === applicationId)!,
      );
      const verify = (person: (typeof samples)[number]) => {
        let reviewed = person;
        for (const document of person.applicationDetails!.documents) {
          const result = recordDocumentVerification(reviewed, document, "Approved");
          if (result.ok) reviewed = result.person;
        }
        updateFeeWorkflowPerson(markApplicationReviewed(reviewed));
      };
      return (
        <>
          {samples.map((person) => (
            <button key={person.id} onClick={() => verify(person)}>
              Verify {person.applicationId}
            </button>
          ))}
          {samples.map((person) => (
            <output key={person.id} data-testid={person.applicationId}>
              {students.filter((student) => student.applicationId === person.applicationId).length}
            </output>
          ))}
        </>
      );
    }

    render(
      <FinanceProvider>
        <BillingLinkProbe />
      </FinanceProvider>,
    );
    expect(screen.getByTestId("APP2026-130")).toHaveTextContent("0");
    expect(screen.getByTestId("APP2026-131")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-130" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-131" }));
    await waitFor(() => {
      expect(screen.getByTestId("APP2026-130")).toHaveTextContent("1");
      expect(screen.getByTestId("APP2026-131")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-130" }));
    await waitFor(() => expect(screen.getByTestId("APP2026-130")).toHaveTextContent("1"));
  });

  it("forwards a concession without an Accounts Reviewer field and preserves its reason", async () => {
    renderConcessions();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      "Sl. No.",
      "Concession No.",
      "Application No.",
      "Student",
      "Course",
      "Requested Amt",
      "Status",
      "Details",
    ]);
    const row = within(table).getByText("FC-2026-001").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("Pending Accounts Review")).toBeInTheDocument();
    expect(within(row!).getAllByRole("cell")[5]).toHaveTextContent(/^₹[\d,]+$/);
    fireEvent.click(within(row!).getByRole("button", { name: "View Details" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Accounts Review & Forwarding")).toBeInTheDocument();
    expect(within(dialog).queryByText("Earlier Director Decision History")).toBeNull();
    expect(within(dialog).queryByLabelText("Accounts Reviewer")).toBeNull();
    expect(within(dialog).getByText("Review Date").parentElement).toHaveTextContent(
      formatDate(TODAY),
    );
    expect(within(dialog).getByText("Forwarded to Director")).toBeInTheDocument();
    expect(within(dialog).getByText("Forwarding Date").parentElement).toHaveTextContent("—");
    expect(within(dialog).getByRole("button", { name: "Send to Director" })).toBeEnabled();
    expect(within(dialog).getByText("Reason for Concession").parentElement).toHaveTextContent(
      "Sibling currently enrolled in the Data Science programme.",
    );
    expect(within(dialog).queryByLabelText("Reason for Concession")).toBeNull();
    expect(within(dialog).getByText("Director Response")).toBeInTheDocument();
    expect(within(dialog).queryByText("Financial Impact")).toBeNull();
    expect(
      within(dialog).getByRole("heading", { name: "02 Supporting Documents" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Fee_Concession_Request.pdf")).toBeInTheDocument();
    expect(within(dialog).getByText("Family_Income_Proof.jpg")).toBeInTheDocument();
    expect(within(dialog).getByText("Supporting_Statement.png")).toBeInTheDocument();
    expect(within(dialog).getByText("PDF · 278.0 KB")).toBeInTheDocument();
    expect(within(dialog).getByText("JPG · 192.0 KB")).toBeInTheDocument();
    expect(within(dialog).getByText("PNG · 144.0 KB")).toBeInTheDocument();
    for (const [fileName, fileType] of [
      ["Fee_Concession_Request.pdf", "application/pdf"],
      ["Family_Income_Proof.jpg", "image/jpeg"],
      ["Supporting_Statement.png", "image/png"],
    ]) {
      expect(within(dialog).getByRole("link", { name: `Preview ${fileName}` })).toHaveAttribute(
        "href",
        expect.stringContaining(`data:${fileType}`),
      );
      expect(within(dialog).getByRole("link", { name: `Preview ${fileName}` })).toHaveAttribute(
        "target",
        "_blank",
      );
      expect(within(dialog).getByRole("link", { name: `Download ${fileName}` })).toHaveAttribute(
        "download",
        fileName,
      );
    }
    expect(within(dialog).getByText("Billing Information")).toBeInTheDocument();
    expect(within(dialog).getByText("Director Decision & Activity History")).toBeInTheDocument();

    const sectionNumbers = Array.from(dialog.querySelectorAll("section > h3 span"))
      .map((number) => number.textContent?.trim())
      .filter(Boolean);
    expect(sectionNumbers).toEqual(["01", "02", "03", "04", "05", "06"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Director" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Forwarding Date").parentElement).not.toHaveTextContent("—");
      expect(within(dialog).queryByRole("button", { name: "Send to Director" })).toBeNull();
      expect(within(dialog).getAllByText("Pending Director Decision").length).toBeGreaterThan(1);
    });
  }, 15000);

  it("filters requests by pending workflow status and final Director decision", async () => {
    renderConcessions();
    const pendingTable = screen.getByRole("table");
    expect(within(pendingTable).getByText("FC-2026-001")).toBeInTheDocument();
    expect(within(pendingTable).getByText("FC-2026-003")).toBeInTheDocument();
    expect(within(pendingTable).queryByText("FC-2026-005")).toBeNull();
    expect(within(pendingTable).queryByText("FC-2026-007")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Request status" }));
    expect(
      (await screen.findAllByRole("option")).map((option) => option.textContent?.trim()),
    ).toEqual(["All Request Status", "Pending Director Decision", "Pending Accounts Review"]);
    fireEvent.click(screen.getByRole("option", { name: "Pending Director Decision" }));
    expect(within(screen.getByRole("table")).getByText("FC-2026-003")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("FC-2026-001")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Request status" }));
    fireEvent.click(screen.getByRole("option", { name: "Pending Accounts Review" }));
    expect(within(screen.getByRole("table")).getByText("FC-2026-001")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("FC-2026-003")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decision History" }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Decision History" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Director decision" }));
    expect(
      (await screen.findAllByRole("option")).map((option) => option.textContent?.trim()),
    ).toEqual(["All Director Decisions", "Approved", "Rejected"]);
    fireEvent.click(screen.getByRole("option", { name: "Rejected" }));
    expect(within(screen.getByRole("table")).getByText("FC-2026-007")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("FC-2026-005")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Director decision" }));
    fireEvent.click(screen.getByRole("option", { name: "Approved" }));
    expect(within(screen.getByRole("table")).getByText("FC-2026-005")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("FC-2026-007")).toBeNull();
  });

  it("shows Director decisions, requested and approved amounts, and comments in history", async () => {
    renderConcessions();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decision History" }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Decision History" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      "Sl. No.",
      "Concession No.",
      "Application No.",
      "Student",
      "Course",
      "Decision Date",
      "Requested Amt",
      "Approved Amt",
      "Status",
      "Details",
    ]);

    const approvedRow = within(table).getByText("FC-2026-005").closest("tr");
    expect(approvedRow).not.toBeNull();
    const approvedCells = within(approvedRow!).getAllByRole("cell");
    expect(approvedCells[6]).toHaveTextContent(formatINR(3000));
    expect(approvedCells[7]).toHaveTextContent(formatINR(2500));
    expect(approvedCells[7]).toHaveClass("text-amber-700");
    expect(approvedCells[8]).toHaveTextContent("Approved");

    const row = within(table).getByText("FC-2026-007").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(within(row!).getAllByRole("cell")[7]).toHaveTextContent("—");
    fireEvent.click(within(row!).getByRole("button", { name: "View Details" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "04 Director Response" }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Decision Date").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Requested Amount").parentElement).toHaveTextContent(
      formatINR(4000),
    );
    expect(within(dialog).getByText("Approved Amount").parentElement).toHaveTextContent("—");
    expect(within(dialog).getByText("Director's Decision").parentElement).toHaveTextContent(
      "Rejected",
    );
    expect(within(dialog).getByText("Director's Comments").parentElement).toHaveTextContent(
      "The submitted documents do not meet the concession criteria.",
    );
    expect(within(dialog).queryByText("Response Source")).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /approve|reject/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /clarification|return/i })).toBeNull();
  });

  it("shows the recorded approved amount and comments in the read-only details view", async () => {
    renderConcessions();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decision History" }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Decision History" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    const table = screen.getByRole("table");
    const row = within(table).getByText("FC-2026-005").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole("button", { name: "View Details" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Approved Amount").parentElement).toHaveTextContent(
      formatINR(2500),
    );
    expect(within(dialog).getByText("Director's Decision").parentElement).toHaveTextContent(
      "Approved",
    );
    expect(within(dialog).getByText("Director's Comments").parentElement).toHaveTextContent(
      "Approved at ₹2,500 instead of ₹3,000.",
    );
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  it("persists the approved fee plan and installment breakdown across provider refresh", async () => {
    function PersistenceProbe() {
      const { concessions, students, applyConcession } = useFinance();
      const { open } = useRecordPayment();
      const request = concessions.find((item) => item.id === "FCR-SIM-5");
      const student = students.find((item) => item.id === request?.personId);
      return (
        <>
          <output data-testid="persisted-status">{request?.status}</output>
          <output data-testid="persisted-plan">
            {JSON.stringify(
              student?.installments.map((installment) => ({
                original: installment.originalAmount ?? installment.amount,
                concession: installment.concessionAmount ?? 0,
                revised: installment.amount,
              })),
            )}
          </output>
          <button onClick={() => applyConcession("FCR-SIM-5")}>
            Apply simulated approved request
          </button>
          {request && student && (
            <button onClick={() => open(request.personId)}>Open Payment Procedure</button>
          )}
        </>
      );
    }

    const first = render(
      <FinanceProvider>
        <RecordPaymentProvider>
          <PersistenceProbe />
        </RecordPaymentProvider>
      </FinanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply simulated approved request" }));
    await waitFor(() =>
      expect(screen.getByTestId("persisted-status")).toHaveTextContent("Approved"),
    );
    const savedPlan = screen.getByTestId("persisted-plan").textContent;
    expect(savedPlan).toContain('"concession":');
    expect(savedPlan).not.toBeNull();
    const stored = JSON.parse(window.localStorage.getItem("finance-concessions-v1") ?? "[]") as {
      id: string;
      status: string;
      applied?: { planAfter: { originalAmount?: number | undefined; concessionAmount?: (number) | undefined }[] };
      history: { text: string }[];
    }[];
    const savedRequest = stored.find((item) => item.id === "FCR-SIM-5");
    expect(savedRequest?.status).toBe("Approved");
    expect(savedRequest?.applied?.planAfter.some((item) => (item.concessionAmount ?? 0) > 0)).toBe(
      true,
    );
    expect(savedRequest?.history.some((entry) => entry.text.includes("applied by Accounts"))).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Payment Procedure" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Original amount")).toBeInTheDocument();
    expect(within(dialog).getByText("Fee Concession")).toBeInTheDocument();
    expect(within(dialog).getByText("Revised payable")).toBeInTheDocument();
    expect(within(dialog).getByText("Outstanding", { selector: "th" })).toBeInTheDocument();
    const concessionTotal = (savedRequest?.applied?.planAfter ?? []).reduce(
      (total, installment) => total + (installment.concessionAmount ?? 0),
      0,
    );
    const schedule = within(dialog).getAllByRole("table")[0]!;
    expect(within(schedule).getAllByText(formatINR(concessionTotal)).length).toBeGreaterThan(0);
    const admissionFeeRow = within(schedule).getByText("Admission Fee").closest("tr");
    expect(admissionFeeRow?.cells[3]?.textContent).toBe(formatINR(0));
    expect(within(dialog).getByText("Payment History")).toBeInTheDocument();
    first.unmount();

    render(
      <FinanceProvider>
        <RecordPaymentProvider>
          <PersistenceProbe />
        </RecordPaymentProvider>
      </FinanceProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("persisted-status")).toHaveTextContent("Approved"),
    );
    expect(screen.getByTestId("persisted-plan").textContent).toBe(savedPlan);
    fireEvent.click(screen.getByRole("button", { name: "Open Payment Procedure" }));
    const reopenedDialog = await screen.findByRole("dialog");
    expect(within(reopenedDialog).getByText("Original amount")).toBeInTheDocument();
    expect(
      within(within(reopenedDialog).getAllByRole("table")[0]!).getAllByText(
        formatINR(concessionTotal),
      ).length,
    ).toBeGreaterThan(0);
  });
});
