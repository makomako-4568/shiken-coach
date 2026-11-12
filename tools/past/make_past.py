"""IPAの過去問（午前II）を取り込み、アプリ用の画像と正解データを作り直す。

使い方（リポジトリの直下で）:  python3 tools/past/make_past.py 2021r03 2022r04 2023r05 2024r06 2025r07
  1. IPAの年度別ページから、支援士（sc）とネスペ（nw）の午前II・午後のPDFの場所を集める
  2. 午前IIの問題冊子と解答例のPDFをダウンロードする
  3. 問題冊子のページを画像にし、1問ずつ切り出す（crop3.py）。スマホ向けの折り返し版も作る（narrow.py）
  4. 解答例PDFから正解を読み取る
  5. sc/past/, nespe/past/ に画像を、src/<アプリ>/d_past.js にデータを書き出す
その後 python3 tools/build.py でアプリを組み立て直す。

必要なもの: Python 3、Pillow、poppler-utils（pdftoppm, pdftotext）、poppler-data、tesseract-ocr と tesseract-ocr-jpn
  文字認識は「問N」の位置を見つけるためだけに使う。表示するのはPDFのページ画像そのもの。
  問題冊子PDFは文字のコピーが禁止されているため、問題文を文字として取り出すことはしない。
利用条件: IPAの「試験に関するよくある質問」の「その他」にある過去問題の使用の留意点に従い、出典を明記する。
"""
import glob, json, os, re, shutil, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.path.join(ROOT, ".past-work")  # 作業用（.gitignore 済み）
sys.path.insert(0, HERE)
from crop3 import crop_set          # noqa: E402
from crop2 import save               # noqa: E402
from narrow import narrow            # noqa: E402

IPA = "https://www.ipa.go.jp"
APPS = {"sc": ("sc", "情報処理安全確保支援士試験"), "nw": ("nespe", "ネットワークスペシャリスト試験")}
HEADER = ("/* ===== IPA公表の過去問（午前II）と午後の過去問へのリンク（tools/past/make_past.py が生成）\n"
          "   問題は、IPAが公表している問題冊子PDFのページを1問ずつ切り出した画像で表示する（文字の書き換えはしていない）。\n"
          "   スマホ向けに、行を左右に分けて折り返した画像（qNNn.png）も用意している。正解はIPA公表の解答例による。\n"
          "   出典の表記はIPAの案内（試験に関するよくある質問「その他」）に従う ===== */\n")


def get(url, path=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (study-app builder)"})
    data = urllib.request.urlopen(req, timeout=60).read()
    if path:
        open(path, "wb").write(data)
    return data


def main(years):
    os.makedirs(os.path.join(WORK, "pdf"), exist_ok=True)
    links = {}
    for y in years:
        html = get(f"{IPA}/shiken/mondai-kaiotu/{y}.html").decode("utf-8", "replace")
        for u in sorted(set(re.findall(r'href="([^"]*_(?:sc|nw)_(?:pm\d?|am2)_(?:qs|ans|cmnt)\.pdf)"', html))):
            m = re.match(r"(\d{4}r\d\d)([ah])_(sc|nw)_(pm\d?|am2)_(qs|ans|cmnt)\.pdf", u.split("/")[-1])
            key = m.group(1) + m.group(2) + "_" + m.group(3)
            links.setdefault(key, {}).setdefault(m.group(4), {})[m.group(5)] = IPA + u
    sets = {"sc": [], "nw": []}
    tmp = os.path.join(WORK, "tmp"); os.makedirs(tmp, exist_ok=True)
    for key in sorted(links, key=lambda k: (k[:7], k[7] == "a"), reverse=True):
        am2 = links[key].get("am2", {})
        if "qs" not in am2 or "ans" not in am2:
            continue
        code = key.split("_")[1]; app, exam = APPS[code]
        qs_pdf = os.path.join(WORK, "pdf", key + "_am2_qs.pdf"); ans_pdf = os.path.join(WORK, "pdf", key + "_am2_ans.pdf")
        if not os.path.exists(qs_pdf): get(am2["qs"], qs_pdf)
        if not os.path.exists(ans_pdf): get(am2["ans"], ans_pdf)
        # 正解
        t = subprocess.run(["pdftotext", "-layout", ans_pdf, "-"], capture_output=True, text=True).stdout
        head = re.search(r"令和\s*(\d+)\s*年度\s*(春期|秋期)\s*(\S+試験)", t)
        pairs = re.findall(r"問\s*(\d+)\s+([アイウエ])", t.split("午後")[0])
        ans = {int(n): a for n, a in pairs}
        if not head or head.group(3) != exam or len(ans) != 25:
            print("skip（正解を読み取れない）:", key); continue
        # 問題画像
        qs, _ = crop_set(qs_pdf, tmp)
        if len(qs) != 25:
            print("skip（25問に切り出せない）:", key, len(qs)); continue
        out = os.path.join(ROOT, app, "past", key)
        shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
        save(qs, out)
        for f in sorted(glob.glob(os.path.join(out, "q??.png"))):
            narrow(f, f.replace(".png", "n.png"))
        label = f"令和{head.group(1)}年度 {head.group(2)}"
        parts = []
        for part, name in [("am2", "午前II"), ("pm", "午後"), ("pm1", "午後I"), ("pm2", "午後II")]:
            if part in links[key]:
                d = links[key][part]; parts.append({"name": name, "qs": d.get("qs"), "ans": d.get("ans"), "cmnt": d.get("cmnt")})
        sets[code].append({"key": key, "label": label, "src": f"{label} {exam} 午前Ⅱ", "ans": "".join(ans[n] for n in range(1, 26)), "pdf": parts})
        print("ok:", key, label)
    for code, (app, _) in APPS.items():
        js = HEADER + "const PAST = " + json.dumps(sets[code], ensure_ascii=False, indent=1) + ";\n"
        open(os.path.join(ROOT, "src", app, "d_past.js"), "w", encoding="utf-8").write(js)


if __name__ == "__main__":
    main(sys.argv[1:] or ["2021r03", "2022r04", "2023r05", "2024r06", "2025r07"])
