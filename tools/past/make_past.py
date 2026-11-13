"""IPAの過去問を取り込み、アプリ用の画像と正解データを作り直す。

使い方（リポジトリの直下で）:  python3 tools/past/make_past.py [2021r03 2022r04 ...]
  対象: 支援士（sc）とネスペ（nw）の科目A-2（午前II）、高度試験共通の科目A-1（午前I）、
        午後（支援士の科目B・旧午後II、ネスペの午後II）
  1. IPAの年度別ページから、PDFの場所を集めてダウンロードする（作業用フォルダ .past-work/）
  2. 午前I・午前II: 問題冊子のページを画像にして1問ずつ切り出す（crop3.py）。スマホ向けの折り返し版も作る（narrow.py）
     正解は解答例PDFから読み取る（文字が入っていないPDFは止まるので、画像を見て ANSWER_OVERRIDES に書く）
  3. 午後: 問題冊子・解答例・採点講評をページ画像にし、問ごとにまとめる（pm_pages.py）
  4. 画像を sc/past/, nespe/past/, common/am1/, sc/pm/, nespe/pm/ に、データを src/<アプリ>/d_past.js に書き出す
その後 python3 tools/build.py でアプリを組み立て直す。

必要なもの: Python 3、Pillow、poppler-utils（pdftoppm, pdftotext）、poppler-data、tesseract-ocr と tesseract-ocr-jpn
  文字認識は「問N」の位置を見つけるためだけに使う。表示するのはPDFのページ画像そのもの。
  問題冊子PDFは文字のコピーが禁止されているため、問題文を文字として取り出すことはしない。
利用条件: IPAの「試験に関するよくある質問」の「その他」にある過去問題の使用の留意点に従い、出典を明記する。
"""
import glob, json, os, re, shutil, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.environ.get("PAST_WORK", os.path.join(ROOT, ".past-work"))  # 作業用（.gitignore 済み）
sys.path.insert(0, HERE)

IPA = "https://www.ipa.go.jp"
EXAM = {"sc": "情報処理安全確保支援士試験", "nw": "ネットワークスペシャリスト試験", "koudo": "高度試験・情報処理安全確保支援士試験"}
APP = {"sc": "sc", "nw": "nespe"}
# 文字が入っていない解答例PDFの正解（画像を目で読み、字形の分類で照合したもの）
ANSWER_OVERRIDES = {"2022r04h_koudo_am1": "アアエイウイウウアイエアエウウイアエウエイアイウアウエウイエ"}
HEADER = ("/* ===== IPAの過去問（tools/past/make_past.py が生成）\n"
          "   a2: 科目A-2（午前II）、a1: 科目A-1（午前I・高度試験共通）、pm: 午後の本番演習\n"
          "   問題は、IPAが公表しているPDFのページを画像にして表示する（文字の書き換えはしていない）。\n"
          "   スマホ向けに、行を左右に分けて折り返した画像も用意している。正解はIPA公表の解答例による。\n"
          "   出典の表記はIPAの案内（試験に関するよくある質問「その他」）に従う ===== */\n")
TERM = {"h": "春期", "a": "秋期"}


def label_of(key):
    return f"令和{int(key[5:7])}年度 {TERM[key[7]]}"


