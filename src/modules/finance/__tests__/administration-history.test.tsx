import "./setup";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdministrationHistory } from "@/modules/finance/components/finance/AdministrationHistory";
import {
  ApplicationDetails,
  ApplicationDetailsPrintButton,
  DocumentVerificationHistory,
} from "@/modules/finance/components/finance/ApplicationDetails";
import {
  areRequiredDocumentsApproved,
  buildAdministrationDetailsPayload,
  documentSourceFingerprint,
  documentVerificationStatus,
  recordAdministrationDetailsSent,
} from "@/modules/finance/finance/feeWorkflow";
import { formatINR } from "@/modules/finance/finance/logic";
import type {
  DocumentCorrectionRequest,
  DocumentVerification,
  FeeWorkflowPayment,
  Person,
} from "@/modules/finance/finance/types";

const person: Person = {
  id: "p1",
  name: "Test Student",
  contact: "9845000000",
  email: "test.student@example.com",
  course: "Python",
  appliedOn: "2026-10-01",
  applicationId: "APP2026-001",
  applicationStatus: "Reviewed",
  accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
  plan: [
    {
      id: "registration",
      label: "Admission Fee",
      amountDue: 100,
      dueDate: "2026-10-01",
      reminders: [],
    },
    {
      id: "installment-1",
      label: "Installment 1",
      amountDue: 100,
      dueDate: "2026-11-01",
      reminders: [],
    },
  ],
  adminNotifiedOfClearance: false,
};

function payment(
  id: string,
  date: string,
  amount: number,
  installmentId: string,
): FeeWorkflowPayment {
  return {
    id,
    personId: person.id,
    amount,
    date,
    method: "UPI",
    reference: "",
    receiptNo: id,
    allocations: [{ installmentId, amount }],
    adminNotified: false,
    confirmation: { status: "Not Sent" },
  };
}

