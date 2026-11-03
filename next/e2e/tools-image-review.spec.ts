import { test, expect, APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { api, authOf, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, meridian, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';

/**
 * Image review (the third Tools page, owner-approved design 2026-11-03), end to end against the live media-service, Core's
 * measuring code and ai-service's local vision model, as Riverside Health's synthetic administrator:
 *
 * - three visits of one synthetic wound measure about 9.3, 6.5 and 4.1 cm² against the ruler in each photo, and Compare's
 *   trend says the area went down; a photo without a ruler has no size (never an estimate);
 * - a phone photo's location (GPS), date-time original and camera are gone from the bytes that are stored;
 * - Riverside's viewer (no Tools page) is refused, and another workspace's administrator finds none of it.
 *
 * Everything is synthetic: the photos under e2e/fixtures/tools/images/ are the platform's demo images, stamped "SYNTHETIC
 * TEST IMAGE - not a patient". What it leaves, as the platform's rule is for test data: the photos it uploaded, under a
 * patient named E2E-IR-<time> (kept 30 days, then removed); each draft description bills one ai.vision.images to Riverside.
 */
const FIX = join(__dirname, 'fixtures', 'tools', 'images');

let admin: Session;
const PATIENT = `E2E-IR-${Date.now().toString(36)}`;

test.use({ ...LOCAL_BUILD_USE, testIdAttribute: 'data-test' });

/** APP1 "Exif\0\0" with a little-endian TIFF: IFD0 {Make, Orientation 1, GPS pointer}, a GPS IFD {GPSLatitudeRef N}. */
function exifWithGps(): Buffer {
  const t = Buffer.alloc(128);
  t.write('II', 0, 'ascii'); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
  t.writeUInt16LE(3, 8);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    t.writeUInt16LE(tag, at); t.writeUInt16LE(type, at + 2); t.writeUInt32LE(count, at + 4); t.writeUInt32LE(value, at + 8);
  };
  entry(10, 0x010f, 2, 6, 90);           // Make -> "Phone"
  entry(22, 0x0112, 3, 1, 1);            // Orientation 1
  entry(34, 0x8825, 4, 1, 50);           // GPS IFD at 50
  t.writeUInt32LE(0, 46);
  t.writeUInt16LE(1, 50);
  t.writeUInt16LE(0x0001, 52); t.writeUInt16LE(2, 54); t.writeUInt32LE(2, 56); t.write('N\0', 60, 'ascii');
  t.writeUInt32LE(0, 64);
  t.write('Phone\0', 90, 'ascii');
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), t]);
  const head = Buffer.alloc(4);
  head.writeUInt8(0xff, 0); head.writeUInt8(0xe1, 1); head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

/** Whether a JPEG carries an APPn segment from 0xE1 on (EXIF, XMP, ICC...) before its scan. */
function hasMetadata(jpeg: Buffer): boolean {
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const m = jpeg[i + 1];
    if (m === 0xda) return false;
    if (m >= 0xe1 && m <= 0xef) return true;
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  return false;
}

async function upload(request: APIRequestContext, file: string, buffer: Buffer, taken: string, extra: Record<string, string> = {}) {
  const r = await request.post(`${api}/imageReview.json/photos`, { headers: authOf(admin), timeout: 120_000, multipart: {
    file: { name: file, mimeType: 'image/jpeg', buffer }, patientRef: PATIENT, woundLabel: 'W1', bodyPart: 'foot', siteDetail: 'left foot, plantar',
    takenAt: taken, ...extra } });
  const body = await r.json();
  expect(body.status, body.message).toBe('SUCCESS');
  return body.data.photos[0];
}

