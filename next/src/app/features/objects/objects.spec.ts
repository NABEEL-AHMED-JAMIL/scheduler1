import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { Objects } from './objects';
import { FileChat } from './chat/file-chat';
import { AuthService } from '../../core/auth/auth.service';
import { BucketSummary, ObjectSummary, StorageService } from './storage.service';

/**
 * Switching the chat panel from one file to another.
 *
 * The panel is a single `@if` block, so "open chat on B while chat is open on A" is a rebind
 * unless something actually makes that block go falsy in a cycle of its own. Everything that
 * makes the panel belong to one particular file -- the agent list narrowed to its extension,
 * the coverage banner, and the prepareContext call that puts the file's text where the model
 * can read it -- happens in FileChat's ngOnInit, which only runs on a fresh instance. A rebind
 * therefore leaves B's header and key sitting over A's session, and B's questions are answered
 * against A's text.
 *
 * These are written against the rendered panel rather than the component's signals, because
 * "the same instance was reused" does not show up in a signal at all.
 */

const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };

const FILE_A: ObjectSummary = { name: 'sales.csv', key: 'daily/sales.csv', folder: false };
const FILE_B: ObjectSummary = { name: 'notes.txt', key: 'daily/notes.txt', folder: false };

const SERVER_RESPONSE = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

/**
 * An object browser wired to stubbed services, already showing a connection.
 *
 * `confirms` is the answer the chat's own "Close this chat?" dialog gets. An empty conversation
 * never reaches that dialog; a test that puts messages on screen does.
 */
/*
 * No default on `confirms`, deliberately. It used to default to true, which made browser(undefined)
 * -- the way a test says "the reader dismissed the dialog" -- silently identical to browser(), i.e.
 * the reader CONFIRMED. The decline test therefore drove the confirm path and failed on an
 * identity check it should have passed. An explicit argument at every call site is the only way a
 * union of true/false/undefined can actually express its third case.
 */
function browser(confirms: boolean | undefined) {
  let agentFetches = 0;
  const prepared: string[] = [];
  const ended: string[] = [];

  const http = {
    get: vi.fn((url: string) => {
      if (url.includes('fetchAllAgents')) {
        agentFetches++;
        return of(SERVER_RESPONSE([
          { aiAgentId: 7, agentName: 'Reader', provider: 'Ollama', status: 'Active' },
        ]));
      }
      return of(SERVER_RESPONSE(null));
    }),
    post: vi.fn((url: string, body: { key?: string }) => {
      if (url.includes('prepareContext')) {
        prepared.push(body.key ?? '');
        return of(SERVER_RESPONSE({ truncated: false, usingRetrieval: false, charsUsed: 10, totalChars: 10 }));
      }
      if (url.includes('endSession')) {
        ended.push(body.key ?? '');
      }
      return of(SERVER_RESPONSE(null));
    }),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: http },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      {
        provide: StorageService,
        useValue: {
          buckets: () => of(SERVER_RESPONSE([MINIO])),
          listObjects: () => of(SERVER_RESPONSE({ objects: [FILE_A, FILE_B] })),
        },
      },
      // confirmWith resolves as soon as the dialog "closes", so this is the reader saying yes or
      // no to losing the conversation without an overlay ever being rendered.
      { provide: Dialog, useValue: { open: () => ({ closed: of(confirms) }) } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
    ],
  });

  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const objects = fixture.componentInstance;
  objects.bucket.set(MINIO.bucket);
  fixture.detectChanges();

  return {
    fixture, objects, prepared, ended,
    agentFetches: () => agentFetches,
  };
}

/**
 * Drives the rendering the switch waits on.
 *
 * openChat deliberately parks until the render that removes the closed panel has happened, and
 * in a test nothing renders unless the test asks it to -- so change detection, the render hooks
 * and the microtask queue are pumped alternately until there is nothing pending left.
 */
