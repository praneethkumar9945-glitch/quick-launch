// ============= Full file contents =============

import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Printer,
  UserRound,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/finance/components/ui/table";
import { SerialNumberCell, SerialNumberHead, SerialNumberLabel } from "@/modules/finance/components/finance/common";
import { Button } from "@/modules/finance/components/ui/button";
import { Textarea } from "@/modules/finance/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/finance/components/ui/dialog";
import { cn } from "@/modules/finance/lib/utils";
import { formatINR, formatDate } from "@/modules/finance/finance/logic";
import type {
  AdministrationDetailsSnapshot,
  DocumentCorrectionRequest,
  DocumentVerification,
  Installment,
  StudentApplicationDetails,
} from "@/modules/finance/finance/types";
import { displayInstallmentLabel } from "@/modules/finance/finance/types";
import { documentSourceFingerprint, documentVerificationStatus } from "@/modules/finance/finance/feeWorkflow";

const DOCUMENT_LABELS: Record<StudentApplicationDetails["documents"][number]["type"], string> = {
  "ID proof": "ID Proof",
  "Address proof": "Address Proof",
  "Latest marksheet": "Latest Marksheet",
  TC: "Transfer Certificate (TC)",
};
const documentLabel = (type: StudentApplicationDetails["documents"][number]["type"]) =>
  DOCUMENT_LABELS[type] ?? type;

