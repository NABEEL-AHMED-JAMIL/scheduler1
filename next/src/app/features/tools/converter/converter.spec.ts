import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Converter } from './converter';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ObjectPicker, PickedObject } from '../../../shared/ui/object-picker';

/**
 * A document from a bucket is chosen in the console's one ObjectPicker.
 *
 * The converter used to hand-roll bucket -> breadcrumb -> folders -> file (the picker was written
 * to replace exactly this, and the copies had drifted: the transcript tool had no folder filter,
 * and a failed read went silent in both until each was patched on its own). Browsing, paging,
 * stale answers and read failures are the picker's, and are pinned in object-picker.spec.ts.
 */
function converterPicking(picked: PickedObject | undefined) {
  const open = vi.fn((_component: unknown, _config: any) => ({ closed: of(picked) }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {} },
      { provide: Dialog, useValue: { open } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: StorageService, useValue: {} },
    ],
  });
  const converter = TestBed.runInInjectionContext(() => new Converter());
  converter.families.set([
    { key: 'office', label: 'Office document', inputFormats: ['docx', 'odt'], outputFormats: ['pdf'] },
    { key: 'md', label: 'Markdown', inputFormats: ['md'], outputFormats: ['html'] },
  ] as any);
  return { converter, open };
}

describe('Converter source from a bucket', () => {
  it('opens the shared ObjectPicker, offering only formats the converter reads', () => {
    const { converter, open } = converterPicking(undefined);
    converter.chooseFile();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(ObjectPicker);
    expect(open.mock.calls[0][1].data.extensions).toEqual(['docx', 'odt', 'md']);
  });

  it('takes the picked bucket and key as the source', () => {
    const { converter } = converterPicking({ bucket: 'docs', key: 'legal/2026/contract.docx', name: 'contract.docx' });
    converter.mode.set('bucket');
    converter.chooseFile();
    expect(converter.bucket()).toBe('docs');
    expect(converter.selectedKey()).toBe('legal/2026/contract.docx');
    expect(converter.sourceName()).toBe('contract.docx');
    expect(converter.family()?.key).toBe('office');
  });

  it('reopens where the last file was, and keeps the choice when the picker is dismissed', () => {
    const { converter, open } = converterPicking(undefined);
    converter.bucket.set('docs');
    converter.selectedKey.set('legal/2026/contract.docx');
    converter.chooseFile();
    expect(open.mock.calls[0][1].data).toMatchObject({ bucket: 'docs', prefix: 'legal/2026/' });
    expect(converter.selectedKey()).toBe('legal/2026/contract.docx');
  });
});
