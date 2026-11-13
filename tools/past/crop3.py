"""午前II問題冊子のページ画像から1問ずつ切り出す（確定版）。
左端付近から始まる行の先頭だけを文字認識し、「問N」と読めた行を問題の書き出しとする。
問題数（午前IIは25問、午前Iは30問）だけ切り出す。表示に使うのはページの画像そのもの（文字認識の結果は位置合わせだけに使う）。"""
import os, re, subprocess, sys, glob, json, io
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from crop import lines_of
from crop2 import render, page_bands, save

def head_num(body, b):
    h = b[1] - b[0] + 1
    reg = body.crop((max(0, b[2] - 6), max(0, b[0] - 4), b[2] + int(h * 4.5), b[1] + 5))
    reg = reg.resize((reg.width * 2, reg.height * 2), Image.LANCZOS)
    buf = io.BytesIO(); reg.save(buf, "PNG")
    t = subprocess.run(["tesseract", "stdin", "stdout", "-l", "jpn", "--psm", "7"], input=buf.getvalue(), capture_output=True).stdout.decode()
    t = t.replace(" ", "").replace("　", "")
    # 「問」は別の漢字に誤読されることがあるため、「漢字1文字＋数字」で始まれば書き出しとみなす
    m = re.match(r"^[-ー－_~=.|'‐]?[\u3400-\u9fff]([0-9０-９OolIＩ]{1,2})", t)
    if not m:
        # 数字が読めなくても、行頭が「問」と読めれば書き出しとみなす（続きの行は字下げされているので取り違えない）
        return (0, t) if re.match(r"^[-ー－_~=.|'‐]?[問間]", t) else (None, t)
    d = m.group(1).translate(str.maketrans("０１２３４５６７８９OolIＩ", "0123456789" + "00111"))
    return int(d), t

def crop_set(pdf, tmp, count=25):
    pages = render(pdf, tmp)
    qs, nums, log = [], [], []
    for pi, pg in enumerate(pages[1:], start=2):
        body, bands = page_bands(pg)
        if not bands: continue
        w = body.width
        lefts = [b[2] for b in bands if b[2] >= 40]  # 左端ぎりぎりの線は余白の判定に使わない
        if not lefts: continue
        lm = min(lefts)
        cand = []
        for i, b in enumerate(bands):
            if b[2] < lm - 2 or b[2] > lm + 25 or b[2] > w * 0.3 or b[1] - b[0] > 45: continue  # 図のかたまりは行ではない
            n, t = head_num(body, b)
            exp = len(nums) + len(cand) + 1
            if n is not None:
                cand.append(i)
                if n != exp: log.append((exp, n))  # 番号の読み違い（位置合わせには使わない）
        def piece(i0, i1):
            top = max(0, bands[i0][0] - 10); bot = min(body.height, bands[i1][1] + 12)
            return body.crop((0, top, w, bot))
        first = cand[0] if cand else len(bands)
        if first > 0 and qs and len(qs) < count:
            qs[-1].append(piece(0, first - 1))
        for k, si in enumerate(cand):
            ei = (cand[k + 1] - 1) if k + 1 < len(cand) else len(bands) - 1
            qs.append([piece(si, ei)]); nums.append(len(nums) + 1)
        if len(qs) >= count and not cand: break
    return qs, log

if __name__ == "__main__":
    base = sys.argv[1]
    tmp = os.path.join(base, "tmp"); os.makedirs(tmp, exist_ok=True)
    res = json.load(open(os.path.join(base, "crop.json"))) if os.path.exists(os.path.join(base, "crop.json")) else {}
    keys = sys.argv[2:] or [os.path.basename(p).replace("_qs.pdf", "") for p in sorted(glob.glob(os.path.join(base, "pdf", "*_am[12]_qs.pdf")))]
    for key in keys:
        count = 30 if "_am1" in key else 25
        qs, log = crop_set(os.path.join(base, "pdf", key + "_qs.pdf"), tmp, count)
        outdir = os.path.join(base, "img", key); os.makedirs(outdir, exist_ok=True)
        for f in glob.glob(os.path.join(outdir, "*.png")): os.remove(f)
        meta = save(qs[:count], outdir); res[key] = meta
        hs = [m["h"] for m in meta]
        print(key, "found", len(qs), "min h", min(hs) if hs else 0, "max h", max(hs) if hs else 0, "multi-page", [m["n"] for m in meta if m["parts"] > 1], "odd", log[:4], flush=True)
    json.dump(res, open(os.path.join(base, "crop.json"), "w"), indent=1)