async function settle(fixture: ComponentFixture<Objects>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    fixture.detectChanges();
    TestBed.tick();
    await Promise.resolve();
  }
  fixture.detectChanges();
}

/** The FileChat currently on screen -- the only thing that can answer "which instance is this". */
function panel(fixture: ComponentFixture<Objects>): FileChat | null {
  return fixture.debugElement.query(By.directive(FileChat))?.componentInstance ?? null;
}

describe('switching the chat panel between files', () => {
  it('replaces the panel rather than rebinding the one already open', async () => {
    const browse = browser(true);

    await browse.objects.openChat(FILE_A);
    await settle(browse.fixture);
    const first = panel(browse.fixture);
    expect(first).not.toBeNull();
    expect(first!.fileKey()).toBe(FILE_A.key);

    const opening = browse.objects.openChat(FILE_B);
    await settle(browse.fixture);
    await opening;
    await settle(browse.fixture);

    const second = panel(browse.fixture);
    expect(second).not.toBeNull();
    expect(second!.fileKey()).toBe(FILE_B.key);
    // The whole point: a different instance, so none of A's session can be carried into B's.
    expect(second).not.toBe(first);
  });

  it('gives the second file the panel setup instead of letting it inherit the first one', async () => {
    const browse = browser(true);

    await browse.objects.openChat(FILE_A);
    await settle(browse.fixture);

    const opening = browse.objects.openChat(FILE_B);
    await settle(browse.fixture);
    await opening;
    await settle(browse.fixture);

    // ngOnInit is where the agent list is fetched and narrowed to the file's extension -- once
    // per file, not once per visit to the screen.
    expect(browse.agentFetches()).toBe(2);
    // prepareContext is what puts a file's text where the model can read it. Without a second
    // one, B's questions are answered against whatever A left on the server.
    expect(browse.prepared).toEqual([FILE_A.key, FILE_B.key]);
    // And A's session is ended on the way out, so its extracted text does not linger there.
    expect(browse.ended).toEqual([FILE_A.key]);
  });

  it('stays on the current file when the reader declines to lose the conversation', async () => {
    const browse = browser(undefined);

    await browse.objects.openChat(FILE_A);
    await settle(browse.fixture);
    const first = panel(browse.fixture);
    // A conversation worth warning about, and a reader who says "no, keep it".
    first!.messages.set([{ role: 'user', text: 'what is in this file?', at: Date.now() }]);

    const opening = browse.objects.openChat(FILE_B);
    await settle(browse.fixture);
    await opening;
    await settle(browse.fixture);

    expect(panel(browse.fixture)).toBe(first);
    expect(browse.objects.chatFile()?.key).toBe(FILE_A.key);
    expect(browse.ended).toEqual([]);
  });
});

/**
 * Uploading a folder, which is really "many files, each keeping where it came from".
 *
 * The one thing that must not happen is a flattened upload. The server strips any directory off
 * the file NAME as path-traversal defence -- Paths.get(name).getFileName() -- so a folder sent as
 * names alone arrives as a heap in one place, and two sub-folders holding a file of the same name
 * silently overwrite each other. The relative path therefore has to travel as the PREFIX, which
 * the server does check for traversal.
 */
/**
 * Uploading a folder, which is really "many files, each keeping where it came from".
 *
 * The one thing that must not happen is a flattened upload. The server strips any directory off
 * the file NAME as path-traversal defence -- Paths.get(name).getFileName() -- so a folder sent as
 * names alone arrives as a heap in one place, and two sub-folders holding a file of the same name
 * silently overwrite each other without a word. The relative path therefore has to travel as the
 * PREFIX, which the server does check for traversal.
 */
