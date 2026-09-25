import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, of } from 'rxjs';
import { FileChat } from './file-chat';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { StorageService } from '../storage.service';

/** Audit 09-22, the file chat panel as a screen reader, a phone and the dark theme meet it. */
function panel(opts: { coverage?: object; converting?: boolean } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ aiAgentId: 7, agentName: 'Reader', provider: 'Ollama', status: 'Active' }] })),
        post: vi.fn((url: string) => {
          if (url.includes('prepareContext')) return of({ status: 'SUCCESS', message: '', data: opts.coverage ?? { truncated: false, usingRetrieval: false, charsUsed: 1, totalChars: 1 } });
          if (url.includes('exportFile')) return opts.converting ? NEVER : of({ status: 'SUCCESS', message: '', data: btoa('x') });
          return of({ status: 'SUCCESS', message: '', data: null });
        }),
      } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
    ],
  });
  const fixture = TestBed.createComponent(FileChat);
  fixture.componentRef.setInput('bucket', 'docs');
  fixture.componentRef.setInput('fileKey', 'reports/q3.csv');
  fixture.componentRef.setInput('fileName', 'q3.csv');
  fixture.detectChanges();
  return { fixture, chat: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const PENDING = { sourceFormat: 'csv', targetFormat: 'xlsx', filename: 'q3-export.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const FILE = { filename: 'q3-export.csv', content: 'a,b', mimeType: 'text/csv', pendingExport: PENDING };

describe('FileChat panel', () => {
  it('is a named region, and its minimise toggle says whether the panel is open', () => {
    const { el, chat, fixture } = panel();
    const root = el.firstElementChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-label')).toBe('Chat about q3.csv');
    const toggle = el.querySelector<HTMLButtonElement>('button[aria-label="Minimise"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    chat.minimized.set(true);
    fixture.detectChanges();
    expect(el.querySelector('button[aria-label="Expand"]')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('names the composer after the file', () => {
    const { el } = panel();
    expect(el.querySelector('textarea')!.getAttribute('aria-label')).toBe('Message about q3.csv');
  });

  it('colours the retrieval notice from theme tokens, not a near-black brand-500 inline style', () => {
    const { el } = panel({ coverage: { truncated: false, usingRetrieval: true, charsUsed: 1, totalChars: 1 } });
    const notice = [...el.querySelectorAll('div')].find(d => d.textContent!.trim().startsWith('Answers are drawn from indexed excerpts'))
      ?? [...el.querySelectorAll('div')].find(d => d.textContent!.includes('Answers are drawn from indexed excerpts') && d.querySelector('app-icon[name="info"]'))!;
    expect(notice.getAttribute('style') ?? '').not.toContain('brand-500');
    const icon = notice.querySelector('app-icon[name="info"]')!;
    expect(icon.getAttribute('style') ?? '').not.toContain('brand-500');
    expect(icon.classList).toContain('icon-info');
    expect(el.innerHTML).not.toContain('color-mix(in oklab, var(--color-');
  });

  it('keeps an answer\'s actions visible without hover on a phone', () => {
    const { el, chat, fixture } = panel();
    chat.messages.set([{ role: 'user', text: 'hi', at: 1 }, { role: 'assistant', text: 'hello', at: 2 }]);
    fixture.detectChanges();
    const copy = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Copy')!;
    const row = copy.parentElement!;
    expect(row.classList).not.toContain('opacity-0');
    expect(row.classList).toContain('sm:opacity-0');
  });

  it('marks only the reply whose file is converting, not every reply with a file of that name', () => {
    const { el, chat, fixture } = panel({ converting: true });
    chat.messages.set([
      { role: 'assistant', text: 'first', at: 1, files: [FILE] },
      { role: 'assistant', text: 'second', at: 2, files: [FILE] },
    ]);
    fixture.detectChanges();
    const chips = () => [...el.querySelectorAll('button')].filter(b => b.textContent!.includes('q3-export.csv') || b.textContent!.includes('Converting'));
    chips()[1].click();
    fixture.detectChanges();
    expect(chips().map(b => b.textContent!.trim())).toEqual(['q3-export.csv', 'Converting…']);
  });

  it('saves a plain file through the shared StorageService.saveBlob', () => {
    const save = vi.spyOn(StorageService, 'saveBlob').mockImplementation(() => {});
    const { chat } = panel();
    chat.download({ filename: 'notes.txt', content: 'x', mimeType: 'text/plain' });
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'notes.txt');
    save.mockRestore();
  });
});
