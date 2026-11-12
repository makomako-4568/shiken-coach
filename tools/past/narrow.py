"""スマホ向けの「折り返し版」画像を作る。
本文の行（高さの低い帯）は、中央付近の文字の切れ目で左右に分け、右半分を次の行として並べる。
図や表（高さのある帯）は分けずにそのまま置く。"""
import os, sys, glob
from PIL import Image

def bands_of(im, thr=170):
    w, h = im.size; px = im.load()
    rows = [any(px[x, y] < thr for x in range(0, w, 2)) for y in range(h)]
    out, y = [], 0
    while y < h:
        if not rows[y]: y += 1; continue
        y0 = y
        while y < h and rows[y]: y += 1
        out.append([y0, y])
    merged = []
    for b in out:
        if merged and b[0] - merged[-1][1] <= 3: merged[-1][1] = b[1]
        else: merged.append(b)
    return merged

def col_empty(im, x, y0, y1, thr=170):
    px = im.load()
    return all(px[x, y] >= thr for y in range(y0, y1))

def split_x(im, y0, y1):
    w = im.width; mid = w // 2
    for d in range(0, int(w * 0.12)):
        for x in (mid - d, mid + d):
            if 2 <= x < w - 2 and col_empty(im, x, y0, y1) and col_empty(im, x - 1, y0, y1) and col_empty(im, x + 1, y0, y1):
                return x
    return None

def narrow(src, dst):
    im = Image.open(src).convert("L")
    w, h = im.size
    bands = bands_of(im)
    pieces = []  # (image, indent)
    prev = 0
    for (y0, y1) in bands:
        top = max(prev, y0 - 6); bot = min(h, y1 + 6); prev = bot
        if y1 - y0 <= 40:
            x = split_x(im, y0, y1)
            if x:
                L = im.crop((0, top, x, bot)); R = im.crop((x, top, w, bot))
                rb = R.point(lambda v: 255 if v < 200 else 0).getbbox()
                lb = L.point(lambda v: 255 if v < 200 else 0).getbbox()
                pieces.append((L, 0))
                # 続きの行は、元の行の書き出し位置にそろえる
                if rb: pieces.append((R.crop((rb[0], 0, rb[2], R.height)), lb[0] if lb else 0))
                continue
        pieces.append((im.crop((0, top, w, bot)), 0))
    W = max(p.width + ind for p, ind in pieces); H = sum(p.height for p, _ in pieces)
    out = Image.new("L", (W, H), 255); y = 0
    for p, ind in pieces: out.paste(p, (ind, y)); y += p.height
    out = out.point(lambda v: min(255, int(v / 17) * 17))
    out.convert("P", palette=Image.ADAPTIVE, colors=16).save(dst, optimize=True)
    return out.size

if __name__ == "__main__":
    for f in sys.argv[1:]:
        print(f, narrow(f, f.replace(".png", "n.png")))
