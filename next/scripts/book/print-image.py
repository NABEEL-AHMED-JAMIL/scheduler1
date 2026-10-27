#!/usr/bin/env python3
"""A screenshot for paper (scripts/build-book.mjs): in.png -> out.jpg, at most 2000 pixels wide, JPEG quality 84.

A full console screen keeps what the article is about and drops the console's own frame: the menu on the left and the
top bar, found by their border lines (a page without them, the report designer or the help, is left whole). What is
left prints larger at the same width, so its small text reads. Prints "cropped" or "whole".

    python3 print-image.py in.png out.jpg
"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
w, h = im.size
px = im.load()


def lum(x, y):
    r, g, b = px[x, y]
    return (r * 299 + g * 587 + b * 114) / 1000


def vertical_line(x):
    """How many rows have a line at column x: darker than the pixels 8 to either side."""
    rows = range(int(h * 0.15), int(h * 0.95), 7)
    hits = sum(1 for y in rows if lum(x, y) < lum(x - 8, y) - 4 and lum(x, y) < lum(x + 8, y) - 4)
    return hits / max(1, len(rows))


def horizontal_line(y):
    cols = range(int(w * 0.3), int(w * 0.95), 11)
    hits = sum(1 for x in cols if lum(x, y) < lum(x, y - 6) - 4 and lum(x, y) < lum(x, y + 6) - 4)
    return hits / max(1, len(cols))


crop = None
if w >= 3800:  # a full 1920 x 1080 screen at device scale 2
    left = next((x for x in range(470, 492) if vertical_line(x) > 0.7), None)
    top = next((y for y in range(104, 120) if horizontal_line(y) > 0.6), None)
    if left and top:
        crop = (left + 2, top + 2, w, h)
if crop:
    im = im.crop(crop)
    # A short page leaves the bottom of the screen empty: trim it to the last line with anything on it, and a margin.
    w2, h2 = im.size
    p2 = im.load()
    bg = p2[w2 // 2, h2 - 2]
    def empty(y):
        return all(sum(abs(a - b) for a, b in zip(p2[x, y], bg)) < 12 for x in range(0, w2, 9))
    bottom = h2 - 1
    while bottom > h2 // 3 and empty(bottom):
        bottom -= 3
    if bottom < h2 - 80:
        im = im.crop((0, 0, w2, min(h2, bottom + 40)))
if im.size[0] > 2000:
    im = im.resize((2000, round(im.size[1] * 2000 / im.size[0])), Image.LANCZOS)
im.save(dst, 'JPEG', quality=84, optimize=True)
print('cropped' if crop else 'whole')
