import "./setup";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { recognizeScannedPages, type PdfOcrWord } from "@/modules/finance/finance/bankStatementOcr";
import {
  BankStatementImport,
  ImportedStatementList,
} from "@/modules/finance/components/finance/BankStatementImport";
import {
  parseBankStatementCsv,
  suggestBankStatementMapping,
  validateBankStatementRows,
  type BankStatementImport as BankStatementImportRecord,
} from "@/modules/finance/finance/bankStatementImport";
import { extractBankStatementPdf } from "@/modules/finance/finance/bankStatementPdf";
import { FinanceProvider, useFinance } from "@/modules/finance/finance/store";

vi.mock("@/modules/finance/finance/bankStatementOcr", () => ({
  recognizeScannedPages: vi.fn(),
}));

GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

afterEach(() => {
  vi.mocked(recognizeScannedPages).mockReset();
});

const validCsv = [
  "Date,Narration,UTR No.,Debit,Credit,Balance",
  "2026-10-28,Office supplies,  UTR-551  ,,1250,25000",
].join("\n");

function ImportHarness() {
  const [imports, setImports] = useState<BankStatementImportRecord[]>([]);
  return (
    <>
      <BankStatementImport
        imports={imports}
        onImport={(statement) => {
          setImports((current) => [...current, statement]);
          return true;
        }}
      />
      <ImportedStatementList imports={imports} />
      <output data-testid="import-count">{imports.length}</output>
      <output data-testid="imported-data">{JSON.stringify(imports)}</output>
    </>
  );
}

function FinanceImportHarness() {
  const {
    bankStatementImports,
    bankStatementImportsLoaded,
    addBankStatementImport,
    transactions,
    balances,
  } = useFinance();
  return (
    <>
      <BankStatementImport
        imports={bankStatementImports}
        onImport={addBankStatementImport}
        ready={bankStatementImportsLoaded}
      />
      <ImportedStatementList imports={bankStatementImports} />
      <output data-testid="finance-import-data">{JSON.stringify(bankStatementImports)}</output>
      <output data-testid="transaction-count">{transactions.length}</output>
      <output data-testid="bank-balance">{balances.bank}</output>
    </>
  );
}

async function selectCsv(content: string, name = "statement.csv") {
  const input = screen.getByLabelText("Bank statement file (CSV, XLS, XLSX, or PDF)");
  fireEvent.change(input, {
    target: { files: [new File([content], name, { type: "text/csv" })] },
  });
  await waitFor(() => {
    expect(screen.queryByText("Transaction preview") || screen.queryByRole("alert")).toBeTruthy();
  });
}

function excelFile(name: string, sheets: Array<{ name: string; rows: unknown[][] }>) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  const bookType = name.toLowerCase().endsWith(".xls") ? "biff8" : "xlsx";
  const bytes = XLSX.write(workbook, { bookType, type: "array" });
  return new File([bytes], name, {
    type:
      bookType === "biff8"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function selectExcel(file: File) {
  const input = screen.getByLabelText("Bank statement file (CSV, XLS, XLSX, or PDF)");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.queryByText("Transaction preview") || screen.queryByRole("alert")).toBeTruthy();
  });
}

async function selectPdf(data: ArrayBuffer, name = "statement.pdf") {
  const input = screen.getByLabelText("Bank statement file (CSV, XLS, XLSX, or PDF)");
  fireEvent.change(input, {
    target: { files: [new File([data], name, { type: "application/pdf" })] },
  });
  await waitFor(() => {
    expect(screen.queryByText("Transaction preview") || screen.queryByRole("alert")).toBeTruthy();
  });
}

