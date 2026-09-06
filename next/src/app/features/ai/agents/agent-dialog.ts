import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

const FILE_TYPES = ['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'xml', 'png', 'jpg', 'mp3', 'm4a'];

const ENDPOINT_PLACEHOLDER: Record<string, string> = {
  OpenAI: 'https://api.openai.com/v1',
  Anthropic: 'https://api.anthropic.com/v1',
  Ollama: 'http://host.docker.internal:11434',
};

@Component({
  selector: 'app-agent-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  templateUrl: './agent-dialog.html',
})
export class AgentDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ agent?: any; providers: string[] }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly fileTypes = FILE_TYPES;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly selectedTypes = signal<string[]>(
    (this.data.agent?.targetFileTypes ?? '').split(',').map((t: string) => t.trim()).filter(Boolean));

  readonly isEdit = computed(() => !!this.data.agent);
  readonly provider = signal<string>(this.data.agent?.provider ?? this.data.providers[0] ?? 'Ollama');

  /** Ollama runs locally and unauthenticated, so a key is meaningless there. */
  readonly needsKey = computed(() => this.provider().toLowerCase() !== 'ollama');
  readonly isOllama = computed(() => this.provider().toLowerCase() === 'ollama');
  readonly endpointPlaceholder = computed(() => ENDPOINT_PLACEHOLDER[this.provider()] ?? '');

  /**
   * What is actually pulled on this Ollama host, not a name typed blind. Only Ollama has a
   * concept of "installed" at all -- a hosted provider's model catalogue is not something this
   * server can enumerate, so every other provider keeps the free-text field it always had.
   *
   * Loaded once and reused rather than refetched on every provider switch back to Ollama within
   * the same dialog session -- the AI Models screen is where pulling happens, and nothing in
   * this dialog changes what is installed, so there is nothing to go stale here.
   */
  readonly ollamaModels = signal<string[]>([]);
  readonly loadingOllamaModels = signal(false);

  /**
   * The select's option list: live models plus the currently-saved value if it is not one of
   * them. Without the second half, editing an agent whose model was pulled on a different host,
   * or has since been deleted here, would silently blank the field the moment this dialog loads
   * -- the saved value is still what the agent runs with until someone actually changes it.
   */
  readonly modelOptions = computed(() => {
    const installed = this.ollamaModels();
    const current = this.form?.get('model')?.value as string | undefined;
    if (current && !installed.includes(current)) {
      return [...installed, current];
    }
    return installed;
  });

  readonly form: FormGroup = this.fb.group({
    aiAgentId: [this.data.agent?.aiAgentId ?? null],
    agentName: [this.data.agent?.agentName ?? '', Validators.required],
    description: [this.data.agent?.description ?? ''],
    provider: [this.data.agent?.provider ?? this.data.providers[0] ?? '', Validators.required],
    model: [this.data.agent?.model ?? '', Validators.required],
    apiEndpoint: [this.data.agent?.apiEndpoint ?? ''],
    apiKey: [''],
    instructions: [this.data.agent?.instructions ?? '', Validators.required],
    jsonMode: [this.data.agent?.jsonMode ?? false],
    status: [this.data.agent?.status ?? 'Active'],
  });

  constructor() {
    this.form.get('provider')!.valueChanges.subscribe(v => {
      this.provider.set(v);
      if (this.isOllama()) {
        this.loadOllamaModels();
      }
    });
    if (this.isOllama()) {
      this.loadOllamaModels();
    }
  }

  private loadOllamaModels(): void {
    if (this.ollamaModels().length || this.loadingOllamaModels()) {
      return;
    }
    this.loadingOllamaModels.set(true);
    this.http.get<ApiResponse<{ name: string }[]>>(`${API_BASE}/ollama.json/listModels`).subscribe({
      next: response => {
        this.loadingOllamaModels.set(false);
        if (response.status === API_SUCCESS) {
          this.ollamaModels.set((response.data ?? []).map(m => m.name).filter(Boolean));
        }
        // A failed fetch leaves the list empty -- modelOptions() still offers the saved value
        // (if any), and the field falls back to being typed by hand, exactly as it always was.
      },
      error: () => this.loadingOllamaModels.set(false),
    });
  }

  toggleType(type: string): void {
    this.selectedTypes.update(list =>
      list.includes(type) ? list.filter(t => t !== type) : [...list, type]);
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    if (!this.selectedTypes().length) {
      this.toast.error('Choose at least one file type.');
      return;
    }

    const payload: any = {
      ...this.form.getRawValue(),
      targetFileTypes: this.selectedTypes().join(','),
    };
    // Blank means "keep the stored key"; sending "" would wipe it.
    if (!payload.apiKey) delete payload.apiKey;

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/aiAgent.json/updateAgent`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/aiAgent.json/addAgent`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(this.isEdit() ? 'Agent updated.' : 'Agent created.');
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The agent could not be saved.');
      },
    });
  }
}
