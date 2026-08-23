import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { copyText } from '../../../shared/ui/clipboard.util';

export interface XmlTag {
  tagKey: string;
  tagParent: string;
  tagValue: string;
}

const blankTag = (): XmlTag => ({ tagKey: '', tagParent: '', tagValue: '' });

@Component({
  selector: 'app-xml-builder',
  imports: [Icon],
  templateUrl: './xml-builder.html',
})
export class XmlBuilder {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  /** Six blank rows, the number the legacy screen opened with. */
  readonly tags = signal<XmlTag[]>(Array.from({ length: 6 }, blankTag));
  readonly xml = signal('');
  readonly building = signal(false);

  /** Rows left entirely blank are ignored rather than rejected, so the six starting rows
      do not have to be filled or deleted before anything can be built. */
  readonly filled = computed(() => this.tags().filter(tag => tag.tagKey.trim()));

  readonly problems = computed(() => {
    const tags = this.filled();
    if (!tags.length) return ['Give at least one tag a key.'];

    const problems: string[] = [];
    const keys = tags.map(t => t.tagKey.trim());

    const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
    if (duplicates.length) problems.push(`Duplicate tag key: ${[...new Set(duplicates)].join(', ')}.`);

    const invalid = keys.filter(key => !/^[A-Za-z_][\w.-]*$/.test(key));
    if (invalid.length) problems.push(`Not a valid XML name: ${invalid.join(', ')}.`);

    // A parent that is not itself a tag would silently drop its children from the output.
    const orphans = tags
      .filter(t => t.tagParent.trim() && !keys.includes(t.tagParent.trim()))
      .map(t => `${t.tagKey} → ${t.tagParent}`);
    if (orphans.length) problems.push(`Parent tag does not exist: ${orphans.join(', ')}.`);

    const selfParent = tags.filter(t => t.tagParent.trim() === t.tagKey.trim()).map(t => t.tagKey);
    if (selfParent.length) problems.push(`A tag cannot be its own parent: ${selfParent.join(', ')}.`);

    if (!tags.some(t => !t.tagParent.trim())) problems.push('Every tag has a parent, so there is no root.');

    return problems;
  });

  readonly canBuild = computed(() => !this.problems().length && !this.building());

  update(index: number, field: keyof XmlTag, value: string): void {
    this.tags.update(tags => tags.map((tag, i) => i === index ? { ...tag, [field]: value } : tag));
  }

  addAt(index: number): void {
    this.tags.update(tags => [...tags.slice(0, index + 1), blankTag(), ...tags.slice(index + 1)]);
  }

  addRow(): void { this.tags.update(tags => [...tags, blankTag()]); }

  removeAt(index: number): void {
    // Never leave the table with nothing to type into.
    this.tags.update(tags => tags.length === 1 ? [blankTag()] : tags.filter((_, i) => i !== index));
  }

  /** Offered as a parent: any other row that has a key. */
  parentOptions(index: number): string[] {
    return this.tags()
      .filter((tag, i) => i !== index && tag.tagKey.trim())
      .map(tag => tag.tagKey.trim());
  }

  build(): void {
    if (!this.canBuild()) return;
    this.building.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/setting.json/xmlCreateChecker`,
      { xmlTagsInfo: this.filled() }).subscribe({
      next: response => {
        this.building.set(false);
        // This endpoint returns the document in `message` rather than `data`.
        if (response.status === API_SUCCESS) this.xml.set(response.message ?? '');
        else this.toast.error(response.message);
      },
      error: err => {
        this.building.set(false);
        this.toast.error(err?.error?.message || 'The XML could not be built.');
      },
    });
  }

  reset(): void {
    this.tags.set(Array.from({ length: 6 }, blankTag));
    this.xml.set('');
  }

  async copy(): Promise<void> {
    if (await copyText(this.xml())) this.toast.success('XML copied.');
    else this.toast.error('Could not copy the XML.');
  }

  download(): void {
    const blob = new Blob([this.xml()], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-data-${new Date().toISOString().slice(0, 10)}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
