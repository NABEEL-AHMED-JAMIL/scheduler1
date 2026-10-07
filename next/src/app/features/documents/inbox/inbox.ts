import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { LoadError } from '../../../shared/ui/load-error';
import { StatusPill } from '../../../shared/ui/status-pill';
import { DataText } from '../../../shared/ui/data-text';
import { FileDropzone } from '../../../shared/ui/file-dropzone';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import {
  ACCEPTED_KINDS, InboxFile, InboxSettings, capSentence, filesOf, inboxOf, oversizeReason, shortSha, uploaderName,
} from './inbox.model';
import { InboxApi, InboxArrival } from './inbox.service';
import { InboxSettingsDialog, InboxSettingsData } from './inbox-settings-dialog';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { NeedsWorkspace } from '../../../shared/ui/needs-workspace';
import { CopyButton } from '../../../shared/ui/copy-button';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';

/** One file on its way to the inbox. */
export interface QueuedUpload {
  id: number;
  file: File;
  name: string;
  bytes: number;
  state: 'queued' | 'uploading' | 'done' | 'refused';
  progress: number;
  /** The service's answer: its confirmation, or its refusal word for word. */
  message: string;
  arrival?: InboxArrival;
}

const LIST_LIMIT = 50;

/**
 * Documents › Inbox (MIG-239 on storage-service; page key objects, as Browse files): the workspace's upload box.
 * A file uploaded here lands under intake/ in the workspace's chosen bucket, and any job with an inbox trigger that
 * matches its name starts (the trigger is set on the job, MIG-251).
 *
 * Every member reads the settings and the arrivals and uploads -- one file at a time, each with its own progress and
 * result; the service judges every file and its refusal is shown as it is. Choosing the connection, a lower limit
 * and turning the inbox off are a workspace administrator's; a member sees the same settings, read-only.
 */
@Component({
  selector: 'app-inbox',
  imports: [Icon, TableShell, LoadError, StatusPill, DataText, FileDropzone, ServerTimePipe, RouterLink, ManagedBanner, CopyButton, NeedsWorkspace],
  templateUrl: './inbox.html',
})
export class Inbox implements OnInit {
  private readonly api = inject(InboxApi);
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly settings = signal<InboxSettings | null>(null);
  readonly files = signal<InboxFile[]>([]);
  readonly loading = signal(true);
  readonly filesLoading = signal(true);
  readonly error = signal('');
  readonly filesError = signal('');
  readonly queue = signal<QueuedUpload[]>([]);
  readonly showKinds = signal(false);
  /** The arrival whose key was just copied, so exactly one row ticks. */
  readonly copiedKey = signal<string | null>(null);
  private readonly names = signal(new Map<number, string>());
  private nextId = 1;
  private sending = false;
  /** Something arrived since the list was last read. */
  private arrived = false;

  readonly canManage = computed(() => this.auth.canBuild());
  readonly configured = computed(() => !!this.settings()?.configured);
  readonly capText = computed(() => { const s = this.settings(); return s ? capSentence(s) : ''; });
  readonly notConfiguredText = computed(() => this.canManage()
    ? 'The inbox is not set up. Choose which of the workspace\'s storage connections takes the files, and members can then upload here; '
      + 'a job with an inbox trigger starts when a matching file arrives.'
    : this.auth.builderLocked()
      ? 'The inbox is not set up for this workspace. Our team sets it up: contact your account team.'
      : 'The inbox is not set up for this workspace. Ask a workspace admin to choose the storage connection it uses.');
  readonly finished = computed(() => this.queue().filter(q => q.state === 'done' || q.state === 'refused').length);
  readonly kinds = ACCEPTED_KINDS;
  readonly formatSize = formatSize;
  readonly shortSha = shortSha;
  readonly listLimit = LIST_LIMIT;