describe("Administration history", () => {
  it("renders derived age and documents, and handles an absent photo", () => {
    const snapshot = buildAdministrationDetailsPayload(
      {
        ...person,
        applicationDetails: {
          dateOfBirth: "2000-01-01",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          postalCode: "",
          guardianName: "",
          guardianRelationship: "",
          guardianPhone: "",
          guardianEmail: "",
          educationWorkExperience: "",
          leadSource: "",
          leadReference: "",
          coursePreference: "Python",
          installmentPreference: 1,
          documents: [
            { type: "ID proof", fileName: "id-proof.pdf", provided: true },
            { type: "TC", provided: false },
          ],
          documentsEnclosed: ["ID proof"],
          declarationAccepted: false,
        },
      },
      [],
    );
    const { container } = render(<ApplicationDetails snapshot={snapshot} />);
    expect(screen.getByText("ID Proof")).toBeInTheDocument();
    expect(screen.getAllByText("Missing")).toHaveLength(2);
    expect(screen.queryByText("Student Photo")).not.toBeInTheDocument();
    const personalSection = screen
      .getByRole("heading", { name: "Personal details" })
      .closest("section");
    const photo = personalSection?.querySelector("figure");
    const personalFields = personalSection?.querySelector("dl");
    expect(photo).not.toBeNull();
    expect(personalFields).not.toBeNull();
    expect(
      photo!.compareDocumentPosition(personalFields!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const nameLabel = within(personalSection!).getByText("Student full name");
    expect(nameLabel.parentElement).toHaveClass("flex", "gap-2");
    expect(nameLabel.nextElementSibling).toHaveTextContent("Test Student");
    expect(
      screen.getByRole("heading", { name: "Course preference" }).parentElement?.nextElementSibling,
    ).toHaveClass("sm:grid-cols-2");
    expect(screen.getByText("Preferred number of instalments")).toHaveClass("whitespace-nowrap");
    expect(screen.queryByRole("button", { name: "Preview ID proof" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
    expect(screen.queryByText("Photo not provided")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "STUDENT DETAILS" })).not.toBeInTheDocument();
    expect(screen.queryByAltText("Skill AI")).not.toBeInTheDocument();
    expect(container.querySelector(".application-details-print")).toHaveClass(
      "border-application-orange",
    );
    expect(screen.queryByText("Test Student", { selector: "h2" })).not.toBeInTheDocument();
    expect(screen.getByText(String(new Date().getFullYear() - 2000))).toBeInTheDocument();
  });

  it("updates document status icons for approvals and rejections while preserving pending icons", () => {
    const idProofDocument = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "https://files.example.test/id-proof.pdf",
      provided: true,
    };
    const tcDocument = {
      type: "TC" as const,
      fileName: "tc.pdf",
      fileUrl: "https://files.example.test/tc.pdf",
      provided: true,
    };
    const marksheetDocument = {
      type: "Latest marksheet" as const,
      fileName: "marksheet.pdf",
      fileUrl: "https://files.example.test/marksheet.pdf",
      provided: true,
    };
    const documents = [idProofDocument, tcDocument, marksheetDocument];
    const snapshot = buildAdministrationDetailsPayload(
      {
        ...person,
        applicationDetails: {
          dateOfBirth: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          postalCode: "",
          guardianName: "",
          guardianRelationship: "",
          guardianPhone: "",
          guardianEmail: "",
          educationWorkExperience: "",
          leadSource: "",
          leadReference: "",
          coursePreference: "Python",
          installmentPreference: 1,
          documents,
          declarationAccepted: true,
        },
      },
      [],
    );
    const { rerender } = render(
      <ApplicationDetails snapshot={snapshot} documentVerifications={[]} />,
    );

    const getDocumentIcon = (label: string) =>
      screen.getByText(label).closest("li")?.querySelector("svg");
    const pendingIcon = getDocumentIcon("Latest Marksheet");
    expect(pendingIcon).toHaveClass("text-muted-foreground");
    expect(pendingIcon).not.toHaveClass("fill-green-600", "fill-red-600");

    const makeVerification = (
      document: (typeof documents)[number],
      status: "Approved" | "Rejected",
    ): DocumentVerification => {
      const sourceFingerprint = documentSourceFingerprint(document.fileName, document.fileUrl);
      const event = {
        status,
        date: "2026-11-16T00:00:00.000Z",
        fileName: document.fileName,
        sourceFingerprint,
      };
      return {
        documentType: document.type,
        ...event,
        history: [event],
      };
    };

    rerender(
      <ApplicationDetails
        snapshot={snapshot}
        documentVerifications={[
          makeVerification(idProofDocument, "Approved"),
          makeVerification(tcDocument, "Rejected"),
        ]}
      />,
    );

    expect(getDocumentIcon("ID Proof")).toHaveClass("fill-green-600", "text-white");
    expect(getDocumentIcon("Transfer Certificate (TC)")).toHaveClass("fill-red-600", "text-white");
    expect(getDocumentIcon("Latest Marksheet")).toHaveClass("text-muted-foreground");
  });

  it("renders document verification history outside the original application form", () => {
    const submittedDocument = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "/sample-documents/id-proof.pdf",
      provided: true,
    };
    const verificationDate = "2026-11-07T10:00:00.000Z";
    const sourceFingerprint = documentSourceFingerprint(
      submittedDocument.fileName,
      submittedDocument.fileUrl,
    );
    const event = {
      status: "Approved" as const,
      decision: "Approved" as const,
      previousStatus: "Pending" as const,
      date: verificationDate,
      fileName: submittedDocument.fileName,
      sourceFingerprint,
      reviewer: "Accounts Officer",
    };
    const documentVerifications: DocumentVerification[] = [
      {
        documentType: submittedDocument.type,
        ...event,
        history: [event],
      },
    ];
    const snapshot = buildAdministrationDetailsPayload(
      {
        ...person,
        applicationDetails: {
          dateOfBirth: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          postalCode: "",
          guardianName: "",
          guardianRelationship: "",
          guardianPhone: "",
          guardianEmail: "",
          educationWorkExperience: "",
          leadSource: "",
          leadReference: "",
          coursePreference: "Python",
          installmentPreference: 1,
          documents: [submittedDocument],
          declarationAccepted: true,
        },
      },
      [],
    );

    const { container } = render(
      <>
        <ApplicationDetails snapshot={snapshot} documentVerifications={documentVerifications} />
        <DocumentVerificationHistory documentVerifications={documentVerifications} />
        <section>
          <h3>For office use only</h3>
        </section>
      </>,
    );

    const applicationForm = container.querySelector<HTMLElement>(".application-details-print");
    expect(applicationForm).not.toBeNull();
    expect(within(applicationForm!).getByText("ID Proof")).toBeInTheDocument();
    expect(within(applicationForm!).queryByText(/Pending → Approved/)).not.toBeInTheDocument();

    const historyHeading = screen.getByRole("heading", { name: "Document Verification History" });
    const historySection = historyHeading.closest("section");
    expect(historySection).not.toBeNull();
    expect(historySection).toHaveTextContent("ID Proof");
    expect(historySection).toHaveTextContent("Pending → Approved");
    expect(historySection).toHaveTextContent("Decision: Approved");
    expect(historySection).toHaveTextContent("Accounts Officer");
    expect(historySection).toHaveTextContent(new Date(verificationDate).toLocaleString("en-IN"));
    expect(
      historyHeading.compareDocumentPosition(
        screen.getByRole("heading", { name: "For office use only" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows active correction summaries separately from one complete verification history", () => {
    const idProofDocument = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "https://files.example.test/id-proof.pdf",
      provided: true,
    };
    const tcDocument = {
      type: "TC" as const,
      fileName: "tc.pdf",
      fileUrl: "https://files.example.test/tc-resubmitted.pdf",
      provided: true,
    };
    const marksheetDocument = {
      type: "Latest marksheet" as const,
      fileName: "marksheet.pdf",
      fileUrl: "https://files.example.test/marksheet.pdf",
      provided: true,
    };
    const documents = [idProofDocument, tcDocument, marksheetDocument];
    const snapshot = buildAdministrationDetailsPayload(
      {
        ...person,
        applicationDetails: {
          dateOfBirth: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          postalCode: "",
          guardianName: "",
          guardianRelationship: "",
          guardianPhone: "",
          guardianEmail: "",
          educationWorkExperience: "",
          leadSource: "",
          leadReference: "",
          coursePreference: "Python",
          installmentPreference: 1,
          documents,
          declarationAccepted: true,
        },
      },
      [],
    );
    const makeCorrectionRequest = (
      id: string,
      documentType: DocumentCorrectionRequest["documents"][number]["documentType"],
      status: DocumentCorrectionRequest["status"],
      resubmittedFileUrl?: string | undefined,
    ): DocumentCorrectionRequest => ({
      id,
      personId: person.id,
      applicationId: person.applicationId,
      studentName: person.name,
      studentContact: person.contact,
      documents: [
        {
          documentType,
          issue: "Rejected",
          reason: `${documentType} correction required`,
          ...(resubmittedFileUrl ? { resubmittedFileUrl } : {}),
        },
      ],
      requestedAt: "2026-11-10T00:00:00.000Z",
      requestedBy: "Accounts Officer",
      status,
      ...(status === "Resubmitted" ? { resubmittedAt: "2026-11-15T00:00:00.000Z" } : {}),
      history: [
        {
          action: "Requested",
          date: "2026-11-10T00:00:00.000Z",
          actor: "Accounts Officer",
          documentTypes: [documentType],
        },
        ...(status === "Resubmitted"
          ? [
              {
                action: "Resubmitted" as const,
                date: "2026-11-15T00:00:00.000Z",
                actor: "Admission (Sales)",
                documentTypes: [documentType],
              },
            ]
          : []),
      ],
    });
    const correctionRequests = [
      makeCorrectionRequest("corr-open", "ID proof", "Awaiting Resubmission"),
      makeCorrectionRequest("corr-resubmitted", "TC", "Resubmitted", tcDocument.fileUrl),
      makeCorrectionRequest(
        "corr-old",
        "Latest marksheet",
        "Resubmitted",
        "https://files.example.test/old-marksheet.pdf",
      ),
    ];
    const verificationDate = "2026-11-16T08:30:00.000Z";
    const verificationFingerprint = documentSourceFingerprint(
      idProofDocument.fileName,
      idProofDocument.fileUrl,
    );
    const verificationEvent = {
      status: "Rejected" as const,
      decision: "Rejected" as const,
      previousStatus: "Pending" as const,
      date: verificationDate,
      fileName: idProofDocument.fileName,
      sourceFingerprint: verificationFingerprint,
      reason: "Image is unreadable.",
      reviewer: "Accounts Officer",
    };
    const documentVerifications: DocumentVerification[] = [
      {
        documentType: "ID proof",
        ...verificationEvent,
        history: [verificationEvent],
      },
    ];

    render(
      <>
        <ApplicationDetails
          snapshot={snapshot}
          documentVerifications={documentVerifications}
          onVerifyDocument={vi.fn()}
          correctionRequests={correctionRequests}
        />
        <DocumentVerificationHistory documentVerifications={documentVerifications} />
        <section>
          <h3>For office use only</h3>
        </section>
      </>,
    );

    expect(screen.getAllByRole("heading", { name: "Document Verification History" })).toHaveLength(
      1,
    );
    const correctionHeading = screen.getByRole("heading", {
      name: "Correction Requests to Admission",
    });
    const correctionSection = correctionHeading.closest(".no-print");
    expect(correctionSection).toHaveTextContent(
      "ID Proof · Rejected: ID proof correction required",
    );
    expect(correctionSection).toHaveTextContent("Awaiting resubmission");
    expect(correctionSection).toHaveTextContent(
      "Transfer Certificate (TC) · Rejected: TC correction required",
    );
    expect(correctionSection).toHaveTextContent("Resubmitted");
    expect(correctionSection).not.toHaveTextContent("corr-old");
    expect(correctionSection).not.toHaveTextContent("Admission (Sales)");
    expect(correctionSection).not.toHaveTextContent("Requested ·");

    const historyHeading = screen.getByRole("heading", { name: "Document Verification History" });
    const historySection = historyHeading.closest("section");
    expect(historySection).toHaveTextContent("Pending → Rejected");
    expect(historySection).toHaveTextContent("Decision: Rejected");
    expect(historySection).toHaveTextContent("Accounts Officer");
    expect(historySection).toHaveTextContent("Remark: Image is unreadable.");
    expect(
      historyHeading.compareDocumentPosition(
        screen.getByRole("heading", { name: "For office use only" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the correction action only after a resubmitted document is reviewed and rejected", () => {
    const originalDocument = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "https://files.example.test/id-proof.pdf",
      provided: true,
    };
    const resubmittedDocument = {
      ...originalDocument,
      fileName: "id-proof-corrected.pdf",
      fileUrl: "https://files.example.test/id-proof-corrected.pdf",
    };
    const makeSnapshot = (document: typeof originalDocument) =>
      buildAdministrationDetailsPayload(
        {
          ...person,
          applicationDetails: {
            dateOfBirth: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            state: "",
            postalCode: "",
            guardianName: "",
            guardianRelationship: "",
            guardianPhone: "",
            guardianEmail: "",
            educationWorkExperience: "",
            leadSource: "",
            leadReference: "",
            coursePreference: "Python",
            installmentPreference: 1,
            documents: [document],
            declarationAccepted: true,
          },
        },
        [],
      );
    const makeRejectedVerification = (document: typeof originalDocument) => {
      const event = {
        status: "Rejected" as const,
        decision: "Rejected" as const,
        previousStatus: "Pending" as const,
        date: "2026-11-16T08:30:00.000Z",
        fileName: document.fileName,
        sourceFingerprint: documentSourceFingerprint(document.fileName, document.fileUrl),
        reason: "The image is unreadable.",
        reviewer: "Accounts Officer",
      };
      return {
        documentType: document.type,
        ...event,
        history: [event],
      } satisfies DocumentVerification;
    };
    const awaitingRequest: DocumentCorrectionRequest = {
      id: "corr-current",
      personId: person.id,
      applicationId: person.applicationId,
      studentName: person.name,
      studentContact: person.contact,
      documents: [
        {
          documentType: "ID proof",
          issue: "Rejected",
          reason: "The image is unreadable.",
        },
      ],
      requestedAt: "2026-11-16T08:00:00.000Z",
      requestedBy: "Accounts Officer",
      status: "Awaiting Resubmission",
    };
    const resubmittedRequest: DocumentCorrectionRequest = {
      ...awaitingRequest,
      status: "Resubmitted",
      resubmittedAt: "2026-11-16T09:00:00.000Z",
      documents: [
        {
          ...awaitingRequest.documents[0]!,
          resubmittedFileUrl: resubmittedDocument.fileUrl,
        },
      ],
    };
    const onSendCorrectionRequest = vi.fn(() => true);
    const { rerender } = render(
      <ApplicationDetails
        snapshot={makeSnapshot(originalDocument)}
        documentVerifications={[makeRejectedVerification(originalDocument)]}
        onVerifyDocument={vi.fn()}
        onSendCorrectionRequest={onSendCorrectionRequest}
      />,
    );

    expect(screen.getByRole("button", { name: "Send Correction Request" })).toBeInTheDocument();

    rerender(
      <ApplicationDetails
        snapshot={makeSnapshot(originalDocument)}
        documentVerifications={[makeRejectedVerification(originalDocument)]}
        onVerifyDocument={vi.fn()}
        onSendCorrectionRequest={onSendCorrectionRequest}
        correctionRequests={[awaitingRequest]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Send Correction Request" }),
    ).not.toBeInTheDocument();

    rerender(
      <ApplicationDetails
        snapshot={makeSnapshot(resubmittedDocument)}
        documentVerifications={[]}
        onVerifyDocument={vi.fn()}
        onSendCorrectionRequest={onSendCorrectionRequest}
        correctionRequests={[resubmittedRequest]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Send Correction Request" }),
    ).not.toBeInTheDocument();

    rerender(
      <ApplicationDetails
        snapshot={makeSnapshot(resubmittedDocument)}
        documentVerifications={[makeRejectedVerification(resubmittedDocument)]}
        onVerifyDocument={vi.fn()}
        onSendCorrectionRequest={onSendCorrectionRequest}
        correctionRequests={[resubmittedRequest]}
      />,
    );
    expect(screen.getByRole("button", { name: "Send Correction Request" })).toBeInTheDocument();
  });

  it("previews only uploaded documents and records approval decisions", async () => {
    const uploaded = {
      type: "ID proof" as const,
      fileName: "id-proof.png",
      fileUrl: "data:image/png;base64,AA==",
      provided: true,
    };
    const missing = { type: "TC" as const, provided: false };
    const applicationPerson = {
      ...person,
      applicationDetails: {
        dateOfBirth: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: "Python",
        installmentPreference: 1,
        documents: [uploaded, missing],
        declarationAccepted: true,
        passportPhoto: { fileName: "student.png", previewUrl: "data:image/png;base64,AA==" },
      },
    };
    const onVerifyDocument = vi.fn();
    const onSendCorrectionRequest = vi.fn(() => true);
    render(
      <ApplicationDetails
        snapshot={buildAdministrationDetailsPayload(applicationPerson, [])}
        documentVerifications={[]}
        onVerifyDocument={onVerifyDocument}
        onSendCorrectionRequest={onSendCorrectionRequest}
      />,
    );

    expect(screen.getByAltText("Test Student student photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview ID Proof" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview TC" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send Correction Request" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Send Correction Request" }));
    expect(onSendCorrectionRequest).toHaveBeenCalledWith([
      { documentType: "TC", issue: "Missing", reason: "Required document is missing." },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Preview ID Proof" }));
    expect(await screen.findByRole("img", { name: "ID Proof" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("110%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onVerifyDocument).toHaveBeenCalledWith(uploaded, "Approved");
  });

  it("requires a reason before a document rejection can be confirmed", async () => {
    const uploaded = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
      provided: true,
    };
    const applicationPerson = {
      ...person,
      applicationDetails: {
        dateOfBirth: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: "Python",
        installmentPreference: 1,
        documents: [uploaded],
        declarationAccepted: true,
      },
    };
    const onVerifyDocument = vi.fn();
    render(
      <ApplicationDetails
        snapshot={buildAdministrationDetailsPayload(applicationPerson, [])}
        documentVerifications={[]}
        onVerifyDocument={onVerifyDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview ID Proof" }));
    expect(await screen.findByTitle("Preview of ID Proof")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const confirmButton = screen.getByRole("button", {
      name: "Reject Document",
    });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "The name is not legible." },
    });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(onVerifyDocument).toHaveBeenCalledWith(uploaded, "Rejected", "The name is not legible.");
  });

  it("previews all rejected and missing documents before sending one correction request", async () => {
    const idProof = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "https://files.example.test/id-proof.pdf",
      provided: true,
    };
    const missingTc = { type: "TC" as const, provided: false };
    const sourceFingerprint = documentSourceFingerprint(idProof.fileName, idProof.fileUrl);
    const rejectedEvent = {
      status: "Rejected" as const,
      date: "2026-11-07T10:00:00.000Z",
      fileName: idProof.fileName,
      fileUrl: idProof.fileUrl,
      sourceFingerprint,
      reason: "The name is not legible.",
      reviewer: "Accountant (Finance)",
    };
    const applicationPerson = {
      ...person,
      applicationDetails: {
        dateOfBirth: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: "Python",
        installmentPreference: 1,
        documents: [idProof, missingTc],
        declarationAccepted: true,
      },
      documentVerifications: [
        {
          documentType: "ID proof" as const,
          ...rejectedEvent,
          history: [rejectedEvent],
        },
      ],
    };
    const onSendCorrectionRequest = vi.fn(() => true);
    render(
      <ApplicationDetails
        snapshot={buildAdministrationDetailsPayload(applicationPerson, [])}
        documentVerifications={applicationPerson.documentVerifications}
        onVerifyDocument={vi.fn()}
        onSendCorrectionRequest={onSendCorrectionRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send Correction Request" }));
    expect(await screen.findByText("Review correction request")).toBeInTheDocument();
    const correctionDialog = screen.getByRole("dialog");
    expect(correctionDialog).toHaveTextContent("The name is not legible.");
    expect(correctionDialog).toHaveTextContent("Required document is missing.");
    fireEvent.click(
      within(correctionDialog).getByRole("button", { name: "Confirm & Send Correction Request" }),
    );
    expect(onSendCorrectionRequest).toHaveBeenCalledWith([
      { documentType: "ID proof", issue: "Rejected", reason: "The name is not legible." },
      { documentType: "TC", issue: "Missing", reason: "Required document is missing." },
    ]);
  });

  it("offers the original file when an uploaded format cannot be previewed inline", async () => {
    const document = {
      type: "ID proof" as const,
      fileName: "identity-document.docx",
      fileUrl: "https://files.example.test/identity-document.docx",
      provided: true,
    };
    const applicationPerson = {
      ...person,
      applicationDetails: {
        dateOfBirth: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: "Python",
        installmentPreference: 1,
        documents: [document],
        declarationAccepted: true,
      },
    };
    render(
      <ApplicationDetails
        snapshot={buildAdministrationDetailsPayload(applicationPerson, [])}
        onVerifyDocument={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview ID Proof" }));
    expect(await screen.findByRole("link", { name: "Open original" })).toHaveAttribute(
      "href",
      document.fileUrl,
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      document.fileName,
    );
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  });

  it("requires every provided document to be approved for application verification", () => {
    const idProof = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "https://files.example.test/id-proof.pdf",
      provided: true,
    };
    const tc = {
      type: "TC" as const,
      fileName: "tc.pdf",
      fileUrl: "https://files.example.test/tc.pdf",
      provided: true,
    };
    const verifications: DocumentVerification[] = [idProof, tc].map((document) => {
      const sourceFingerprint = documentSourceFingerprint(document.fileName, document.fileUrl);
      const event = {
        status: "Approved" as const,
        date: "2026-11-07T10:00:00.000Z",
        fileName: document.fileName,
        sourceFingerprint,
      };
      return {
        documentType: document.type,
        ...event,
        history: [event],
      };
    });
    const applicationPerson = {
      ...person,
      applicationDetails: {
        dateOfBirth: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: "Python",
        installmentPreference: 1,
        documents: [idProof, tc],
        declarationAccepted: true,
      },
      documentVerifications: verifications,
    };
    expect(documentVerificationStatus(idProof, verifications)).toBe("Approved");
    expect(areRequiredDocumentsApproved(applicationPerson)).toBe(true);
    const resubmittedIdProof = {
      ...idProof,
      fileUrl: "https://files.example.test/id-proof-corrected.pdf",
    };
    expect(documentVerificationStatus(resubmittedIdProof, verifications)).toBe("Pending");
    expect(
      areRequiredDocumentsApproved({
        ...applicationPerson,
        applicationDetails: {
          ...applicationPerson.applicationDetails,
          documents: [resubmittedIdProof, tc],
        },
      }),
    ).toBe(false);
    expect(
      areRequiredDocumentsApproved({
        ...applicationPerson,
        applicationDetails: {
          ...applicationPerson.applicationDetails,
          documents: [{ ...tc, provided: false }],
        },
      }),
    ).toBe(false);
  });

  it("keeps Print / Save PDF functional from its modal-header control", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<ApplicationDetailsPrintButton />);

    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveClass("printing-application-details");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement).not.toHaveClass("printing-application-details");
    print.mockRestore();
  });

  it("shows the prepared snapshot after a later payment without using current payment data", async () => {
    const sentPayment = payment("payment-1", "2026-10-02", 100, "registration");
    const laterPayment = payment("payment-2", "2026-10-03", 50, "installment-1");
    const handoffs = recordAdministrationDetailsSent([], person, [sentPayment], "2026-10-02");
    const currentSnapshot = buildAdministrationDetailsPayload(
      person,
      [sentPayment, laterPayment],
      "2026-10-03",
    );

    expect(currentSnapshot.paymentSummary.totalPaid).toBe(150);
    render(<AdministrationHistory personId={person.id} handoffs={handoffs} />);

    fireEvent.click(screen.getByRole("button", { name: "View handoff details" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent(/simulated|not delivered/i);
    expect(dialog).not.toHaveTextContent(formatINR(100));
    expect(dialog).not.toHaveTextContent(formatINR(currentSnapshot.paymentSummary.totalPaid));
  });
});