test.describe('Image review (live)', () => {
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.skip(!canMintPeople(), 'needs the mint script for Riverside\'s people');

  test.beforeAll(async ({ request }) => {
    admin = await sessionAsPerson(request, riverside().admin);
  });

  test('three visits measure against their rulers; no ruler, no size; the trend is down', async ({ request }) => {
    test.setTimeout(240_000);
    const v1 = await upload(request, 'wound-SV-000117-v1.jpg', readFileSync(join(FIX, 'wound-SV-000117-v1.jpg')), '2026-10-19T08:55');
    const v2 = await upload(request, 'wound-SV-000117-v2.jpg', readFileSync(join(FIX, 'wound-SV-000117-v2.jpg')), '2026-10-21T09:40');
    const v3 = await upload(request, 'wound-SV-000117-v3.jpg', readFileSync(join(FIX, 'wound-SV-000117-v3.jpg')), '2026-10-23T10:12');
    const expected = [9.3, 6.5, 4.1];
    [v1, v2, v3].forEach((p, k) => {
      expect(p.status).toBe('MEASURED');
      expect(p.scaleFound).toBe(true);
      expect(p.areaCm2, `visit ${k + 1}`).toBeGreaterThan(expected[k] - 0.25);
      expect(p.areaCm2, `visit ${k + 1}`).toBeLessThan(expected[k] + 0.25);
      expect(p.visit).toBe(k + 1);
    });
    expect(v3.sinceFirstPct).toBeLessThanOrEqual(-50);

    const none = await upload(request, 'wound-noruler.jpg', readFileSync(join(FIX, 'wound-noruler.jpg')), '2026-10-24T11:31', { woundLabel: 'W2' });
    expect(none.status).toBe('NO_RULER');
    expect(none.areaCm2 ?? null, 'no ruler, no size').toBeNull();
    expect(none.lengthCm ?? null).toBeNull();

    const compare = await (await request.get(`${api}/imageReview.json/photos/${v3.photoId}/compare`, { headers: authOf(admin) })).json();
    expect(compare.data.photos.map((r: { photoId: number }) => r.photoId)).toEqual([v1.photoId, v2.photoId, v3.photoId]);
    expect(compare.data.sizedCount).toBe(3);
    expect(compare.data.sinceFirstPct).toBeLessThan(0);
  });

  test('location, date-time original and camera are gone from the stored bytes', async ({ request }) => {
    test.setTimeout(120_000);
    const plain = readFileSync(join(FIX, 'wound-SV-000117-v1.jpg'));
    const phone = Buffer.concat([plain.subarray(0, 2), exifWithGps(), plain.subarray(2)]);
    expect(hasMetadata(phone), 'the photo sent carries EXIF with GPS').toBe(true);
    const made = await upload(request, 'phone-photo.jpg', phone, '2026-10-25T09:00', { woundLabel: 'W9' });
    expect(made.metadataRemoved).toEqual(expect.arrayContaining(['location', 'camera']));
    const stored = Buffer.from(await (await request.get(`${api}/imageReview.json/photos/${made.photoId}/image`, { headers: authOf(admin) })).body());
    expect(stored.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(hasMetadata(stored), 'no APP1-APP15 segment in the stored copy').toBe(false);
    expect(stored.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
    expect(stored.includes(Buffer.from('Phone\0', 'binary'))).toBe(false);
  });

  test('the viewer has no Image review, and another workspace finds nothing of Riverside\'s', async ({ request }) => {
    test.setTimeout(120_000);
    const mine = await (await request.get(`${api}/imageReview.json/photos`, { headers: authOf(admin), params: { days: '0', q: PATIENT, size: '5', page: '1' } })).json();
    const id = mine.data.rows[0]?.photoId;
    expect(id).toBeTruthy();

    const viewer = await sessionAsPerson(request, riverside().viewer);
    expect((await request.get(`${api}/imageReview.json/photos`, { headers: authOf(viewer) })).status(), 'the viewer holds no Tools page').toBe(403);
    expect((await request.get(`${api}/imageReview.json/photos/${id}`, { headers: authOf(viewer) })).status()).toBe(403);

    const other = await sessionAsPerson(request, meridian().admin);
    const theirs = await (await request.get(`${api}/imageReview.json/photos`, { headers: authOf(other), params: { days: '0', q: PATIENT } })).json();
    expect(theirs.data.rows, 'Meridian lists none of Riverside\'s photos').toEqual([]);
    expect((await request.get(`${api}/imageReview.json/photos/${id}`, { headers: authOf(other) })).status()).toBe(404);
    expect((await request.get(`${api}/imageReview.json/photos/${id}/image`, { headers: authOf(other) })).status()).toBe(404);
    expect((await request.post(`${api}/imageReview.json/photos/${id}/description/discard`, { headers: authOf(other) })).status()).toBe(404);
  });

  test('the list and the photo page show the size in code, and no ruler as no size', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await useLocalBuild(page);
    await page.goto('/tools/images');
    await page.getByTestId('photos-search').fill(PATIENT);
    const rows = page.locator('[data-photo-row]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('photos')).toContainText('No ruler: no size');
    await expect(page.getByTestId('photos')).toContainText('cm²');
    await expect(page.getByTestId('photos-drop')).toContainText('location and camera details are removed on upload');
    await rows.filter({ hasText: 'visit 3' }).first().click();
    await expect(page.getByTestId('panel-size')).toContainText('cm²');
    await page.getByTestId('open-photo').click();
    await expect(page.getByTestId('size-card')).toContainText('Ruler found');
    await expect(page.getByTestId('size-card')).toContainText('never estimated');
    await page.locator('[data-tab="compare"]').click();
    await expect(page.getByTestId('area-trend')).toContainText('down');
  });
});
