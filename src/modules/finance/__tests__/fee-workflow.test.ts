import "./setup";
import { describe, expect, it } from "vitest";
import type { ConcessionRequest, ConcessionStatus } from "@/modules/finance/finance/concessions";
import type {
  FeePayment,
  FeeWorkflowPayment,
  Handoff,
  Installment,
  Person,
  Student,
  StudentApplicationDetails,
} from "@/modules/finance/finance/types";
import {
  allocatePayment,
  autoForwardEligibleApplications,
  buildAdministrationDetailsPayload,
  documentSourceFingerprint,
  buildPaymentNotificationPayload,
  appearsInBilling,
  isEligibleNow,
  recordAdministrationDetailsSent,
  recordDocumentVerification,
  buildPaymentConfirmationEmail,
  preparePaymentConfirmation,
  buildPaymentReminderEmail,
  feeWorkflowPaymentStatus,
  hasDuplicatePaymentReference,
  canSendToAdministration,
  applicationStage,
  applicationListStatus,
  applicationResubmissionForReview,
  hasResubmittedDocumentsAwaitingReview,
  matchesApplicationListFilter,
  isApplicationVerified,
  markApplicationReviewed,
  documentVerificationStatus,
  filterApplicationsByStage,
  classAccess,
  createDemoFeeWorkflow,
  createDemoBillingPayments,
  createDemoBillingStudents,
  followUpStatus,
  installmentFollowUpStatus,
  installmentReminderWindowEnd,
  installmentDaysOverdue,
  isRecentlyPaidInstallment,
  mergeBillingPayments,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  nextAction,
  personTotals,
  markPaymentsAdministrationNotified,
  createNewFeeWorkflowPayment,
  studentFromAdmittedPerson,
  taskPriority,
  validateAdmissionNo,
} from "@/modules/finance/finance/feeWorkflow";
import {
  addDocumentsToOpenCorrectionRequest,
  applyResubmissions,
  createCorrectionRequest,
  hasUnresolvedCorrectionRequest,
  resubmitCorrection,
  sampleDocumentFile,
} from "@/modules/finance/finance/documentCorrections";
import {
  DEMO_FEE_PLANS,
  DEMO_BILLING_SCENARIO_PERSON_IDS,
  DEMO_SCENARIO_PEOPLE,
  DEMO_SCENARIO_PAYMENT_SPECS,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
  newDemoApplicants,
  buildPlan,
} from "@/modules/finance/finance/feeWorkflowConfig";
import { seedPayments, seedStudents } from "@/modules/finance/finance/data";
import { createSimulatedConcessions } from "@/modules/finance/finance/concessionSeed";
import { demoDate } from "@/modules/finance/finance/demoDates";
import { billStatus, installmentSchedule, nextDue, studentPaid, TODAY } from "@/modules/finance/finance/logic";

const plan: Installment[] = [
  {
    id: "i1",
    label: "Registration",
    amountDue: 100,
    dueDate: "2026-10-01",
    reminders: [],
  },
  {
    id: "i2",
    label: "Instalment 1",
    amountDue: 100,
    dueDate: "2026-11-01",
    reminders: [],
  },
];

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Test Student",
    contact: "9845000000",
    email: "test.student@example.com",
    course: "Python",
    appliedOn: "2026-10-01",
    applicationId: "APP2026-001",
    applicationStatus: "Reviewed",
    plan,
    adminNotifiedOfClearance: false,
    ...overrides,
  };
}

function payment(installmentId: string, amount: number, date = "2026-10-02"): FeeWorkflowPayment {
  return {
    id: `pay-${installmentId}-${amount}`,
    personId: "p1",
    amount,
    date,
    method: "UPI",
    reference: "TXN-1",
    receiptNo: "RCP-1",
    allocations: [{ installmentId, amount }],
    adminNotified: false,
    confirmation: { status: "Not Sent" },
  };
}

function concession(personId: string, status: ConcessionStatus): ConcessionRequest {
  const decision =
    status === "Approved" || status === "Rejected"
      ? {
          decision: status,
          date: "2026-10-02",
          ...(status === "Approved" ? { approvedDiscount: 10 } : {}),
          remarks: "Director decision",
          simulated: true as const,
        }
      : undefined;
  return {
    id: `concession-${status}`,
    concessionNo: "FC-2026-001",
    personId,
    submission: {
      studentName: "Test Student",
      branch: "Main",
      applicationNo: "APP2026-001",
      requestedDate: "2026-10-01",
      contact: "9845000000",
      totalFees: 200,
      eligibleFees: 180,
      course: "Python",
      courseDuration: "3 months",
      startingDate: "2026-10-01",
      amountAlreadyPaid: 0,
      concessionType: "Fixed Amount",
      requestedValue: 10,
      reason: "Test",
      declarationAccepted: true,
    },
    previousSubmissions: [],
    status,
    directorDecision: decision,
    directorDecisions: decision ? [decision] : [],
    applied:
      status === "Approved"
        ? {
            date: "2026-10-03",
            appliedBy: "Accounts",
            originalFees: 200,
            approvedDiscount: 10,
            netPayable: 190,
            paidAtApply: 0,
            outstanding: 190,
            excessCredit: 0,
            adjustments: [],
            planAfter: plan,
          }
        : undefined,
    simulated: true,
    history: [],
  };
}