export function ApplicationDetail({
  label,
  value,
  layout = "stacked",
  labelSingleLine = false,
}: {
  label: string;
  value: ReactNode;
  layout?: "stacked" | "inline" | undefined;
  labelSingleLine?: boolean | undefined;
}) {
  return (
    <div className={cn("min-w-0", layout === "inline" && "flex items-baseline gap-2")}>
      <dt
        className={cn(
          "text-xs font-medium uppercase tracking-wide text-muted-foreground",
          layout === "inline" && "w-fit max-w-[48%] shrink-0",
          layout === "inline" && labelSingleLine && "max-w-none whitespace-nowrap",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm font-medium",
          layout === "inline" && "flex-1",
          layout === "stacked" && "mt-1",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Print only this view: mirrors the established print-mode pattern in styles.css. */
function printApplicationDetails() {
  const root = document.documentElement;
  const done = () => {
    root.classList.remove("printing-application-details");
    window.removeEventListener("afterprint", done);
  };
  root.classList.add("printing-application-details");
  window.addEventListener("afterprint", done);
  window.print();
}

export function ApplicationDetailsPrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print shrink-0"
      onClick={printApplicationDetails}
    >
      <Printer className="h-4 w-4" />
      Print / Save PDF
    </Button>
  );
}

type SectionAccent = "lavender" | "blue" | "aqua";

/* Neutral document styling: white cards, thin light-grey borders, dark navy headings.
   The accent key is kept so call sites stay unchanged; every accent renders the same. */
const SECTION_NEUTRAL = {
  chip: "border border-application-line bg-application-surface text-application-ink",
  title: "text-application-ink",
  block: "bg-application-surface",
  line: "border-application-line",
  tag: "border-application-line bg-application-surface text-application-ink",
};
const SECTION_ACCENTS: Record<
  SectionAccent,
  { chip: string; title: string; block: string; line: string; tag: string }
> = {
  lavender: SECTION_NEUTRAL,
  blue: SECTION_NEUTRAL,
  aqua: SECTION_NEUTRAL,
};

function DetailSection({
  index,
  title,
  accent,
  children,
}: {
  index?: number | undefined;
  title: string;
  accent: SectionAccent;
  children: ReactNode;
}) {
  const a = SECTION_ACCENTS[accent];
  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", a.block, a.line)}>
      <div className="mb-4 flex items-center gap-2.5">
        {index !== undefined && (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              a.chip,
            )}
          >
            {index}
          </span>
        )}
        <h3 className={cn("text-sm font-bold uppercase tracking-wide", a.title)}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function DocumentVerificationHistory({
  documentVerifications,
}: {
  documentVerifications?: DocumentVerification[] | undefined;
}) {
  const history = (documentVerifications ?? []).flatMap((verification) =>
    verification.history.map((event, index) => ({
      documentType: verification.documentType,
      event,
      index,
    })),
  );

  return (
    <div className="application-details-print">
      <DetailSection title="Document Verification History" accent="blue">
        {history.length > 0 ? (
          <ul className="space-y-2">
            {history.map(({ documentType, event, index }) => (
              <li
                key={`${documentType}-${event.date}-${index}`}
                className="rounded-lg border border-application-line bg-application-surface px-3 py-2"
              >
                <p className="text-sm font-medium">{documentLabel(documentType)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.previousStatus ?? "—"} → {event.status} · Decision:{" "}
                  {event.decision ?? event.status} · {event.reviewer ?? "Reviewer"} ·{" "}
                  {new Date(event.date).toLocaleString("en-IN")}
                  {event.correctionRequestReference
                    ? ` · Request ${event.correctionRequestReference}`
                    : ""}
                  {event.reason ? ` · Remark: ${event.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No document verification history recorded.
          </p>
        )}
      </DetailSection>
    </div>
  );
}

const chipClass =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap";
// Root-relative paths ("/sample-documents/...") are same-origin stored files and must be accepted;
// rejecting them was why every uploaded document previously showed "File unavailable".
const DOCUMENT_FILE_SOURCE_PATTERN =
  /^(\/(?!\/)|https?:\/\/|blob:|data:application\/(?!xhtml|javascript|ecmascript)[a-z0-9.+-]+;base64,|data:image\/(?:jpeg|png|gif|webp);base64,|data:text\/(?:plain|csv);base64,)/i;

export function ApplicationDetails({
  snapshot,
  plan,
  documentVerifications,
  onVerifyDocument,
  onSendCorrectionRequest,
  correctionRequests,
}: {
  snapshot: AdministrationDetailsSnapshot;
  plan?: Installment[] | undefined;
  documentVerifications?: DocumentVerification[] | undefined;
  correctionRequests?: DocumentCorrectionRequest[] | undefined;
  onSendCorrectionRequest?: ((
    documents: Pick<
      DocumentCorrectionRequest["documents"][number],
      "documentType" | "issue" | "reason"
    >[],
  ) => boolean) | undefined;
  onVerifyDocument?: (
    document: StudentApplicationDetails["documents"][number],
    status: "Approved" | "Rejected",
    reason?: string | undefined,
  ) => void;
}) {
  const details = snapshot.applicationForm;
  const [selectedDocument, setSelectedDocument] = useState<
    StudentApplicationDetails["documents"][number] | null
  >(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [zoom, setZoom] = useState(100);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [correctionPreviewOpen, setCorrectionPreviewOpen] = useState(false);
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, string>>({});
  const shown = (value: string | undefined | null) => (value?.trim() ? value : "Not provided");
  const photoUrl = details?.passportPhoto?.previewUrl;
  const hasStudentPhoto =
    !!photoUrl &&
    /^(https?:\/\/|blob:|data:image\/(?:jpeg|png|gif|webp);base64,)/i.test(photoUrl) &&
    !/\.svg(?:[?#]|$)/i.test(photoUrl);
  const isISODate = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const address = details
    ? [details.addressLine1, details.addressLine2, details.city, details.state, details.postalCode]
        .filter((value) => typeof value === "string" && value.trim())
        .join(", ")
    : "";
  const educationRows =
    details?.educationWorkExperience
      ?.toString()
      .split(/\r?\n/)
      .filter((item) => item.length > 0) ?? [];
  const installmentPreference = details?.installmentPreference;
  const age = (() => {
    const birth = details?.dateOfBirth;
    if (!isISODate(birth)) return "Not provided";
    const date = new Date(`${birth}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Not provided";
    const now = new Date();
    return String(
      now.getFullYear() -
        date.getFullYear() -
        (now < new Date(now.getFullYear(), date.getMonth(), date.getDate()) ? 1 : 0),
    );
  })();
  const educationCells = (row: string) => {
    const parts = row
      .replace(/^Education \d+:\s*/i, "")
      .replace(/\.$/, "")
      .split(",")
      .map((part) => part.trim());
    const year = parts.find((part) => /\b\d{4}(?:\s*[-–/]\s*\d{4})?\b/.test(part)) ?? "";
    return [
      parts[0] ?? "",
      parts[1] ?? "",
      year,
      parts
        .slice(2)
        .filter((part) => part !== year)
        .join(", "),
    ];
  };
  const guardianLabel = (() => {
    const name = details?.guardianName?.trim();
    const relation = details?.guardianRelationship?.trim();
    const combined = [name, relation ? `(${relation})` : ""].filter(Boolean).join(" ");
    return combined || "Not provided";
  })();
  const leadSource = details?.leadSource?.trim();
  const leadReference = details?.leadReference?.trim();
  const dob = isISODate(details?.dateOfBirth) ? formatDate(details!.dateOfBirth!) : "Not provided";
  const previewUrl = selectedDocument?.fileUrl;
  const isPdf =
    !!selectedDocument &&
    (/\.pdf(?:[?#]|$)/i.test(selectedDocument.fileName ?? "") ||
      /\.pdf(?:[?#]|$)/i.test(previewUrl ?? "") ||
      /^data:application\/pdf;/i.test(previewUrl ?? ""));
  const isImage =
    !!selectedDocument &&
    (/\.(?:png|jpe?g|gif|webp)(?:[?#]|$)/i.test(selectedDocument.fileName ?? "") ||
      /\.(?:png|jpe?g|gif|webp)(?:[?#]|$)/i.test(previewUrl ?? "") ||
      /^data:image\/(?:jpeg|png|gif|webp);base64,/i.test(previewUrl ?? ""));
  const canEmbedPreview =
    !!previewUrl && (isPdf || isImage) && DOCUMENT_FILE_SOURCE_PATTERN.test(previewUrl);
  const currentVerification = selectedDocument
    ? documentVerifications?.find((item) => item.documentType === selectedDocument.type)
    : undefined;
  const selectedDocumentStatus = selectedDocument
    ? documentVerificationStatus(selectedDocument, documentVerifications)
    : undefined;
  const sourceFingerprint =
    selectedDocument && previewUrl
      ? documentSourceFingerprint(selectedDocument.fileName, previewUrl)
      : "";
  const rejectedCurrentFile =
    currentVerification?.status === "Rejected" &&
    currentVerification.sourceFingerprint === sourceFingerprint;
  const pdfPreviewUrl = previewUrl ? `${previewUrl.split("#")[0]}#toolbar=1&zoom=${zoom}` : "";
  const openDocumentPreview = (document: StudentApplicationDetails["documents"][number]) => {
    setSelectedDocument(document);
    setRejecting(false);
    setRejectionReason("");
    setZoom(100);
    setPreviewError(null);
    const url = document.fileUrl;
    // Confirm the stored file is actually reachable so access problems are reported, not hidden.
    if (url && url.startsWith("/finance")) {
      fetch(url, { method: "HEAD" })
        .then((response) => {
          if (!response.ok)
            setPreviewError(`The stored file could not be loaded (HTTP ${response.status}).`);
        })
        .catch(() => setPreviewError("The stored file could not be reached."));
    }
  };
  const applicationCorrections = (correctionRequests ?? []).filter(
    (request) => request.applicationId === snapshot.applicationId,
  );
  const activeCorrectionRequests = applicationCorrections.filter(
    (request) =>
      request.status === "Awaiting Resubmission" ||
      (request.status === "Resubmitted" &&
        request.documents.some((requested) => {
          const document = details?.documents.find((item) => item.type === requested.documentType);
          return (
            !!requested.resubmittedFileUrl &&
            !!document &&
            document.fileUrl === requested.resubmittedFileUrl &&
            documentVerificationStatus(document, documentVerifications) === "Pending"
          );
        })),
  );
  const unresolvedCorrection = applicationCorrections.find(
    (request) => request.status === "Awaiting Resubmission",
  );
  const pendingDocumentCount = (details?.documents ?? []).filter(
    (document) =>
      document.provided &&
      !!document.fileUrl &&
      documentVerificationStatus(document, documentVerifications) === "Pending",
  ).length;
  const correctionCandidates = (details?.documents ?? []).flatMap((document) => {
    const verification = documentVerifications?.find((item) => item.documentType === document.type);
    const missing = !document.provided || !document.fileUrl;
    const rejected =
      !missing && documentVerificationStatus(document, documentVerifications) === "Rejected";
    if (!missing && !rejected) return [];
    return [
      {
        documentType: document.type,
        issue: missing ? ("Missing" as const) : ("Rejected" as const),
        reason: missing
          ? "Required document is missing."
          : verification?.reason?.trim() || "Document was rejected.",
      },
    ];
  });
  const sendCorrectionRequest = () => {
    if (!onSendCorrectionRequest || !correctionCandidates.length) return;
    const requestDocuments = correctionCandidates.map((document) => ({
      ...document,
      reason: correctionReasons[document.documentType] ?? document.reason,
    }));
    if (requestDocuments.some((document) => !document.reason.trim())) return;
    if (onSendCorrectionRequest(requestDocuments)) setCorrectionPreviewOpen(false);
  };
  const correctionRequestHasChanges = correctionCandidates.some((document) => {
    const existing = unresolvedCorrection?.documents.find(
      (item) => item.documentType === document.documentType,
    );
    const reason = (correctionReasons[document.documentType] ?? document.reason).trim();
    return !existing || existing.issue !== document.issue || existing.reason !== reason;
  });
  const openCorrectionPreview = () => {
    setCorrectionReasons(
      Object.fromEntries(
        correctionCandidates.map((document) => [document.documentType, document.reason]),
      ),
    );
    setCorrectionPreviewOpen(true);
  };
  const closeDocumentPreview = () => {
    setSelectedDocument(null);
    setRejecting(false);
    setRejectionReason("");
  };

  return (
    <>
      <div className="application-details-print overflow-hidden rounded-lg border-[1.5px] border-application-orange bg-application-surface">
        <div className="space-y-5 p-4 sm:p-6">
          {/* 1. Personal details */}
          <DetailSection index={1} title="Personal details" accent="lavender">
            <div className="flex items-start gap-4 sm:gap-6">
              <figure className="shrink-0">
                <div className="flex h-[7.5rem] w-24 items-center justify-center overflow-hidden rounded-sm border border-application-line bg-application-surface text-muted-foreground print:bg-white">
                  {hasStudentPhoto ? (
                    <img
                      src={photoUrl}
                      alt={`${snapshot.name} student photo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound
                      aria-label="No student photo"
                      className="h-9 w-9 stroke-[1.25] opacity-60"
                    />
                  )}
                </div>
              </figure>
              <dl className="grid min-w-0 flex-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <ApplicationDetail
                  label="Student full name"
                  value={shown(snapshot.name)}
                  layout="inline"
                />
                <ApplicationDetail label="Date of birth" value={dob} layout="inline" />
                <ApplicationDetail label="Age" value={age} layout="inline" />
                <ApplicationDetail label="Gender" value="Not provided" layout="inline" />
                <ApplicationDetail
                  label="Mobile no"
                  value={shown(snapshot.contact)}
                  layout="inline"
                />
                <ApplicationDetail label="Email" value={shown(snapshot.email)} layout="inline" />
                <div className="sm:col-span-2 lg:col-span-3">
                  <ApplicationDetail
                    label="Permanent address"
                    value={shown(address)}
                    layout="inline"
                  />
                </div>
              </dl>
            </div>
          </DetailSection>

          {/* 2. Guardian details */}
          <DetailSection index={2} title="Guardian details" accent="aqua">
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <ApplicationDetail
                label="Guardian Name & Relation"
                value={guardianLabel}
                layout="inline"
              />
              <ApplicationDetail
                label="Guardian mobile no"
                value={shown(details?.guardianPhone)}
                layout="inline"
              />
              <ApplicationDetail
                label="Guardian email"
                value={shown(details?.guardianEmail)}
                layout="inline"
              />
            </dl>
          </DetailSection>

          {/* 3. Educational qualification / work experience */}
          <DetailSection index={3} title="Educational qualification / work exp" accent="blue">
            <Table>
              <TableHeader>
                <TableRow className="bg-application-table-header hover:bg-application-table-header">
                  <SerialNumberHead />
                  <TableHead>Qualification / Role</TableHead>
                  <TableHead>Institute / Company</TableHead>
                  <TableHead>Year of passing</TableHead>
                  <TableHead>% / Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(educationRows.length > 0 ? educationRows : [""]).map((row, index) =>
                  row ? (
                    <TableRow key={`${index}-${row}`}>
                      <SerialNumberCell index={index} />
                      {educationCells(row).map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell || "Not provided"}</TableCell>
                      ))}
                    </TableRow>
                  ) : (
                    <TableRow key={`${index}-empty`}>
                      <TableCell />
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Not provided
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </DetailSection>

          {/* 4. Lead source & reference */}
          <DetailSection index={4} title="Lead source & reference" accent="lavender">
            <div className="flex flex-wrap items-center gap-2">
              {leadSource && (
                <span className={cn(chipClass, SECTION_ACCENTS.lavender.tag)}>{leadSource}</span>
              )}
              {leadReference && (
                <span className={cn(chipClass, SECTION_ACCENTS.aqua.tag)}>
                  Ref: {leadReference}
                </span>
              )}
              {!leadSource && !leadReference && (
                <span className="text-sm text-muted-foreground">Not provided</span>
              )}
            </div>
            <div className="mt-2">
              <ApplicationDetail label="More details" value="Not provided" layout="inline" />
            </div>
          </DetailSection>

          {/* 5. Course preference */}
          <DetailSection index={5} title="Course preference" accent="aqua">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ApplicationDetail
                  label="Course applied for"
                  value={shown(details?.coursePreference)}
                  layout="inline"
                />
              </div>
              <div className="sm:col-span-2">
                <ApplicationDetail
                  label="Fee plan preferred"
                  value={
                    plan?.length
                      ? plan
                          .map((installment) => displayInstallmentLabel(installment.label))
                          .join(", ")
                      : "Not provided"
                  }
                  layout="inline"
                />
              </div>
              <ApplicationDetail
                label="Instalments"
                value={
                  installmentPreference === undefined
                    ? "Not provided"
                    : installmentPreference > 1
                      ? "Yes"
                      : "No"
                }
                layout="inline"
              />
              <ApplicationDetail
                label="Preferred number of instalments"
                value={
                  installmentPreference === undefined
                    ? "Not provided"
                    : String(installmentPreference)
                }
                layout="inline"
                labelSingleLine
              />
            </dl>
          </DetailSection>

          {/* 6. Documents enclosed */}
          <DetailSection index={6} title="Documents enclosed" accent="blue">
            {details?.documents?.length ? (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {details.documents.map((document, index) => {
                  const { type, provided, fileUrl } = document;
                  const verificationStatus = documentVerificationStatus(
                    document,
                    documentVerifications,
                  );
                  const uploadedFileAvailable =
                    provided && !!fileUrl && DOCUMENT_FILE_SOURCE_PATTERN.test(fileUrl);
                  return (
                    <li
                      key={type}
                      className="flex items-center justify-between gap-3 rounded-lg border border-application-line bg-application-surface px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <SerialNumberLabel index={index} />
                        {verificationStatus === "Approved" ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 fill-green-600 text-white" />
                        ) : verificationStatus === "Rejected" ? (
                          <XCircle className="h-4 w-4 shrink-0 fill-red-600 text-white" />
                        ) : provided ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 break-words">{documentLabel(type)}</span>
                      </span>
                      <span className="flex shrink-0 items-center justify-end gap-1.5">
                        {!provided || !fileUrl ? (
                          <span
                            className={cn(
                              chipClass,
                              "border-danger-soft bg-danger-soft text-destructive",
                            )}
                          >
                            Missing
                          </span>
                        ) : null}
                        {uploadedFileAvailable && onVerifyDocument && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="no-print h-8 w-8 shrink-0"
                            aria-label={`Preview ${documentLabel(type)}`}
                            title={`Preview ${documentLabel(type)}`}
                            onClick={() => openDocumentPreview(document)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Not provided</p>
            )}
          </DetailSection>

          {/* 7. Declaration */}
          <DetailSection index={7} title="Declaration" accent="lavender">
            <p className="text-sm">
              {details?.declarationAccepted === undefined
                ? "Not provided"
                : details.declarationAccepted
                  ? "Accepted"
                  : "Not accepted"}
            </p>
          </DetailSection>
        </div>
      </div>
      {onVerifyDocument && activeCorrectionRequests.length > 0 && (
        <div className="no-print mt-4 space-y-2 rounded-lg border border-application-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Correction Requests to Admission</h4>
          </div>
          <ul className="space-y-2">
            {activeCorrectionRequests
              .slice()
              .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
              .map((request) => {
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">Correction request {request.id}</p>
                      <ul className="mt-1 list-disc pl-4 text-destructive">
                        {request.documents.map((document) => (
                          <li key={document.documentType}>
                            {documentLabel(document.documentType)} · {document.issue}:{" "}
                            {document.reason}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-muted-foreground">
                        Resubmission status:{" "}
                        {request.status === "Awaiting Resubmission"
                          ? "Awaiting resubmission"
                          : request.resubmittedAt
                            ? `Resubmitted · ${new Date(request.resubmittedAt).toLocaleString("en-IN")}`
                            : "Resubmitted"}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
      {onSendCorrectionRequest &&
        correctionCandidates.length > 0 &&
        activeCorrectionRequests.length === 0 && (
          <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-application-line p-3">
            <p className="text-xs text-muted-foreground">
              Review the affected documents and their reasons before sending one consolidated
              request to Admission (Sales).
            </p>
            <Button type="button" size="sm" variant="outline" onClick={openCorrectionPreview}>
              Send Correction Request
            </Button>
          </div>
        )}
      <Dialog open={correctionPreviewOpen} onOpenChange={setCorrectionPreviewOpen}>
        <DialogContent className="max-w-lg [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Review correction request</DialogTitle>
            <DialogDescription>
              One consolidated request for {snapshot.name} · Application No.{" "}
              {snapshot.applicationId}. Sending is simulated in this prototype; Admission (Sales)
              communication and document resubmission are not connected.
            </DialogDescription>
          </DialogHeader>
          {pendingDocumentCount > 0 && (
            <p className="rounded-md border border-warning-soft bg-warning-soft/50 p-3 text-sm text-warning">
              Some documents are still awaiting review. They will not be included in this correction
              request.
            </p>
          )}
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {correctionCandidates.map((document) => (
              <div key={document.documentType} className="space-y-2 rounded-md border p-3">
                <p className="font-medium">
                  {documentLabel(document.documentType)} · {document.issue}
                </p>
                <label
                  htmlFor={`correction-reason-${document.documentType}`}
                  className="text-sm font-medium"
                >
                  Correction reason
                </label>
                <Textarea
                  id={`correction-reason-${document.documentType}`}
                  value={correctionReasons[document.documentType] ?? document.reason}
                  onChange={(event) =>
                    setCorrectionReasons((current) => ({
                      ...current,
                      [document.documentType]: event.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCorrectionPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={sendCorrectionRequest}
              disabled={
                correctionCandidates.length === 0 ||
                !correctionRequestHasChanges ||
                correctionCandidates.some(
                  (document) =>
                    !(correctionReasons[document.documentType] ?? document.reason).trim(),
                )
              }
            >
              Send Correction Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedDocument}
        onOpenChange={(open) => {
          if (!open) closeDocumentPreview();
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
            <DialogTitle>
              {selectedDocument
                ? rejecting
                  ? `Reject ${documentLabel(selectedDocument.type)}`
                  : documentLabel(selectedDocument.type)
                : ""}
            </DialogTitle>
            <DialogDescription>
              {snapshot.name} · Application No. {snapshot.applicationId}
            </DialogDescription>
          </DialogHeader>
          {rejecting ? (
            <div className="space-y-3 overflow-y-auto p-5">
              <label htmlFor="document-rejection-reason" className="text-sm font-medium">
                Rejection reason
              </label>
              <Textarea
                id="document-rejection-reason"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Explain what Admission (Sales) needs to correct."
                rows={4}
                required
              />
              <p className="text-sm text-muted-foreground">
                Admission (Sales) must obtain and resubmit the corrected document. Finance cannot
                upload it.
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {selectedDocument ? documentLabel(selectedDocument.type) : ""}
                  {selectedDocument && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {selectedDocumentStatus === "Pending" ? "Pending" : selectedDocumentStatus}
                    </span>
                  )}
                </p>
                {canEmbedPreview && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Zoom out"
                      disabled={zoom <= 50}
                      onClick={() => setZoom((current) => Math.max(50, current - 10))}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center text-xs tabular-nums">{zoom}%</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Zoom in"
                      disabled={zoom >= 200}
                      onClick={() => setZoom((current) => Math.min(200, current + 10))}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {previewError ? (
                <div
                  role="alert"
                  className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-5 text-center"
                >
                  <p className="text-sm font-medium text-destructive">
                    Document could not be opened
                  </p>
                  <p className="text-sm text-muted-foreground">{previewError}</p>
                </div>
              ) : canEmbedPreview && previewUrl ? (
                isPdf ? (
                  <iframe
                    title={`Preview of ${selectedDocument ? documentLabel(selectedDocument.type) : ""}`}
                    src={pdfPreviewUrl}
                    className="h-[55vh] w-full rounded-md border bg-muted/20"
                  />
                ) : (
                  <div className="flex h-[55vh] items-center justify-center overflow-auto rounded-md border bg-muted/20 p-4">
                    <img
                      src={previewUrl}
                      alt={selectedDocument ? documentLabel(selectedDocument.type) : ""}
                      onError={() => setPreviewError("The stored image file could not be loaded.")}
                      className="max-h-full max-w-full object-contain transition-transform"
                      style={{ transform: `scale(${zoom / 100})` }}
                    />
                  </div>
                )
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border bg-muted/20 p-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    In-app preview is not available for this file format.
                  </p>
                  {previewUrl && !previewError && (
                    <div className="flex gap-2">
                      <Button asChild variant="outline">
                        <a href={previewUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open original
                        </a>
                      </Button>
                      <Button asChild variant="outline">
                        <a href={previewUrl} download={selectedDocument?.fileName}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {canEmbedPreview && previewUrl && !previewError && (
                <div className="flex justify-end gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open original
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={previewUrl} download={selectedDocument?.fileName}>
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                </div>
              )}
              {currentVerification?.status === "Rejected" && currentVerification.reason && (
                <p className="text-sm text-destructive">
                  Previous rejection: {currentVerification.reason}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3">
            {rejecting ? (
              <>
                <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!rejectionReason.trim()}
                  onClick={() => {
                    if (!selectedDocument || !rejectionReason.trim() || !onVerifyDocument) return;
                    onVerifyDocument(selectedDocument, "Rejected", rejectionReason.trim());
                    closeDocumentPreview();
                  }}
                >
                  Reject
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !selectedDocument ||
                    !previewUrl ||
                    !!previewError ||
                    rejectedCurrentFile ||
                    selectedDocumentStatus === "Approved"
                  }
                  onClick={() => setRejecting(true)}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  disabled={
                    !selectedDocument ||
                    !previewUrl ||
                    !!previewError ||
                    rejectedCurrentFile ||
                    selectedDocumentStatus === "Approved"
                  }
                  onClick={() => {
                    if (!selectedDocument || !onVerifyDocument) return;
                    onVerifyDocument(selectedDocument, "Approved");
                    closeDocumentPreview();
                  }}
                >
                  {selectedDocumentStatus === "Approved" ? "Approved" : "Approve"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