  /** A sign-in with no workspace (a platform administrator's own): the inbox is a workspace's, so nothing is read (review L6). */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);

  ngOnInit(): void {
    if (this.noWorkspace()) return;
    this.load();
    // Names for an administrator, who may list the workspace's people whoever builds it (MIG-254); a member reads
    // the colleagues the task inbox offers (MIG-321). Either refused, the user numbers stand in for the names.
    if (this.auth.isTenantAdmin()) {
      this.api.users().subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) return;
          this.names.set(new Map((r.data ?? []).map(u => [u.appUserId, u.fullName || u.username || `User ${u.appUserId}`])));
        },
        error: () => {},
      });
    } else {
      this.api.colleagues().subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) return;
          this.names.set(new Map((r.data ?? []).map(u => [u.userId, u.fullName || u.username || `User ${u.userId}`])));
        },
        error: () => {},
      });
    }
  }

  /**
   * MIG-324: a pipeline's Read step names its file by the key the inbox stored it under (intake/<date>/<arrival>-<name>),
   * which the list did not show: a new administrator could upload a file and then not tell a step where it was.
   */
  async copyKey(f: InboxFile): Promise<void> {
    if (!f.key) return;
    if (!(await copyText(f.key))) { this.toast.error('Could not copy the key. Select it and copy by hand.'); return; }
    this.copiedKey.set(f.arrivalId);
    setTimeout(() => { if (this.copiedKey() === f.arrivalId) this.copiedKey.set(null); }, 1500);
  }

  load(): void {
    if (this.noWorkspace()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.settings().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.settings.set(inboxOf(r.data));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The inbox could not be read.'); },
    });
    this.loadFiles();
  }

  loadFiles(): void {
    this.filesLoading.set(true);
    this.filesError.set('');
    this.api.files(LIST_LIMIT).subscribe({
      next: r => {
        this.filesLoading.set(false);
        if (r.status !== API_SUCCESS) { this.filesError.set(r.message); return; }
        this.files.set(filesOf(r.data));
      },
      error: err => { this.filesLoading.set(false); this.filesError.set(err?.error?.message || 'The inbox\'s files could not be read.'); },
    });
  }

  uploader(file: InboxFile): string {
    return uploaderName(file.uploadedBy, this.auth.user()?.appUserId, this.names());
  }

  /** Adds the files to the queue, refusing at once any the limit rules out, and starts sending. */
  enqueue(files: File[]): void {
    const settings = this.settings();
    if (!settings?.configured || !files.length) return;
    const added = files.map((file): QueuedUpload => {
      const tooBig = oversizeReason(file.name, file.size, settings.maxBytes);
      return { id: this.nextId++, file, name: file.name, bytes: file.size, state: tooBig ? 'refused' : 'queued', progress: 0, message: tooBig };
    });
    this.queue.update(q => [...q, ...added]);
    this.pump();
  }

  clearFinished(): void {
    this.queue.update(q => q.filter(item => item.state === 'queued' || item.state === 'uploading'));
  }

  openSettings(): void {
    const settings = this.settings();
    if (!this.canManage() || !settings) return;
    const data: InboxSettingsData = { settings };
    this.dialog.open<boolean>(InboxSettingsDialog, { data }).closed.subscribe(changed => { if (changed) this.load(); });
  }

  /** One upload at a time: the next starts when the last has its answer; the list is read again when none are left. */
  private pump(): void {
    if (this.sending) return;
    const next = this.queue().find(q => q.state === 'queued');
    if (!next) { if (this.arrived) { this.arrived = false; this.loadFiles(); } return; }
    this.sending = true;
    this.patch(next.id, { state: 'uploading', progress: 0 });
    const done = (patch: Partial<QueuedUpload>) => { this.patch(next.id, patch); this.sending = false; this.pump(); };
    this.api.upload(next.file).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.patch(next.id, { progress: Math.round((event.loaded / event.total) * 100) });
        } else if (event.type === HttpEventType.Response) {
          const body = event.body as ApiResponse<InboxArrival> | null;
          if (body?.status === API_SUCCESS) {
            this.arrived = true;
            done({ state: 'done', progress: 100, message: body.message || 'Uploaded.', arrival: body.data });
          } else done({ state: 'refused', message: body?.message || 'The inbox did not take this file.' });
        }
      },
      error: err => done({ state: 'refused', message: err?.status >= 500 || !err?.error?.message
        ? 'The upload did not reach the inbox. Try again.' : err.error.message }),
    });
  }

  private patch(id: number, patch: Partial<QueuedUpload>): void {
    this.queue.update(q => q.map(item => item.id === id ? { ...item, ...patch } : item));
  }
}
