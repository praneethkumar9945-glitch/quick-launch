import * as XLSX from "xlsx";
import {
  suggestBankStatementMapping,
  type ParsedBankStatement,
} from "@/modules/finance/finance/bankStatementImport";

export interface ExcelBankStatementWorksheet {
  name: string;
  parsed: ParsedBankStatement | null;
  error?: string | undefined;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

function toCellText(value: unknown, cell: XLSX.CellObject | undefined, date1904: boolean): string {
  if (isEmpty(value)) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getUTCFullYear().toString().padStart(4, "0"),
      (value.getUTCMonth() + 1).toString().padStart(2, "0"),
      value.getUTCDate().toString().padStart(2, "0"),
    ].join("-");
  }
  if (typeof value === "number" && typeof cell?.z === "string" && XLSX.SSF.is_date(cell.z)) {
    const date = XLSX.SSF.parse_date_code(value, { date1904 });
    if (date) {
      return [
        date.y.toString().padStart(4, "0"),
        date.m.toString().padStart(2, "0"),
        date.d.toString().padStart(2, "0"),
      ].join("-");
    }
  }
  return String(value);
}

function parseWorksheet(
  worksheet: XLSX.WorkSheet,
  workbook: XLSX.WorkBook,
): ExcelBankStatementWorksheet["parsed"] {
  if (!worksheet["!ref"]) return null;
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  const rows = rawRows.map((row, rowIndex) =>
    row.map((value, columnIndex) => {
      const address = XLSX.utils.encode_cell({
        r: range.s.r + rowIndex,
        c: range.s.c + columnIndex,
      });
      return toCellText(value, worksheet[address], Boolean(workbook.Workbook?.WBProps?.date1904));
    }),
  );
  const nonEmptyRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((value) => value.trim()));
  if (!nonEmptyRows.length) return null;

  const candidates = nonEmptyRows.map(({ row, index }) => {
    const mapping = suggestBankStatementMapping(row);
    const requiredFields = Number(!!mapping.date) + Number(!!mapping.description);
    const amountFields = Number(!!mapping.debit) + Number(!!mapping.credit);
    const score = Object.values(mapping).filter(Boolean).length;
    return { row, index, mapping, requiredFields, amountFields, score };
  });
  const detectedHeader = candidates
    .filter(({ requiredFields, amountFields }) => requiredFields === 2 && amountFields > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];
  const header = detectedHeader ?? candidates[0]!;
  const columnCount = Math.max(header.row.length, ...rows.map((row) => row.length));
  const usedHeaders = new Map<string, number>();
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const original = header.row[index]?.trim() || `Column ${index + 1}`;
    const count = (usedHeaders.get(original.toLowerCase()) ?? 0) + 1;
    usedHeaders.set(original.toLowerCase(), count);
    return count === 1 ? original : `${original} (${count})`;
  });
  const records = rows
    .slice(header.index + 1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => headers.map((_, index) => row[index] ?? ""));
  return { headers, records };
}

export function extractBankStatementWorksheets(data: ArrayBuffer): ExcelBankStatementWorksheet[] {
  const bytes = new Uint8Array(data);
  const zipWorkbook =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(bytes[3] ?? -1);
  const legacyWorkbook = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (byte, index) => bytes[index] === byte,
  );
  if (!zipWorkbook && !legacyWorkbook) {
    throw new Error("The selected file is not a valid XLS or XLSX workbook.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  } catch {
    throw new Error("The Excel workbook is invalid, encrypted, or could not be read.");
  }
  if (!Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) {
    throw new Error("The Excel workbook is invalid or does not contain any worksheets.");
  }
  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) return { name, parsed: null, error: "This worksheet could not be read." };
    const parsed = parseWorksheet(worksheet, workbook);
    return parsed ? { name, parsed } : { name, parsed: null, error: "This worksheet is empty." };
  });
}