describe("installment-based fee workflow", () => {
  it("seeds exactly two complete, unverified Applications with linked pending concessions", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const samples = workflow.persons.filter((person) =>
      ["APP2026-130", "APP2026-131"].includes(person.applicationId),
    );
    expect(samples).toHaveLength(2);
    expect(samples.map((person) => person.applicationId).sort()).toEqual([
      "APP2026-130",
      "APP2026-131",
    ]);
    for (const person of samples) {
      expect(person.applicationStatus).toBe("Received");
      expect(person.accountantVerifiedAt).toBeUndefined();
      expect(person.documentVerifications).toBeUndefined();
      expect(applicationListStatus(person, [], workflow.handoffs)).toBe("New");
      expect(person.applicationDetails?.passportPhoto?.previewUrl).toMatch(
        /^data:image\/svg\+xml,/,
      );
      expect(person.applicationDetails?.documents).toHaveLength(4);
      expect(
        person.applicationDetails?.documents.every(
          (document) => document.provided && document.fileUrl?.startsWith("/sample-documents/"),
        ),
      ).toBe(true);
      let reviewedPerson = person;
      for (const document of person.applicationDetails!.documents) {
        const result = recordDocumentVerification(reviewedPerson, document, "Approved");
        expect(result.ok).toBe(true);
        if (result.ok) reviewedPerson = result.person;
      }
      expect(isApplicationVerified(reviewedPerson)).toBe(false);
      const verifiedPerson = markApplicationReviewed(reviewedPerson);
      expect(isApplicationVerified(verifiedPerson)).toBe(true);
      expect(appearsInBilling(verifiedPerson, workflow.payments)).toBe(true);
    }
    const concessions = createSimulatedConcessions(workflow).filter((request) =>
      ["APP2026-130", "APP2026-131"].includes(request.submission.applicationNo),
    );
    expect(concessions).toHaveLength(2);
    expect(concessions.map((request) => request.status)).toEqual([
      "Pending Accounts Review",
      "Pending Accounts Review",
    ]);
    expect(concessions.every((request) => request.directorDecision === undefined)).toBe(true);
    expect(concessions.every((request) => request.applied === undefined)).toBe(true);
  });

  it("filters existing application records by each derived stage", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const applications = workflow.persons
      .filter((item) => item.applicationDetails)
      .map((person) => {
        if (!person.accountantVerifiedAt || !person.applicationDetails) return person;
        const documents = person.applicationDetails.documents.map((document) => {
          const fileName = document.fileName ?? `${document.type}.pdf`;
          const fileUrl = `https://files.test/${encodeURIComponent(fileName)}`;
          return { ...document, fileName, fileUrl, provided: true };
        });

        const documentVerifications = documents.map((document) => {
          const event = {
            status: "Approved" as const,
            date: person.accountantVerifiedAt!,
            fileName: document.fileName,
            sourceFingerprint: documentSourceFingerprint(document.fileName, document.fileUrl!),
          };
          return {
            documentType: document.type,
            ...event,
            history: [event],
          };
        });
        return {
          ...person,
          applicationDetails: { ...person.applicationDetails, documents },
          documentVerifications,
        };
      });
    const stages = [
      "To review",
      "Awaiting Resubmission",
      "Awaiting payment",
      "Ready to send",
      "Handoff prepared",
      "Admitted",
    ] as const;
    const stageFor = (item: Person) =>
      applicationStage(
        item,
        workflow.payments.filter((paymentItem) => paymentItem.personId === item.id),
        workflow.handoffs,
      );

    expect(
      filterApplicationsByStage(applications, workflow.payments, workflow.handoffs, "All"),
    ).toEqual(applications);
    for (const stage of stages) {
      const filtered = filterApplicationsByStage(
        applications,
        workflow.payments,
        workflow.handoffs,
        stage,
      );
      expect(filtered).toEqual(applications.filter((item) => stageFor(item) === stage));
    }
    expect(
      filterApplicationsByStage(applications, workflow.payments, workflow.handoffs, null).every(
        (item) => stageFor(item) !== "Admitted",
      ),
    ).toBe(true);
  });

  it("derives application stages once for counts, filtered rows, and detail status", () => {
    const toReview = person({ id: "review", applicationStatus: "Received" });
    const awaitingPayment = person({
      id: "awaiting",
      applicationStatus: "Reviewed",
      accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
      plan: [{ ...plan[0]!, label: "Admission Fee" }, plan[1]!],
    });
    const readyToSend = person({
      id: "ready",
      applicationStatus: "Reviewed",
      accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
      plan: [{ ...plan[0]!, label: "Admission Fee" }, plan[1]!],
    });
    const withAdministration = person({
      id: "sent",
      applicationStatus: "Reviewed",
      accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
      plan: [{ ...plan[0]!, label: "Admission Fee" }, plan[1]!],
    });
    const admitted = person({ id: "admitted", admissionNo: "ADM-1" });
    const payments = [
      { ...payment("i1", 40), personId: awaitingPayment.id },
      { ...payment("i1", 100), personId: readyToSend.id },
      { ...payment("i1", 100), personId: withAdministration.id },
    ];
    const sent = recordAdministrationDetailsSent(
      [],
      withAdministration,
      payments.filter((item) => item.personId === withAdministration.id),
      "2026-10-02",
    );
    const people = [toReview, awaitingPayment, readyToSend, withAdministration, admitted];
    const stageFor = (item: Person) =>
      applicationStage(
        item,
        payments.filter((itemPayment) => itemPayment.personId === item.id),
        sent,
      );
    const stages = people.map(stageFor);
    const cardStages = [
      "To review",
      "Awaiting payment",
      "Ready to send",
      "Handoff prepared",
    ] as const;
    const defaultRows = people.filter((item) => stageFor(item) !== "Admitted");
    const cardCounts = cardStages.map((stage) => ({
      stage,
      count: people.filter((item) => stageFor(item) === stage).length,
      rows: defaultRows.filter((item) => stageFor(item) === stage),
    }));

    expect(stages).toEqual([
      "To review",
      "Awaiting payment",
      "Ready to send",
      "Handoff prepared",
      "Admitted",
    ]);
    expect(cardCounts.map(({ count, rows }) => count - rows.length)).toEqual([0, 0, 0, 0]);
    for (const [index, item] of people.entries()) {
      const expectedStage = stages[index];
      expect(stageFor(item)).toBe(expectedStage);
      expect(
        applicationStage(
          item,
          payments.filter((itemPayment) => itemPayment.personId === item.id),
          sent,
        ),
      ).toBe(expectedStage);
    }
    expect(applicationStage(toReview, [], [], false)).toBe("Awaiting payment");
    expect(
      applicationStage(person({ id: "later-installment-only" }), [
        { ...payment("i2", 100), personId: "later-installment-only" },
      ]),
    ).toBe("To review");
  });

  it("classifies application list status from correction workflow and moves verified applications to Billing", () => {
    const applicant = person({
      id: "application-list",
      applicationStatus: "Received",
      appliedOn: "2026-11-14T09:30:00.000Z",
    });
    expect(applicationListStatus(applicant)).toBe("New");
    expect(appearsInBilling(applicant, [])).toBe(false);

    const correctionRequest = createCorrectionRequest(
      applicant,
      [{ documentType: "ID proof", issue: "Rejected", reason: "Unreadable." }],
      "2026-11-14T10:00:00.000Z",
    );
    expect(applicationListStatus(applicant, [], [], [correctionRequest])).toBe("Pending");

    const resubmittedRequest = {
      ...correctionRequest,
      status: "Resubmitted" as const,
      resubmittedAt: "2026-11-14T11:00:00.000Z",
      documents: [
        {
          ...correctionRequest.documents[0]!,
          resubmittedAt: "2026-11-14T11:00:00.000Z",
          resubmittedFileUrl: "/id-proof.pdf?resubmission=1",
        },
      ],
      history: [
        ...(correctionRequest.history ?? []),
        {
          action: "Resubmitted" as const,
          date: "2026-11-14T11:00:00.000Z",
          actor: "Admission (Sales)",
          documentTypes: ["ID proof" as const],
        },
      ],
    };
    expect(applicationListStatus(applicant, [], [], [resubmittedRequest])).toBe("Pending");
    const resubmission = applicationResubmissionForReview(applicant, [resubmittedRequest]);
    expect(resubmission).toEqual({
      correctionRequestId: resubmittedRequest.id,
      date: "2026-11-14T11:00:00.000Z",
      documentTypes: ["ID proof"],
    });
    expect(matchesApplicationListFilter("New", false, "New")).toBe(true);
    expect(matchesApplicationListFilter("Pending", false, "New")).toBe(false);
    expect(matchesApplicationListFilter("New", true, "New")).toBe(false);
    expect(matchesApplicationListFilter("Pending", false, "Pending")).toBe(true);
    expect(matchesApplicationListFilter("Pending", false, "All")).toBe(true);

    const verified = { ...applicant, accountantVerifiedAt: "2026-11-14T12:00:00.000Z" };
    expect(applicationListStatus(verified)).toBeNull();
    expect(appearsInBilling(verified, [])).toBe(true);
  });

  it("detects only resubmitted documents that are still pending Accounts review", () => {
    const correctedDocument = {
      type: "ID proof" as const,
      fileName: "id-proof-corrected.pdf",
      fileUrl: "/id-proof.pdf?resubmission=1",
      provided: true,
    };
    const applicant = person({
      id: "resubmission-review",
      applicationStatus: "Received",
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
        documents: [correctedDocument],
        declarationAccepted: true,
      },
    });
    const correctionRequest = createCorrectionRequest(
      applicant,
      [{ documentType: "ID proof", issue: "Rejected", reason: "Unreadable." }],
      "2026-11-14T10:00:00.000Z",
    );
    expect(hasResubmittedDocumentsAwaitingReview(applicant, [correctionRequest])).toBe(false);
    expect(hasResubmittedDocumentsAwaitingReview(applicant, [])).toBe(false);
    expect(applicationListStatus(applicant)).toBe("New");
    expect(applicationListStatus(applicant, [], [], [correctionRequest])).toBe("Pending");

    const resubmittedRequest = {
      ...correctionRequest,
      status: "Resubmitted" as const,
      resubmittedAt: "2026-11-14T11:00:00.000Z",
      documents: [
        {
          ...correctionRequest.documents[0]!,
          resubmittedAt: "2026-11-14T11:00:00.000Z",
          resubmittedFileUrl: correctedDocument.fileUrl,
        },
      ],
      history: [
        ...(correctionRequest.history ?? []),
        {
          action: "Resubmitted" as const,
          date: "2026-11-14T11:00:00.000Z",
          actor: "Admission (Sales)",
          documentTypes: ["ID proof" as const],
        },
      ],
    };
    expect(hasResubmittedDocumentsAwaitingReview(applicant, [resubmittedRequest])).toBe(true);
    expect(applicationStage(applicant, [], [], true, [resubmittedRequest])).toBe(
      "Resubmitted for Review",
    );
    expect(applicationListStatus(applicant, [], [], [resubmittedRequest])).toBe("Pending");

    const verificationEvent = {
      status: "Rejected" as const,
      decision: "Rejected" as const,
      previousStatus: "Pending" as const,
      date: "2026-11-14T11:00:00.000Z",
      fileName: correctedDocument.fileName,
      sourceFingerprint: documentSourceFingerprint(
        correctedDocument.fileName,
        correctedDocument.fileUrl,
      ),
      reviewer: "Accounts Officer",
      reason: "Still unreadable.",
    };
    const reviewedApplicant = {
      ...applicant,
      documentVerifications: [
        {
          documentType: "ID proof" as const,
          ...verificationEvent,
          history: [verificationEvent],
        },
      ],
    };
    expect(hasResubmittedDocumentsAwaitingReview(reviewedApplicant, [resubmittedRequest])).toBe(
      false,
    );
    expect(applicationStage(reviewedApplicant, [], [], true, [resubmittedRequest])).toBe(
      "To review",
    );
    expect(applicationListStatus(reviewedApplicant, [], [], [resubmittedRequest])).toBe("Pending");
  });

  it("sends one correction request for missing and rejected documents and resubmits them together", () => {
    const originalDocument = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "/sample-documents/id-proof.pdf",
      provided: true,
    };
    const applicationDetails: StudentApplicationDetails = {
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
      documents: [originalDocument, { type: "TC", provided: false }],
      declarationAccepted: true,
    };
    const applicant = person({ applicationDetails });
    expect(applicationStage(applicant)).toBe("To review");
    expect(filterApplicationsByStage([applicant], [], [], "To review")).toEqual([applicant]);

    const decision = recordDocumentVerification(
      applicant,
      originalDocument,
      "Rejected",
      "The name is not legible.",
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    const correctionRequest = createCorrectionRequest(
      decision.person,
      [
        { documentType: "ID proof", issue: "Rejected", reason: "The name is not legible." },
        { documentType: "TC", issue: "Missing", reason: "Required document is missing." },
      ],
      "2026-11-07T10:00:00.000Z",
    );
    expect(hasUnresolvedCorrectionRequest([correctionRequest], applicant.applicationId)).toBe(true);
    expect(applicationStage(decision.person, [], [], true, [correctionRequest])).toBe(
      "Awaiting Resubmission",
    );
    expect(
      filterApplicationsByStage([decision.person], [], [], "Awaiting Resubmission", [
        correctionRequest,
      ]),
    ).toEqual([decision.person]);
    expect(correctionRequest).toMatchObject({
      applicationId: applicant.applicationId,
      studentName: applicant.name,
      documents: [
        { documentType: "ID proof", issue: "Rejected", reason: "The name is not legible." },
        { documentType: "TC", issue: "Missing", reason: "Required document is missing." },
      ],
      status: "Awaiting Resubmission",
    });

    const awaitingRequests = [correctionRequest];
    expect(hasUnresolvedCorrectionRequest(awaitingRequests, applicant.applicationId)).toBe(true);
    const requests = resubmitCorrection(
      awaitingRequests,
      correctionRequest.id,
      [
        { documentType: "ID proof", fileUrl: originalDocument.fileUrl },
        { documentType: "TC", fileUrl: sampleDocumentFile("TC").fileUrl },
      ],
      "2026-11-07T11:00:00.000Z",
    );
    expect(hasUnresolvedCorrectionRequest(requests, applicant.applicationId)).toBe(false);
    const resubmitted = applyResubmissions(decision.person, requests);
    expect(applicationStage(resubmitted, [], [], true, requests)).toBe("Resubmitted for Review");
    expect(
      filterApplicationsByStage(
        [resubmitted, applicant],
        [],
        [],
        "Resubmitted for Review",
        requests,
      ),
    ).toEqual([resubmitted]);
    const replacementDocuments = resubmitted.applicationDetails!.documents;
    expect(replacementDocuments[0]).toMatchObject({
      provided: true,
      fileUrl: "/sample-documents/id-proof.pdf?resubmission=1",
    });
    expect(replacementDocuments[1]).toMatchObject({
      provided: true,
      fileName: "tc.pdf",
      fileUrl: "/sample-documents/tc.pdf?resubmission=1",
    });
    expect(
      replacementDocuments.map((document) =>
        documentVerificationStatus(document, resubmitted.documentVerifications),
      ),
    ).toEqual(["Pending", "Pending"]);
    expect(resubmitted.documentVerifications?.[0]?.history[0]?.fileUrl).toBe(
      originalDocument.fileUrl,
    );
    expect(decision.person.documentVerifications?.[0]?.history[0]).toMatchObject({
      previousStatus: "Pending",
      status: "Rejected",
      reviewer: "Accountant (Finance)",
      reason: "The name is not legible.",
    });
    expect(correctionRequest.history?.map((event) => event.action)).toEqual(["Requested"]);
  });

  it("reviews pending documents independently and preserves their prior status", () => {
    const first = {
      type: "ID proof" as const,
      fileName: "id-proof.pdf",
      fileUrl: "/sample-documents/id-proof.pdf",
      provided: true,
    };
    const second = {
      type: "TC" as const,
      fileName: "tc.pdf",
      fileUrl: "/sample-documents/tc.pdf",
      provided: true,
    };
    const applicant = person({
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
        documents: [first, second],
        declarationAccepted: true,
      },
    });
    const approved = recordDocumentVerification(applicant, second, "Approved");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(documentVerificationStatus(first, approved.person.documentVerifications)).toBe(
      "Pending",
    );
    expect(documentVerificationStatus(second, approved.person.documentVerifications)).toBe(
      "Approved",
    );
    expect(approved.person.documentVerifications?.[0]?.history[0]).toMatchObject({
      previousStatus: "Pending",
      status: "Approved",
      reviewer: "Accountant (Finance)",
    });

    const allApproved = recordDocumentVerification(approved.person, first, "Approved");
    expect(allApproved.ok).toBe(true);
    if (!allApproved.ok) return;
    expect(allApproved.allRequiredDocumentsApproved).toBe(true);
    expect(allApproved.person.accountantVerifiedAt).toBeUndefined();
    expect(isApplicationVerified(allApproved.person)).toBe(false);
    expect(applicationStage(allApproved.person)).toBe("To review");

    const verified = markApplicationReviewed(allApproved.person);
    expect(isApplicationVerified(verified)).toBe(true);
    expect(applicationStage(verified)).toBe("Awaiting payment");
    expect(markApplicationReviewed(verified).accountantVerifiedAt).toBe(
      verified.accountantVerifiedAt,
    );
    expect(applicationStage({ ...verified, applicationStatus: "Received" })).toBe(
      "Awaiting payment",
    );
  });

  it("adds a newly rejected document to the same open request without duplicates", () => {
    const applicant = person();
    const request = createCorrectionRequest(
      applicant,
      [{ documentType: "ID proof", issue: "Rejected", reason: "Unreadable." }],
      "2026-11-07T10:00:00.000Z",
    );
    const added = {
      documentType: "TC" as const,
      issue: "Rejected" as const,
      reason: "Incorrect document.",
    };
    const withAddition = addDocumentsToOpenCorrectionRequest(
      [request],
      applicant.applicationId,
      [added],
      "2026-11-07T11:00:00.000Z",
    );
    const duplicate = addDocumentsToOpenCorrectionRequest(
      withAddition,
      applicant.applicationId,
      [added],
      "2026-11-07T12:00:00.000Z",
    );
    const updatedReason = addDocumentsToOpenCorrectionRequest(
      duplicate,
      applicant.applicationId,
      [{ documentType: "ID proof", issue: "Rejected", reason: "Upload a clearer copy." }],
      "2026-11-07T13:00:00.000Z",
    );
    expect(withAddition).toHaveLength(1);
    expect(withAddition[0]?.id).toBe(request.id);
    expect(withAddition[0]?.documents.map((item) => item.documentType)).toEqual(["ID proof", "TC"]);
    expect(duplicate).toBe(withAddition);
    expect(updatedReason[0]?.id).toBe(request.id);
    expect(updatedReason[0]?.documents[0]?.reason).toBe("Upload a clearer copy.");
    expect(updatedReason[0]?.history?.map((event) => event.action)).toEqual([
      "Requested",
      "Documents added",
      "Request updated",
    ]);
    const completedCycle = resubmitCorrection(
      updatedReason,
      request.id,
      [
        { documentType: "ID proof", fileUrl: sampleDocumentFile("ID proof").fileUrl },
        { documentType: "TC", fileUrl: sampleDocumentFile("TC").fileUrl },
      ],
      "2026-11-07T14:00:00.000Z",
    );
    const nextCycle = createCorrectionRequest(
      applicant,
      [{ documentType: "ID proof", issue: "Rejected", reason: "Still unreadable." }],
      "2026-11-07T15:00:00.000Z",
      completedCycle,
    );
    expect(completedCycle[0]?.status).toBe("Resubmitted");
    expect(completedCycle[0]?.history?.at(-1)?.action).toBe("Resubmitted");
    expect(nextCycle.id).not.toBe(request.id);
  });

  it("includes billed or paid applicants in Billing and previews only unnotified payments", () => {
    const billedPerson = person({ billCreated: true, admissionNo: "ADM2026-500" });
    const paid = { ...payment("i1", 40), adminNotified: true };
    const unpaid = {
      ...payment("i2", 25, "2026-10-03"),
      id: "pay-i2-unnotified",
      reference: "TXN-2",
      adminNotified: false,
    };
    expect(appearsInBilling(person(), [])).toBe(false);
    expect(appearsInBilling(person(), [paid])).toBe(true);
    expect(appearsInBilling(billedPerson, [])).toBe(true);
    const payload = buildPaymentNotificationPayload(billedPerson, [paid, unpaid]);
    expect(payload).toMatchObject({
      name: billedPerson.name,
      contact: billedPerson.contact,
      admissionNo: "ADM2026-500",
      note: "Payment details prepared for Administration.",
    });
    expect(payload.payments).toEqual([
      {
        id: "pay-i2-unnotified",
        date: "2026-10-03",
        amount: 25,
        installmentsCovered: [{ label: "Instalment 1", amount: 25 }],
        remainingBalance: 135,
      },
    ]);
  });

  it("builds configured plans with a full-payment fallback and rounded installment splits", () => {
    const full = buildPlan("full", "Python", "2026-10-22", []);
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ label: "Full payment", amountDue: 16000 });

    const three = buildPlan("three", "Python", "2026-10-22", DEMO_FEE_PLANS["Python"]!, 3);
    expect(three.map(({ label, amountDue }) => [label, amountDue])).toEqual([
      ["Admission Fee", 6000],
      ["Instalment 1", 3333],
      ["Instalment 2", 3333],
      ["Instalment 3", 3334],
    ]);
    expect(three.map(({ id }) => id)).toEqual(["three-I01", "three-I02", "three-I03", "three-I04"]);

    const four = buildPlan(
      "four",
      "Advanced Data Science",
      "2026-10-22",
      DEMO_FEE_PLANS["Advanced Data Science"]!,
      4,
    );
    expect(four.map(({ amountDue }) => amountDue)).toEqual([25000, 12500, 12500, 12500, 12500]);
    expect(four.map(({ label }) => label)).toEqual([
      "Admission Fee",
      "Instalment 1",
      "Instalment 2",
      "Instalment 3",
      "Instalment 4",
    ]);
    expect(four.reduce((total, installment) => total + installment.amountDue, 0)).toBe(75000);

    const noRegistration = buildPlan(
      "no-registration",
      "Other course",
      "2026-10-22",
      [
        { label: "Tuition 1", amount: 10000 },
        { label: "Tuition 2", amount: 10000 },
      ],
      3,
    );
    expect(noRegistration.map(({ label }) => label)).toEqual([
      "Instalment 1",
      "Instalment 2",
      "Instalment 3",
    ]);
    expect(noRegistration.map(({ amountDue }) => amountDue)).toEqual([6666, 6666, 6668]);
  });

  it("generates demo dates relative to an injected today", () => {
    expect(demoDate(-1, "2026-10-22")).toBe("2026-10-21");
    expect(demoDate(4, "2026-10-22")).toBe("2026-10-26");
  });

  it("seeds the existing twelve scenarios plus two complete applications", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const scenarios = workflow.persons.filter(
      (item) =>
        item.applicationId.startsWith("APP2026-1") &&
        Number(item.applicationId.slice("APP2026-".length)) >= 118 &&
        Number(item.applicationId.slice("APP2026-".length)) <= 129,
    );
    expect(scenarios).toHaveLength(12);
    expect(DEMO_SCENARIO_PEOPLE).toHaveLength(14);
    expect(scenarios.map((item) => item.appliedOn)).toEqual([
      demoDate(-1),
      demoDate(-2),
      demoDate(-3),
      demoDate(-5),
      demoDate(-7),
      demoDate(-10),
      demoDate(-30),
      demoDate(-60),
      demoDate(-70),
      demoDate(-30),
      demoDate(-8),
      demoDate(-4),
    ]);

    const expected = [
      ["Received", false, "Review Application", "On Hold", null],
      ["Received", false, "Review Application", "On Hold", null],
      ["Reviewed", false, "Record Payment", "On Hold", null],
      ["Payment Recorded", true, "Record Payment", "On Hold", null],
      ["Payment Recorded", true, null, null, null],
      ["Payment Recorded", true, "Enter Admission No.", null, null],
      ["Admitted", true, "Send Reminder", null, null],
      ["Admitted", true, "Send Reminder", "On Hold", "Reminder sent"],
      ["Admitted", true, "Send Reminder", "On Hold", "Reminder sent"],
      ["Admitted", true, "Notify Administration", "Payment Cleared", null],
      ["Admitted", true, null, null, null],
      ["Received", false, "Review Application", "On Hold", null],
    ] as const;
    const billingStudents = createDemoBillingStudents(workflow);
    const billingPayments = createDemoBillingPayments(seedPayments, workflow);
    expect(billingPayments.filter((payment) => payment.id === "APP-PAY-003")).toHaveLength(1);

    scenarios.forEach((scenario, index) => {
      const personPayments = workflow.payments.filter((item) => item.personId === scenario.id);
      const [status, appearsInBilling, action, access, followUp] = expected[index]!;
      expect(scenario.applicationStatus).toBe(status);
      expect(billingStudents.some((student) => student.id === scenario.id)).toBe(appearsInBilling);
      expect(nextAction(scenario, personPayments, workflow.handoffs)).toBe(action);
      expect(classAccess(scenario, personPayments)).toBe(access);
      expect(followUpStatus(scenario, personPayments)).toBe(followUp);

      if (scenario.id !== "APP-P-129") {
        const form = scenario.applicationDetails!;
        expect(
          [
            form.dateOfBirth,
            form.addressLine1,
            form.addressLine2,
            form.city,
            form.state,
            form.postalCode,
            form.guardianName,
            form.guardianRelationship,
            form.guardianPhone,
            form.guardianEmail,
            form.educationWorkExperience,
            form.leadSource,
            form.leadReference,
            form.coursePreference,
          ].every(Boolean),
        ).toBe(true);
        expect(form.installmentPreference).toBeGreaterThan(0);
        expect(Object.keys(form.documents ?? {})).toHaveLength(4);
        expect(form.declarationAccepted).toBe(true);
      }

      const totals = personTotals(scenario, personPayments);
      expect(totals.payable).toBe(
        scenario.plan.reduce((sum, installment) => sum + installment.amountDue, 0),
      );
      expect(totals.paid).toBe(personPayments.reduce((sum, payment) => sum + payment.amount, 0));
      expect(totals.outstanding).toBe(totals.payable - totals.paid);
      for (const payment of personPayments) {
        expect(payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(
          payment.amount,
        );
      }
    });

    expect(DEMO_SCENARIO_PAYMENT_SPECS).toHaveLength(9);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.applicationId)).size).toBe(14);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.email)).size).toBe(14);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.contact)).size).toBe(14);
    expect(new Set(DEMO_SCENARIO_PAYMENT_SPECS.map((item) => item.reference)).size).toBe(9);
    expect(new Set(DEMO_SCENARIO_PAYMENT_SPECS.map((item) => item.receiptNo)).size).toBe(9);
    expect(
      DEMO_SCENARIO_PEOPLE.every(
        (scenario) =>
          !workflow.persons.some(
            (item) =>
              item.id !== scenario.id &&
              (item.applicationId === scenario.applicationId ||
                item.email === scenario.email ||
                item.contact === scenario.contact),
          ),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PAYMENT_SPECS.every(
        (spec) =>
          !seedPayments.some(
            (item) => item.reference === spec.reference || item.receiptNo === spec.receiptNo,
          ),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PEOPLE.filter((item) => item.id !== "APP-P-129").every((item) =>
        item.applicationDetails?.documents.some((document) => document.provided),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PEOPLE.find((item) => item.id === "APP-P-129")?.applicationDetails,
    ).toMatchObject({
      dateOfBirth: "",
      guardianName: "",
      leadSource: "",
      addressLine1: "",
      declarationAccepted: false,
      documents: [{ type: "ID proof", provided: false }],
      documentsEnclosed: [],
    });
    expect(billingStudents).toHaveLength(DEMO_BILLING_SCENARIO_PERSON_IDS.length + 1);
    expect(billingStudents.some((student) => student.id === "APP-P-003")).toBe(true);
    expect(
      billingPayments.filter((item) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(item.studentId)),
    ).toHaveLength(9);
    const addedBilled = billingStudents
      .filter((student) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(student.id))
      .reduce((total, student) => total + student.totalFee, 0);
    const addedPaid = billingPayments
      .filter((item) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(item.studentId))
      .reduce((total, item) => total + item.amount, 0);
    expect(addedBilled).toBe(419000);
    expect(addedPaid).toBe(161000);
    const allBillingStudents = [...seedStudents, ...billingStudents];
    expect(allBillingStudents.slice(0, seedStudents.length)).toEqual(seedStudents);
    expect(billingPayments.slice(0, seedPayments.length)).toEqual(seedPayments);
    const totalBilled = allBillingStudents.reduce((total, student) => total + student.totalFee, 0);
    const totalPaid = billingPayments.reduce((total, item) => total + item.amount, 0);
    const rowOutstanding = allBillingStudents.reduce(
      (total, student) =>
        total + Math.max(0, student.totalFee - studentPaid(student.id, billingPayments)),
      0,
    );
    expect(totalBilled).toBe(
      allBillingStudents.reduce((total, student) => total + student.totalFee, 0),
    );
    expect(totalPaid).toBe(billingPayments.reduce((total, item) => total + item.amount, 0));
    expect(totalBilled - totalPaid).toBe(rowOutstanding);
    expect([totalBilled, totalPaid, rowOutstanding]).toEqual([1489000, 654000, 835000]);
    expect(scenarios[6]?.plan[1]?.dueDate).toBe(demoDate(4));
    expect(scenarios[7]?.plan[1]?.dueDate).toBe(demoDate(-12));
    expect(scenarios[7]?.plan[1]?.reminders).toHaveLength(1);
    expect(scenarios[8]?.plan[1]?.dueDate).toBe(demoDate(-25));
    expect(scenarios[8]?.plan[1]?.reminders).toHaveLength(MAX_REMINDERS);
    expect(scenarios[9]?.plan[1]?.dueDate).toBe(demoDate(-10));
    expect(workflow.payments.find((item) => item.reference === "TXN880608")?.date).toBe(
      demoDate(-3),
    );
    expect(scenarios[10]?.plan.map(({ label }) => label)).toEqual([
      "Admission Fee",
      "Instalment 1",
    ]);

    const snapshots = workflow.handoffs.flatMap((handoff) =>
      handoff.history
        .filter((event) => event.snapshot)
        .map((event) => ({ handoff, event, snapshot: event.snapshot! })),
    );
    expect(snapshots).toHaveLength(6);
    for (const { handoff, event, snapshot } of snapshots) {
      const scenario = scenarios.find((item) => item.id === handoff.personId)!;
      const sentDate = event.date.slice(0, 10);
      expect(snapshot.applicationForm).toEqual(scenario.applicationDetails);
      expect(snapshot.applicationForm?.educationWorkExperience).toBeTruthy();
      expect(snapshot).not.toHaveProperty("admissionNo");
      expect(snapshot.paymentSummary.payments.every((item) => item.date <= sentDate)).toBe(true);
      expect(snapshot.paymentSummary.totalPaid).toBe(
        snapshot.paymentSummary.payments.reduce((sum, item) => sum + item.amount, 0),
      );
      const paymentsAtSend = workflow.payments.filter(
        (item) => item.personId === scenario.id && item.date <= sentDate,
      );
      expect(snapshot.paymentSummary.totalPaid).toBe(
        paymentsAtSend.reduce((sum, item) => sum + item.amount, 0),
      );
      expect(snapshot.paymentSummary.installmentsPaid).toBe(
        scenario.plan.filter(
          (installment) =>
            installmentOutstanding(installment, paymentsAtSend) === 0 && installment.amountDue > 0,
        ).length,
      );
      expect(snapshot.paymentSummary.outstanding).toBe(
        scenario.plan.reduce((sum, item) => sum + item.amountDue, 0) -
          snapshot.paymentSummary.totalPaid,
      );
      expect(JSON.stringify(snapshot)).not.toContain(scenario.admissionNo ?? "no-admission");
    }
    expect(
      workflow.payments
        .filter((item) => scenarios.some((scenario) => scenario.id === item.personId))
        .filter((item) => item.reference !== "TXN880601" && item.reference !== "TXN880608")
        .every((item) => item.adminNotified),
    ).toBe(true);
    expect(workflow.payments.find((item) => item.reference === "TXN880608")?.adminNotified).toBe(
      false,
    );
    expect(
      workflow.payments.find((item) => item.reference === "TXN880608")?.confirmation.status,
    ).toBe("Pending");
  });

  it("creates unnotified payments and marks selected payments notified only once", () => {
    const created = createNewFeeWorkflowPayment(
      {
        personId: "p1",
        amount: 100,
        date: "2026-10-22",
        method: "UPI",
        reference: "TXN-NEW",
        receiptNo: "RCP-NEW",
        allocations: [{ installmentId: "i1", amount: 100 }],
        confirmation: { status: "Not Sent" },
      },
      "new-payment",
    );
    expect(created.adminNotified).toBe(false);

    const unchanged = payment("i1", 100);
    const notified = markPaymentsAdministrationNotified([created, unchanged], [created.id]);
    expect(notified[0]?.adminNotified).toBe(true);
    expect(notified[1]).toBe(unchanged);
    expect(markPaymentsAdministrationNotified(notified, [created.id])).toBe(notified);
  });

  it("keeps the editable demo plan totals and workflow defaults consistent", () => {
    expect(DEMO_FEE_PLANS["Python"]?.reduce((total, item) => total + item.amount, 0)).toBe(16000);
    expect(DEMO_FEE_PLANS["Tally"]?.reduce((total, item) => total + item.amount, 0)).toBe(12000);
    expect(
      DEMO_FEE_PLANS["Advanced Data Science"]?.reduce((total, item) => total + item.amount, 0),
    ).toBe(75000);
    expect([REMINDER_LEAD_DAYS, MAX_REMINDERS]).toEqual([4, 2]);
    const applicants = newDemoApplicants();
    expect(applicants).toHaveLength(3);
    expect(applicants[0]?.plan.map((installment) => installment.dueDate)).toEqual([
      "2026-10-18",
      "2026-11-18",
      "2026-12-18",
    ]);
  });

  it("allocates a full payment to the oldest unpaid installment", () => {
    expect(allocatePayment(plan, [], 100)).toEqual([{ installmentId: "i1", amount: 100 }]);
  });

  it("allocates carry-over from a specific installment and detects newly eligible handoffs", () => {
    expect(allocatePayment(plan, [], 150, "i2")).toEqual([
      { installmentId: "i2", amount: 100 },
      { installmentId: "i1", amount: 50 },
    ]);

    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const partialRegistration = {
      ...workflow.persons.find((item) => item.id === "APP-P-121")!,
      applicationDetails: undefined,
      accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
    };
    const existingPayments = workflow.payments.filter(
      (item) => item.personId === partialRegistration.id,
    );
    expect(existingPayments[0]?.amount).toBe(10000);
    expect(isEligibleNow(partialRegistration, existingPayments, workflow.handoffs)).toBe(false);

    const completedRegistration: FeeWorkflowPayment = {
      id: "payment-registration-completed",
      personId: partialRegistration.id,
      amount: 15000,
      date: TODAY,
      method: "UPI",
      reference: "TXN-REG-COMPLETE",
      receiptNo: "RCP-REG-COMPLETE",
      allocations: allocatePayment(partialRegistration.plan, existingPayments, 15000),
      adminNotified: false,
      confirmation: { status: "Not Sent" },
    };
    expect(
      isEligibleNow(
        partialRegistration,
        [...existingPayments, completedRegistration],
        workflow.handoffs,
      ),
    ).toBe(true);
  });

  it("allocates partial payments and carries excess into the next installment", () => {
    expect(allocatePayment(plan, [payment("i1", 40)], 60)).toEqual([
      { installmentId: "i1", amount: 60 },
    ]);
    expect(allocatePayment(plan, [], 150)).toEqual([
      { installmentId: "i1", amount: 100 },
      { installmentId: "i2", amount: 50 },
    ]);
  });

  it("allocates a payment toward a selected installment", () => {
    expect(allocatePayment(plan, [], 100, "i2")).toEqual([{ installmentId: "i2", amount: 100 }]);
  });

  it("allocates only across the explicitly selected installments", () => {
    expect(allocatePayment(plan, [], 150, ["i2", "i1"])).toEqual([
      { installmentId: "i1", amount: 100 },
      { installmentId: "i2", amount: 50 },
    ]);
    expect(() => allocatePayment(plan, [], 101, ["i2"])).toThrow(RangeError);
  });

  it("uses recorded allocations in the admitted student installment schedule", () => {
    const student: Student = {
      id: "p1",
      name: "Test Student",
      regNo: "ADM-1",
      course: "Python",
      phone: "",
      registeredOn: "2026-10-01",
      totalFee: 200,
      installments: [
        { label: "Registration", due: "2026-10-01", amount: 100 },
        { label: "Instalment 1", due: "2026-11-01", amount: 100 },
      ],
    };
    const mirrored = {
      id: "pmt-1",
      studentId: "p1",
      date: "2026-10-02",
      amount: 100,
      method: "UPI" as const,
      reference: "R-1",
      receiptNo: "RCP-1",
      allocations: [{ installmentId: "p1-I02", amount: 100 }],
    };
    expect(installmentSchedule(student, 100, TODAY, [mirrored]).map((item) => item.paid)).toEqual([
      0, 100,
    ]);
  });

  it("rejects payments greater than the total outstanding balance", () => {
    expect(() => allocatePayment(plan, [], 201)).toThrow(RangeError);
  });

  it("calculates installment payment, outstanding and every status", () => {
    const paid = payment("i1", 100, "2026-09-30");
    const partial = payment("i2", 40, "2026-10-10");
    const futureInstallment = { ...plan[1]!, dueDate: demoDate(10) };
    expect(installmentPaid("i1", [paid])).toBe(100);
    expect(installmentOutstanding(futureInstallment, [partial])).toBe(60);
    expect(installmentStatus(plan[0]!, [paid])).toBe("Paid");
    expect(installmentStatus(futureInstallment, [partial])).toBe("Partially Paid");
    expect(installmentStatus(futureInstallment, [])).toBe("Pending");
    expect(installmentStatus(plan[0]!, [])).toBe("Overdue");
  });

  it("derives person totals, next due installment and overdue days", () => {
    const totals = personTotals(person(), [payment("i1", 40, "2026-10-10")], "2026-10-20");
    expect(totals).toMatchObject({
      payable: 200,
      paid: 40,
      outstanding: 160,
      nextDueInstallment: plan[0],
      daysOverdue: 19,
    });
  });

  it("holds access for overdue balances and reports cleared late payments", () => {
    expect(classAccess(person(), [], TODAY)).toBe("On Hold");
    const latePaid = payment("i1", 100, "2026-10-03");
    expect(classAccess(person({ plan: [plan[0]!] }), [latePaid], TODAY)).toBe("Payment Cleared");
    expect(
      classAccess(person({ plan: [{ ...plan[1]!, dueDate: demoDate(10) }] }), [], TODAY),
    ).toBeNull();
  });

  it("requires the Admission Fee itself to be fully paid before handoff", () => {
    const applicant = person({
      plan: [
        { ...plan[0]!, label: "Admission Fee" },
        { ...plan[1]!, label: "Installment 1" },
      ],
    });
    const laterInstallment = {
      ...payment("i2", 100, "2026-09-30"),
      allocations: [{ installmentId: "i2", amount: 100 }],
    };
    expect(canSendToAdministration(applicant, [])).toBe(false);
    expect(
      canSendToAdministration(applicant, [
        { ...payment("i1", 50), allocations: [{ installmentId: "i1", amount: 50 }] },
      ]),
    ).toBe(false);
    expect(canSendToAdministration(applicant, [laterInstallment])).toBe(false);
    expect(
      canSendToAdministration(applicant, [
        { ...payment("i1", 100), allocations: [{ installmentId: "i1", amount: 100 }] },
      ]),
    ).toBe(true);
  });

  it("uses a fully paid first installment only when an Admission Fee installment is absent", () => {
    const applicant = person({ accountantVerifiedAt: "2026-10-02T10:00:00.000Z" });
    const paidFirstInstallment = {
      ...payment("i1", 100),
      allocations: [{ installmentId: "i1", amount: 100 }],
    };
    expect(canSendToAdministration(applicant, [])).toBe(false);
    expect(canSendToAdministration(applicant, [payment("i1", 50)])).toBe(false);
    expect(canSendToAdministration(applicant, [payment("i2", 100)])).toBe(false);
    expect(canSendToAdministration(applicant, [paidFirstInstallment])).toBe(true);

    const unverified = { ...applicant, accountantVerifiedAt: undefined };
    const paymentFirst = autoForwardEligibleApplications({
      persons: [unverified],
      payments: [paidFirstInstallment],
      handoffs: [],
    });
    expect(paymentFirst.handoffs).toHaveLength(0);
    const verified = autoForwardEligibleApplications({
      ...paymentFirst,
      persons: [{ ...unverified, accountantVerifiedAt: "2026-10-03T10:00:00.000Z" }],
    });
    expect(verified.handoffs).toHaveLength(1);
    expect(verified.handoffs[0]).toMatchObject({
      status: "Ready",
      idempotencyKey: `administration-handoff:${applicant.id}:${applicant.applicationId}`,
      delivery: { status: "Not Sent" },
    });
    expect(autoForwardEligibleApplications(verified).handoffs).toHaveLength(1);
  });

  it("uses only decided and applied concession rules for handoff eligibility", () => {
    const applicant = person({
      plan: [
        { ...plan[0]!, label: "Admission Fee" },
        { ...plan[1]!, label: "Installment 1" },
      ],
    });
    const fullyPaid = {
      ...payment("i1", 100),
      allocations: [{ installmentId: "i1", amount: 100 }],
    };

    expect(
      canSendToAdministration(
        applicant,
        [fullyPaid],
        [concession(applicant.id, "Pending Director Decision")],
      ),
    ).toBe(false);
    expect(
      canSendToAdministration(applicant, [fullyPaid], [concession(applicant.id, "Approved")]),
    ).toBe(true);
    expect(
      canSendToAdministration(applicant, [fullyPaid], [concession(applicant.id, "Rejected")]),
    ).toBe(true);

    const approvedButUnapplied = {
      ...concession(applicant.id, "Approved"),
      applied: undefined,
    };
    expect(canSendToAdministration(applicant, [fullyPaid], [approvedButUnapplied])).toBe(false);
  });

  it("automatically prepares one handoff when verification and full Admission Fee are both satisfied", () => {
    const applicant = person({
      plan: [
        { ...plan[0]!, label: "Admission Fee" },
        { ...plan[1]!, label: "Installment 1" },
      ],
    });
    const paidAdmissionFee = {
      ...payment("i1", 100),
      allocations: [{ installmentId: "i1", amount: 100 }],
    };
    const fullyPaidFirst = {
      persons: [applicant],
      payments: [paidAdmissionFee],
      handoffs: [] as Handoff[],
    };
    expect(
      autoForwardEligibleApplications(fullyPaidFirst, "2026-10-03T10:00:00.000Z").handoffs,
    ).toHaveLength(0);

    const verifiedFirst = {
      ...fullyPaidFirst,
      persons: [{ ...applicant, accountantVerifiedAt: "2026-10-02T10:00:00.000Z" }],
    };
    const forwarded = autoForwardEligibleApplications(verifiedFirst, "2026-10-03T10:00:00.000Z");
    expect(forwarded.handoffs).toHaveLength(1);
    expect(forwarded.handoffs[0]).toMatchObject({
      status: "Ready",
      history: [
        {
          text: "Application handoff prepared",
          date: "2026-10-03T10:00:00.000Z",
        },
      ],
    });
    expect(autoForwardEligibleApplications(forwarded)).toBe(forwarded);

    const verifiedUnpaid = {
      persons: [{ ...applicant, accountantVerifiedAt: "2026-10-02T10:00:00.000Z" }],
      payments: [] as FeeWorkflowPayment[],
      handoffs: [] as Handoff[],
    };
    expect(autoForwardEligibleApplications(verifiedUnpaid).handoffs).toHaveLength(0);
    expect(
      autoForwardEligibleApplications({
        ...verifiedUnpaid,
        payments: [
          {
            ...payment("i1", 50),
            allocations: [{ installmentId: "i1", amount: 50 }],
          },
        ],
      }).handoffs,
    ).toHaveLength(0);
    const paidAfterVerification = autoForwardEligibleApplications({
      ...verifiedUnpaid,
      payments: [paidAdmissionFee],
    });
    expect(paidAfterVerification.handoffs).toHaveLength(1);
  });

  it("prioritizes application review before payment or reminders", () => {
    const applicant = person({ applicationStatus: "Received" });
    expect(nextAction(applicant, [])).toBe("Review Application");
  });

  it("skips application review when configured off", () => {
    const applicant = person({ applicationStatus: "Received" });
    expect(nextAction(applicant, [], [], TODAY, false)).toBe("Record Payment");
  });

  it("builds confirmation emails with two covered installments and admission status", () => {
    const applicant = person({ email: "s@example.com" });
    const paid = {
      ...payment("i1", 150),
      allocations: [
        { installmentId: "i1", amount: 100 },
        { installmentId: "i2", amount: 50 },
      ],
    };
    const message = buildPaymentConfirmationEmail(applicant, paid, [paid]);
    expect(message.to).toBe("s@example.com");
    expect(message.body).toContain("Test Student");
    expect(message.body).toContain("₹150");
    expect(message.body).toContain("Registration: ₹100");
    expect(message.body).toContain("Instalment 1: ₹50.00");
    expect(message.body).toContain("Admission No.: Pending");
    expect(
      buildPaymentConfirmationEmail({ ...applicant, admissionNo: "ADM-1" }, paid, [paid]).body,
    ).toContain("Admission No.: ADM-1");
  });

  it("prepares separate confirmation records with payment-specific receipt PDF references", () => {
    const applicant = person({ email: "student@example.com" });
    const first = payment("i1", 100);
    const second = {
      ...payment("i2", 100),
      id: "payment-second-installment",
      receiptNo: "RCP-SECOND",
    };
    const firstRequest = preparePaymentConfirmation(applicant, first, [first]);
    const secondRequest = preparePaymentConfirmation(applicant, second, [first, second]);

    expect(firstRequest).toMatchObject({
      idempotencyKey: `student-payment-confirmation:${first.id}`,
      paymentId: first.id,
      personId: applicant.id,
      recipient: applicant.email,
      receipt: {
        paymentId: first.id,
        receiptNo: first.receiptNo,
        fileName: `Receipt-${first.receiptNo}.pdf`,
        contentType: "application/pdf",
      },
    });
    expect(secondRequest?.idempotencyKey).not.toBe(firstRequest?.idempotencyKey);
    expect(secondRequest?.receipt.receiptNo).toBe(second.receiptNo);
    expect(first.confirmation.status).toBe("Not Sent");
  });

  it("keeps a submitted application, payment plan, and admitted Billing record on one stable ID", () => {
    const applicationDetails: StudentApplicationDetails = {
      dateOfBirth: "2004-03-14",
      passportPhoto: { fileName: "passport-photo.png", previewUrl: "data:image/svg+xml,avatar" },
      addressLine1: "10 Sample Road",
      addressLine2: "Flat 2",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      guardianName: "Parent Student",
      guardianRelationship: "Parent",
      guardianPhone: "9845000001",
      guardianEmail: "parent@example.com",
      educationWorkExperience: "BCom graduate; one year of office experience.",
      leadSource: "Website",
      leadReference: "WEB-001",
      coursePreference: "Python",
      installmentPreference: 2,
      documents: [
        { type: "ID proof", fileName: "id-proof.pdf", provided: true },
        { type: "Address proof", provided: false },
      ],
      documentsEnclosed: ["ID proof"],
      declarationAccepted: true,
    };
    const submitted: Person = {
      id: "APP-P-LIFECYCLE",
      applicationId: "APP2026-203",
      name: "Lifecycle Student",
      contact: "9845000000",
      email: "lifecycle@example.com",
      course: "Python",
      appliedOn: "2026-10-20",
      applicationStatus: "Received",
      admissionStatus: "Applicant",
      paymentStatus: "Unpaid",
      adminNotifiedOfClearance: false,
      plan: [
        { ...plan[0]!, id: "APP-P-LIFECYCLE-I01" },
        { ...plan[1]!, id: "APP-P-LIFECYCLE-I02" },
      ],
      applicationDetails,
    };
    const admitted: Person = {
      ...submitted,
      admissionNo: "ADM2026-0203",
      admissionStatus: "Admitted",
      applicationStatus: "Admitted",
      paymentStatus: "Partially paid",
    };
    const billingStudent = studentFromAdmittedPerson(admitted, "ADM2026-0203");

    expect(submitted.id).toBe(admitted.id);
    expect(submitted.applicationId).toBe(admitted.applicationId);
    expect(submitted.admissionStatus).toBe("Applicant");
    expect(submitted.applicationDetails).toEqual(applicationDetails);
    expect(billingStudent).toMatchObject({
      id: submitted.id,
      regNo: "ADM2026-0203",
      email: "lifecycle@example.com",
      applicationDetails,
      totalFee: 200,
    });
    const initialPayment: FeeWorkflowPayment = {
      ...payment("i1", 100),
      personId: submitted.id,
      allocations: [{ installmentId: submitted.plan[0]!.id, amount: 100 }],
    };
    expect(feeWorkflowPaymentStatus(admitted, [initialPayment])).toBe("Partially paid");
    expect(admitted.admissionStatus).toBe("Admitted");
    expect(validateAdmissionNo("ADM2026-0203", submitted.id, [admitted], [])).toBe("valid");
    expect(validateAdmissionNo("ADM2026-0203", "another-person", [admitted], [])).toBe("duplicate");
    expect(validateAdmissionNo("ADM2026-20X", submitted.id, [], [])).toBe("invalid");
  });

  it("merges applicant payments into Billing once and creates complete simulated reminders", () => {
    const workflowPayment = payment("i1", 60);
    const billing: FeePayment[] = mergeBillingPayments(
      [],
      [workflowPayment, workflowPayment],
      "p1",
    );
    expect(billing).toHaveLength(1);
    expect(mergeBillingPayments(billing, [workflowPayment], "p1")).toEqual(billing);
    const reminder = buildPaymentReminderEmail(
      { name: "Test Student", email: "student@example.com", course: "Python" },
      "Instalment 1",
      60,
      "2026-11-01",
      "Sample Institute",
    );
    expect(reminder.to).toBe("student@example.com");
    expect(reminder.body).toContain("Test Student");
    expect(reminder.body).toContain("Installment 1");
    expect(reminder.body).toContain("₹60.00");
    expect(reminder.body).toContain("01 Nov 2026");
    expect(reminder.body).toContain("payment methods");
    expect(reminder.body).toContain("simulated reminder");
    expect(reminder.body).toContain("Python");
  });

  it("derives installment reminder timing, overdue days, and recently paid visibility", () => {
    const dueSoon = { ...plan[0]!, dueDate: "2026-11-11", reminders: [] };
    const outsideReminderWindow = { ...dueSoon, dueDate: "2026-11-12" };
    const overdue = { ...plan[0]!, dueDate: demoDate(-12), reminders: [] };
    const reminded = {
      ...overdue,
      reminders: [{ id: "rem-1", date: `${TODAY}T12:00:00.000Z`, text: "Reminder sent" }],
    };
    const atLimit = {
      ...reminded,
      reminders: Array.from({ length: MAX_REMINDERS }, (_, index) => ({
        id: `rem-${index + 1}`,
        date: `${TODAY}T12:00:00.000Z`,
        text: "Reminder sent",
      })),
    };
    expect(installmentReminderWindowEnd("2026-11-07")).toBe("2026-11-11");
    expect(installmentFollowUpStatus(dueSoon, [], "2026-11-07")).toBe("Reminder Due");
    expect(installmentFollowUpStatus(outsideReminderWindow, [], "2026-11-07")).toBeNull();
    expect(installmentFollowUpStatus(dueSoon, [], "2026-11-06")).toBeNull();
    expect(installmentFollowUpStatus(overdue, [], TODAY)).toBe("Reminder Due");
    expect(installmentFollowUpStatus(reminded, [], TODAY)).toBe("Reminder Sent");
    expect(installmentFollowUpStatus(atLimit, [], TODAY)).toBe("Reminder Sent");
    expect(installmentDaysOverdue(overdue, TODAY)).toBe(12);
    expect(isRecentlyPaidInstallment(plan[0]!, [payment("i1", 100, demoDate(-3))], TODAY)).toBe(
      true,
    );
    expect(isRecentlyPaidInstallment(plan[0]!, [payment("i1", 100, demoDate(-10))], TODAY)).toBe(
      false,
    );
  });

  describe("Administration details snapshot", () => {
    const form: StudentApplicationDetails = {
      dateOfBirth: "2004-02-01",
      passportPhoto: { fileName: "passport-photo.png", previewUrl: "data:image/svg+xml,avatar" },
      addressLine1: "12 MG Road",
      addressLine2: "",
      city: "Pune",
      state: "MH",
      postalCode: "411001",
      guardianName: "R. Student",
      guardianRelationship: "Father",
      guardianPhone: "9800000000",
      guardianEmail: "g@example.com",
      educationWorkExperience: "BCom 2024",
      leadSource: "Referral",
      leadReference: "Friend",
      coursePreference: "Python",
      installmentPreference: 2,
      documents: [
        { type: "ID proof", fileName: "id-proof.pdf", provided: true },
        { type: "TC", provided: false },
      ],
      documentsEnclosed: ["ID proof"],
      declarationAccepted: true,
    };
    const paid = {
      ...payment("i1", 150),
      allocations: [
        { installmentId: "i1", amount: 100 },
        { installmentId: "i2", amount: 50 },
      ],
    };

    it("contains every form section and the payment summary", () => {
      const payload = buildAdministrationDetailsPayload(person({ applicationDetails: form }), [
        paid,
      ]);
      expect(payload.applicationForm).toEqual(form);
      expect(payload.applicationForm?.passportPhoto).toEqual(form.passportPhoto);
      expect(payload.applicationForm?.documents).toEqual(form.documents);
      expect(payload.paymentSummary.totalPaid).toBe(150);
      expect(payload.paymentSummary.installmentsPaid).toBe(1);
      expect(payload.paymentSummary.outstanding).toBe(50);
      expect(payload.paymentSummary.payments[0]?.installmentsCovered).toEqual([
        { label: "Registration", amount: 100 },
        { label: "Instalment 1", amount: 50 },
      ]);
    });

    it("keeps missing values undefined", () => {
      const payload = buildAdministrationDetailsPayload(person({ applicationDetails: undefined }), [
        paid,
      ]);
      expect(payload.applicationForm).toBeUndefined();
    });

    it("never includes an Admission No.", () => {
      const payload = buildAdministrationDetailsPayload(person({ admissionNo: "ADM2026-999" }), [
        paid,
      ]);
      expect(JSON.stringify(payload)).not.toContain("ADM2026-999");
      expect(payload).not.toHaveProperty("admissionNo");
    });

    it("stores a snapshot that later payments do not change and records a handoff once", () => {
      const documents = form.documents.map((document) => ({
        ...document,
        provided: true,
        fileUrl: `https://files.test/${document.type.replaceAll(" ", "-")}.pdf`,
      }));
      const documentVerifications = documents.map((document) => {
        const sourceFingerprint = documentSourceFingerprint(document.fileName, document.fileUrl!);
        const event = {
          status: "Approved" as const,
          date: "2026-10-02T10:00:00.000Z",
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          sourceFingerprint,
          reviewer: "Accountant (Finance)",
        };
        return { documentType: document.type, ...event, history: [event] };
      });
      const applicant = person({
        applicationDetails: { ...form, documents },
        accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
        documentVerifications,
        plan: [{ ...plan[0]!, label: "Admission Fee" }, plan[1]!],
      });
      expect(isApplicationVerified(applicant)).toBe(true);
      expect(isEligibleNow(applicant, [paid], [])).toBe(true);
      const laterInstallmentOnly = { ...payment("i2", 100), personId: applicant.id };
      expect(isEligibleNow(applicant, [laterInstallmentOnly], [])).toBe(false);
      const once = recordAdministrationDetailsSent(
        [],
        applicant,
        [paid],
        "2026-10-03T10:00:00.000Z",
      );
      const later = { ...payment("i2", 50), id: "later" };
      const twice = recordAdministrationDetailsSent(
        once,
        applicant,
        [paid, later],
        "2026-10-04T10:00:00.000Z",
      );
      expect(twice).toBe(once);
      const events = twice.flatMap((h) => h.history.filter((e) => e.snapshot));
      expect(events).toHaveLength(1);
      expect(events[0]?.snapshot?.paymentSummary.totalPaid).toBe(150);
      form.city = "Changed";
      expect(events[0]?.snapshot?.applicationForm?.city).toBe("Pune");
      expect(events[0]?.snapshot?.applicationForm?.passportPhoto).toEqual(form.passportPhoto);
      expect(events[0]?.snapshot?.applicationForm?.documents).toEqual(documents);
      expect(isEligibleNow(applicant, [paid, later], twice)).toBe(false);
    });
  });

  it("rejects repeated references only for the same person", () => {
    const recorded = payment("i1", 100);
    expect(hasDuplicatePaymentReference("p1", " txn-1 ", [recorded])).toBe(true);
    expect(hasDuplicatePaymentReference("p2", "TXN-1", [recorded])).toBe(false);
    expect(hasDuplicatePaymentReference("p1", "", [recorded])).toBe(false);
  });

  it("keeps payment confirmation not sent until delivery is confirmed", () => {
    const pending = createNewFeeWorkflowPayment(
      { ...payment("i1", 100), confirmation: { status: "Not Sent" } },
      "live-payment",
    );
    expect(pending.confirmation.status).toBe("Not Sent");
    expect(payment("i1", 100).confirmation.status).toBe("Not Sent");
  });

  it("asks unadmitted reviewed applicants to record the first payment", () => {
    expect(nextAction(person(), [])).toBe("Record Payment");
  });

  it("does not offer another reminder when an overdue installment has reached the reminder limit", () => {
    const overduePerson = person({
      admissionNo: "ADM2026-001",
      plan: [
        plan[0]!,
        {
          ...plan[1]!,
          dueDate: "2026-10-19",
          reminders: [
            { date: "2026-10-10", text: "1" },
            { date: "2026-10-15", text: "2" },
          ],
        },
      ],
    });
    expect(nextAction(overduePerson, [payment("i1", 100, "2026-09-30")])).not.toBe("Send Reminder");
  });

  it("sends reminders for overdue installments before handoff, and soon-due installments", () => {
    const overduePerson = person({
      admissionNo: "ADM2026-001",
      plan: [plan[0]!, { ...plan[1]!, dueDate: "2026-10-19" }],
    });
    const paidFirst = payment("i1", 100, "2026-09-30");
    expect(nextAction(overduePerson, [paidFirst])).toBe("Send Reminder");

    const dueSoonPerson = person({
      admissionNo: "ADM2026-001",
      plan: [plan[0]!, { ...plan[1]!, dueDate: demoDate(4) }],
    });
    expect(nextAction(dueSoonPerson, [paidFirst])).toBe("Send Reminder");
  });

  it("does not offer a manual Administration send action for an eligible applicant", () => {
    const eligiblePerson = person({
      accountantVerifiedAt: "2026-10-02T10:00:00.000Z",
      plan: plan.map((installment) => ({ ...installment, dueDate: demoDate(30) })),
    });
    const paidFirst = payment("i1", 100, "2026-09-30");
    expect(nextAction(eligiblePerson, [paidFirst])).toBeNull();
  });

  it("requests an Admission No. after a local handoff simulation", () => {
    const applicant = person({
      plan: plan.map((installment) => ({ ...installment, dueDate: demoDate(30) })),
    });
    const handoff: Handoff = {
      personId: applicant.id,
      target: "Administration",
      status: "Simulated (not delivered)",
      history: [],
    };
    expect(nextAction(applicant, [payment("i1", 100, "2026-09-30")], [handoff])).toBe(
      "Enter Admission No.",
    );
  });

  it("notifies Administration after overdue installments are cleared", () => {
    const clearedPerson = person({
      admissionNo: "ADM2026-001",
      applicationStatus: "Admitted",
      plan: [plan[0]!],
    });
    const latePaid = payment("i1", 100, "2026-10-03");
    const completedHandoff: Handoff = {
      personId: clearedPerson.id,
      target: "Administration",
      status: "Completed",
      history: [],
    };
    expect(classAccess(clearedPerson, [latePaid], TODAY)).toBe("Payment Cleared");
    expect(nextAction(clearedPerson, [latePaid], [completedHandoff])).toBe("Notify Administration");
    expect(
      nextAction(clearedPerson, [{ ...latePaid, adminNotified: true }], [completedHandoff]),
    ).toBeNull();
    const onTimePaid = { ...latePaid, date: "2026-09-30" };
    expect(nextAction(clearedPerson, [onTimePaid], [completedHandoff])).toBeNull();
    expect(nextAction(person({ plan: [plan[0]!] }), [latePaid], [completedHandoff])).not.toBe(
      "Notify Administration",
    );

    const alreadyLogged = {
      ...completedHandoff,
      history: [
        {
          date: "2026-10-20",
          text: ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
          referenceId: latePaid.id,
        },
      ],
    };
    expect(nextAction(clearedPerson, [latePaid], [alreadyLogged])).toBeNull();
  });

  it("returns no action when no workflow condition applies and orders task priority", () => {
    const complete = person({
      admissionNo: "ADM2026-001",
      applicationStatus: "Admitted",
      adminNotifiedOfClearance: true,
      plan: [plan[1]!],
    });
    const completeHandoff: Handoff = {
      personId: complete.id,
      target: "Administration",
      status: "Completed",
      history: [],
    };
    expect(nextAction(complete, [payment("i2", 100, "2026-10-30")], [completeHandoff])).toBeNull();
    expect(
      taskPriority(
        person({
          applicationStatus: "Received",
          plan: [{ ...plan[1]!, dueDate: demoDate(30) }],
        }),
        [],
      ),
    ).toBe(3);
    expect(taskPriority(person({ admissionNo: "ADM2026-001" }), [])).toBe(1);
    expect(taskPriority(complete, [payment("i2", 100, "2026-10-30")], [completeHandoff])).toBe(4);
    const meetingPriority = person({
      plan: [
        {
          ...plan[0]!,
          reminders: [
            { date: "2026-10-10", text: "1" },
            { date: "2026-10-15", text: "2" },
          ],
        },
      ],
    });
    expect(taskPriority(meetingPriority, [])).toBe(0);
    const dueSoonPriority = person({
      plan: [{ ...plan[1]!, dueDate: "2026-10-25" }],
    });
    expect(taskPriority(dueSoonPriority, [])).toBe(2);
  });

  it("seeds existing Billing students with matching plans, totals, due dates and statuses", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    expect(
      workflow.persons.filter(
        (item) => item.applicationId === "APP2026-104" || item.applicationId === "APP2026-105",
      ),
    ).toHaveLength(2);
    expect(workflow.persons.filter((item) => item.id.startsWith("APP-P-"))).toHaveLength(17);
    expect(
      workflow.payments
        .filter((payment) => !DEMO_SCENARIO_PEOPLE.some((person) => person.id === payment.personId))
        .every((payment) => payment.adminNotified),
    ).toBe(true);
    for (const student of seedStudents) {
      const seededPerson = workflow.persons.find((item) => item.id === student.id)!;
      const studentPayments = workflow.payments.filter((item) => item.personId === student.id);
      const totals = personTotals(seededPerson, studentPayments);
      expect(totals.payable).toBe(student.totalFee);
      expect(totals.paid).toBe(studentPaid(student.id, seedPayments));
      expect(totals.nextDueInstallment?.dueDate ?? null).toBe(nextDue(student, seedPayments));
      expect(
        totals.paid >= totals.payable
          ? "Paid"
          : totals.daysOverdue > 0
            ? "Overdue"
            : totals.paid > 0
              ? "Partially Paid"
              : "Pending",
      ).toBe(billStatus(student, seedPayments));
    }
  });
});
