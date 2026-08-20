/** PDF text extraction via pdf.js (text layer only; scanned-PDF OCR is out of scope here). */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPage {
  pageNumber: number;
  paragraphs: string[];
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  height: number;
}

/** Group text items into lines by Y position, then merge lines into paragraphs by vertical gaps. */
function itemsToParagraphs(items: PositionedItem[]): string[] {
  if (items.length === 0) return [];

  const lines: { y: number; height: number; text: string }[] = [];
  // Sort top-to-bottom (PDF y grows upward), then left-to-right.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const str = item.str.trim();
    if (!str) continue;
    const last = lines[lines.length - 1];
    const tolerance = Math.max(item.height * 0.5, 2);
    if (last && Math.abs(last.y - item.y) <= tolerance) {
      last.text += last.text.endsWith('-') ? str : ` ${str}`;
    } else {
      lines.push({ y: item.y, height: item.height || 10, text: str });
    }
  }

  const paragraphs: string[] = [];
  let current = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prev = lines[i - 1];
    const gap = prev ? prev.y - line.y : 0;
    const newParagraph = prev !== undefined && gap > Math.max(prev.height, line.height) * 1.8;
    if (newParagraph && current) {
      paragraphs.push(current);
      current = line.text;
    } else {
      // De-hyphenate wrapped words when joining lines.
      current = current
        ? current.endsWith('-')
          ? current.slice(0, -1) + line.text
          : `${current} ${line.text}`
        : line.text;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.filter((p) => p.trim().length > 1);
}

export async function extractPdfPages(data: ArrayBuffer): Promise<PdfPage[]> {
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const doc = await loadingTask.promise;
    const pages: PdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !('transform' in item)) continue;
        items.push({
          str: item.str,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          height: Math.abs(item.transform[3] as number) || 10,
        });
      }
      pages.push({ pageNumber, paragraphs: itemsToParagraphs(items) });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
