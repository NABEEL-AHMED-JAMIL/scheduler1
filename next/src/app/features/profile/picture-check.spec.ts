import { describe, it, expect } from 'vitest';
import { MAX_PICTURE_BYTES, pictureKind, pictureProblem } from './picture-check';
import { clampOffset, cropRect } from '../../shared/ui/avatar-crop-dialog';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = ascii('RIFF\u0010\u0000\u0000\u0000WEBPVP8 ');

/** A profile picture is checked by its bytes before anything else happens to it. */
describe('pictureKind', () => {
  it('reads PNG, JPEG and WebP from their first bytes', () => {
    expect(pictureKind(PNG)).toBe('png');
    expect(pictureKind(JPEG)).toBe('jpeg');
    expect(pictureKind(WEBP)).toBe('webp');
  });

  it('knows SVG however it starts', () => {
    expect(pictureKind(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(pictureKind(ascii('  <?xml version="1.0"?><SVG/>'))).toBe('svg');
    expect(pictureKind(new Uint8Array([0xef, 0xbb, 0xbf, ...ascii('<svg/>')]))).toBe('svg');
  });

  it('calls anything else other, whatever it is named', () => {
    expect(pictureKind(ascii('GIF89a'))).toBe('other');
    expect(pictureKind(ascii('%PDF-1.7'))).toBe('other');
    expect(pictureKind(new Uint8Array())).toBe('other');
  });
});

describe('pictureProblem', () => {
  const file = (head: Uint8Array, size = head.length, name = 'me.png') => {
    const body = new Uint8Array(size);
    body.set(head.subarray(0, Math.min(head.length, size)));
    return new File([body], name);
  };

  it('accepts a PNG, a JPEG and a WebP', async () => {
    expect(await pictureProblem(file(PNG, 2048))).toBeNull();
    expect(await pictureProblem(file(JPEG, 2048, 'photo.jpg'))).toBeNull();
    expect(await pictureProblem(file(WEBP, 2048, 'photo.webp'))).toBeNull();
  });

  it('refuses an SVG even named .png', async () => {
    expect(await pictureProblem(file(ascii('<svg/>'), 6, 'innocent.png'))).toContain('SVG');
  });

  it('refuses over 5 MB, and an empty file', async () => {
    expect(await pictureProblem(file(PNG, MAX_PICTURE_BYTES + 1))).toContain('5 MB');
    expect(await pictureProblem(file(PNG, MAX_PICTURE_BYTES))).toBeNull();
    expect(await pictureProblem(new File([], 'empty.png'))).toContain('empty');
  });

  it('refuses a GIF or anything else', async () => {
    expect(await pictureProblem(file(ascii('GIF89a'), 100, 'anim.gif'))).toContain('not a PNG, JPEG or WebP');
  });
});

/** The square the crop dialog cuts: the arithmetic, without a canvas. */
describe('crop square', () => {
  it('at zoom 1 and no offset, takes the centre square of a landscape picture', () => {
    const r = cropRect({ w: 1200, h: 800 }, 1, { x: 0, y: 0 }, 288);
    expect(r.sx).toBeCloseTo(200, 6);
    expect(r.sy).toBeCloseTo(0, 6);
    expect(r.side).toBeCloseTo(800, 6);
  });

  it('zooming in takes a smaller square round the same centre', () => {
    const r = cropRect({ w: 1000, h: 1000 }, 2, { x: 0, y: 0 }, 288);
    expect(r.side).toBeCloseTo(500, 6);
    expect(r.sx).toBeCloseTo(250, 6);
    expect(r.sy).toBeCloseTo(250, 6);
  });

  it('a drag never shows past an edge', () => {
    const right = clampOffset({ w: 1200, h: 800 }, 1, { x: 9999, y: 50 }, 288);
    const left = clampOffset({ w: 1200, h: 800 }, 1, { x: -9999, y: -50 }, 288);
    expect(right.x).toBeCloseTo(72, 6);
    expect(right.y).toBeCloseTo(0, 6);
    expect(left.x).toBeCloseTo(-72, 6);
    const dragged = clampOffset({ w: 1200, h: 800 }, 1, { x: 9999, y: 0 }, 288);
    expect(cropRect({ w: 1200, h: 800 }, 1, dragged, 288).sx).toBeCloseTo(0, 6);
  });
});
