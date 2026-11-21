import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/modules/finance/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/finance/components/ui/dialog";
import { Input } from "@/modules/finance/components/ui/input";
import { Progress } from "@/modules/finance/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/finance/components/ui/table";
import {
  Field,
  SerialNumberCell,
  SerialNumberHead,
  SerialNumberLabel,
  SimpleSelect,
} from "@/modules/finance/components/finance/common";
import {
  type BankStatementField,
  type BankStatementImport as BankStatementImportRecord,
  type BankStatementMapping,
  type ImportedBankStatementRow,
  type ParsedBankStatement,
  parseBankStatementCsv,
  suggestBankStatementMapping,
  validateBankStatementRows,
} from "@/modules/finance/finance/bankStatementImport";
import {
  extractBankStatementWorksheets,
  type ExcelBankStatementWorksheet,
} from "@/modules/finance/finance/bankStatementExcel";
import { extractBankStatementPdf, type PdfOcrProgress } from "@/modules/finance/finance/bankStatementPdf";
import { formatDate, formatINR } from "@/modules/finance/finance/logic";

const fieldLabels: Record<BankStatementField, string> = {
  date: "Date *",
  valueDate: "Value date (optional)",
  description: "Description / narration *",
  bankReference: "Bank reference / UTR (optional)",
  debit: "Debit (one amount column required)",
  credit: "Credit (one amount column required)",
  balance: "Running balance (optional)",
};

const fields: BankStatementField[] = [
  "date",
  "valueDate",
  "description",
  "bankReference",
  "debit",
  "credit",
  "balance",
];

