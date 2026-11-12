"""午前II問題冊子のページ画像から1問ずつ切り出す（改良版）。
行頭が「問」の字形と一致する行だけを問題の書き出しとみなす。ページ先頭に書き出しがない内容は前の問題の続きとしてつなげる。"""
import os, subprocess, sys, glob, json
from PIL import Image, ImageChops
sys.path.insert(0, os.path.dirname(__file__))
from crop import lines_of

DPI = 150
SZ = 28

def glyph(img, band, left):
    """行頭の1文字ぶん（正方形）を取り出し、インク範囲で切り詰めて SZ×SZ に正規化する。"""
    h = band[1] - band[0] + 1
    reg = img.crop((left, band[0], left + int(h * 1.15), band[1] + 1))
    inv = reg.point(lambda v: 255 if v < 160 else 0)
    bb = inv.getbbox()
    if not bb: return None
    return inv.crop(bb).resize((SZ, SZ), Image.BILINEAR)

def score(a, b):
    d = ImageChops.difference(a, b)
    return sum(d.getdata()) / (SZ * SZ * 255)

def render(pdf, tmp):
    for f in glob.glob(os.path.join(tmp, "*.png")): os.remove(f)
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", pdf, os.path.join(tmp, "p")], check=True)
    return sorted(glob.glob(os.path.join(tmp, "p-*.png")))

def page_bands(pg):
    im = Image.open(pg).convert("L")
    w, h = im.size
    body = im.crop((int(w * 0.05), int(h * 0.04), int(w * 0.96), int(h * 0.93)))  # 端の線やページ番号を除く
    return body, [b for b in lines_of(body) if b[1] - b[0] >= 4]

def make_template(base, tmp):
    pages = render(os.path.join(base, "pdf", "2024r06h_sc_am2_qs.pdf"), tmp)
    body, bands = page_bands(pages[2])  # 3ページ目の先頭は「問1」
    b = bands[0]
    return glyph(body, b, b[2])

def crop_set(pdf, outdir, tmp, tpl, thr):
    os.makedirs(outdir, exist_ok=True)
    for f in glob.glob(os.path.join(outdir, "*.png")): os.remove(f)
    pages = render(pdf, tmp)
    qs = []          # 各問題の画像片のリスト
    scores = []
    for pi, pg in enumerate(pages[1:], start=2):
        body, bands = page_bands(pg)
        if not bands: continue
        w = body.width
        cand = []
        for i, b in enumerate(bands):
            if b[2] > w * 0.25: continue
            g = glyph(body, b, b[2])
            if g is None: continue
            s = score(g, tpl)
            scores.append(round(s, 3))
            if s < thr: cand.append(i)
        def piece(i0, i1):
            top = max(0, bands[i0][0] - 10); bot = min(body.height, bands[i1][1] + 12)
            return body.crop((0, top, w, bot))
        first = cand[0] if cand else len(bands)
        if first > 0 and qs and len(qs) < 25:
            qs[-1].append(piece(0, first - 1))   # 前ページからの続き
        for k, si in enumerate(cand):
            ei = (cand[k + 1] - 1) if k + 1 < len(cand) else len(bands) - 1
            qs.append([piece(si, ei)])
        if len(qs) >= 25 and not cand: break
    return qs[:25], len(qs), scores

def save(qs, outdir):
    meta = []
    for n, parts in enumerate(qs, start=1):
        W = max(p.width for p in parts); H = sum(p.height for p in parts)
        im = Image.new("L", (W, H), 255); y = 0
        for p in parts: im.paste(p, (0, y)); y += p.height
        inv = im.point(lambda v: 255 if v < 200 else 0); bb = inv.getbbox()
        if bb: im = im.crop((max(0, bb[0] - 12), 0, min(W, bb[2] + 12), H))
        im = im.point(lambda v: min(255, int(v / 17) * 17))
        im.convert("P", palette=Image.ADAPTIVE, colors=16).save(os.path.join(outdir, f"q{n:02d}.png"), optimize=True)
        meta.append({"n": n, "w": im.width, "h": im.height, "parts": len(parts)})
    return meta

if __name__ == "__main__":
    base = sys.argv[1]; thr = float(sys.argv[2]) if len(sys.argv) > 2 else 0.12
    tmp = os.path.join(base, "tmp"); os.makedirs(tmp, exist_ok=True)
    tpl = make_template(base, tmp); tpl.save(os.path.join(base, "tpl.png"))
    res = {}
    for pdf in sorted(glob.glob(os.path.join(base, "pdf", "*_am2_qs.pdf"))):
        key = os.path.basename(pdf).replace("_am2_qs.pdf", "")
        outdir = os.path.join(base, "img", key)
        qs, total, sc = crop_set(pdf, outdir, tmp, tpl, thr)
        meta = save(qs, outdir)
        res[key] = meta
        hs = [m["h"] for m in meta]
        near = sorted(s for s in sc if thr * 0.6 < s < thr * 1.8)
        print(key, "found", total, "min h", min(hs), "max h", max(hs), "split", sum(m["parts"] > 1 for m in meta), "near-thr", near[:6])
    json.dump(res, open(os.path.join(base, "crop.json"), "w"), indent=1)
