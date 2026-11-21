
import {
  identifyBankStatementField,
  type BankStatementField,
  type ParsedBankStatement,
} from "@/modules/finance/finance/bankStatementImport";



interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
  confidence?: number | undefined;
}

interface TextLine {
  y: number;
  items: PositionedText[];
}

interface PdfColumn {
  field: BankStatementField;
  x: number;
}

export interface PdfBankStatementExtraction {
  parsed: ParsedBankStatement;
  warnings: string[];
  pageCount: number;
  lowConfidenceCells: Array<{ rowIndex: number; columnIndex: number; confidence: number }>;
  scannedPageCount: number;
}

export interface PdfOcrProgress {
  stage: "reading" | "rendering" | "ocr" | "loading";
  page: number;
  pageCount: number;
  progress: number;
}

const fieldLabels: Record<BankStatementField, string> = {
  date: "Date",
  valueDate: "Value date",
  description: "Description",
  bankReference: "Reference",
  debit: "Debit",
  credit: "Credit",
  balance: "Balance",
};

function isPositionedText(item: unknown): item is {
  str: string;
  transform: number[];
  width: number;
} {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "transform" in item &&
    Array.isArray(item.transform) &&
    typeof item.transform[4] === "number" &&
    typeof item.transform[5] === "number"
  );
}

function groupLines(items: PositionedText[], yTolerance = 3): TextLine[] {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: TextLine[] = [];
  for (const item of sorted) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  return lines
    .map((line) => ({
      ...line,
      items: line.items.sort((left, right) => left.x - right.x),
    }))
    .sort((left, right) => right.y - left.y);
}

function detectColumns(line: TextLine): PdfColumn[] {
  const candidates: Array<{ field: BankStatementField; x: number; labelLength: number }> = [];
  for (let start = 0; start < line.items.length; start += 1) {
    for (let length = 1; length <= 3 && start + length <= line.items.length; length += 1) {
      const group = line.items.slice(start, start + length);
      const label = group
        .map((item) => item.text)
        .join(" ")
        .trim();
      const field = identifyBankStatementField(label);
      if (field) {
        candidates.push({
          field,
          x: group.reduce((sum, item) => sum + item.x + item.width / 2, 0) / group.length,
          labelLength: length,
        });
      }
    }
  }

  const columns: PdfColumn[] = [];
  for (const candidate of candidates.sort((left, right) => right.labelLength - left.labelLength)) {
    const existing = columns.find((column) => column.field === candidate.field);
    if (!existing) columns.push(candidate);
  }
  if (
    !columns.some((column) => column.field === "date") &&
    columns.some((column) => column.field === "valueDate")
  ) {
    columns.find((column) => column.field === "valueDate")!.field = "date";
  }
  return columns.sort((left, right) => left.x - right.x);
}

function lineLooksLikeTransaction(line: TextLine): boolean {
  const text = line.items.map((item) => item.text).join(" ");
  const datePattern =
    /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4})\b/i;
  const date = datePattern.exec(text);
  if (!date) return false;
  const remaining = `${text.slice(0, date.index)} ${text.slice(date.index + date[0].length)}`;
  return /(?:₹|INR|Rs\.?)\s*-?\d|\b\d[\d,]*\b/i.test(remaining);
}

