import type {
  DocumentCorrectionItem,
  DocumentCorrectionRequest,
  Person,
  StudentApplicationDetails,
} from "@/modules/finance/finance/types";
import { DOCUMENT_REVIEWER } from "@/modules/finance/finance/feeWorkflow";

/**
 * Correction requests Finance sends to Admission (Sales) for missing or rejected documents.
 * Prototype: requests and simulated resubmissions are stored in this browser only.
 */
export const DOCUMENT_CORRECTIONS_STORAGE_KEY = "finance-document-corrections-v1";

type DocumentType = StudentApplicationDetails["documents"][number]["type"];
const DOCUMENT_TYPES: DocumentType[] = ["ID proof", "Address proof", "Latest marksheet", "TC"];

const SAMPLE_DOCUMENT_FILES: Record<DocumentType, { fileName: string; fileUrl: string }> = {
  "ID proof": { fileName: "id-proof.pdf", fileUrl: "/sample-documents/id-proof.pdf" },
  "Address proof": {
    fileName: "address-proof.png",
    fileUrl: "/sample-documents/address-proof.png",
  },
  "Latest marksheet": {
    fileName: "latest-marksheet.pdf",
    fileUrl: "/sample-documents/latest-marksheet.pdf",
  },
  TC: { fileName: "tc.pdf", fileUrl: "/sample-documents/tc.pdf" },
};

export function sampleDocumentFile(documentType: DocumentType) {
  return SAMPLE_DOCUMENT_FILES[documentType];
}

export function hasUnresolvedCorrectionRequest(
  requests: DocumentCorrectionRequest[],
  applicationId: string,
): boolean {
  return requests.some(
    (request) =>
      request.applicationId === applicationId && request.status === "Awaiting Resubmission",
  );
}

export function createCorrectionRequest(
  person: Person,
  documents: Pick<DocumentCorrectionItem, "documentType" | "issue" | "reason">[],
  now = new Date().toISOString(),
  existingRequests: DocumentCorrectionRequest[] = [],
): DocumentCorrectionRequest {
  if (!documents.length)
    throw new Error("A correction request must include at least one document.");
  const baseId = `corr-${person.id}-${Date.parse(now)}`;
  let id = baseId;
  let sequence = 1;
  while (existingRequests.some((request) => request.id === id)) {
    id = `${baseId}-${sequence}`;
    sequence += 1;
  }
  const requestedDocuments = documents.map((document) => ({
    documentType: document.documentType,
    issue: document.issue,
    reason: document.reason.trim(),
  }));
  return {
    id,
    personId: person.id,
    applicationId: person.applicationId,
    studentName: person.name,
    studentContact: person.contact,
    documents: requestedDocuments,
    requestedAt: now,
    requestedBy: DOCUMENT_REVIEWER,
    status: "Awaiting Resubmission",
    history: [
      {
        action: "Requested",
        date: now,
        actor: DOCUMENT_REVIEWER,
        documentTypes: requestedDocuments.map((document) => document.documentType),
      },
    ],
  };
}

