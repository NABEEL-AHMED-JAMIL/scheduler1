
const pdfjsLib: any = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

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
