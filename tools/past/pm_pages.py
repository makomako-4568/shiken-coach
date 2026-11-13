"""午後（科目B・午後II）の問題冊子・解答例・採点講評を、アプリで表示するページ画像に変換する。

ページごとに次の2種類を作る。
  <id>.png          ページ全体（PCやタブレット向け。タップで拡大）
  <id>_<k>.png      スマホ向けのかたまり。本文は行を左右に分けて折り返し（t）、図や表はそのまま（f）
問題冊子は各ページ先頭の「問N」を文字認識で読み取り、問ごとにページをまとめる（各問は新しいページから始まる）。
表示するのはPDFのページ画像そのもので、文字の書き換えはしない。
"""
import glob, os, re, subprocess, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from crop3 import head_num  # noqa: E402

DPI = 130
LINE_MAX = 34   # これより高い帯は図や表とみなす
LEVELS = 7      # 8階調（0〜7）。白は255のまま残す


def quant(im):
    return im.point(lambda v: int(round(v / 255 * LEVELS) * 255 / LEVELS)).convert("P", palette=Image.ADAPTIVE, colors=8)


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


def split_x(im, y0, y1, thr=170):
    w = im.width; px = im.load(); mid = w // 2
    empty = lambda x: all(px[x, y] >= thr for y in range(y0, y1))
    for d in range(0, int(w * 0.12)):
        for x in (mid - d, mid + d):
            if 2 <= x < w - 2 and empty(x) and empty(x - 1) and empty(x + 1):
                return x
    return None


def ink_box(im):
    return im.point(lambda v: 255 if v < 200 else 0).getbbox()


def reflow(im, bands):
    """本文の行を左右に分けて折り返した1枚の画像にする。"""
    pieces = []
    for (y0, y1) in bands:
        top, bot = max(0, y0 - 4), min(im.height, y1 + 4)
        x = split_x(im, y0, y1)
        if x:
            L = im.crop((0, top, x, bot)); R = im.crop((x, top, im.width, bot))
            lb, rb = ink_box(L), ink_box(R)
            pieces.append((L, 0))
            if rb: pieces.append((R.crop((rb[0], 0, rb[2], R.height)), lb[0] if lb else 0))
        else:
            pieces.append((im.crop((0, top, im.width, bot)), 0))
    W = max(p.width + i for p, i in pieces); H = sum(p.height for p, _ in pieces)
    out = Image.new("L", (W, H), 255); y = 0
    for p, i in pieces: out.paste(p, (i, y)); y += p.height
    b = ink_box(out)
    return out.crop((max(0, b[0] - 8), 0, min(W, b[2] + 8), H)) if b else out


def render(pdf, tmp):
    for f in glob.glob(os.path.join(tmp, "*.png")): os.remove(f)
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", pdf, os.path.join(tmp, "p")], check=True)
    return sorted(glob.glob(os.path.join(tmp, "p-*.png")))


def content(page_png):
    im = Image.open(page_png).convert("L"); w, h = im.size
    body = im.crop((int(w * .05), int(h * .03), int(w * .96), int(h * .94)))  # 端の線とページ番号を除く
    b = ink_box(body)
    return body.crop((max(0, b[0] - 10), max(0, b[1] - 10), min(body.width, b[2] + 10), min(body.height, b[3] + 10))) if b else None


def save_page(im, outdir, pid):
    quant(im).save(os.path.join(outdir, pid + ".png"), optimize=True)
    bands = bands_of(im)
    blocks, run = [], []
    def flush():
        if run: blocks.append(("t", reflow(im, run))); run.clear()
    for b in bands:
        if b[1] - b[0] <= LINE_MAX: run.append(b)
        else:
            flush()
            fig = im.crop((0, max(0, b[0] - 4), im.width, min(im.height, b[1] + 4)))
            fb = ink_box(fig)
            blocks.append(("f", fig.crop((max(0, fb[0] - 6), 0, min(fig.width, fb[2] + 6), fig.height)) if fb else fig))
    flush()
    kinds = ""
    for k, (t, b) in enumerate(blocks, start=1):
        quant(b).save(os.path.join(outdir, f"{pid}_{k}.png"), optimize=True); kinds += t
    return {"id": pid, "b": kinds}


def is_blank(im):
    return im is None or len([b for b in bands_of(im) if b[1] - b[0] > 6]) < 4  # 白紙・メモ用紙


def is_prob_start(im):
    """ページ先頭の行が、左端から始まる「問N」なら問題の書き出し（図表の見出し「図2」「表1」は除く）。"""
    bs = [b for b in bands_of(im) if b[1] - b[0] >= 10]  # 小さな点は行とみなさない
    if not bs or bs[0][1] - bs[0][0] > LINE_MAX: return False
    b0 = bs[0]
    x = ink_box(im.crop((0, b0[0], im.width, b0[1] + 1)))[0]
    if x > 80: return False
    _, t = head_num(im, [b0[0], b0[1], x])
    return bool(re.match(r"^[-ー－_~=.|'‐]?[問間][0-9０-９OolIＩ]", t))  # 「問題」などの本文と区別するため数字を必須にする


def build(key, pdfs, outdir, tmp):
    """pdfs: {"qs": path, "ans": path, "cmnt": path}。戻り値はアプリ用のメタデータ。"""
    os.makedirs(outdir, exist_ok=True)
    for f in glob.glob(os.path.join(outdir, "*.png")): os.remove(f)
    meta = {"probs": [], "ans": [], "cmnt": []}
    pages = render(pdfs["qs"], tmp)
    for pi, pg in enumerate(pages[1:-1], start=2):  # 表紙と裏表紙を除く
        im = content(pg)
        if is_blank(im): continue
        if is_prob_start(im):
            meta["probs"].append({"n": len(meta["probs"]) + 1, "pages": []})
        if not meta["probs"]:
            continue  # 最初の「問1」より前（注意事項の続きなど）
        meta["probs"][-1]["pages"].append(save_page(im, outdir, f"q{pi:02d}"))
    for kind in ("ans", "cmnt"):
        if not pdfs.get(kind): continue
        for pi, pg in enumerate(render(pdfs[kind], tmp), start=1):
            im = content(pg)
            if is_blank(im): continue
            meta[kind].append(save_page(im, outdir, f"{kind[0]}{pi:02d}"))
    return meta
