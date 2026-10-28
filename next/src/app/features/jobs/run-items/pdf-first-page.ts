import { InjectionToken } from '@angular/core';

/** A PDF's first page as a picture (an object URL of a PNG) and how many pages the PDF has. */
export interface PdfFirstPage { url: string; pages: number; }

/** Draws a PDF's first page at about `width` CSS pixels. */
export type PdfFirstPageDrawer = (pdf: Blob, width: number) => Promise<PdfFirstPage>;

/** pdf.js's document and page, as far as this uses them. */
interface PdfPage { getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> }; }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?(): Promise<void> | void; }

/**
 * ZT-I35: the first page of a PDF that is no Report Studio report (whose own thumbnail comes from Report Studio), drawn
 * in the browser with pdf.js -- the library the console's PDF viewer and Report Studio's preview already load, with the
 * worker angular.json copies -- on a canvas that is never shown, kept as a PNG; the document is let go at once.
 */
export async function drawPdfFirstPage(pdf: Blob, width: number): Promise<PdfFirstPage> {
  const pdfjs = await import('pdfjs-dist') as unknown as {
    GlobalWorkerOptions: { workerSrc: string }; getDocument(o: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
  };
  // As the console's PDF viewer: the worker is the file angular.json copies to this path.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await pdf.arrayBuffer() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to draw on.');
    // The page's paper, as pdf.js prints it.
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const png = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
    if (!png) throw new Error('The page could not be kept as a picture.');
    return { url: URL.createObjectURL(png), pages: doc.numPages };
  } finally {
    await doc.destroy?.();
  }
}

/** The drawer the files panel uses: pdf.js in the console, a stand-in in the specs. */
export const PDF_FIRST_PAGE = new InjectionToken<PdfFirstPageDrawer>('A PDF\'s first page', { providedIn: 'root', factory: () => drawPdfFirstPage });
