"""2つの学習コーチを、ホーム画面に追加できるWebアプリ（PWA）として組み立てる。

使い方（リポジトリの直下で）:  python3 tools/build.py
  src/<アプリ>/ の部品（見た目 → データ → 処理の順）を1枚のHTMLにまとめ、
  リポジトリ直下に GitHub Pages で公開するファイルを書き出す。
    index.html               入口ページ
    sc/ , nespe/             各アプリ（index.html, manifest.webmanifest, sw.js, アイコン）
必要なもの: Python 3 と Pillow（アイコン画像の生成に使う）
"""
import hashlib, json, os, shutil
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = ROOT

RESET = (':root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);'
         'padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}'
         'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
         'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}')

APPS = [
    {"dir": "sc", "parts": ["h_head.html", "d1_quiz.js", "d2_write.js", "d_past.js", "e_engine.js"], "name": "支援士合格コーチ", "short": "支援士コーチ",
     "light": "#FFFFFF", "dark": "#15211E", "bg": "#F1F5F4", "color": (11, 110, 95), "icon": "shield",
     "desc": "情報処理安全確保支援士試験の学習計画づくり、4択・記述・事例演習、進捗管理"},
    {"dir": "nespe", "parts": ["h_head.html", "d_exam.js", "d_data.js", "d_cases.js", "d_past.js", "e_engine.js"], "name": "ネスペ合格コーチ", "short": "ネスペコーチ",
     "light": "#FFFFFF", "dark": "#16212A", "bg": "#F2F5F7", "color": (31, 111, 178), "icon": "port",
     "desc": "ネットワークスペシャリスト試験の学習計画づくり、4択・記述・事例演習、進捗管理"},
]


def icon(kind, color, size):
    """背景は全面塗り（iOS が角を丸める）。中央に白い記号を描く。"""
    S = 1024
    im = Image.new("RGB", (S, S), color)
    d = ImageDraw.Draw(im)
    w = (255, 255, 255)
    if kind == "shield":
        pts = [(512, 170), (780, 270), (780, 500), (740, 640), (640, 760), (512, 850), (384, 760), (284, 640), (244, 500), (244, 270)]
        d.polygon(pts, outline=w, width=52)
        d.ellipse((452, 400, 572, 520), fill=w)
        d.rounded_rectangle((482, 480, 542, 650), radius=20, fill=w)
        d.ellipse((700, 190, 790, 280), fill=(120, 230, 150))
    else:
        d.rounded_rectangle((232, 300, 792, 720), radius=40, outline=w, width=52)
        d.rectangle((392, 700, 632, 800), fill=color)
        d.line((392, 720, 392, 800), fill=w, width=52)
        d.line((632, 720, 632, 800), fill=w, width=52)
        d.line((366, 800, 658, 800), fill=w, width=52)
        d.rounded_rectangle((300, 370, 380, 430), radius=10, fill=(120, 230, 150))
        d.rounded_rectangle((644, 370, 724, 430), radius=10, fill=(245, 190, 80))
    return im.resize((size, size), Image.LANCZOS)


