import { Component, computed, inject, input, signal } from '@angular/core';
import { CopyButton } from '../../shared/ui/copy-button';
import { copyText } from '../../shared/ui/clipboard.util';
import { ToastService } from '../../shared/ui/toast.service';
import { DevLangService } from './developer-docs';
import { LangKey } from './guide-markdown';

export interface Snippet { key: string; label: string; code: string }

const LANG_KEYS: string[] = ['curl', 'python', 'node'];

/**
 * MIG-336: a block of code with a copy button; with several snippets, one tab each (curl, Python, Node.js). The language
 * a reader picks is remembered for every group on every page (DevLangService). Long lines scroll inside the block.
 */
@Component({
  selector: 'app-dev-code',
  imports: [CopyButton],
  template: `
    <div class="md-code min-w-0" [attr.data-code-group]="snippets().length > 1 ? '' : null">
      <div class="flex items-center justify-between gap-2 border-b border-subtle bg-sunken px-2 py-1 text-xs text-[color:var(--text-muted)]">
        @if (snippets().length > 1) {
          <div class="seg" role="tablist" aria-label="Language">
            @for (s of snippets(); track s.key) {
              <button type="button" role="tab" class="seg-btn" [class.seg-on]="s.key === current().key"
                      [attr.aria-selected]="s.key === current().key" (click)="pick(s.key)">{{ s.label }}</button>
            }
          </div>
        } @else {
          <span>{{ label() || current().label || 'Code' }}</span>
        }
        <app-copy-button [value]="current().label || 'the code'" [copied]="copied()" copiedLabel="Code copied" (copy)="copy()" />
      </div>
      <pre><code>{{ current().code }}</code></pre>
    </div>
  `,
})
export class DevCode {
  private readonly langs = inject(DevLangService);
  private readonly toast = inject(ToastService);

  readonly snippets = input.required<Snippet[]>();
  /** The heading of a single block: "JSON", "Request". */
  readonly label = input('');
  /** A tab picked in this group that is not a language the portal remembers. */
  private readonly picked = signal<string | null>(null);
  readonly copied = signal(false);

  readonly current = computed<Snippet>(() => {
    const list = this.snippets();
    const want = this.picked() ?? this.langs.lang();
    return list.find(s => s.key === want) ?? list[0] ?? { key: '', label: '', code: '' };
  });

  pick(key: string): void {
    if (LANG_KEYS.includes(key)) {
      this.picked.set(null);
      this.langs.choose(key as LangKey);
    } else {
      this.picked.set(key);
    }
  }

  copy(): void {
    copyText(this.current().code).then(done => {
      if (!done) {
        this.toast.error('Could not copy that: select the code and copy it by hand.');
        return;
      }
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