def get(url, path=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (study-app builder)"})
    data = urllib.request.urlopen(req, timeout=60).read()
    if path: open(path, "wb").write(data)
    return data


def collect_links(years):
    """{"2025r07a_sc": {"am2": {"qs":url,...}, "pm": {...}}, "2025r07a_koudo": {"am1": {...}}}"""
    links = {}
    for y in years:
        html = get(f"{IPA}/shiken/mondai-kaiotu/{y}.html").decode("utf-8", "replace")
        for u in sorted(set(re.findall(r'href="([^"]*_(?:sc|nw|koudo)_(?:pm\d?|am[12])_(?:qs|ans|cmnt)\.pdf)"', html))):
            m = re.match(r"(\d{4}r\d\d)([ah])_(sc|nw|koudo)_(pm\d?|am[12])_(qs|ans|cmnt)\.pdf", u.split("/")[-1])
            links.setdefault(m.group(1) + m.group(2) + "_" + m.group(3), {}).setdefault(m.group(4), {})[m.group(5)] = IPA + u
    return links


def read_answers(pdf, count, key):
    if key in ANSWER_OVERRIDES: return ANSWER_OVERRIDES[key]
    t = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    ans = {int(n): a for n, a in re.findall(r"問\s*(\d+)\s+([アイウエ])", t.split("午後")[0])}
    if len(ans) != count:
        raise SystemExit(f"{key}: 正解を{count}問分読み取れない（{len(ans)}問）。画像を見て ANSWER_OVERRIDES に追加してください")
    return "".join(ans[n] for n in range(1, count + 1))


def assemble(links, answers, pm_meta):
    """answers: {"2025r07a_sc_am2": "ア…", "2025r07a_koudo_am1": "…"}、pm_meta: {"2025r07a_sc_pm": pm_pages.build の戻り値}"""
    order = lambda k: (k[:7], k[7] == "a")
    a1 = []
    for key in sorted((k for k in answers if k.endswith("_koudo_am1")), key=order, reverse=True):
        lk = key[:8] + "_koudo"; lab = label_of(key)
        d = links.get(lk, {}).get("am1", {})
        a1.append({"key": key, "label": lab, "subj": "科目A-1", "min": 50, "dir": "../common/am1",
                   "src": f"{lab} {EXAM['koudo']} 午前Ⅰ", "ans": answers[key], "pdf": {"qs": d.get("qs"), "ans": d.get("ans")}})
    for code in ("sc", "nw"):
        a2 = []
        for key in sorted((k for k in answers if k.endswith(f"_{code}_am2")), key=order, reverse=True):
            lk = key.replace("_am2", ""); lab = label_of(key); L = links.get(lk, {})
            parts = [{"name": n, **L[p]} for p, n in [("pm", "午後"), ("pm1", "午後I"), ("pm2", "午後II")] if p in L]
            a2.append({"key": lk, "label": lab, "subj": "科目A-2", "min": 40, "dir": "past", "src": f"{lab} {EXAM[code]} 午前Ⅱ",
                       "ans": answers[key], "pdf": {"qs": L.get("am2", {}).get("qs"), "ans": L.get("am2", {}).get("ans")}, "pm": parts})
        pm = []
        for key in sorted((k for k in pm_meta if f"_{code}_pm" in k), key=order, reverse=True):
            lab = label_of(key); m = pm_meta[key]; part = key.split("_")[-1]
            if code == "sc" and part == "pm": subj, mins, pick, nm = "科目B", 150, "4問中2問を選んで解答", "午後"
            elif code == "sc": subj, mins, pick, nm = "旧午後II", 120, "2問中1問を選んで解答", "午後Ⅱ"
            else: subj, mins, pick, nm = "科目B-2（旧午後II）", 120, "2問中1問を選んで解答", "午後Ⅱ"
            pm.append({"key": key, "label": lab, "subj": subj, "min": mins, "pick": pick, "dir": "pm", "src": f"{lab} {EXAM[code]} {nm}",
                       "subjAll": "科目B・旧午後II" if code == "sc" else "科目B-2", "probs": m["probs"], "ans": m["ans"], "cmnt": m["cmnt"]})
        data = {"a2": a2, "a1": a1, "pm": pm}
        js = HEADER + "const PAST = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
        open(os.path.join(ROOT, "src", APP[code], "d_past.js"), "w", encoding="utf-8").write(js)


def main(years):
    from crop3 import crop_set
    from crop2 import save
    from narrow import narrow
    from pm_pages import build
    pdfdir = os.path.join(WORK, "pdf"); tmp = os.path.join(WORK, "tmp")
    os.makedirs(pdfdir, exist_ok=True); os.makedirs(tmp, exist_ok=True)
    links = collect_links(years)
    answers, pm_meta = {}, {}
    for lk, parts in links.items():
        code = lk.split("_")[1]
        for part, d in parts.items():
            key = f"{lk}_{part}"
            paths = {}
            for kind, url in d.items():
                paths[kind] = os.path.join(pdfdir, f"{key}_{kind}.pdf")
                if not os.path.exists(paths[kind]): get(url, paths[kind])
            if part in ("am1", "am2") and "qs" in paths and "ans" in paths:
                count = 30 if part == "am1" else 25
                answers[key] = read_answers(paths["ans"], count, key)
                qs, _ = crop_set(paths["qs"], tmp, count)
                if len(qs) != count: raise SystemExit(f"{key}: {count}問に切り出せない（{len(qs)}問）")
                out = os.path.join(ROOT, "common", "am1", key) if part == "am1" else os.path.join(ROOT, APP[code], "past", lk)
                shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
                save(qs, out)
                for f in sorted(glob.glob(os.path.join(out, "q??.png"))): narrow(f, f.replace(".png", "n.png"))
            elif part.startswith("pm") and code in APP and part in (("pm", "pm2") if code == "sc" else ("pm2",)) and "qs" in paths:
                pm_meta[key] = build(key, paths, os.path.join(ROOT, APP[code], "pm", key), tmp)
            print("ok:", key, flush=True)
    assemble(links, answers, pm_meta)


if __name__ == "__main__":
    main(sys.argv[1:] or ["2021r03", "2022r04", "2023r05", "2024r06", "2025r07"])
