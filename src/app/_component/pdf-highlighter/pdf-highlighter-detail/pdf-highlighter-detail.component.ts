import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertService, PdfHighlighterService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, HIGHLIGHTER_STATUS_LIST, STATUS_LIST } from '@/_models';
import { PdfHighlighterField, PdfHighlighterFieldSelector } from '@/_models/index';

// The plain (non-legacy) build uses private class fields, which this project's webpack 4 /
// ts-loader pipeline has no loader for (.js files pass through untranspiled) -- the legacy
// build targets older JS environments and avoids that syntax.
// tslint:disable-next-line:no-var-requires
const pdfjsLib: any = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

interface DraftRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface PageTextItem {
    str: string;
    box: { x: number; y: number; width: number; height: number };
}

const MAX_RENDER_WIDTH = 1100;
const MIN_DRAG_PX = 6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const CONTEXT_CHARS = 30;

/** Reads a File's bytes as an ArrayBuffer via FileReader (Blob.arrayBuffer() isn't in this project's TS 3.1 dom lib). */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

let localFieldIdCounter = 0;
function nextLocalFieldId(): string {
    localFieldIdCounter += 1;
    return 'field-' + Date.now() + '-' + localFieldIdCounter;
}

/**
 * Full PDF viewer + box-drawing tool for a PdfHighlighterTask -- upload a PDF, drag rectangles
 * over the fields you need, and save the mapping (label + coordinates + an auto-derived
 * text-anchored selector). Ported from io-frontend's ai-tool/pdf-highlighter screen, minus the
 * organization/form linkage (scheduler1 has no such concept).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'pdf-highlighter-detail',
    templateUrl: 'pdf-highlighter-detail.component.html'
})
export class PdfHighlighterDetailComponent implements OnInit, OnDestroy {
    @ViewChild('pdfCanvas', {static: false}) private canvasRef?: ElementRef<HTMLCanvasElement>;
    @ViewChild('overlay', {static: false}) private overlayRef?: ElementRef<HTMLDivElement>;
    @ViewChild('viewerScroll', {static: false}) private viewerScrollRef?: ElementRef<HTMLDivElement>;

    public ERROR = 'Error';
    public readonly highlighterStatusList: any = HIGHLIGHTER_STATUS_LIST;
    public readonly statusList: any = STATUS_LIST;

    // --- Task metadata ---
    public pdfHighlighterTaskId: any = null;
    public taskName = '';
    public description = '';
    public highlighterStatus = 'Draft';
    public status = 'Active';
    public loadingTask = false;
    public saving = false;
    public setupError = '';
    public readOnly = false;

    // --- PDF viewer state ---
    public fileName = '';
    public fileSize?: number;
    public fileContentType?: string;
    public loading = false;
    public rendering = false;
    public errorMessage = '';
    private selectedFile: File | null = null;

    public currentPage = 1;
    public totalPages = 0;
    public fields: PdfHighlighterField[] = [];

    public draftRect: DraftRect | null = null;
    public zoom = 1;
    public readonly minZoom = MIN_ZOOM;
    public readonly maxZoom = MAX_ZOOM;

    private pdfDoc: any = null;
    private scale = 1;
    private isDrawing = false;
    private dragStart = { x: 0, y: 0 };
    private nextFieldNumber = 1;
    private pageTextCache = new Map<number, PageTextItem[]>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private pdfHighlighterService: PdfHighlighterService,
        private cdr: ChangeDetectorRef) {
    }

    ngOnInit(): void {
        this.pdfHighlighterTaskId = this.route.snapshot.paramMap.get('pdfHighlighterTaskId');
        this.readOnly = this.route.snapshot.queryParamMap.get('mode') === 'view';
        if (this.pdfHighlighterTaskId) {
            this.loadTask(this.pdfHighlighterTaskId);
        }
    }

    ngOnDestroy(): void {
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
        }
    }

    private loadTask(pdfHighlighterTaskId: any): void {
        this.loadingTask = true;
        this.pdfHighlighterService.fetchPdfHighlighterTaskById(pdfHighlighterTaskId).subscribe((response) => {
            if (response.status === ApiCode.SUCCESS) {
                const task = response.data;
                if (task) {
                    this.taskName = task.taskName;
                    this.description = task.description || '';
                    this.highlighterStatus = task.highlighterStatus;
                    this.status = task.status;
                    this.fileName = task.fileName || '';
                    this.fileSize = task.fileSize;
                    this.fileContentType = task.fileContentType;
                    if (task.fileName) {
                        this.loadStoredFile(pdfHighlighterTaskId);
                    }
                }
                this.loadFieldsFromServer(pdfHighlighterTaskId);
            } else {
                this.loadingTask = false;
                this.alertService.showError(response.message, this.ERROR);
            }
        }, (error) => {
            this.loadingTask = false;
            this.alertService.showError(error, this.ERROR);
        });
    }

    private loadFieldsFromServer(pdfHighlighterTaskId: any): void {
        this.pdfHighlighterService.fetchPdfHighlighterFields(pdfHighlighterTaskId).subscribe((response) => {
            this.loadingTask = false;
            if (response.status === ApiCode.SUCCESS) {
                const serverFields: any[] = response.data || [];
                this.fields = serverFields.map((f) => ({
                    id: nextLocalFieldId(),
                    label: f.label,
                    page: f.page,
                    x: f.x,
                    y: f.y,
                    width: f.width,
                    height: f.height,
                    useXpathFirst: !!f.useXpathFirst,
                    selector: f.selectorPath
                        ? { path: f.selectorPath, text: f.selectorText || '', prefix: f.selectorPrefix || '', suffix: f.selectorSuffix || '' }
                        : undefined
                }));
                this.totalPages = Math.max(this.totalPages, this.currentPage, ...this.fields.map((f) => f.page));
            } else {
                this.alertService.showError(response.message, this.ERROR);
            }
        }, (error) => {
            this.loadingTask = false;
            this.alertService.showError(error, this.ERROR);
        });
    }

    // --- Save (create/update task + replace fields + upload file) ---

    public saveTask(): void {
        if (this.readOnly) { return; }
        if (!this.taskName || !this.taskName.trim()) {
            this.alertService.showError('Task name is required.', this.ERROR);
            return;
        }

        this.saving = true;
        const payload: any = { taskName: this.taskName.trim(), description: this.description, highlighterStatus: this.highlighterStatus };
        if (this.pdfHighlighterTaskId) {
            payload.pdfHighlighterTaskId = this.pdfHighlighterTaskId;
            payload.status = this.status;
            this.pdfHighlighterService.updatePdfHighlighterTask(payload).subscribe(() => {
                this.afterTaskSaved(this.pdfHighlighterTaskId);
            }, (error) => {
                this.saving = false;
                this.alertService.showError(error, this.ERROR);
            });
        } else {
            this.pdfHighlighterService.addPdfHighlighterTask(payload).subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.pdfHighlighterTaskId = response.data ? response.data.pdfHighlighterTaskId : null;
                    this.afterTaskSaved(this.pdfHighlighterTaskId);
                } else {
                    this.saving = false;
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.saving = false;
                this.alertService.showError(error, this.ERROR);
            });
        }
    }

    private afterTaskSaved(pdfHighlighterTaskId: any): void {
        if (!pdfHighlighterTaskId) {
            this.saving = false;
            this.alertService.showError('Task was saved but no id was returned.', this.ERROR);
            return;
        }
        const fieldsPayload = this.fields.map((f, index) => ({
            label: f.label,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            displayOrder: index,
            selectorPath: f.selector ? f.selector.path : undefined,
            selectorText: f.selector ? f.selector.text : undefined,
            selectorPrefix: f.selector ? f.selector.prefix : undefined,
            selectorSuffix: f.selector ? f.selector.suffix : undefined,
            useXpathFirst: f.useXpathFirst
        }));
        this.pdfHighlighterService.syncPdfHighlighterFields({ pdfHighlighterTaskId, fields: fieldsPayload }).subscribe(() => {
            if (this.selectedFile) {
                this.pdfHighlighterService.uploadPdfHighlighterFile(pdfHighlighterTaskId, this.selectedFile).subscribe(() => {
                    this.finishSave();
                }, (error) => {
                    this.saving = false;
                    this.alertService.showError(error, this.ERROR);
                });
            } else {
                this.finishSave();
            }
        }, (error) => {
            this.saving = false;
            this.alertService.showError(error, this.ERROR);
        });
    }

    private finishSave(): void {
        this.saving = false;
        this.alertService.showSuccess('PDF highlighter task saved', 'Saved');
        this.router.navigate(['/pdfHighlighter']);
    }

    public cancel(): void {
        this.router.navigate(['/pdfHighlighter']);
    }

    // --- File loading ---

    public onFileSelected(event: Event): void {
        if (this.readOnly) { return; }
        const input = event.target as HTMLInputElement;
        const file = input.files && input.files[0];
        if (file) { this.loadFile(file); }
        input.value = '';
    }

    public onDrop(event: DragEvent): void {
        event.preventDefault();
        if (this.readOnly) { return; }
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) { return; }
        if (file.type !== 'application/pdf') {
            this.alertService.showError('Please drop a PDF file.', this.ERROR);
            return;
        }
        this.loadFile(file);
    }

    public onDragOver(event: DragEvent): void {
        event.preventDefault();
    }

    private loadFile(file: File): void {
        if (file.type !== 'application/pdf') {
            this.alertService.showError('Please select a PDF file.', this.ERROR);
            return;
        }
        this.loading = true;
        this.errorMessage = '';
        readFileAsArrayBuffer(file).then((buffer) => {
            this.fileName = file.name;
            this.fileSize = file.size;
            this.fileContentType = file.type;
            this.selectedFile = file;
            return this.openPdfBuffer(buffer);
        }).then(() => {
            this.loading = false;
        }).catch(() => {
            this.errorMessage = 'Could not read that PDF. Please try a different file.';
            this.pdfDoc = null;
            this.fileName = '';
            this.loading = false;
        });
    }

    private loadStoredFile(pdfHighlighterTaskId: any): void {
        this.loading = true;
        this.errorMessage = '';
        this.pdfHighlighterService.downloadPdfHighlighterFile(pdfHighlighterTaskId).subscribe((blob) => {
            readFileAsArrayBuffer(blob as any).then((buffer) => this.openPdfBuffer(buffer)).then(() => {
                this.loading = false;
            }).catch(() => {
                this.errorMessage = 'Could not load the stored PDF. You can upload it again below.';
                this.loading = false;
            });
        }, () => {
            this.errorMessage = 'Could not load the stored PDF. You can upload it again below.';
            this.loading = false;
        });
    }

    private async openPdfBuffer(buffer: ArrayBuffer): Promise<void> {
        if (this.pdfDoc) { this.pdfDoc.destroy(); }
        this.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
        this.pageTextCache.clear();
        this.totalPages = Math.max(this.pdfDoc.numPages, this.totalPages);
        this.currentPage = 1;
        this.zoom = 1;
        // The canvas/overlay live behind *ngIf="fileName"; force a sync view update so
        // the ViewChild refs exist before the first renderPage() looks them up.
        this.cdr.detectChanges();
        await this.renderPage();
    }

    public removeFile(): void {
        if (this.readOnly) { return; }
        if (this.pdfDoc) { this.pdfDoc.destroy(); }
        this.pdfDoc = null;
        this.fileName = '';
        this.fileSize = undefined;
        this.fileContentType = undefined;
        this.selectedFile = null;
        this.totalPages = 0;
        this.currentPage = 1;
        this.zoom = 1;
        this.errorMessage = '';
        this.pageTextCache.clear();
    }

    // --- Page rendering ---

    private async renderPage(): Promise<void> {
        if (!this.pdfDoc || !this.canvasRef || !this.overlayRef) { return; }
        this.rendering = true;
        const page = await this.pdfDoc.getPage(this.currentPage);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const containerWidth = (this.viewerScrollRef ? this.viewerScrollRef.nativeElement.clientWidth : MAX_RENDER_WIDTH) - 48;
        const fitWidth = Math.min(Math.max(containerWidth, 320), MAX_RENDER_WIDTH);
        const fitScale = fitWidth / unscaledViewport.width;
        this.scale = fitScale * this.zoom;
        const viewport = page.getViewport({ scale: this.scale });

        const canvas = this.canvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        const overlay = this.overlayRef.nativeElement;
        overlay.style.width = viewport.width + 'px';
        overlay.style.height = viewport.height + 'px';

        const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined;
        await page.render({ canvasContext: ctx, viewport, transform }).promise;
        this.rendering = false;
        this.enrichFieldSelectors(this.currentPage);
    }

    // --- Text-anchored selectors ---

    private async enrichFieldSelectors(pageNum: number): Promise<void> {
        const pending = this.fields.filter((f) => f.page === pageNum && !f.selector);
        if (!pending.length) { return; }
        try {
            const items = await this.getPageTextItems(pageNum);
            for (const field of pending) {
                field.selector = this.buildSelector(pageNum, items, { x: field.x, y: field.y, width: field.width, height: field.height });
            }
        } catch (e) {
            // Best-effort enrichment -- coordinates alone still work if text extraction fails.
        }
    }

    private async getPageTextItems(pageNum: number): Promise<PageTextItem[]> {
        const cached = this.pageTextCache.get(pageNum);
        if (cached) { return cached; }
        if (!this.pdfDoc) { return []; }

        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const items: PageTextItem[] = [];
        for (const item of textContent.items) {
            if (!item.str || !item.str.trim()) { continue; }
            const x0 = item.transform[4];
            const y0 = item.transform[5];
            const p0 = viewport.convertToViewportPoint(x0, y0);
            const p1 = viewport.convertToViewportPoint(x0 + item.width, y0 + item.height);
            items.push({
                str: item.str,
                box: {
                    x: Math.min(p0[0], p1[0]),
                    y: Math.min(p0[1], p1[1]),
                    width: Math.abs(p1[0] - p0[0]),
                    height: Math.abs(p1[1] - p0[1])
                }
            });
        }

        this.pageTextCache.set(pageNum, items);
        return items;
    }

    private buildSelector(pageNum: number, items: PageTextItem[], rect: { x: number; y: number; width: number; height: number }): PdfHighlighterFieldSelector | undefined {
        const matchedIndices: number[] = [];
        items.forEach((item, index) => {
            const cx = item.box.x + item.box.width / 2;
            const cy = item.box.y + item.box.height / 2;
            if (cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height) {
                matchedIndices.push(index);
            }
        });
        if (!matchedIndices.length) { return undefined; }

        const startIndex = matchedIndices[0];
        const endIndex = matchedIndices[matchedIndices.length - 1];
        const text = matchedIndices.map((i) => items[i].str).join(' ').replace(/\s+/g, ' ').trim();

        const before = items.slice(Math.max(0, startIndex - 6), startIndex).map((i) => i.str).join(' ');
        const after = items.slice(endIndex + 1, endIndex + 7).map((i) => i.str).join(' ');

        return {
            path: 'page[' + pageNum + ']/text()[' + startIndex + ':' + endIndex + ']',
            text,
            prefix: before.slice(-CONTEXT_CHARS).trim(),
            suffix: after.slice(0, CONTEXT_CHARS).trim()
        };
    }

    public async prevPage(): Promise<void> {
        if (this.currentPage <= 1) { return; }
        this.currentPage--;
        await this.renderPage();
    }

    public async nextPage(): Promise<void> {
        if (this.currentPage >= this.totalPages) { return; }
        this.currentPage++;
        await this.renderPage();
    }

    // --- Zoom ---

    public async zoomIn(): Promise<void> {
        await this.setZoom(this.zoom + ZOOM_STEP);
    }

    public async zoomOut(): Promise<void> {
        await this.setZoom(this.zoom - ZOOM_STEP);
    }

    public async resetZoom(): Promise<void> {
        await this.setZoom(1);
    }

    private async setZoom(value: number): Promise<void> {
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
        if (clamped === this.zoom) { return; }
        this.zoom = clamped;
        await this.renderPage();
    }

    // --- Box drawing ---

    public onOverlayMouseDown(event: MouseEvent): void {
        if (this.readOnly || !this.pdfDoc || !this.overlayRef) { return; }
        const rect = this.overlayRef.nativeElement.getBoundingClientRect();
        this.dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        this.isDrawing = true;
        this.draftRect = { left: this.dragStart.x, top: this.dragStart.y, width: 0, height: 0 };
    }

    public onOverlayMouseMove(event: MouseEvent): void {
        if (!this.isDrawing || !this.overlayRef) { return; }
        const rect = this.overlayRef.nativeElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.draftRect = {
            left: Math.min(x, this.dragStart.x),
            top: Math.min(y, this.dragStart.y),
            width: Math.abs(x - this.dragStart.x),
            height: Math.abs(y - this.dragStart.y)
        };
    }

    public async onOverlayMouseUp(): Promise<void> {
        if (!this.isDrawing) { return; }
        this.isDrawing = false;
        const rect = this.draftRect;
        this.draftRect = null;
        if (!rect || rect.width < MIN_DRAG_PX || rect.height < MIN_DRAG_PX) { return; }

        const page = this.currentPage;
        const fieldRect = {
            x: Math.round(rect.left / this.scale),
            y: Math.round(rect.top / this.scale),
            width: Math.round(rect.width / this.scale),
            height: Math.round(rect.height / this.scale)
        };

        const field: PdfHighlighterField = {
            id: nextLocalFieldId(),
            label: 'Field ' + (this.nextFieldNumber++),
            page,
            x: fieldRect.x,
            y: fieldRect.y,
            width: fieldRect.width,
            height: fieldRect.height,
            useXpathFirst: false
        };
        this.fields.push(field);

        try {
            const items = await this.getPageTextItems(page);
            field.selector = this.buildSelector(page, items, fieldRect);
        } catch (e) {
            // Text extraction is best-effort -- the rectangle mapping alone still works.
        }
    }

    public removeField(id: any): void {
        if (this.readOnly) { return; }
        this.fields = this.fields.filter((f) => f.id !== id);
    }

    public moveFieldUp(index: number): void {
        if (this.readOnly || index <= 0) { return; }
        this.swapFields(index, index - 1);
    }

    public moveFieldDown(index: number): void {
        if (this.readOnly || index >= this.fields.length - 1) { return; }
        this.swapFields(index, index + 1);
    }

    private swapFields(a: number, b: number): void {
        const fields = [...this.fields];
        const tmp = fields[a];
        fields[a] = fields[b];
        fields[b] = tmp;
        this.fields = fields;
    }

    public fieldsOnCurrentPage(): PdfHighlighterField[] {
        return this.fields.filter((f) => f.page === this.currentPage);
    }

    public fieldStyle(field: PdfHighlighterField): { [key: string]: string } {
        return {
            left: (field.x * this.scale) + 'px',
            top: (field.y * this.scale) + 'px',
            width: (field.width * this.scale) + 'px',
            height: (field.height * this.scale) + 'px'
        };
    }

    // --- Export ---

    public get mappingJson(): string {
        const mapping = this.fields.map((f) => {
            const item: any = { label: f.label, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, useXpathFirst: f.useXpathFirst };
            if (f.selector) {
                item.selector = { path: f.selector.path, text: f.selector.text, prefix: f.selector.prefix, suffix: f.selector.suffix };
            }
            return item;
        });
        return JSON.stringify(mapping, null, 2);
    }

    public copyMapping(): void {
        this.copyToClipboard(this.mappingJson, 'Mapping copied to clipboard');
    }

    public copySelector(field: PdfHighlighterField): void {
        if (!field.selector) { return; }
        this.copyToClipboard(field.selector.path, 'Selector path copied');
    }

    private copyToClipboard(text: string, successMessage: string): void {
        navigator.clipboard.writeText(text).then(() => {
            this.alertService.showSuccess(successMessage, 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public downloadMapping(): void {
        const blob = new Blob([this.mappingJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (this.fileName || 'pdf').replace(/\.pdf$/i, '') + '-field-mapping.json';
        a.click();
        URL.revokeObjectURL(url);
    }

}