export function addDocumentsToOpenCorrectionRequest(
  requests: DocumentCorrectionRequest[],
  applicationId: string,
  documents: Pick<DocumentCorrectionItem, "documentType" | "issue" | "reason">[],
  now = new Date().toISOString(),
): DocumentCorrectionRequest[] {
  const target = requests.find(
    (request) =>
      request.applicationId === applicationId && request.status === "Awaiting Resubmission",
  );
  if (!target || !documents.length) return requests;
  const existingTypes = new Set(target.documents.map((document) => document.documentType));
  const addedDocuments: DocumentCorrectionItem[] = [];
  const updatedDocuments: DocumentCorrectionItem[] = [];
  const mergedDocuments = [...target.documents];
  for (const document of documents) {
    const incoming = {
      documentType: document.documentType,
      issue: document.issue,
      reason: document.reason.trim(),
    };
    const existingIndex = mergedDocuments.findIndex(
      (item) => item.documentType === document.documentType,
    );
    if (existingIndex < 0) {
      if (existingTypes.has(document.documentType)) continue;
      existingTypes.add(document.documentType);
      mergedDocuments.push(incoming);
      addedDocuments.push(incoming);
      continue;
    }
    const existing = mergedDocuments[existingIndex]!;
    if (existing.issue !== incoming.issue || existing.reason !== incoming.reason) {
      mergedDocuments[existingIndex] = { ...existing, ...incoming };
      updatedDocuments.push(incoming);
    }
  }
  if (!addedDocuments.length && !updatedDocuments.length) return requests;
  return requests.map((request) =>
    request.id === target.id
      ? {
          ...request,
          documents: mergedDocuments,
          history: [
            ...(request.history ?? []),
            ...(addedDocuments.length
              ? [
                  {
                    action: "Documents added" as const,
                    date: now,
                    actor: DOCUMENT_REVIEWER,
                    documentTypes: addedDocuments.map((document) => document.documentType),
                  },
                ]
              : []),
            ...(updatedDocuments.length
              ? [
                  {
                    action: "Request updated" as const,
                    date: now,
                    actor: DOCUMENT_REVIEWER,
                    documentTypes: updatedDocuments.map((document) => document.documentType),
                  },
                ]
              : []),
          ],
        }
      : request,
  );
}