def build_app(a):
    out = os.path.join(OUT, a["dir"])
    os.makedirs(out, exist_ok=True)
    rd = lambda f: open(os.path.join(ROOT, "src", a["dir"], f), encoding="utf-8").read()
    page = rd(a["parts"][0]) + "<script>\n" + "".join(rd(f) for f in a["parts"][1:]) + "</script>\n"
    for s in (180, 192, 512):
        icon(a["icon"], a["color"], s).save(os.path.join(out, f"icon-{s}.png"), optimize=True)
    head = (
        '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        f'<meta name="description" content="{a["desc"]}">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
        f'<meta name="apple-mobile-web-app-title" content="{a["short"]}">'
        f'<meta name="theme-color" content="{a["light"]}" media="(prefers-color-scheme: light)">'
        f'<meta name="theme-color" content="{a["dark"]}" media="(prefers-color-scheme: dark)">'
        '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png">'
        '<link rel="icon" type="image/png" href="icon-192.png">'
        f'<style>{RESET}</style></head><body>\n'
    )
    sw_reg = ('\n<script>if ("serviceWorker" in navigator) addEventListener("load", () => '
              'navigator.serviceWorker.register("sw.js").catch(() => {}));</script>\n')
    html = head + page + sw_reg + "</body></html>\n"
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
    manifest = {
        "name": a["name"], "short_name": a["short"], "description": a["desc"], "lang": "ja",
        "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": a["bg"], "theme_color": a["light"],
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    open(os.path.join(out, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    ver = hashlib.sha256(html.encode()).hexdigest()[:10]
    sw = f"""// オフラインでも開けるようにする。画面は通信できればいつも最新版を取り、できなければ保存済みの版を使う
const CACHE = "{a['dir']}-{ver}";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); }});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("{a['dir']}-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.mode === "navigate") {{
    e.respondWith(fetch(r).then(res => {{ const c = res.clone(); caches.open(CACHE).then(x => x.put("./index.html", c)); return res; }})
      .catch(() => caches.match("./index.html")));
    return;
  }}
  // それ以外（過去問の画像など）は、一度読み込んだものを保存しておき、次からはオフラインでも表示する
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {{
    if (res.ok) {{ const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }}
    return res;
  }})));
}});
"""
    open(os.path.join(out, "sw.js"), "w", encoding="utf-8").write(sw)


def build_portal():
    cards = "".join(
        f'<a class="app" href="{a["dir"]}/"><img src="{a["dir"]}/icon-192.png" alt="" width="64" height="64">'
        f'<span><strong>{a["name"]}</strong><small>{a["desc"]}</small></span></a>' for a in APPS)
    html = f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>試験合格コーチ</title>
<meta name="description" content="情報処理技術者試験の学習を、チャット形式で伴走する2つのアプリ">
<link rel="icon" type="image/png" href="sc/icon-192.png">
<style>
/* Layout: 1カラム。アプリへの入口カード2枚と、ホーム画面への追加方法 */
:root {{ --bg: #F3F5F6; --surface: #FFFFFF; --ink: #16212A; --muted: #56636E; --line: #D5DDE2; --accent: #1F6FB2; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #0E151B; --surface: #16212A; --ink: #E2E9EF; --muted: #97A8B6; --line: #2A3A47; --accent: #5BA7E9; color-scheme: dark; }} }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.7 "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }}
main {{ max-width: 560px; margin: 0 auto; display: grid; gap: 16px; }}
h1 {{ font-size: 22px; margin: 0; text-wrap: balance; }}
p {{ margin: 0; color: var(--muted); }}
.app {{ display: grid; grid-template-columns: 64px 1fr; gap: 14px; align-items: center; padding: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; color: inherit; text-decoration: none; }}
.app img {{ border-radius: 14px; }}
.app span {{ display: grid; min-width: 0; }}
.app small {{ color: var(--muted); font-size: 13px; }}
.app:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 2px; }}
section {{ background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }}
h2 {{ font-size: 15px; margin: 0 0 6px; }}
ol {{ margin: 0; padding-left: 1.3em; }}
</style></head><body><main>
<h1>試験合格コーチ</h1>
<p>使いたいアプリを開いてください。記録はそれぞれの端末の中に保存されます。</p>
{cards}
<section><h2>iPhoneのホーム画面に追加する</h2><ol>
<li>Safariで使いたいアプリを開く</li>
<li>画面下の共有ボタン（四角から上向きの矢印）を押す</li>
<li>「ホーム画面に追加」を選び、「追加」を押す</li>
</ol><p style="margin-top:6px">ホーム画面のアイコンから開くと、全画面のアプリとして動き、通信できない場所でも使えます。2つとも使う場合は、それぞれ追加してください。</p></section>
</main></body></html>
"""
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)


if __name__ == "__main__":
    for a in APPS:
        # 生成するファイルだけを消す（past/ の過去問画像は tools/past/make_past.py が作るので残す）
        for f in ("index.html", "manifest.webmanifest", "sw.js", "icon-180.png", "icon-192.png", "icon-512.png"):
            fp = os.path.join(OUT, a["dir"], f)
            if os.path.exists(fp): os.remove(fp)
        build_app(a)
    build_portal()
    print("built", OUT)
