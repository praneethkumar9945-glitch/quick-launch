import { formatCourseDuration, seedCourseCatalog } from "./courses";
import { personTotals, type FeeWorkflowState } from "./feeWorkflow";
import { demoDate } from "./demoDates";
import { sum, TODAY } from "./logic";
import { ADMISSION_FEE_LABEL } from "./labels";
import { installmentPaid } from "./feeWorkflow";
import {
  forwardToDirector,
  receiveSubmission,
  recordDirectorDecision,
  saveReview,
  type ConcessionAttachment,
  type ConcessionRequest,
  type ConcessionSubmission,
  type ConcessionType,
} from "./concessions";
import type { Person } from "./types";

export function submissionForPerson(
  person: Person,
  workflow: FeeWorkflowState,
  input: { type: ConcessionType; value: number; reason: string; requestedDate: string },
): ConcessionSubmission {
  const course = seedCourseCatalog.courses.find((item) => item.name === person.course);
  return {
    studentName: person.name,
    branch: "Skill AI – Bengaluru Main Centre",
    applicationNo: person.applicationId,
    requestedDate: input.requestedDate,
    contact: person.contact,
    totalFees: sum(person.plan.map((installment) => installment.amountDue)),
    eligibleFees: sum(
      person.plan
        .filter((item) => item.label.trim().toLowerCase() !== ADMISSION_FEE_LABEL.toLowerCase())
        .map((item) => item.amountDue),
    ),
    course: person.course,
    courseDuration: formatCourseDuration(course?.normalTrack ?? course?.fastTrack),
    startingDate: person.plan[0]?.dueDate ?? person.appliedOn,
    amountAlreadyPaid: personTotals(
      person,
      workflow.payments.filter((payment) => payment.personId === person.id),
    ).paid,
    concessionType: input.type,
    requestedValue: input.value,
    reason: input.reason,
    declarationAccepted: true,
  };
}

const SCENARIOS: {
  type: ConcessionType;
  value: number;
  reason: string;
  stage: "accounts" | "director" | "approved" | "rejected";
  applicationId?: string | undefined;
}[] = [
  {
    type: "Percentage",
    value: 10,
    reason: "Sibling currently enrolled in the Data Science programme.",
    stage: "accounts",
  },
  {
    type: "Fixed Amount",
    value: 5000,
    reason: "Merit scholarship – scored 92% in the entrance assessment.",
    stage: "accounts",
  },
  {
    type: "Percentage",
    value: 15,
    reason: "Single-parent household; income certificate attached by Admission.",
    stage: "director",
  },
  { type: "Special Case", value: 8000, reason: "Ex-servicemen dependent.", stage: "accounts" },
  {
    type: "Fixed Amount",
    value: 3000,
    reason: "Early-bird enrolment before the batch cut-off.",
    stage: "approved",
  },
  {
    type: "Percentage",
    value: 5,
    reason: "Admission resubmitted the corrected household details.",
    stage: "director",
  },
  {
    type: "Fixed Amount",
    value: 4000,
    reason: "Financial hardship request supported by Admission documents.",
    stage: "rejected",
  },
  {
    type: "Percentage",
    value: 8,
    reason: "Supporting information provided by Admission for Director review.",
    stage: "director",
  },
  {
    type: "Fixed Amount",
    value: 1500,
    reason: "Merit concession request submitted with the application.",
    stage: "accounts",
    applicationId: "APP2026-130",
  },
  {
    type: "Fixed Amount",
    value: 1200,
    reason: "Family support concession request submitted with the application.",
    stage: "accounts",
    applicationId: "APP2026-131",
  },
];