/** The replacement file reference produced when Admission (Sales) resubmits a document. */
export function resubmittedFileUrl(originalUrl: string, version: number): string {
  const base = originalUrl.split(/[?#]/)[0]!;
  return `${base}?resubmission=${version}`;
}

export function resubmitCorrection(
  requests: DocumentCorrectionRequest[],
  requestId: string,
  sourceFiles: { documentType: DocumentType; fileUrl: string }[],
  now = new Date().toISOString(),
): DocumentCorrectionRequest[] {
  const target = requests.find((request) => request.id === requestId);
  if (!target || target.status !== "Awaiting Resubmission") return requests;
  if (
    target.documents.some(
      (item) => !sourceFiles.some((file) => file.documentType === item.documentType),
    )
  )
    return requests;
  return requests.map((request) =>
    request.id === requestId
      ? {
          ...request,
          status: "Resubmitted",
          resubmittedAt: now,
          history: [
            ...(request.history ?? []),
            {
              action: "Resubmitted",
              date: now,
              actor: "Admission (Sales)",
              documentTypes: request.documents.map((document) => document.documentType),
            },
          ],
          documents: request.documents.map((item) => {
            const source = sourceFiles.find((file) => file.documentType === item.documentType);
            if (!source) return item;
            const version =
              requests
                .filter(
                  (entry) => entry.personId === target.personId && entry.status === "Resubmitted",
                )
                .flatMap((entry) => entry.documents)
                .filter(
                  (entry) => entry.documentType === item.documentType && !!entry.resubmittedFileUrl,
                ).length + 1;
            return {
              ...item,
              resubmittedAt: now,
              resubmittedFileUrl: resubmittedFileUrl(source.fileUrl, version),
            };
          }),
        }
      : request,
  );
}

/** Apply the latest resubmitted file for each document so it shows as Pending Review. */
export function applyResubmissions(person: Person, requests: DocumentCorrectionRequest[]): Person {
  const details = person.applicationDetails;
  if (!details) return person;
  let changed = false;
  const documents = details.documents.map((document) => {
    const latest = requests
      .filter(
        (request) =>
          request.personId === person.id &&
          request.documents.some(
            (item) => item.documentType === document.type && !!item.resubmittedFileUrl,
          ),
      )
      .flatMap((request) =>
        request.documents
          .filter((item) => item.documentType === document.type && !!item.resubmittedFileUrl)
          .map((item) => ({
            ...item,
            resubmittedAt: item.resubmittedAt ?? request.resubmittedAt ?? request.requestedAt,
          })),
      )
      .sort((a, b) => a.resubmittedAt.localeCompare(b.resubmittedAt))
      .at(-1);
    if (!latest?.resubmittedFileUrl || document.fileUrl === latest.resubmittedFileUrl)
      return document;
    changed = true;
    return {
      ...document,
      fileName: document.fileName ?? sampleDocumentFile(document.type).fileName,
      provided: true,
      fileUrl: latest.resubmittedFileUrl,
    };
  });
  return changed ? { ...person, applicationDetails: { ...details, documents } } : person;
}

export function loadStoredCorrections(): DocumentCorrectionRequest[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(DOCUMENT_CORRECTIONS_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const validRequests: DocumentCorrectionRequest[] = [];
    const legacyOpen = new Map<string, Record<string, unknown>[]>();
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object" || typeof raw.id !== "string") continue;
      const item = raw as Record<string, unknown>;
      if (
        Array.isArray(item["documents"]) &&
        typeof item["personId"] === "string" &&
        typeof item["applicationId"] === "string" &&
        typeof item["studentName"] === "string" &&
        typeof item["studentContact"] === "string" &&
        typeof item["requestedAt"] === "string" &&
        typeof item["requestedBy"] === "string" &&
        (item["status"] === "Awaiting Resubmission" || item["status"] === "Resubmitted") &&
        item["documents"].length > 0 &&
        item["documents"].every(
          (document) =>
            !!document &&
            typeof document === "object" &&
            DOCUMENT_TYPES.includes(
              (document as Record<string, unknown>)["documentType"] as DocumentType,
            ) &&
            typeof (document as Record<string, unknown>)["reason"] === "string",
        )
      ) {
        validRequests.push({
          id: item["id"] as string,
          personId: item["personId"] as string,
          applicationId: item["applicationId"] as string,
          studentName: item["studentName"] as string,
          studentContact: item["studentContact"] as string,
          documents: item["documents"].map((document) => {
            const correction = document as Record<string, unknown>;
            return {
              documentType: correction["documentType"] as DocumentType,
              issue:
                correction["issue"] === "Missing" || correction["issue"] === "Rejected"
                  ? correction["issue"]
                  : "Rejected",
              reason: correction["reason"] as string,
              ...(typeof correction["resubmittedAt"] === "string"
                ? { resubmittedAt: correction["resubmittedAt"] }
                : {}),
              ...(typeof correction["resubmittedFileUrl"] === "string"
                ? { resubmittedFileUrl: correction["resubmittedFileUrl"] }
                : {}),
            };
          }),
          requestedAt: item["requestedAt"] as string,
          requestedBy: item["requestedBy"] as string,
          status: item["status"] as DocumentCorrectionRequest["status"],
          ...(typeof item["resubmittedAt"] === "string" ? { resubmittedAt: item["resubmittedAt"] } : {}),
          history: Array.isArray(item["history"])
            ? item["history"].flatMap((rawEvent) => {
                if (!rawEvent || typeof rawEvent !== "object") return [];
                const event = rawEvent as Record<string, unknown>;
                if (
                  !["Requested", "Documents added", "Request updated", "Resubmitted"].includes(
                    event["action"] as string,
                  ) ||
                  typeof event["date"] !== "string" ||
                  typeof event["actor"] !== "string" ||
                  !Array.isArray(event["documentTypes"])
                )
                  return [];
                return [
                  {
                    action: event["action"] as
                      "Requested" | "Documents added" | "Request updated" | "Resubmitted",
                    date: event["date"],
                    actor: event["actor"],
                    documentTypes: event["documentTypes"].filter((type): type is DocumentType =>
                      DOCUMENT_TYPES.includes(type as DocumentType),
                    ),
                  },
                ];
              })
            : [
                {
                  action: "Requested" as const,
                  date: item["requestedAt"] as string,
                  actor: item["requestedBy"] as string,
                  documentTypes: item["documents"].map(
                    (document) =>
                      (document as Record<string, unknown>)["documentType"] as DocumentType,
                  ),
                },
                ...(typeof item["resubmittedAt"] === "string"
                  ? [
                      {
                        action: "Resubmitted" as const,
                        date: item["resubmittedAt"],
                        actor: "Admission (Sales)",
                        documentTypes: item["documents"].map(
                          (document) =>
                            (document as Record<string, unknown>)["documentType"] as DocumentType,
                        ),
                      },
                    ]
                  : []),
              ],
        });
      } else if (
        typeof item["personId"] === "string" &&
        typeof item["documentType"] === "string" &&
        typeof item["reason"] === "string"
      ) {
        if (item["status"] === "Awaiting Resubmission") {
          legacyOpen.set(item["personId"], [...(legacyOpen.get(item["personId"]) ?? []), item]);
        } else if (
          item["status"] === "Resubmitted" &&
          typeof item["applicationId"] === "string" &&
          typeof item["studentName"] === "string" &&
          typeof item["studentContact"] === "string" &&
          typeof item["requestedAt"] === "string" &&
          typeof item["requestedBy"] === "string"
        ) {
          validRequests.push({
            id: item["id"] as string,
            personId: item["personId"] as string,
            applicationId: item["applicationId"] as string,
            studentName: item["studentName"] as string,
            studentContact: item["studentContact"] as string,
            documents: [
              {
                documentType: item["documentType"] as DocumentType,
                issue: item["reason"].startsWith("Required document is missing")
                  ? "Missing"
                  : "Rejected",
                reason: item["reason"] as string,
                ...(typeof item["resubmittedAt"] === "string"
                  ? { resubmittedAt: item["resubmittedAt"] }
                  : {}),
                ...(typeof item["resubmittedFileUrl"] === "string"
                  ? { resubmittedFileUrl: item["resubmittedFileUrl"] }
                  : {}),
              },
            ],
            requestedAt: item["requestedAt"] as string,
            requestedBy: item["requestedBy"] as string,
            status: "Resubmitted",
            ...(typeof item["resubmittedAt"] === "string"
              ? { resubmittedAt: item["resubmittedAt"] }
              : {}),
          });
        }
      }
    }
    for (const [personId, legacyItems] of legacyOpen) {
      const first = legacyItems[0]!;
      if (
        typeof first["applicationId"] !== "string" ||
        typeof first["studentName"] !== "string" ||
        typeof first["studentContact"] !== "string" ||
        typeof first["requestedAt"] !== "string" ||
        typeof first["requestedBy"] !== "string"
      )
        continue;
      validRequests.push({
        id: `corr-${personId}-legacy`,
        personId,
        applicationId: first["applicationId"],
        studentName: first["studentName"],
        studentContact: first["studentContact"],
        documents: legacyItems.map((legacy) => ({
          documentType: legacy["documentType"] as DocumentType,
          issue: (legacy["reason"] as string).startsWith("Required document is missing")
            ? "Missing"
            : "Rejected",
          reason: legacy["reason"] as string,
        })),
        requestedAt: first["requestedAt"],
        requestedBy: first["requestedBy"],
        status: "Awaiting Resubmission",
        history: [
          {
            action: "Requested",
            date: first["requestedAt"] as string,
            actor: first["requestedBy"] as string,
            documentTypes: legacyItems.flatMap((legacy) =>
              DOCUMENT_TYPES.includes(legacy["documentType"] as DocumentType)
                ? [legacy["documentType"] as DocumentType]
                : [],
            ),
          },
        ],
      });
    }
    return validRequests;
  } catch {
    return [];
  }
}

export function saveStoredCorrections(requests: DocumentCorrectionRequest[]): boolean {
  try {
    window.localStorage.setItem(DOCUMENT_CORRECTIONS_STORAGE_KEY, JSON.stringify(requests));
    return true;
  } catch {
    return false;
  }
}
