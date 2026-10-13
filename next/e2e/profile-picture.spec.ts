import { expect, test, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { api, authOf, canMintPeople, pageAs, sessionAsPerson, sessionFor, Session } from './support/session';
import { meridian, rebuild, riverside } from './support/fixtures';

/**
 * Profile pictures, live: Riverside's administrator sets one on Profile (a generated picture -- coloured rings, never
 * a person's photo -- cropped in the dialog), and it shows in the top bar and its menu, Administration › Users and the
 * Task inbox's history; Meridian's administrator cannot fetch it, by id or by version.
 *
 * The picture is left in place afterwards (the owner removes test data). PICTURE_SHOTS=<dir> also writes screenshots
 * at 1920 and 1187 px wide, light and dark.
 */

/** An abstract 720 x 540 PNG: teal and amber rings on a blue gradient. */
function generatedPicture(): Buffer {
  const w = 720;
  const h = 540;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - w / 2, y - h / 2);
      const t = y / h;
      const c = r < 230 ? (Math.floor(r / 34) % 2 ? [20, 150, 140] : [240, 180, 60]) : [40 + 60 * t, 60 + 40 * t, 110 + 80 * t];
      raw.set(c.map(Math.round), row + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const SHOTS = process.env['PICTURE_SHOTS'];

async function shoot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(t => {
      localStorage.setItem('etl_theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}-${theme}.png` });
  }
  await page.evaluate(() => { localStorage.setItem('etl_theme', 'light'); document.documentElement.classList.remove('dark'); });
}

test.describe('profile pictures', () => {
  test.skip(!rebuild() || !canMintPeople(), 'needs the rebuilt platform (rebuild.json) and the mint script (E2E_MINT=1)');
  test.setTimeout(180_000);

  let admin: Session;
  let version = '';

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    expect(admin.appUserId, 'Riverside\'s administrator').toBe(riverside().admin);
  });

  test('Riverside\'s administrator crops and sets a picture on Profile', async ({ browser, request }) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto('/profile');
    await page.locator('[data-test="profile-picture-input"]').setInputFiles({
      name: 'rings.png', mimeType: 'image/png', buffer: generatedPicture(),
    });
    const stage = page.getByRole('img', { name: /Picture to crop/ });
    await expect(stage).toBeVisible();
    await page.locator('[data-test="avatar-zoom"]').fill('1.4');
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 5 });
    await page.mouse.up();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/crop-dialog-1920-light.png` });

    const saved = page.waitForResponse(r => r.url().includes('/appUser.json/avatar') && r.request().method() === 'POST');
    await page.locator('[data-test="avatar-crop-use"]').click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('Picture updated.')).toBeVisible();
    const me = await (await request.get(`${api}/appUser.json/me`, { headers: authOf(admin) })).json();
    version = me.data.avatarVersion;
    expect(version).toMatch(/^[0-9a-f]{20}$/);
    await expect(page.locator('[data-test="profile-picture-drop"] img.avatar-img')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace' })).toBeVisible();

    // The top bar: its own chunk, then the picture.
    await expect(page.locator('[data-nav-menu="__user"] > button img.avatar-img')).toBeVisible();
    await shoot(page, 'profile');
    await page.setViewportSize({ width: 1187, height: 900 });
    await shoot(page, 'profile');
    await page.context().close();
  });

  test('it shows in the top bar\'s menu, on Users and in the Task inbox', async ({ browser }) => {
    for (const width of [1920, 1187]) {
      const page = await pageAs(browser, admin, { viewport: { width, height: width === 1920 ? 1080 : 900 } });
      await page.goto('/administration/users');
      const row = page.locator('tr, article').filter({ hasText: 'Riverside Health admin' }).first();
      await expect(row.locator('img.avatar-img')).toBeVisible();
      // A colleague without a picture: initials on their colour, nothing fetched for them.
      await expect(page.locator('tr, article').filter({ hasText: 'Riverside Health reviewer' }).first()
        .locator('.avatar-initials[data-initials]')).toBeVisible();
      await expect(page.locator('[data-nav-menu="__user"] > button img.avatar-img')).toBeVisible();
      await shoot(page, 'users');

      await page.locator('[data-nav-menu="__user"] > button').click();
      await expect(page.locator('#user-menu img.avatar-img')).toBeVisible();
      await shoot(page, 'user-menu');
      await page.keyboard.press('Escape');

      // The inbox: the tasks Riverside's administrator acted on, and their history's byline.
      await page.goto('/workflows/inbox');
      await page.locator('[data-test="tab-done"]').click();
      await page.locator('.inbox-row').first().click();
      await expect(page.locator('.inbox-timeline img.avatar-img').first()).toBeVisible();
      await page.locator('.inbox-timeline img.avatar-img').first().scrollIntoViewIfNeeded();
      await shoot(page, 'inbox');
      await page.context().close();
    }
  });

  test('Meridian\'s administrator cannot fetch it', async ({ request }) => {
    const other = await sessionAsPerson(request, meridian().admin);
    for (const url of [`${api}/appUser.json/avatar?appUserId=${admin.appUserId}`,
      `${api}/appUser.json/avatar?appUserId=${admin.appUserId}&size=64&v=${version}`]) {
      const answer = await request.get(url, { headers: authOf(other) });
      expect(answer.status(), `${url} as Meridian's administrator`).toBe(404);
    }
    const removal = await request.delete(`${api}/appUser.json/avatar?appUserId=${admin.appUserId}`, { headers: authOf(other) });
    expect(removal.status(), 'nor remove it').toBe(404);
    // Riverside's own administrator still gets it, cached by version.
    const own = await request.get(`${api}/appUser.json/avatar?appUserId=${admin.appUserId}&size=64&v=${version}`,
      { headers: authOf(admin) });
    expect(own.status()).toBe(200);
    expect(own.headers()['content-type']).toBe('image/jpeg');
    expect(own.headers()['etag']).toBe(`"${version}-64"`);
    expect(own.headers()['cache-control']).toContain('immutable');
  });
});