function reconstructRows(
  linesByPage: TextLine[][],
  pageCount: number,
  scannedPageCount: number,
): PdfBankStatementExtraction {
  const warnings: string[] = [];
  const rows: string[][] = [];
  const lowConfidenceCells: PdfBankStatementExtraction["lowConfidenceCells"] = [];
  let columns: PdfColumn[] = [];
  let headerFound = false;
  let uncertainRows = 0;
  let skippedTextLines = 0;

  for (const pageLines of linesByPage) {
    let pageHasHeader = false;
    for (const line of pageLines) {
      const detected = detectColumns(line);
      const hasDate = detected.some((column) => column.field === "date");
      const hasDescription = detected.some((column) => column.field === "description");
      const hasAmount = detected.some(
        (column) => column.field === "debit" || column.field === "credit",
      );
      if (hasDate && hasDescription && hasAmount) {
        columns = detected;
        headerFound = true;
        pageHasHeader = true;
        continue;
      }
      if (!columns.length) {
        if (line.items.some((item) => item.text.trim())) skippedTextLines += 1;
        continue;
      }

      const record = Array.from({ length: columns.length }, () => "");
      const cellConfidence = Array.from({ length: columns.length }, () => Number.POSITIVE_INFINITY);
      for (const item of line.items) {
        const center = item.x + item.width / 2;
        const columnIndex = columns.reduce(
          (bestIndex, column, index) =>
            Math.abs(column.x - center) < Math.abs(columns[bestIndex]!.x - center)
              ? index
              : bestIndex,
          0,
        );
        record[columnIndex] = [record[columnIndex], item.text.trim()].filter(Boolean).join(" ");
        if (item.confidence !== undefined) {
          cellConfidence[columnIndex] = Math.min(cellConfidence[columnIndex]!, item.confidence);
        }
      }
      if (!record.some(Boolean)) continue;

      const mapped = Object.fromEntries(
        columns.map((column, index) => [column.field, record[index] ?? ""]),
      ) as Partial<Record<BankStatementField, string>>;
      const hasDateValue = !!mapped.date?.trim();
      const hasAmountValue = !!mapped.debit?.trim() || !!mapped.credit?.trim();
      if (!hasDateValue && !hasAmountValue && mapped.description?.trim() && rows.length) {
        const descriptionIndex = columns.findIndex((column) => column.field === "description");
        const previous = rows[rows.length - 1]!;
        previous[descriptionIndex] = [previous[descriptionIndex], mapped.description.trim()]
          .filter(Boolean)
          .join(" ");
        uncertainRows += 1;
        continue;
      }
      if (!hasDateValue || !hasAmountValue) uncertainRows += 1;
      cellConfidence.forEach((confidence, columnIndex) => {
        if (confidence < 60) {
          lowConfidenceCells.push({
            rowIndex: rows.length,
            columnIndex,
            confidence,
          });
        }
      });
      rows.push(record);
    }
    if (headerFound && !pageHasHeader && pageLines.length) {
      warnings.push(
        "A page did not repeat the statement headings; the previous page's columns were used.",
      );
    }
  }

  if (scannedPageCount) {
    warnings.push(
      `${scannedPageCount} scanned page(s) were processed locally with OCR. Review every extracted value before importing.`,
    );
  }
  if (lowConfidenceCells.length) {
    warnings.push(
      `${lowConfidenceCells.length} OCR value(s) have confidence below 60%. They are highlighted for manual review and are not verified transactions.`,
    );
  }

  if (!headerFound) {
    const rawLines = linesByPage.flatMap((page) =>
      page.map((line) =>
        line.items
          .map((item) => item.text.trim())
          .filter(Boolean)
          .join(" "),
      ),
    );
    if (skippedTextLines) {
      warnings.push(
        "Text was extracted, but no supported transaction table headings were found. Review the raw text; this layout cannot be safely normalized automatically.",
      );
    }
    return {
      parsed: {
        headers: ["Extracted text"],
        records: rawLines.filter(Boolean).map((line) => [line]),
      },
      warnings,
      pageCount,
      lowConfidenceCells,
      scannedPageCount,
    };
  }

  if (uncertainRows) {
    warnings.push(
      `${uncertainRows} extracted line(s) have incomplete transaction fields or were joined as wrapped descriptions. Review the editable preview before importing.`,
    );
  }
  if (skippedTextLines) {
    warnings.push(
      `${skippedTextLines} text line(s) before the first transaction header were not treated as transactions.`,
    );
  }

  const headers = columns.map((column) => fieldLabels[column.field]);
  return {
    parsed: { headers, records: rows },
    warnings,
    pageCount,
    lowConfidenceCells,
    scannedPageCount,
  };
}

export async function extractBankStatementPdf(
  data: ArrayBuffer,
  onProgress?: (progress: PdfOcrProgress) => void | undefined,
): Promise<PdfBankStatementExtraction> {
  if (typeof window === "undefined") throw new Error("PDF import is only available in the browser.");
  const { getDocument, GlobalWorkerOptions, PasswordResponses } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: pdfWorkerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = new Uint8Array(data);
  if (!bytes.length) throw new Error("The PDF file is empty.");
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("The selected file is not a valid PDF document.");
  }

  let loadingTask: ReturnType<typeof getDocument>;
  try {
    loadingTask = getDocument({ data: bytes });
  } catch {
    throw new Error("The PDF could not be opened. It may be corrupted or unsupported.");
  }

  let document;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    const passwordError =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "PasswordException";
    if (passwordError) {
      const code = "code" in error ? error.code : undefined;
      throw new Error(
        code === PasswordResponses.INCORRECT_PASSWORD
          ? "The PDF password is incorrect. Password-protected statements are not supported."
          : "This PDF is password-protected. Remove its password before importing.",
      );
    }
    if (
      error instanceof Error &&
      /invalid pdf structure|no pdf header found|pdf file is empty/i.test(error.message)
    ) {
      throw new Error("The PDF is empty, corrupted, or has no readable pages.");
    }
    throw new Error(
      `The PDF is corrupted or could not be read${error instanceof Error ? `: ${error.message}` : "."}`,
    );
  }

  try {
    if (document.numPages === 0) throw new Error("The PDF contains no pages.");
    const linesByPage: TextLine[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      onProgress?.({
        stage: "reading",
        page: pageNumber,
        pageCount: document.numPages,
        progress: (pageNumber - 1) / document.numPages,
      });
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of textContent.items) {
        if (isPositionedText(item)) {
          items.push({
            text: item.str,
            x: item.transform[4]!,
            y: item.transform[5]!,
            width: item.width,
          });
        }
      }
      linesByPage.push(groupLines(items));
    }
    const scannedPages = linesByPage.flatMap((page, index) =>
      page.some(lineLooksLikeTransaction) ? [] : [index + 1],
    );
    if (scannedPages.length) {
      onProgress?.({
        stage: "loading",
        page: 0,
        pageCount: document.numPages,
        progress: 0,
      });
      const { recognizeScannedPages } = await import("@/modules/finance/finance/bankStatementOcr");
      const ocrPages = await recognizeScannedPages(document, scannedPages, onProgress);
      for (const [pageNumber, words] of ocrPages) {
        linesByPage[pageNumber - 1] = groupLines(words, 12);
      }
    }
    const extraction = reconstructRows(linesByPage, document.numPages, scannedPages.length);
    if (scannedPages.length && !extraction.parsed.records.length) {
      throw new Error(
        "OCR found no transaction rows. This scanned statement layout is unsupported.",
      );
    }
    return extraction;
  } finally {
    await loadingTask.destroy();
  }
}
