import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AlertService, StorageService } from '@/_services';
import { first } from 'rxjs/operators';
import { forkJoin, Observable } from 'rxjs';
import { ApiCode, ApiResponse, BucketSummary, ObjectSummary, ObjectMetadata } from '@/_models';

// marked has no bundled TypeScript types in the version installed here -- same "require as any"
// pattern used by cv-tailor.component.ts, which already renders markdown this way.
const marked: any = require('marked');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const PREVIEWABLE_EXTENSIONS = ['json', 'csv', 'txt', 'xml', 'md', 'pdf', 'mp3', 'm4a', 'mp4'].concat(IMAGE_EXTENSIONS);
// Mirrors process/util/ContentTypeUtil.java on the backend -- needed here because these
// previews are built into an in-browser Blob rather than just linking straight at the API (see
// loadPreview: previewObject requires a JWT Authorization header, which a plain <iframe>/<img>/
// <audio>/<video> src can't carry, so the bytes are fetched via HttpClient -- which does attach
// it -- and wrapped in a Blob with the right type instead).
const MEDIA_CONTENT_TYPES: { [extension: string]: string } = {
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp'
};
/** Preview kinds that are plain text under the hood, so all of them can be edited in place
 * and saved back -- json/csv/txt/xml were previously read-only; only md had Edit/Save. */
const EDITABLE_TEXT_KINDS = ['json', 'csv', 'txt', 'xml', 'md'];
const TEXT_CONTENT_TYPES: { [extension: string]: string } = {
    json: 'application/json',
    csv: 'text/csv',
    txt: 'text/plain',
    xml: 'application/xml',
    md: 'text/markdown'
};
const PAGE_SIZE = 50;
// Load the next page once the scroll container is within this many pixels of the bottom.
const SCROLL_FETCH_THRESHOLD_PX = 120;
// Stagger multi-file downloads so the browser doesn't silently drop near-simultaneous ones.
const BULK_DOWNLOAD_STAGGER_MS = 350;
// Upper bound on how many entries a single per-folder count listing will fetch -- a folder
// this size or larger reports "1000+ items" instead of paging through the whole thing just to
// print an exact number.
const FOLDER_STAT_MAX_KEYS = 1000;

interface Breadcrumb {
    name: string;
    prefix: string;
}

interface FolderStat {
    files: number;
    folders: number;
    capped: boolean;
    loading: boolean;
    error: boolean;
}