function samplePdfUrl(title: string) {
  const content = `BT /F1 14 Tf 40 160 Td (${title}) Tj 0 -24 Td (Sample supporting document submitted by Admission Sales.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 220] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return `data:application/pdf,${encodeURIComponent(pdf)}`;
}

const SAMPLE_SUPPORTING_DOCUMENTS: ConcessionAttachment[] = [
  {
    id: "sample-concession-request",
    fileName: "Fee_Concession_Request.pdf",
    fileType: "application/pdf",
    sizeBytes: 284_672,
    previewUrl: samplePdfUrl("Fee Concession Request"),
  },
  {
    id: "sample-family-income-proof",
    fileName: "Family_Income_Proof.jpg",
    fileType: "image/jpeg",
    sizeBytes: 196_608,
    previewUrl:
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
  },
  {
    id: "sample-supporting-statement",
    fileName: "Supporting_Statement.png",
    fileType: "image/png",
    sizeBytes: 147_456,
    previewUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=",
  },
];

/** Clearly simulated incoming Admission requests for testing the workflow. */
export function createSimulatedConcessions(workflow: FeeWorkflowState): ConcessionRequest[] {
  const candidates = workflow.persons.filter(
    (person) => !person.admissionNo && sum(person.plan.map((item) => item.amountDue)) > 10000,
  );
  const reservedApplicationIds = new Set(["APP2026-130", "APP2026-131"]);
  const approvedCandidate = candidates.find(
    (person) =>
      !reservedApplicationIds.has(person.applicationId) &&
      sum(
        person.plan
          .filter(
            (installment) =>
              installment.label !== ADMISSION_FEE_LABEL &&
              installment.dueDate >= TODAY &&
              installmentPaid(installment.id, workflow.payments) === 0,
          )
          .map((installment) => installment.amountDue),
      ) >= 2500,
  );
  const usedPersonIds = new Set<string>();
  const requests: ConcessionRequest[] = [];
  SCENARIOS.forEach((scenario, index) => {
    const person = scenario.applicationId
      ? candidates.find(
          (candidate) =>
            candidate.applicationId === scenario.applicationId &&
            !usedPersonIds.has(candidate.id),
        )
      : scenario.stage === "approved"
        ? approvedCandidate
        : candidates.find(
            (candidate) =>
              !usedPersonIds.has(candidate.id) && candidate.id !== approvedCandidate?.id,
          );
    if (!person) return;
    usedPersonIds.add(person.id);
    const date = `${demoDate(-6 + index, TODAY)}T10:00:00.000Z`;
    const later = `${demoDate(-4 + index, TODAY)}T11:00:00.000Z`;
    const received = receiveSubmission(requests, {
      id: `FCR-SIM-${index + 1}`,
      personId: person.id,
      attachments: SAMPLE_SUPPORTING_DOCUMENTS,
      submission: submissionForPerson(person, workflow, {
        type: scenario.type,
        value: scenario.value,
        reason: scenario.reason,
        requestedDate: date.slice(0, 10),
      }),
      date,
      simulated: true,
    });
    if (!received.ok) return;
    let request = received.value;
    const step = (
      result: { ok: true; value: ConcessionRequest } | { ok: false; error: string },
    ) => {
      if (result.ok) request = result.value;
    };
    if (scenario.stage === "accounts" && index === 1)
      step(
        saveReview(
          request,
          {
            reviewedBy: "Accounts Officer",
            reviewDate: later.slice(0, 10),
            remarks: "Fee record matches the submitted request.",
          },
          later,
        ),
      );
    if (
      scenario.stage === "director" ||
      scenario.stage === "approved" ||
      scenario.stage === "rejected"
    )
      step(
        saveReview(
          request,
          {
            reviewedBy: "Accounts Officer",
            reviewDate: later.slice(0, 10),
            remarks: "Application verified; fee record matches.",
          },
          later,
        ),
      );
    if (
      scenario.stage === "director" ||
      scenario.stage === "approved" ||
      scenario.stage === "rejected"
    )
      step(forwardToDirector(request, later));
    if (scenario.stage === "approved")
      step(
        recordDirectorDecision(request, {
          decision: "Approved",
          date: later,
          approvedDiscount: 2500,
          remarks: "Approved at ₹2,500 instead of ₹3,000.",
        }),
      );
    if (scenario.stage === "rejected")
      step(
        recordDirectorDecision(request, {
          decision: "Rejected",
          date: later,
          remarks: "The submitted documents do not meet the concession criteria.",
        }),
      );
    requests.push(request);
  });
  return requests;
}
