import tesseractWorkerUrl from "tesseract.js/dist/worker.min.js?url";
import tesseractCoreUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import type Tesseract from "tesseract.js";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfOcrProgress } from "@/modules/finance/finance/bankStatementPdf";

export interface PdfOcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  confidence: number;
}

export async function recognizeScannedPages(
  document: PDFDocumentProxy,
  pageNumbers: number[],
  onProgress?: (progress: PdfOcrProgress) => void | undefined,
): Promise<Map<number, PdfOcrWord[]>> {
  if (typeof window === "undefined") throw new Error("OCR is only available in the browser.");
  const { default: Tesseract } = await import("tesseract.js");
  onProgress?.({ stage: "loading", page: 0, pageCount: document.numPages, progress: 0 });
  let currentPage = 0;
  let worker: Tesseract.Worker;
  try {
    worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
      workerPath: tesseractWorkerUrl,
      corePath: tesseractCoreUrl,
      gzip: true,
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress?.({
            stage: "ocr",
            page: currentPage,
            pageCount: document.numPages,
            progress: message.progress,
          });
        } else if (
          message.status === "loading tesseract core" ||
          message.status === "loading language traineddata"
        ) {
          onProgress?.({
            stage: "loading",
            page: 0,
            pageCount: document.numPages,
            progress: message.progress,
          });
        }
      },
    });
  } catch {
    throw new Error("The local OCR engine failed to start. No statement data was sent externally.");
  }

  const wordsByPage = new Map<number, PdfOcrWord[]>();
  try {
    for (const pageNumber of pageNumbers) {
      currentPage = pageNumber;
      onProgress?.({
        stage: "rendering",
        page: pageNumber,
        pageCount: document.numPages,
        progress: (pageNumber - 1) / document.numPages,
      });
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(
        0.5,
        Math.min(2, 2200 / Math.max(baseViewport.width, baseViewport.height)),
      );
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error(`Page ${pageNumber} could not be rendered for OCR.`);

      try {
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
        const words: PdfOcrWord[] = [];
        for (const block of result.data.blocks ?? []) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              for (const word of line.words) {
                if (!word.text.trim()) continue;
                words.push({
                  text: word.text,
                  x: word.bbox.x0,
                  y: canvas.height - word.bbox.y1,
                  width: word.bbox.x1 - word.bbox.x0,
                  confidence: word.confidence,
                });
              }
            }
          }
        }
        if (!words.length && result.data.text.trim()) {
          throw new Error(`Page ${pageNumber} OCR could not determine the text layout.`);
        }
        if (!words.length) {
          throw new Error(`Page ${pageNumber} is unreadable; OCR did not recognize any text.`);
        }
        wordsByPage.set(pageNumber, words);
      } catch (error) {
        if (error instanceof Error && /Page \d+/.test(error.message)) throw error;
        throw new Error(`OCR failed on page ${pageNumber}. No text from that page was imported.`);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    await worker.terminate();
  }
  return wordsByPage;
}