export function BankStatementImport({
  imports,
  onImport,
  ready = true,
}: {
  imports: BankStatementImportRecord[];
  onImport: (statement: BankStatementImportRecord) => boolean;
  ready?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedBankStatement | null>(null);
  const [mapping, setMapping] = useState<BankStatementMapping | null>(null);
  const [fileError, setFileError] = useState("");
  const [worksheets, setWorksheets] = useState<ExcelBankStatementWorksheet[]>([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [fileFormat, setFileFormat] = useState<"csv" | "excel" | "pdf" | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [lowConfidenceCells, setLowConfidenceCells] = useState<
    Array<{ rowIndex: number; columnIndex: number; confidence: number }>
  >([]);
  const [ocrProgress, setOcrProgress] = useState<PdfOcrProgress | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const priorRows = useMemo(() => imports.flatMap((statement) => statement.rows), [imports]);
  const validation =
    parsed && mapping
      ? validateBankStatementRows(parsed, mapping, priorRows)
      : {
          rows: [] as ImportedBankStatementRow[],
          recordRows: [] as Array<ImportedBankStatementRow | null>,
          rowWarnings: [] as string[][],
          errors: [] as string[],
          duplicateCount: 0,
        };
  const fileTypeLabel =
    fileFormat === "csv"
      ? "CSV"
      : fileFormat === "excel"
        ? `Excel (.${fileName.toLowerCase().endsWith(".xls") && !fileName.toLowerCase().endsWith(".xlsx") ? "xls" : "xlsx"})`
        : fileFormat === "pdf"
          ? "PDF"
          : fileName
            ? (fileName.split(".").pop()?.toUpperCase() ?? "Unknown")
            : "";
  const failedRowCount = parsed
    ? parsed.records.filter((_, index) => !validation.recordRows[index]).length
    : 0;
  const sourceValue = (record: string[], field: BankStatementField) => {
    const header = mapping?.[field];
    const index = header ? (parsed?.headers.indexOf(header) ?? -1) : -1;
    return index >= 0 ? (record[index] ?? "") : "";
  };

  const reset = () => {
    setOpen(false);
    setFileName("");
    setParsed(null);
    setMapping(null);
    setFileError("");
    setWorksheets([]);
    setSelectedWorksheet("");
    setFileFormat(null);
    setExtractionWarnings([]);
    setLowConfidenceCells([]);
    setOcrProgress(null);
    setPdfPageCount(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = async (file: File | undefined) => {
    setFileError("");
    setParsed(null);
    setMapping(null);
    setWorksheets([]);
    setSelectedWorksheet("");
    setFileFormat(null);
    setExtractionWarnings([]);
    setLowConfidenceCells([]);
    setOcrProgress(null);
    setPdfPageCount(null);
    if (!file) return;
    setFileName(file.name);
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xls" && extension !== "xlsx" && extension !== "pdf") {
      setFileError("Unsupported file format. Select a CSV, XLS, XLSX, or PDF statement.");
      return;
    }
    try {
      if (extension === "csv") {
        setFileFormat("csv");
        setOcrProgress({ stage: "reading", page: 1, pageCount: 1, progress: 0.1 });
        const content =
          typeof file.text === "function"
            ? await file.text()
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  typeof reader.result === "string"
                    ? resolve(reader.result)
                    : reject(new Error("The selected file could not be decoded as text."));
                reader.onerror = () =>
                  reject(new Error("The selected CSV file could not be read."));
                reader.readAsText(file);
              });
        const result = parseBankStatementCsv(content);
        setParsed(result);
        setMapping(suggestBankStatementMapping(result.headers));
        setOcrProgress(null);
      } else if (extension === "pdf") {
        setFileFormat("pdf");
        const buffer =
          typeof file.arrayBuffer === "function"
            ? await file.arrayBuffer()
            : await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  reader.result instanceof ArrayBuffer
                    ? resolve(reader.result)
                    : reject(new Error("The selected PDF could not be decoded."));
                reader.onerror = () =>
                  reject(new Error("The selected PDF file could not be read."));
                reader.readAsArrayBuffer(file);
              });
        const extracted = await extractBankStatementPdf(buffer, setOcrProgress);
        setParsed(extracted.parsed);
        setMapping(suggestBankStatementMapping(extracted.parsed.headers));
        setExtractionWarnings(extracted.warnings);
        setLowConfidenceCells(extracted.lowConfidenceCells);
        setPdfPageCount(extracted.pageCount);
        setOcrProgress(null);
      } else {
        setFileFormat("excel");
        setOcrProgress({ stage: "reading", page: 1, pageCount: 1, progress: 0.1 });
        const buffer =
          typeof file.arrayBuffer === "function"
            ? await file.arrayBuffer()
            : await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  reader.result instanceof ArrayBuffer
                    ? resolve(reader.result)
                    : reject(new Error("The selected Excel file could not be decoded."));
                reader.onerror = () =>
                  reject(new Error("The selected Excel file could not be read."));
                reader.readAsArrayBuffer(file);
              });
        const extracted = extractBankStatementWorksheets(buffer);
        setWorksheets(extracted);
        const first = extracted[0];
        if (!first) throw new Error("The Excel workbook does not contain any worksheets.");
        setSelectedWorksheet(first.name);
        if (first.parsed) {
          setParsed(first.parsed);
          setMapping(suggestBankStatementMapping(first.parsed.headers));
        } else {
          setFileError(first.error ?? "The selected worksheet contains no statement data.");
        }
        setOcrProgress(null);
      }
    } catch (error) {
      setOcrProgress(null);
      setFileError(
        error instanceof Error ? error.message : "The selected statement file could not be read.",
      );
    }
  };

  const selectWorksheet = (name: string) => {
    const worksheet = worksheets.find((item) => item.name === name);
    setSelectedWorksheet(name);
    setFileError(worksheet?.error ?? "");
    setParsed(worksheet?.parsed ?? null);
    setMapping(worksheet?.parsed ? suggestBankStatementMapping(worksheet.parsed.headers) : null);
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    setParsed((current) =>
      current
        ? {
            ...current,
            records: current.records.map((row, index) =>
              index === rowIndex
                ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell))
                : row,
            ),
          }
        : current,
    );
  };

  const confirmImport = () => {
    if (!parsed || !mapping || validation.errors.length || !validation.rows.length) return;
    const dates = validation.rows.map((row) => row.date).sort();
    const statement: BankStatementImportRecord = {
      id: `BSI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      fileName,
      importedAt: new Date().toISOString(),
      periodStart: dates[0]!,
      periodEnd: dates.at(-1)!,
      rows: validation.rows,
    };
    if (!onImport(statement)) {
      toast.error(
        "The statement could not be saved to this browser. Check local storage availability and try again.",
      );
      return;
    }
    toast.success(`${statement.rows.length} statement rows imported for reconciliation.`);
    reset();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onClick={() => setOpen(true)}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        Import Bank Statement
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && reset()}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[94vw] max-w-5xl flex-col overflow-hidden p-4 sm:max-h-[90vh] sm:p-6">
          <DialogHeader>
            <DialogTitle>Import Bank Statement</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Upload a bank statement in CSV, Excel or PDF format. Imported transactions will be
              reviewed before reconciliation.
            </p>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <Field
              label="Bank statement file (CSV, XLS, XLSX, or PDF)"
              htmlFor="bank-statement-file"
            >
              <Input
                ref={inputRef}
                id="bank-statement-file"
                type="file"
                accept=".csv,.xls,.xlsx,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
            </Field>
            {fileName && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">Selected file:</span> {fileName}
                </span>
                <span>
                  <span className="font-medium">File type:</span> {fileTypeLabel}
                </span>
                {pdfPageCount !== null && (
                  <span>
                    <span className="font-medium">PDF pages:</span> {pdfPageCount}
                  </span>
                )}
              </div>
            )}
            {worksheets.length > 1 && (
              <Field label="Worksheet" htmlFor="bank-statement-worksheet">
                <SimpleSelect
                  id="bank-statement-worksheet"
                  value={selectedWorksheet}
                  onChange={selectWorksheet}
                  options={worksheets.map((worksheet) => worksheet.name)}
                />
              </Field>
            )}
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
            {ocrProgress && (
              <div role="status" aria-live="polite" className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">
                  {ocrProgress.stage === "reading"
                    ? fileFormat === "pdf"
                      ? ocrProgress.page
                        ? `Checking embedded text on page ${ocrProgress.page} of ${ocrProgress.pageCount}`
                        : "Reading PDF pages"
                      : `Reading ${fileTypeLabel} file`
                    : ocrProgress.stage === "rendering"
                      ? `Rendering scanned page ${ocrProgress.page} of ${ocrProgress.pageCount}`
                      : ocrProgress.page
                        ? `Recognizing scanned page ${ocrProgress.page} of ${ocrProgress.pageCount}`
                        : "Loading local OCR engine and English model"}
                </p>
                <Progress
                  value={
                    ocrProgress.page
                      ? ((ocrProgress.page - 1 + ocrProgress.progress) / ocrProgress.pageCount) *
                        100
                      : ocrProgress.progress * 100
                  }
                  aria-label="PDF extraction progress"
                />
                <p className="text-xs text-muted-foreground">
                  PDF text extraction and OCR run in this browser. Statement contents are not sent
                  to an extraction service.
                </p>
              </div>
            )}
            {extractionWarnings.length > 0 && (
              <div
                role="status"
                className="rounded-md border border-warning-soft bg-warning-soft p-3 text-sm text-warning"
              >
                <p className="mb-1 font-medium">PDF extraction needs review</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {extractionWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsed && mapping && (
              <>
                <section aria-label="Statement column mapping" className="space-y-3">
                  <h3 className="text-sm font-semibold">Map statement columns</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <Field key={field} label={fieldLabels[field]} htmlFor={`bank-map-${field}`}>
                        <SimpleSelect
                          id={`bank-map-${field}`}
                          value={mapping[field]}
                          placeholder="Not mapped"
                          onChange={(value) =>
                            setMapping((current) =>
                              current ? { ...current, [field]: value } : current,
                            )
                          }
                          options={parsed.headers}
                        />
                      </Field>
                    ))}
                  </div>
                </section>
                <section aria-label="Statement preview" className="space-y-2">
                  <h3 className="text-sm font-semibold">Transaction preview</h3>
                  <p className="text-xs text-muted-foreground">
                    {parsed.records.length} extracted transaction row(s); {validation.rows.length}{" "}
                    valid and {failedRowCount} failed or incomplete. All rows remain unreviewed
                    until reconciliation.
                  </p>
                  {validation.errors.length > 0 && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                      <p className="mb-1 font-medium">Resolve these issues before importing:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {validation.errors.slice(0, 8).map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                      {validation.errors.length > 8 && (
                        <p className="mt-1">And {validation.errors.length - 8} more issue(s).</p>
                      )}
                    </div>
                  )}
                  {validation.duplicateCount > 0 && (
                    <p className="text-sm text-destructive">
                      {validation.duplicateCount} duplicate row(s) detected; this import is blocked
                      to prevent double counting.
                    </p>
                  )}
                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table aria-label="Common transaction preview">
                      <TableHeader>
                        <TableRow>
                          <SerialNumberHead />
                          <TableHead>Transaction date</TableHead>
                          <TableHead>Value date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Reference number</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead>Running balance</TableHead>
                          <TableHead>Match status</TableHead>
                          <TableHead>Validation warnings</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.records.map((record, rowIndex) => {
                          const validRow = validation.recordRows[rowIndex];
                          const rowWarnings = [...(validation.rowWarnings[rowIndex] ?? [])];
                          const lowConfidence = lowConfidenceCells.filter(
                            (cell) => cell.rowIndex === rowIndex,
                          );
                          for (const cell of lowConfidence) {
                            const header = parsed.headers[cell.columnIndex] ?? "value";
                            rowWarnings.push(
                              `${header} has low OCR confidence (${Math.round(cell.confidence)}%). Verify or correct it.`,
                            );
                          }
                          const mappedCell = (field: BankStatementField, label: string) => {
                            const header = mapping[field];
                            const columnIndex = header ? parsed.headers.indexOf(header) : -1;
                            if (columnIndex < 0) {
                              return <span className="text-muted-foreground">Not mapped</span>;
                            }
                            const confidenceWarning = lowConfidence.find(
                              (cell) => cell.columnIndex === columnIndex,
                            );
                            return (
                              <Input
                                aria-label={`Edit ${label} row ${rowIndex + 1}`}
                                aria-describedby={
                                  confidenceWarning
                                    ? `pdf-ocr-confidence-${rowIndex}-${columnIndex}`
                                    : undefined
                                }
                                className={`h-8 min-w-28 ${
                                  confidenceWarning ? "border-warning text-warning" : ""
                                }`}
                                value={record[columnIndex] ?? ""}
                                onChange={(event) =>
                                  updateCell(rowIndex, columnIndex, event.target.value)
                                }
                              />
                            );
                          };
                          return (
                            <TableRow key={`${selectedWorksheet}-${rowIndex}`}>
                              <SerialNumberCell index={rowIndex} />
                              <TableCell>{mappedCell("date", "Transaction date")}</TableCell>
                              <TableCell>{mappedCell("valueDate", "Value date")}</TableCell>
                              <TableCell>{mappedCell("description", "Description")}</TableCell>
                              <TableCell>
                                {mappedCell("bankReference", "Reference number")}
                              </TableCell>
                              <TableCell>{mappedCell("debit", "Debit")}</TableCell>
                              <TableCell>{mappedCell("credit", "Credit")}</TableCell>
                              <TableCell>{mappedCell("balance", "Running balance")}</TableCell>
                              <TableCell>
                                {validRow ? "Unreviewed" : "Blocked — validation errors"}
                              </TableCell>
                              <TableCell className="min-w-60 text-xs">
                                {rowWarnings.length ? (
                                  <ul className="list-inside list-disc space-y-0.5 text-destructive">
                                    {rowWarnings.map((warning) => (
                                      <li key={warning}>{warning}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-muted-foreground">None</span>
                                )}
                                {lowConfidence.map((cell) => (
                                  <span
                                    id={`pdf-ocr-confidence-${rowIndex}-${cell.columnIndex}`}
                                    key={`${rowIndex}-${cell.columnIndex}`}
                                    className="sr-only"
                                  >
                                    Low OCR confidence: {Math.round(cell.confidence)} percent.
                                    Verify or correct this value.
                                  </span>
                                ))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {parsed.records.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center text-muted-foreground">
                              No transaction rows were extracted.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmImport}
              disabled={!parsed || !validation.rows.length || validation.errors.length > 0}
            >
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportedStatementList({ imports }: { imports: BankStatementImportRecord[] }) {
  if (!imports.length) return null;
  return (
    <section aria-label="Imported statements" className="mb-4 space-y-2">
      <h3 className="text-sm font-semibold">Imported statements — staged for reconciliation</h3>
      {imports.map((statement, index) => (
        <details key={statement.id} className="overflow-hidden rounded-md border">
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 bg-muted/40 px-3 py-2 text-sm">
            <SerialNumberLabel index={index} />
            <span className="font-medium">{statement.fileName}</span>
            <span>{formatDate(statement.importedAt.slice(0, 10))} imported</span>
            <span>
              Period: {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
            </span>
            <span>{statement.rows.length} rows</span>
          </summary>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SerialNumberHead />
                  <TableHead>Date</TableHead>
                  <TableHead>Value date</TableHead>
                  <TableHead>Description / narration</TableHead>
                  <TableHead>Bank reference / UTR</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Running balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.rows.map((row, rowIndex) => (
                  <TableRow key={row.rowKey}>
                    <SerialNumberCell index={rowIndex} />
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell>{row.valueDate ? formatDate(row.valueDate) : "—"}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="font-mono text-xs">{row.bankReference || "—"}</TableCell>
                    <TableCell className="num text-right">
                      {row.debit ? formatINR(row.debit) : "—"}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.credit ? formatINR(row.credit) : "—"}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.balance === undefined ? "—" : formatINR(row.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ))}
    </section>
  );
}