/**
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'object-browser',
    templateUrl: 'object-browser.component.html'
})
export class ObjectBrowserComponent implements OnInit, OnDestroy {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket: string | null = null;

    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];
    public objects: ObjectSummary[] = [];
    public nextContinuationToken: string | null = null;
    public loadingObjects = false;

    // Per-folder file/subfolder counts (Object Browser table) -- there's no backend "folder
    // stats" endpoint, so each folder's count is a bounded, best-effort listObjects call fired
    // lazily as folder rows load (see loadFolderStats), one per folder key, cached in this map
    // so switching directories and back doesn't re-fetch. Capped at FOLDER_STAT_MAX_KEYS so a
    // folder with thousands of entries can't turn "just show a count" into an unbounded
    // pagination loop -- past the cap it reads "1000+ items" instead of an exact number.
    public folderStats: { [key: string]: FolderStat } = {};

    // search/filter (applied client-side over whatever's loaded so far)
    public searchName = '';
    public searchDateFrom = '';
    public searchDateTo = '';

    // multi-select (files and folders -- deleting a selected folder recurses into it)
    public selectedKeys: Set<string> = new Set();

    public selectedObject: ObjectSummary | null = null;
    public selectedObjectMetadata: ObjectMetadata | null = null;
    public loadingMetadata = false;

    public previewKind: 'json' | 'csv' | 'txt' | 'xml' | 'md' | 'pdf' | 'mp3' | 'm4a' | 'mp4' | 'image' | null = null;
    public previewLoading = false;
    public previewError: string | null = null;
    public previewJson: string | null = null;
    public previewText: string | null = null;
    // Streamed source URL, shared by pdf (iframe), mp3/m4a (audio), mp4 (video), and
    // any image format (img) -- all of them just need a src to point their tag at. Backed by
    // an in-browser Blob (see loadPreview) rather than the raw API URL, so it works alongside
    // JWT header auth. previewMediaObjectUrl is the raw blob: URL string underneath it, kept
    // only so it can be revoked (avoids leaking memory as previews are switched).
    public previewMediaUrl: SafeResourceUrl | null = null;
    private previewMediaObjectUrl: string | null = null;

    // Editable text preview (json/csv/txt/xml/md) -- View shows the read-only rendering
    // (previewJson/previewText, or previewMdHtml for markdown), Edit swaps in a raw-source
    // textarea (previewEditText) with Save/Cancel; Save overwrites the object in place.
    public previewEditMode: 'view' | 'edit' = 'view';
    public previewMdHtml: string | null = null;
    public previewEditText = '';
    public savingPreview = false;

    public uploading = false;

    // new-folder modal
    public newFolderName = '';

    // rename-folder modal
    public renameFolderEntry: ObjectSummary | null = null;
    public renameFolderNewName = '';

    // delete-confirm modal (shared by row delete, side-panel delete, and bulk delete)
    public pendingDeleteEntries: ObjectSummary[] = [];
    public pendingDeleteLabel = '';

    @ViewChild('fileInput', { static: false })
    public fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('closeNewFolderModal', { static: false })
    public closeNewFolderModal!: ElementRef<HTMLButtonElement>;
    @ViewChild('closeRenameModal', { static: false })
    public closeRenameModal!: ElementRef<HTMLButtonElement>;
    @ViewChild('closeDeleteModal', { static: false })
    public closeDeleteModal!: ElementRef<HTMLButtonElement>;

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private sanitizer: DomSanitizer) {
    }

    ngOnInit() {
        this.loadBuckets();
    }

    // --- Buckets ---

    public loadBuckets(): void {
        this.loadingBuckets = true;
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                this.loadingBuckets = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingBuckets = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public onBucketChange(): void {
        this.closePanel();
        this.clearSelection();
        this.currentPrefix = '';
        this.breadcrumbs = [];
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        if (this.selectedBucket) {
            this.loadObjects(true);
        }
    }

    // --- Folders/objects listing ---

    public loadObjects(reset: boolean): void {
        if (!this.selectedBucket || this.loadingObjects) {
            return;
        }
        if (!reset && !this.nextContinuationToken) {
            return;
        }
        this.loadingObjects = true;
        const token = reset ? null : this.nextContinuationToken;
        this.storageService.listObjects(this.selectedBucket, this.currentPrefix, token, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingObjects = false;
                if (response.status === ApiCode.SUCCESS) {
                    const page = response.data || {};
                    this.objects = reset ? (page.objects || []) : this.objects.concat(page.objects || []);
                    this.nextContinuationToken = page.nextContinuationToken || null;
                    if (reset) {
                        this.folderStats = {};
                    }
                    this.loadFolderStats(page.objects || []);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingObjects = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** Fires one bounded listObjects call per not-yet-counted folder in the given page, tallying
     * how many of its immediate children are files vs subfolders. Lazy/per-page (called with
     * just the newly-loaded page, not the whole this.objects) so scrolling through a long
     * directory listing doesn't fire hundreds of count requests up front -- only the folders
     * that have actually scrolled into the loaded page so far. */
    private loadFolderStats(entries: ObjectSummary[]): void {
        const bucket = this.selectedBucket;
        if (!bucket) {
            return;
        }
        entries
            .filter((entry) => entry.folder && !this.folderStats[entry.key])
            .forEach((entry) => {
                this.folderStats[entry.key] = { files: 0, folders: 0, capped: false, loading: true, error: false };
                this.storageService.listObjects(bucket, entry.key, null, FOLDER_STAT_MAX_KEYS)
                    .pipe(first())
                    .subscribe((response) => {
                        if (response.status === ApiCode.SUCCESS) {
                            const children: ObjectSummary[] = response.data?.objects || [];
                            this.folderStats[entry.key] = {
                                files: children.filter((c) => !c.folder).length,
                                folders: children.filter((c) => !!c.folder).length,
                                capped: !!response.data?.nextContinuationToken,
                                loading: false,
                                error: false
                            };
                        } else {
                            this.folderStats[entry.key] = { files: 0, folders: 0, capped: false, loading: false, error: true };
                        }
                    }, () => {
                        this.folderStats[entry.key] = { files: 0, folders: 0, capped: false, loading: false, error: true };
                    });
            });
    }

    /** "1 file, 1 folder" (folder rows only, Size column) -- shown directly rather than folded
     * into a hover-only tooltip, since "how many files / how many folders" is the actual
     * question being answered, not just a combined count. */
    public folderStatLabel(entry: ObjectSummary): string {
        const stat = this.folderStats[entry.key];
        if (!stat || stat.loading) {
            return 'Counting…';
        }
        if (stat.error) {
            return '-';
        }
        const prefix = stat.capped ? `${FOLDER_STAT_MAX_KEYS}+ entries, showing ` : '';
        return `${prefix}${stat.files} file${stat.files === 1 ? '' : 's'}, ${stat.folders} folder${stat.folders === 1 ? '' : 's'}`;
    }

    /** Tooltip for the folderStatLabel -- same info, spelled out in case the label itself
     * ever needs to truncate in a narrower layout. */
    public folderStatTitle(entry: ObjectSummary): string {
        const stat = this.folderStats[entry.key];
        if (!stat || stat.loading) {
            return 'Counting folder contents...';
        }
        if (stat.error) {
            return 'Could not count folder contents.';
        }
        const prefix = stat.capped ? `${FOLDER_STAT_MAX_KEYS}+ entries (showing a partial count) -- ` : '';
        return `${prefix}${stat.files} file${stat.files === 1 ? '' : 's'}, ${stat.folders} folder${stat.folders === 1 ? '' : 's'}`;
    }

    /** Infinite scroll: fetch the next page once the user scrolls near the bottom of the table. */
    public onTableScroll(event: Event): void {
        const el = event.target as HTMLElement;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_FETCH_THRESHOLD_PX;
        if (nearBottom) {
            this.loadObjects(false);
        }
    }

    /**
     * Row click handler. Ignores clicks that originated from the row-actions cell instead
     * of calling stopPropagation() on those buttons -- Rename/Delete rely on Bootstrap's
     * data-toggle="modal" data-api, which listens on `document` and only fires if the click
     * actually bubbles that far; stopPropagation() on the button itself would silently kill
     * the modal before it ever opens.
     */
    public openEntry(entry: ObjectSummary, event: Event): void {
        if ((event.target as HTMLElement).closest('.row-actions')) {
            return;
        }
        if (entry.folder) {
            this.openFolder(entry);
        } else {
            this.selectObject(entry);
        }
    }

    private openFolder(entry: ObjectSummary): void {
        this.closePanel();
        this.clearSelection();
        this.currentPrefix = entry.key;
        this.breadcrumbs = [...this.breadcrumbs, { name: entry.name, prefix: entry.key }];
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        this.loadObjects(true);
    }

    public goToBreadcrumb(index: number): void {
        this.closePanel();
        this.clearSelection();
        if (index < 0) {
            this.currentPrefix = '';
            this.breadcrumbs = [];
        } else {
            this.currentPrefix = this.breadcrumbs[index].prefix;
            this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        }
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        this.loadObjects(true);
    }

    // --- Search / filter (client-side, over whatever's loaded so far) ---

    public get filteredObjects(): ObjectSummary[] {
        const term = (this.searchName || '').trim().toLowerCase();
        const from = this.searchDateFrom ? new Date(this.searchDateFrom).getTime() : null;
        const to = this.searchDateTo ? new Date(this.searchDateTo).getTime() + (24 * 60 * 60 * 1000 - 1) : null;
        return this.objects.filter((entry) => {
            if (term && entry.name.toLowerCase().indexOf(term) === -1) {
                return false;
            }
            if ((from || to) && !entry.folder) {
                const modified = entry.lastModified ? new Date(entry.lastModified).getTime() : null;
                if (modified === null) {
                    return false;
                }
                if (from && modified < from) {
                    return false;
                }
                if (to && modified > to) {
                    return false;
                }
            }
            return true;
        });
    }

    public get isFiltering(): boolean {
        return !!(this.searchName || this.searchDateFrom || this.searchDateTo);
    }

    public resetSearch(): void {
        this.searchName = '';
        this.searchDateFrom = '';
        this.searchDateTo = '';
    }

    // --- Multi-select (files and folders) ---

    public toggleSelect(entry: ObjectSummary, event: Event): void {
        event.stopPropagation();
        if (this.selectedKeys.has(entry.key)) {
            this.selectedKeys.delete(entry.key);
        } else {
            this.selectedKeys.add(entry.key);
        }
    }

    public isSelected(entry: ObjectSummary): boolean {
        return this.selectedKeys.has(entry.key);
    }

    public get selectableVisibleCount(): number {
        return this.filteredObjects.length;
    }

    public get allVisibleSelected(): boolean {
        const selectable = this.filteredObjects;
        return selectable.length > 0 && selectable.every((entry) => this.selectedKeys.has(entry.key));
    }

    public toggleSelectAll(event: Event): void {
        event.stopPropagation();
        const checked = (event.target as HTMLInputElement).checked;
        this.filteredObjects.forEach((entry) => {
            if (checked) {
                this.selectedKeys.add(entry.key);
            } else {
                this.selectedKeys.delete(entry.key);
            }
        });
    }

    public clearSelection(): void {
        this.selectedKeys.clear();
    }

    /** Downloads whichever selected items are files -- folders can't be downloaded as a single file (no zip support). */
    public downloadSelectedBulk(): void {
        const fileKeys = this.objects.filter((entry) => !entry.folder && this.selectedKeys.has(entry.key)).map((entry) => entry.key);
        if (!fileKeys.length) {
            return;
        }
        fileKeys.forEach((key, index) => {
            setTimeout(() => this.triggerDownload(key), index * BULK_DOWNLOAD_STAGGER_MS);
        });
    }

    /** Opens the shared delete-confirm modal (data-toggle on the triggering button) for the bulk selection. */
    public requestDeleteBulk(): void {
        const entries = this.objects.filter((entry) => this.selectedKeys.has(entry.key));
        if (!entries.length) {
            return;
        }
        this.pendingDeleteEntries = entries;
        this.pendingDeleteLabel = `${entries.length} selected item(s)`;
    }

    // --- Object side panel (metadata + preview) ---

    public selectObject(entry: ObjectSummary): void {
        this.selectedObject = entry;
        this.selectedObjectMetadata = null;
        this.resetPreview();
        this.loadingMetadata = true;
        this.storageService.objectMetadata(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((response) => {
                this.loadingMetadata = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.selectedObjectMetadata = response.data;
                    this.loadPreview(entry);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingMetadata = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    private loadPreview(entry: ObjectSummary): void {
        const extension = this.extensionOf(entry.name);
        if (PREVIEWABLE_EXTENSIONS.indexOf(extension) === -1) {
            this.previewKind = null;
            return;
        }
        if (IMAGE_EXTENSIONS.indexOf(extension) !== -1) {
            this.previewKind = 'image';
            this.loadMediaPreview(entry.key, extension);
            return;
        }
        this.previewKind = extension as 'json' | 'csv' | 'txt' | 'xml' | 'md' | 'pdf' | 'mp3' | 'm4a' | 'mp4';
        if (extension === 'pdf' || extension === 'mp3' || extension === 'm4a' || extension === 'mp4') {
            this.loadMediaPreview(entry.key, extension);
            return;
        }
        this.previewLoading = true;
        this.storageService.previewObjectText(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((text) => {
                this.previewLoading = false;
                this.previewEditMode = 'view';
                if (extension === 'json') {
                    try {
                        this.previewJson = JSON.stringify(JSON.parse(text), null, 2);
                    } catch (e) {
                        this.previewJson = text;
                    }
                } else if (extension === 'csv' || extension === 'txt' || extension === 'xml') {
                    // CSV/XML shown as plain text (not parsed), same as .txt.
                    this.previewText = text;
                } else if (extension === 'md') {
                    this.previewText = text;
                    this.previewMdHtml = marked.parse(text);
                }
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load preview for this file.';
            });
    }

    /** Fetches an image/pdf/mp3/m4a/mp4 object's bytes via HttpClient (so AuthInterceptor
     * attaches the JWT) and wraps them in a Blob URL for previewMediaUrl -- a plain <img>/
     * <iframe>/<audio>/<video> src pointed straight at the API URL can't carry that header and
     * previewObject requires one, so it 401'd for every media type (most visibly for pdf,
     * whose iframe just showed a browser error page instead of the file). */
    private loadMediaPreview(key: string, extension: string): void {
        this.previewLoading = true;
        this.storageService.previewObjectArrayBuffer(this.selectedBucket, key)
            .pipe(first())
            .subscribe((buffer) => {
                this.previewLoading = false;
                const contentType = MEDIA_CONTENT_TYPES[extension] || 'application/octet-stream';
                this.revokePreviewMediaUrl();
                this.previewMediaObjectUrl = URL.createObjectURL(new Blob([buffer], { type: contentType }));
                this.previewMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewMediaObjectUrl);
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load preview for this file.';
            });
    }

    /** Releases the current blob: URL (if any) -- called before building a new one and on
     * reset/destroy so switching between previews doesn't leak memory. */
    private revokePreviewMediaUrl(): void {
        if (this.previewMediaObjectUrl) {
            URL.revokeObjectURL(this.previewMediaObjectUrl);
            this.previewMediaObjectUrl = null;
        }
    }

    private resetPreview(): void {
        this.previewKind = null;
        this.previewLoading = false;
        this.previewError = null;
        this.previewJson = null;
        this.previewText = null;
        this.revokePreviewMediaUrl();
        this.previewMediaUrl = null;
        this.previewEditMode = 'view';
        this.previewMdHtml = null;
        this.previewEditText = '';
        this.savingPreview = false;
    }

    public ngOnDestroy(): void {
        this.revokePreviewMediaUrl();
    }

    // --- Text preview edit-in-place (json/csv/txt/xml/md) ---

    /** True when the currently previewed file is one of the plain-text kinds that can be
     * edited and saved back in place -- everything except pdf/mp3/m4a/mp4/image. */
    public get isEditableTextPreview(): boolean {
        return !!this.previewKind && EDITABLE_TEXT_KINDS.indexOf(this.previewKind) !== -1;
    }

    /** The read-only rendering currently on screen for the active preview kind -- json has its
     * own pretty-printed field, everything else (csv/txt/xml/md's raw source) shares previewText. */
    private currentPreviewSource(): string {
        return (this.previewKind === 'json' ? this.previewJson : this.previewText) || '';
    }

    /** Switches the preview into edit mode, seeded with the currently loaded source. */
    public startEditPreview(): void {
        this.previewEditText = this.currentPreviewSource();
        this.previewEditMode = 'edit';
    }

    /** Discards unsaved edits and returns to the read-only view. */
    public cancelEditPreview(): void {
        this.previewEditMode = 'view';
    }

    /** Overwrites the object in place with the edited text (same bucket/prefix/name -- MinIO/S3
     * PUT on an existing key replaces its content), then re-renders the preview from it. Saves
     * whatever was typed as-is even if e.g. the JSON doesn't parse -- same as markdown never
     * validating -- the file is the source of truth, not a schema. */
    public savePreview(): void {
        if (!this.selectedObject || !this.selectedBucket || this.savingPreview || !this.previewKind) {
            return;
        }
        const name = this.selectedObject.name;
        const text = this.previewEditText;
        const contentType = TEXT_CONTENT_TYPES[this.previewKind] || 'text/plain';
        const file = new File([text], name, { type: contentType });
        this.savingPreview = true;
        this.storageService.uploadObject(this.selectedBucket, this.currentPrefix, file)
            .pipe(first())
            .subscribe((response) => {
                this.savingPreview = false;
                if (response.status === ApiCode.SUCCESS) {
                    if (this.previewKind === 'json') {
                        try {
                            this.previewJson = JSON.stringify(JSON.parse(text), null, 2);
                        } catch (e) {
                            this.previewJson = text;
                        }
                    } else {
                        this.previewText = text;
                        if (this.previewKind === 'md') {
                            this.previewMdHtml = marked.parse(text);
                        }
                    }
                    this.previewEditMode = 'view';
                    this.alertService.showSuccess(`"${name}" saved.`, this.SUCCESS);
                    if (this.selectedObject) {
                        this.storageService.objectMetadata(this.selectedBucket, this.selectedObject.key)
                            .pipe(first())
                            .subscribe((metaResponse) => {
                                if (metaResponse.status === ApiCode.SUCCESS) {
                                    this.selectedObjectMetadata = metaResponse.data;
                                }
                            });
                    }
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.savingPreview = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public closePanel(): void {
        this.selectedObject = null;
        this.selectedObjectMetadata = null;
        this.resetPreview();
    }

    /** Downloads a single row's file (row action icon, files only). */
    public downloadEntry(entry: ObjectSummary, event: Event): void {
        this.triggerDownload(entry.key);
    }

    /** Copies a row's full bucket path (file or folder key) to the clipboard. */
    public copyPath(entry: ObjectSummary, event: Event): void {
        this.copyToClipboard(entry.key, 'Path copied to clipboard.');
    }

    /** Copies the currently previewed json/csv/txt file's full content to the clipboard. */
    public copyPreviewContent(): void {
        const content = this.previewKind === 'json' ? this.previewJson : this.previewText;
        if (!content) {
            return;
        }
        this.copyToClipboard(content, 'Content copied to clipboard.');
    }

    private copyToClipboard(text: string, successMessage: string): void {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.alertService.showSuccess(successMessage, this.SUCCESS);
            }, () => {
                this.alertService.showError('Could not copy to clipboard.', this.ERROR);
            });
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.alertService.showSuccess(successMessage, this.SUCCESS);
        } catch (e) {
            this.alertService.showError('Could not copy to clipboard.', this.ERROR);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    /** Opens the shared delete-confirm modal for a single row's delete icon (file or folder). */
    public requestDeleteEntry(entry: ObjectSummary, event: Event): void {
        this.pendingDeleteEntries = [entry];
        this.pendingDeleteLabel = entry.folder
            ? `"${entry.name}" and everything inside it`
            : `"${entry.name}"`;
    }

    /**
     * Runs the actual delete once the user confirms in the modal, then closes it. Files are
     * batched into one bulk delete; each folder needs its own recursive deleteFolder call.
     */
    public confirmDelete(): void {
        const entries = this.pendingDeleteEntries;
        if (!entries.length || !this.selectedBucket) {
            return;
        }
        const fileKeys = entries.filter((entry) => !entry.folder).map((entry) => entry.key);
        const folderEntries = entries.filter((entry) => entry.folder);

        const requests: Observable<ApiResponse>[] = [];
        if (fileKeys.length === 1) {
            requests.push(this.storageService.deleteObject(this.selectedBucket, fileKeys[0]));
        } else if (fileKeys.length > 1) {
            requests.push(this.storageService.deleteObjects(this.selectedBucket, fileKeys));
        }
        folderEntries.forEach((folder) => requests.push(this.storageService.deleteFolder(this.selectedBucket, folder.key)));

        if (!requests.length) {
            return;
        }

        forkJoin(requests).pipe(first()).subscribe((responses) => {
            const deletedKeys = entries.map((entry) => entry.key);
            this.objects = this.objects.filter((entry) => deletedKeys.indexOf(entry.key) === -1);
            deletedKeys.forEach((key) => this.selectedKeys.delete(key));
            if (this.selectedObject && deletedKeys.indexOf(this.selectedObject.key) !== -1) {
                this.closePanel();
            }
            const failed = responses.filter((response) => response.status !== ApiCode.SUCCESS);
            if (failed.length) {
                this.alertService.showError(failed.map((response) => response.message).join(' '), this.ERROR);
            } else {
                this.alertService.showSuccess('Deleted successfully.', this.SUCCESS);
            }
            this.pendingDeleteEntries = [];
            this.closeModal(this.closeDeleteModal);
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.pendingDeleteEntries = [];
            this.closeModal(this.closeDeleteModal);
        });
    }

    /** Same JWT-header problem as loadMediaPreview: a plain <a href> navigation to the API URL
     * can't carry the Authorization header, so it 401'd. Fetches the bytes via HttpClient
     * instead and saves them from a Blob, with the filename set explicitly since a blob: URL
     * has none of its own for the browser to fall back on. */
    private triggerDownload(key: string): void {
        this.storageService.previewObjectArrayBuffer(this.selectedBucket, key)
            .pipe(first())
            .subscribe((buffer) => {
                const objectUrl = URL.createObjectURL(new Blob([buffer]));
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = this.fileNameFromKey(key);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(objectUrl);
            }, () => {
                this.alertService.showError(`Could not download "${this.fileNameFromKey(key)}".`, this.ERROR);
            });
    }

    /** Method use to get the last path segment of an object key as its display filename. */
    private fileNameFromKey(key: string): string {
        const segments = key.split('/');
        return segments[segments.length - 1] || key;
    }

    /** trackBy for the object table -- key is this row's stable identity (same field the
     * selection/active-row checks already key off), so Angular can diff by it instead of
     * default object identity and skip re-rendering rows that didn't actually change. */
    public trackByKey(_index: number, entry: any): any {
        return entry.key;
    }

    // --- Create folder ---

    /** Called by the New Folder modal's Create button. */
    public confirmCreateFolder(): void {
        if (!this.selectedBucket || !this.newFolderName || !this.newFolderName.trim()) {
            return;
        }
        this.storageService.createFolder(this.selectedBucket, this.currentPrefix, this.newFolderName.trim())
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.newFolderName = '';
                    this.loadObjects(true);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.closeModal(this.closeNewFolderModal);
            }, (error) => {
                this.alertService.showError(error, this.ERROR);
                this.closeModal(this.closeNewFolderModal);
            });
    }

    private closeModal(closeButton: ElementRef<HTMLButtonElement> | undefined): void {
        if (closeButton) {
            closeButton.nativeElement.click();
        }
    }

    // --- Rename folder ---

    /** Opens the rename modal (data-toggle on the triggering button) for a folder row. */
    public requestRenameFolder(entry: ObjectSummary, event: Event): void {
        this.renameFolderEntry = entry;
        this.renameFolderNewName = entry.name;
    }

    /** Called by the Rename modal's Rename button. */
    public confirmRenameFolder(): void {
        const entry = this.renameFolderEntry;
        if (!entry || !this.selectedBucket || !this.renameFolderNewName || !this.renameFolderNewName.trim()) {
            return;
        }
        this.storageService.renameFolder(this.selectedBucket, entry.key, this.renameFolderNewName.trim())
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.selectedKeys.delete(entry.key);
                    this.loadObjects(true);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.renameFolderEntry = null;
                this.closeModal(this.closeRenameModal);
            }, (error) => {
                this.alertService.showError(error, this.ERROR);
                this.renameFolderEntry = null;
                this.closeModal(this.closeRenameModal);
            });
    }

    // --- Upload ---

    public triggerUpload(): void {
        if (this.fileInput) {
            this.fileInput.nativeElement.click();
        }
    }

    public onFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (!files || !files.length || !this.selectedBucket) {
            return;
        }
        this.uploading = true;
        const uploadNext = (index: number) => {
            if (index >= files.length) {
                this.uploading = false;
                input.value = '';
                this.loadObjects(true);
                return;
            }
            this.storageService.uploadObject(this.selectedBucket, this.currentPrefix, files[index])
                .pipe(first())
                .subscribe((response) => {
                    if (response.status !== ApiCode.SUCCESS) {
                        this.alertService.showError(response.message, this.ERROR);
                    }
                    uploadNext(index + 1);
                }, (error) => {
                    this.alertService.showError(error, this.ERROR);
                    uploadNext(index + 1);
                });
        };
        uploadNext(0);
    }

    private extensionOf(name: string): string {
        if (!name) {
            return '';
        }
        const dot = name.lastIndexOf('.');
        return dot >= 0 && dot < name.length - 1 ? name.substring(dot + 1).toLowerCase() : '';
    }

    public formatSize(bytes: any): string {
        if (bytes === null || bytes === undefined) {
            return '-';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = Number(bytes);
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size = size / 1024;
            unitIndex++;
        }
        return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

}
