import { Component, computed, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from './icon';
import { copyText } from './clipboard.util';

export type Inline = { text: string; code?: boolean; bold?: boolean; italic?: boolean; href?: string };
export type Block =
  | { kind: 'p' | 'h'; level?: number; spans: Inline[] }
  | { kind: 'ul' | 'ol'; items: Inline[][] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'hr' };

/**
 * Renders the subset of Markdown a model actually produces: fenced code, inline code, bold,
 * italic, links, headings and lists.
 *
 * Parsed into blocks and drawn through Angular templates rather than bound as innerHTML, so
 * model output can never inject markup -- the usual reason a chat surface becomes an XSS hole.
 */
@Component({
  selector: 'app-markdown',
  imports: [Icon, NgTemplateOutlet],
  template: `
    <div class="md">
      @for (block of blocks(); track $index) {
        @switch (block.kind) {
          @case ('code') {
            <div class="md-code">
              <div class="md-code-head">
                <span>{{ block.lang || 'code' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" (click)="copyBlock($index, block.code)">
                  <app-icon [name]="copiedIndex() === $index ? 'check' : 'copy'"
                            [class.icon-ok]="copiedIndex() === $index" size="0.85em" />
                  {{ copiedIndex() === $index ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre><code>{{ block.code }}</code></pre>
            </div>
          }
          @case ('hr') {
            <hr class="md-hr" />
          }
          @case ('h') {
            <p class="md-h" [style.font-size]="block.level === 1 ? '0.95rem' : '0.875rem'">
              @for (span of block.spans; track $index) { <ng-container [ngTemplateOutlet]="inline"
                [ngTemplateOutletContext]="{ $implicit: span }" /> }
            </p>
          }
          @case ('ul') {
            <ul class="md-list">
              @for (item of block.items; track $index) {
                <li>@for (span of item; track $index) { <ng-container [ngTemplateOutlet]="inline"
                  [ngTemplateOutletContext]="{ $implicit: span }" /> }</li>
              }
            </ul>
          }
          @case ('ol') {
            <ol class="md-list md-list-ol">
              @for (item of block.items; track $index) {
                <li>@for (span of item; track $index) { <ng-container [ngTemplateOutlet]="inline"
                  [ngTemplateOutletContext]="{ $implicit: span }" /> }</li>
              }
            </ol>
          }
          @default {
            <p>@for (span of block.spans; track $index) { <ng-container [ngTemplateOutlet]="inline"
              [ngTemplateOutletContext]="{ $implicit: span }" /> }</p>
          }
        }
      }
    </div>

    <ng-template #inline let-span>
      @if (span.href) {
        <a [href]="span.href" target="_blank" rel="noopener noreferrer" class="md-link">{{ span.text }}</a>
      } @else if (span.code) {
        <code class="md-inline-code">{{ span.text }}</code>
      } @else if (span.bold) {
        <strong>{{ span.text }}</strong>
      } @else if (span.italic) {
        <em>{{ span.text }}</em>
      } @else {
        {{ span.text }}
      }
    </ng-template>
  `,
})
export class Markdown {
  readonly source = input.required<string>();
  readonly copiedIndex = signal<number | null>(null);

  copyBlock(index: number, code: string): void {
    copyText(code).then(() => {
      this.copiedIndex.set(index);
      setTimeout(() => this.copiedIndex.set(null), 1500);
    });
  }

  readonly blocks = computed<Block[]>(() => parseMarkdown(this.source() ?? ''));

}

export function parseMarkdown(source: string): Block[] {
    const out: Block[] = [];
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const fence = /^```(\w*)\s*$/.exec(line.trim());
      if (fence) {
        const lang = fence[1] ?? '';
        const body: string[] = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
        i++; // closing fence, or end of input for a stream still arriving
        out.push({ kind: 'code', lang, code: body.join('\n') });
        continue;
      }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push({ kind: 'hr' });
        i++;
        continue;
      }

      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        out.push({ kind: 'h', level: heading[1].length, spans: parseInlines(heading[2]) });
        i++;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items: Inline[][] = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(parseInlines(lines[i].replace(/^\s*[-*+]\s+/, '')));
          i++;
        }
        out.push({ kind: 'ul', items });
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: Inline[][] = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(parseInlines(lines[i].replace(/^\s*\d+[.)]\s+/, '')));
          i++;
        }
        out.push({ kind: 'ol', items });
        continue;
      }

      if (!line.trim()) { i++; continue; }

      const paragraph: string[] = [];
      while (i < lines.length && lines[i].trim()
             && !/^```/.test(lines[i].trim())
             && !/^\s*[-*+]\s+/.test(lines[i])
             && !/^\s*\d+[.)]\s+/.test(lines[i])
             && !/^#{1,4}\s+/.test(lines[i])
             && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
        paragraph.push(lines[i]);
        i++;
      }
      out.push({ kind: 'p', spans: parseInlines(paragraph.join(' ')) });
    }

    return out;
  }

  /** Inline code first: its contents must not then be read as bold or italic markers. */
export function parseInlines(text: string): Inline[] {
    const spans: Inline[] = [];
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) spans.push({ text: text.slice(last, match.index) });
      const token = match[0];
      if (token.startsWith('`')) {
        spans.push({ text: token.slice(1, -1), code: true });
      } else if (token.startsWith('**') || token.startsWith('__')) {
        spans.push({ text: token.slice(2, -2), bold: true });
      } else if (token.startsWith('[')) {
        const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(token);
        if (link) spans.push({ text: link[1], href: link[2] });
      } else {
        spans.push({ text: token.slice(1, -1), italic: true });
      }
      last = pattern.lastIndex;
    }
    if (last < text.length) spans.push({ text: text.slice(last) });
    return spans.length ? spans : [{ text }];
  }