describe('uploading a folder', () => {

  /** A file as a directory picker hands it over: named, sized, and knowing where it sat. */
  function picked(path: string): File {
    const file = new File(['content'], path.split('/').pop()!, { type: 'text/csv' });
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
  }

  function uploader(confirms = true) {
    const calls: { prefix: string; name: string }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: { get: vi.fn(() => of(SERVER_RESPONSE(null))), post: vi.fn(() => of(SERVER_RESPONSE(null))) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        {
          provide: StorageService,
          useValue: {
            buckets: () => of(SERVER_RESPONSE([MINIO])),
            listObjects: () => of(SERVER_RESPONSE({ objects: [] })),
            upload: (_bucket: string, prefix: string, file: File) => {
              calls.push({ prefix, name: file.name });
              return of(SERVER_RESPONSE(null));
            },
          },
        },
        { provide: Dialog, useValue: { open: () => ({ closed: of(confirms) }) } },
        { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
      ],
    });
    const fixture = TestBed.createComponent(Objects);
    fixture.detectChanges();
    const objects = fixture.componentInstance;
    objects.bucket.set(MINIO.bucket);
    objects.prefix.set('inbox/');
    return { objects, calls };
  }

  it('sends each file under the sub-folder it came from, not as a flat name', () => {
    const { objects, calls } = uploader();

    (objects as any).uploadAll([
      picked('sales/2024/q1.csv'),
      picked('sales/2025/q1.csv'),
      picked('sales/readme.md'),
    ]);

    // The same file NAME in two sub-folders: flattened, the second overwrites the first.
    expect(calls).toContainEqual({ prefix: 'inbox/sales/2024/', name: 'q1.csv' });
    expect(calls).toContainEqual({ prefix: 'inbox/sales/2025/', name: 'q1.csv' });
    expect(calls).toContainEqual({ prefix: 'inbox/sales/', name: 'readme.md' });
  });

  it('leaves a plain file picker landing exactly where it always did', () => {
    // webkitRelativePath is "" for a file pick, which is the whole difference between the cases.
    const { objects, calls } = uploader();

    (objects as any).uploadAll([new File(['content'], 'one.csv', { type: 'text/csv' })]);

    expect(calls).toEqual([{ prefix: 'inbox/', name: 'one.csv' }]);
  });

  it('drops empty files rather than reporting them as failures', () => {
    // A folder of 300 files with two .DS_Store entries would otherwise report two failures that
    // mean nothing to whoever picked the folder.
    const { objects, calls } = uploader();

    (objects as any).uploadAll([picked('sales/q1.csv'), new File([], '.DS_Store')]);

    expect(calls.map(call => call.name)).toEqual(['q1.csv']);
    expect(objects.uploadFailures()).toEqual([]);
  });

  it('asks in the console\'s own dialog before a folder goes up, and obeys a no', async () => {
    // The browser shows its own "Upload 135 files to this site?" first and that one cannot be
    // restyled -- but it says nothing about WHERE the files land or how much data it is. This is
    // the last point at which somebody who picked the wrong folder can stop.
    const declined = uploader(false);
    declined.objects.prefix.set('inbox/');

    await (declined.objects as any).confirmAndUpload([picked('sales/a.csv'), picked('sales/b.csv')]);

    expect(declined.calls).toEqual([]);

    const accepted = uploader(true);
    accepted.objects.prefix.set('inbox/');

    await (accepted.objects as any).confirmAndUpload([picked('sales/a.csv'), picked('sales/b.csv')]);

    expect(accepted.calls.length).toBe(2);
  });

  it('does not ask twice for a single file', async () => {
    // Asking for one file is how a confirmation becomes something people dismiss unread.
    const { objects, calls } = uploader(false);

    await (objects as any).confirmAndUpload([new File(['content'], 'one.csv')]);

    expect(calls.length).toBe(1);
  });

  it('counts every file it sent, so the progress bar can reach its own total', () => {
    const { objects } = uploader();

    (objects as any).uploadAll([picked('a/1.csv'), picked('a/2.csv'), picked('b/3.csv')]);

    expect(objects.uploadTotal()).toBe(3);
    expect(objects.uploadDone()).toBe(3);
  });
});
