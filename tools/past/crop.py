"""午前II問題冊子PDFのページ画像から、1問ずつ切り出す。
問題の書き出し行（「問N」）だけが左余白ぎりぎりから始まり、続きの行と選択肢は字下げされている、という版面の規則を使う。"""
import os, subprocess, sys, glob, json
from PIL import Image

DPI = 150

def lines_of(im):
    """インクのある行の帯（上端, 下端, 左端x）を返す。"""
    w, h = im.size
    px = im.load()
    rows = []
    for y in range(h):
        xs = None
        for x in range(0, w, 1):
            if px[x, y] < 160:
                xs = x; break
        rows.append(xs)
    bands, y = [], 0
    while y < h:
        if rows[y] is None: y += 1; continue
        y0 = y; left = rows[y]
        while y < h and rows[y] is not None:
            left = min(left, rows[y]); y += 1
        bands.append([y0, y - 1, left])
    # 近い帯（同じ行の上下の点など）をまとめる
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= 3:
            merged[-1][1] = b[1]; merged[-1][2] = min(merged[-1][2], b[2])
        else: merged.append(b)
    return merged

def crop_set(pdf, outdir, tmp):
    os.makedirs(outdir, exist_ok=True)
    for f in glob.glob(os.path.join(tmp, "*.png")): os.remove(f)
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", pdf, os.path.join(tmp, "p")], check=True)
    pages = sorted(glob.glob(os.path.join(tmp, "p-*.png")))
    n = 0
    out = []
    for pi, pg in enumerate(pages):
        if pi == 0: continue  # 表紙
        im = Image.open(pg).convert("L")
        w, h = im.size
        body = im.crop((0, int(h * 0.04), w, int(h * 0.93)))  # 上の余白と下のページ番号を除く
        bands = [b for b in lines_of(body) if b[1] - b[0] >= 4]
        if not bands: continue
        margin = min(b[2] for b in bands)
        starts = [i for i, b in enumerate(bands) if b[2] <= margin + 6]
        for k, si in enumerate(starts):
            if n >= 25: break
            ei = (starts[k + 1] - 1) if k + 1 < len(starts) else len(bands) - 1
            top = max(0, bands[si][0] - 10); bot = min(body.height, bands[ei][1] + 12)
            q = body.crop((0, top, w, bot))
            # 左右の余白を詰める
            inv = q.point(lambda v: 255 if v < 200 else 0)
            bb = inv.getbbox()
            if bb: q = q.crop((max(0, bb[0] - 12), 0, min(w, bb[2] + 12), q.height))
            n += 1
            q = q.point(lambda v: min(255, int(v / 17) * 17))  # 16階調にして軽くする
            q.convert("P", palette=Image.ADAPTIVE, colors=16).save(os.path.join(outdir, f"q{n:02d}.png"), optimize=True)
            out.append({"n": n, "page": pi + 1, "h": q.height, "w": q.width})
        if n >= 25: break
    return out

if __name__ == "__main__":
    base = sys.argv[1]; res = {}
    tmp = os.path.join(base, "tmp"); os.makedirs(tmp, exist_ok=True)
    for pdf in sorted(glob.glob(os.path.join(base, "pdf", "*_am2_qs.pdf"))):
        key = os.path.basename(pdf).replace("_am2_qs.pdf", "")
        r = crop_set(pdf, os.path.join(base, "img", key), tmp)
        res[key] = r
        hs = [x["h"] for x in r]
        print(key, len(r), "min h", min(hs) if hs else 0, "max h", max(hs) if hs else 0, "pages", r[-1]["page"] if r else 0)
    json.dump(res, open(os.path.join(base, "crop.json"), "w"), indent=1)