function makePdf(pages: string[][]) {
  const escapePdfText = (text: string) =>
    text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((lines, pageIndex) => {
    const pageId = pageIds[pageIndex]!;
    const contentId = pageId + 1;
    const commands = lines
      .map((line, lineIndex) => {
        const y = 740 - lineIndex * 24;
        const cells = line.split("|");
        const xPositions = [40, 110, 210, 360, 445, 500, 555];
        return cells
          .map(
            (cell, columnIndex) =>
              `BT /F1 10 Tf ${xPositions[columnIndex] ?? 600} ${y} Td (${escapePdfText(cell)}) Tj ET`,
          )
          .join("\n");
      })
      .join("\n");
    const length = new TextEncoder().encode(commands).length;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${length} >>\nstream\n${commands}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = new TextEncoder().encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer;
}

describe("Bank statement import flow", () => {
  it("previews CSV without importing and can cancel", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    expect(screen.getByRole("heading", { name: "Transaction preview" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Match status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Validation warnings" })).toBeInTheDocument();
    expect(screen.getByText("Unreviewed")).toBeInTheDocument();
    expect(screen.getByText("statement.csv")).toBeInTheDocument();
    expect(screen.getByText("CSV", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit Description row 1" })).toHaveValue(
      "Office supplies",
    );
    expect(screen.getByRole("textbox", { name: "Edit Reference number row 1" })).toHaveValue(
      "  UTR-551  ",
    );
    const previewTable = screen.getByRole("table", { name: "Common transaction preview" });
    expect(within(previewTable).getAllByRole("columnheader")[0]).toHaveTextContent("Sl. No.");
    const firstDataRow = within(previewTable).getAllByRole("row").at(1);
    if (!firstDataRow?.firstElementChild) throw new Error("Expected a preview data row");
    expect(firstDataRow.firstElementChild).toHaveTextContent("1");
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms imported statement rows separately from transactions", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Description row 1" }), {
      target: { value: "Corrected office supplies" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("import-count")).toHaveTextContent("1");
    expect(screen.getByText("statement.csv")).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
    ).toMatchObject({
      date: "2026-10-28",
      description: "Corrected office supplies",
      bankReference: "  UTR-551  ",
      debit: 0,
      credit: 1250,
      balance: 25000,
    });
  });

  it("rejects unsupported and malformed CSV files", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv, "statement.zip");
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported file format");

    await selectCsv('Date,Description\n2026-10-28,"unfinished');
    expect(await screen.findByRole("alert")).toHaveTextContent("unclosed quoted field");
    await selectCsv("");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "empty or contains no statement rows",
    );
    await selectCsv("Date,Description,Debit\n2026-10-28,Office supplies");
    expect(await screen.findByRole("alert")).toHaveTextContent("expected 3");
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");
  });

  it("blocks missing required amount columns and invalid dates or amounts", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv("Date,Narration\n2026-10-28,Office supplies");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Map at least one required amount column",
    );
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();

    await selectCsv("Date,Narration,Debit,Credit\n31/02/2026,Office supplies,invalid,");
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or missing date");
    expect(screen.getByRole("alert")).toHaveTextContent("not a valid amount");
  });

  it("revalidates corrected date and amount fields before confirmation", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);

    fireEvent.change(screen.getByRole("textbox", { name: "Edit Transaction date row 1" }), {
      target: { value: "31/02/2026" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Credit row 1" }), {
      target: { value: "not-an-amount" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("invalid or missing date");
    expect(screen.getByRole("alert")).toHaveTextContent("not a valid amount");
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Edit Transaction date row 1" }), {
      target: { value: "2026-10-29" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Credit row 1" }), {
      target: { value: "1300.50" },
    });
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    expect(
      JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
    ).toMatchObject({ date: "2026-10-29", credit: 1300.5 });
  });

  it("blocks duplicate rows from the same file and repeat imports", async () => {
    const duplicateCsv = [
      "Date,Narration,UTR No.,Debit,Credit",
      "2026-10-28,Office supplies,UTR-551,1250,",
      "2026-10-28,Office supply items,UTR-551,1200,",
    ].join("\n");
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(duplicateCsv);
    expect(await screen.findByText(/duplicate row\(s\) detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    expect(await screen.findByText(/duplicate row\(s\) detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    expect(screen.getByTestId("import-count")).toHaveTextContent("1");
  });

  it("allows manual mapping for unfamiliar headers", () => {
    const parsed = parseBankStatementCsv("Booked,Memo,Outflow,Inflow\n2026-10-28,Transfer,450,");
    const mapping = {
      ...suggestBankStatementMapping(parsed.headers),
      date: "Booked",
      description: "Memo",
      debit: "Outflow",
    };
    const validation = validateBankStatementRows(parsed, mapping);
    expect(validation.errors).toEqual([]);
    expect(validation.rows[0]).toMatchObject({
      date: "2026-10-28",
      description: "Transfer",
      debit: 450,
      credit: 0,
    });
  });

  it.each(["statement.xlsx", "statement.xls"])(
    "imports %s through the existing reconciliation staging flow",
    async (name) => {
      const file = excelFile(name, [
        {
          name: "Transactions",
          rows: [
            ["Bank Statement"],
            [
              "Transaction Date",
              "Value Date",
              "Narration",
              "UTR No.",
              "Debit",
              "Credit",
              "Running Balance",
            ],
            [],
            [
              new Date("2026-10-28T00:00:00.000Z"),
              new Date("2026-10-29T00:00:00.000Z"),
              "Office supplies",
              "UTR-XLS-1",
              "",
              "₹ 1,250.00",
              "INR 25,000.00",
            ],
          ],
        },
      ]);
      render(<ImportHarness />);
      fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
      await selectExcel(file);

      expect(screen.getByRole("textbox", { name: "Edit Description row 1" })).toHaveValue(
        "Office supplies",
      );
      expect(screen.getByRole("textbox", { name: "Edit Value date row 1" })).toHaveValue(
        "2026-10-29",
      );
      expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
      expect(
        await screen.findByText("Imported statements — staged for reconciliation"),
      ).toBeInTheDocument();
      expect(
        JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
      ).toMatchObject({
        date: "2026-10-28",
        valueDate: "2026-10-29",
        description: "Office supplies",
        bankReference: "UTR-XLS-1",
        credit: 1250,
        balance: 25000,
      });
    },
  );

  it("allows selecting a worksheet and editing extracted Excel values", async () => {
    const file = excelFile("multiple.xlsx", [
      {
        name: "Notes",
        rows: [["Description"], ["not a transaction"]],
      },
      {
        name: "Statement",
        rows: [
          ["Transaction Date", "Description", "Debit"],
          ["28-Oct-2026", "Original transfer", 450],
        ],
      },
    ]);
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectExcel(file);
    fireEvent.click(screen.getByRole("combobox", { name: "Worksheet" }));
    fireEvent.click(await screen.findByRole("option", { name: "Statement" }));

    const description = screen.getByRole("textbox", { name: "Edit Description row 1" });
    fireEvent.change(description, { target: { value: "Corrected transfer" } });
    expect(description).toHaveValue("Corrected transfer");
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  });

  it("allows manual mapping when Excel headings are unfamiliar", async () => {
    const file = excelFile("manual.xlsx", [
      {
        name: "Statement",
        rows: [
          ["Booked", "Memo", "Outflow"],
          ["28-Oct-2026", "Transfer", 450],
        ],
      },
    ]);
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectExcel(file);

    const selectors = screen.getAllByRole("combobox");
    const mapColumn = async (selector: HTMLElement, header: string) => {
      fireEvent.click(selector);
      fireEvent.click(await screen.findByRole("option", { name: header }));
    };
    await mapColumn(selectors[0]!, "Booked");
    await mapColumn(selectors[2]!, "Memo");
    await mapColumn(selectors[4]!, "Outflow");
    expect(screen.getByRole("textbox", { name: "Edit Description row 1" })).toHaveValue("Transfer");
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  });

  it("reports invalid workbooks and missing required transaction values", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectExcel(new File(["not an Excel file"], "broken.xlsx"));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid XLS or XLSX workbook");

    const file = excelFile("missing.xlsx", [
      {
        name: "Statement",
        rows: [
          ["Transaction Date", "Description", "Debit"],
          ["", "", 100],
        ],
      },
    ]);
    await selectExcel(file);
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or missing date");
    expect(screen.getByRole("alert")).toHaveTextContent("description / narration is required");
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });

  it("extracts positioned text and reconstructs transaction columns from a text PDF", async () => {
    const extracted = await extractBankStatementPdf(
      makePdf([
        [
          "Transaction Date|Value Date|Description|Reference|Debit|Credit|Balance",
          "28/10/2026|29/10/2026|Office supplies|UTR-PDF-1||1,250|25,000",
        ],
      ]),
    );
    expect(extracted.pageCount).toBe(1);
    expect(extracted.parsed.headers).toEqual([
      "Date",
      "Value date",
      "Description",
      "Reference",
      "Debit",
      "Credit",
      "Balance",
    ]);
    expect(extracted.parsed.records[0]).toEqual([
      "28/10/2026",
      "29/10/2026",
      "Office supplies",
      "UTR-PDF-1",
      "",
      "1,250",
      "25,000",
    ]);
  });

  it("extracts and retains rows across multiple PDF pages", async () => {
    const extracted = await extractBankStatementPdf(
      makePdf([
        [
          "Date|Description|Reference|Debit|Credit|Balance",
          "28/10/2026|First transfer|UTR-PDF-1||1,250|25,000",
        ],
        ["29/10/2026|Second transfer|UTR-PDF-2|400||24,600"],
      ]),
    );
    expect(extracted.pageCount).toBe(2);
    expect(extracted.parsed.records).toHaveLength(2);
    expect(extracted.parsed.records.map((row) => row[1])).toEqual([
      "First transfer",
      "Second transfer",
    ]);
    expect(extracted.warnings).toContain(
      "A page did not repeat the statement headings; the previous page's columns were used.",
    );
  });

  it("shows editable PDF extraction and stages corrected rows through the shared import action", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectPdf(
      makePdf([
        [
          "Date|Description|Reference|Debit|Credit|Balance",
          "28/10/2026|Office supplies|UTR-PDF-UI||1,250|25,000",
        ],
      ]),
    );

    expect(screen.getByRole("textbox", { name: "Edit Description row 1" })).toHaveValue(
      "Office supplies",
    );
    const description = screen.getByRole("textbox", { name: "Edit Description row 1" });
    fireEvent.change(description, { target: { value: "Corrected office supplies" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
    ).toMatchObject({
      date: "2026-10-28",
      description: "Corrected office supplies",
      bankReference: "UTR-PDF-UI",
      credit: 1250,
      balance: 25000,
    });
  });

  it("runs scanned-page OCR with visible progress and stages reviewed OCR values", async () => {
    const words: PdfOcrWord[] = [
      { text: "Date", x: 40, y: 700, width: 30, confidence: 99 },
      { text: "Description", x: 120, y: 700, width: 80, confidence: 99 },
      { text: "Reference", x: 270, y: 700, width: 65, confidence: 99 },
      { text: "Debit", x: 400, y: 700, width: 35, confidence: 99 },
      { text: "Credit", x: 480, y: 700, width: 40, confidence: 99 },
      { text: "Balance", x: 560, y: 700, width: 50, confidence: 99 },
      { text: "28/10/2026", x: 40, y: 650, width: 60, confidence: 96 },
      { text: "Office supplies", x: 120, y: 650, width: 95, confidence: 42 },
      { text: "UTR-OCR-1", x: 270, y: 650, width: 60, confidence: 95 },
      { text: "1,250", x: 480, y: 650, width: 35, confidence: 95 },
      { text: "25,000", x: 560, y: 650, width: 45, confidence: 95 },
    ];
    let finishOcr: () => void = () => {};
    vi.mocked(recognizeScannedPages).mockImplementation(
      async (_document, pageNumbers, onProgress) => {
        expect(pageNumbers).toEqual([1]);
        onProgress?.({ stage: "rendering", page: 1, pageCount: 1, progress: 0 });
        onProgress?.({ stage: "ocr", page: 1, pageCount: 1, progress: 0.5 });
        await new Promise<void>((resolve) => {
          finishOcr = resolve;
        });
        return new Map([[1, words]]);
      },
    );

    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    const input = screen.getByLabelText("Bank statement file (CSV, XLS, XLSX, or PDF)");
    fireEvent.change(input, {
      target: {
        files: [new File([makePdf([[]])], "scanned.pdf", { type: "application/pdf" })],
      },
    });

    expect(await screen.findByText("Recognizing scanned page 1 of 1")).toBeInTheDocument();
    await act(async () => finishOcr());
    expect(await screen.findByRole("textbox", { name: "Edit Description row 1" })).toHaveValue(
      "Office supplies",
    );
    expect(screen.getByText("PDF pages:").parentElement).toHaveTextContent("1");
    expect(screen.getByText(/processed locally with OCR/)).toBeInTheDocument();
    expect(screen.getByText(/low OCR confidence/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Edit Description row 1" }), {
      target: { value: "Verified office supplies" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(
      JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
    ).toMatchObject({
      date: "2026-10-28",
      description: "Verified office supplies",
      bankReference: "UTR-OCR-1",
      credit: 1250,
      balance: 25000,
    });
    expect(recognizeScannedPages).toHaveBeenCalledOnce();
  });

  it("shows scanned-page OCR failures and prevents confirmation", async () => {
    vi.mocked(recognizeScannedPages).mockRejectedValue(
      new Error("OCR failed on page 1. No text from that page was imported."),
    );

    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    const input = screen.getByLabelText("Bank statement file (CSV, XLS, XLSX, or PDF)");
    fireEvent.change(input, {
      target: {
        files: [new File([makePdf([[]])], "unreadable-scan.pdf", { type: "application/pdf" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OCR failed on page 1. No text from that page was imported.",
    );
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });

  it("rejects invalid and empty PDFs before attempting extraction", async () => {
    await expect(
      extractBankStatementPdf(new TextEncoder().encode("not pdf").buffer),
    ).rejects.toThrow("not a valid PDF");
    await expect(extractBankStatementPdf(new ArrayBuffer(0))).rejects.toThrow("PDF file is empty");
    await expect(extractBankStatementPdf(makePdf([]))).rejects.toThrow("PDF contains no pages");
  });

  it("persists confirmed imported rows in browser storage without changing transactions or balances", async () => {
    const storageKey = Object.keys(localStorage).find((key) =>
      key.includes("bank-statement-imports"),
    );
    if (storageKey) localStorage.removeItem(storageKey);
    const firstRender = render(
      <FinanceProvider>
        <FinanceImportHarness />
      </FinanceProvider>,
    );
    const importButton = await screen.findByRole("button", { name: /Import Bank Statement/ });
    await waitFor(() => expect(importButton).toBeEnabled());
    const initialTransactions = screen.getByTestId("transaction-count").textContent;
    const initialBalance = screen.getByTestId("bank-balance").textContent;
    fireEvent.click(importButton);
    await selectCsv(validCsv);
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("transaction-count")).toHaveTextContent(initialTransactions ?? "");
    expect(screen.getByTestId("bank-balance")).toHaveTextContent(initialBalance ?? "");
    expect(Object.keys(localStorage).some((key) => key.includes("bank-statement-imports"))).toBe(
      true,
    );

    firstRender.unmount();
    render(
      <FinanceProvider>
        <FinanceImportHarness />
      </FinanceProvider>,
    );
    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("finance-import-data").textContent ?? "[]")).toHaveLength(
      1,
    );
    const persistedKey = Object.keys(localStorage).find((key) =>
      key.includes("bank-statement-imports"),
    );
    if (persistedKey) localStorage.removeItem(persistedKey);
  });
});
