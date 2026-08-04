// The plain (non-legacy) pdfjs-dist build uses private class fields, which this project's
// webpack 4 / ts-loader pipeline has no loader for -- the legacy build avoids that syntax
// (same reasoning as pdf-highlighter-detail.component.ts, which established this pattern).
// tslint:disable-next-line:no-var-requires
const pdfjsLib: any = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

/** Extracts plain text from a PDF's raw bytes, page by page, client-side. Shared by
 * Object Browser's "Process with AI" flow and the Content Cleaner tool so both read PDFs
 * the same way. */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        text += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
    }
    return text;
}
