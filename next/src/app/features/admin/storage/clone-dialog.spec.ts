import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { CloneDialog } from './clone-dialog';

const source = {
  storageConnectionId: 7,
  connectionName: 'ETL Bucket',
  alias: 'etl-bucket',
  bucketName: 'etl-bucket',
};

/** Records what was posted and what was said, so a refused save can be told from a silent one. */
function dialogFor(connection: Record<string, unknown> = source) {
  const posted: string[] = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const bodies: any[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { connection } },
      { provide: DialogRef, useValue: { close: () => {} } },
      {
        provide: HttpClient,
        useValue: {
          post: (url: string, body: unknown) => {
            posted.push(url);
            bodies.push(body);
            return of({ status: 'SUCCESS', message: 'Copied.', data: [] });
          },
        },
      },
      {
        provide: ToastService,
        useValue: {
          error: (message: string) => errors.push(message),
          info: (message: string) => infos.push(message),
          success: () => {},
        },
      },
    ],
  });
  return { dialog: TestBed.runInInjectionContext(() => new CloneDialog()), posted, errors, infos, bodies };
}

describe('CloneDialog alias', () => {
  it('offers a copy of the source alias that the rule already accepts', () => {
    const { dialog } = dialogFor();
    expect(dialog.alias).toBe('etl-bucket-copy');
  });

  /**
   * The new-connection dialog refuses anything outside letters, numbers, . _ and -. Held to the
   * same rule here, or a copy could be given an alias that dialog would never have allowed and
   * the only sign of it was a server error on a field that never turned red.
   */
  it('refuses an alias the new-connection dialog would refuse', () => {
    const { dialog, posted, errors } = dialogFor();
    dialog.alias = 'etl bucket/copy';
    dialog.save();
    expect(posted).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('sends the copy once the alias is legal', () => {
    const { dialog, posted, errors } = dialogFor();
    dialog.alias = 'etl-bucket.copy_2';
    dialog.save();
    expect(errors).toEqual([]);
    expect(posted).toHaveLength(1);
  });
});

describe('CloneDialog bucket discovery', () => {
  /**
   * "The credentials work, but no buckets were returned" is a success envelope. Reported in red
   * it read as the source connection having failed.
   */
  it('does not report an empty but successful listing as a failure', () => {
    const { dialog, errors, infos } = dialogFor();
    dialog.discover();
    expect(errors).toEqual([]);
    expect(infos).toHaveLength(1);
    expect(dialog.discovered()).toEqual([]);
  });
});

/**
 * An FTP or FTPS server has no bucket. The clone dialog offered a Bucket box and "List buckets"
 * for every provider, where the connection dialog gates the same field on the provider.
 */
describe('CloneDialog on an FTP connection', () => {
  const ftp = { storageConnectionId: 9, connectionName: 'Partner FTP', alias: 'partner-ftp', provider: 'FTPS', bucketName: 'stale' };

  it('knows an FTP source has no bucket, and an object store has one', () => {
    expect(dialogFor(ftp).dialog.hasBucket()).toBe(false);
    expect(dialogFor({ ...source, provider: 'MINIO' }).dialog.hasBucket()).toBe(true);
  });

  it('sends no bucket for an FTP copy', () => {
    const { dialog, bodies } = dialogFor(ftp);
    dialog.save();
    expect(bodies[0].bucketName).toBeNull();
  });
});
