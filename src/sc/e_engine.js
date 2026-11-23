
/* ===== 日付ユーティリティ（すべてローカル日付の YYYY-MM-DD 文字列で扱う） ===== */
const DAY = 864e5;
const parseLocal = s => new Date(s + "T00:00:00");
function todayStr(d = new Date()) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function addDays(s, n) { const d = parseLocal(s); d.setDate(d.getDate() + n); return todayStr(d); }
function diff(a, b) { return Math.round((parseLocal(b) - parseLocal(a)) / DAY); }
function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && todayStr(parseLocal(s)) === s; }
const maxD = (a, b) => (a > b ? a : b);
function md(d) { return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + "/" : "") + (d.getMonth()+1) + "/" + d.getDate(); }
const mds = s => md(parseLocal(s));
const slash = s => s.replace(/-/g, "/");
function hm(min) { const h = Math.floor(min / 60), m = min % 60; return (h ? h + "時間" : "") + (m ? m + "分" : "") || "0分"; }

/* ===== 状態 ===== */
const KEY = "sc-coach-v1";
const DKEY = KEY + "-draft";
const SCHEMA = 3;
const TARGETS = ["r8b", "late", "next"];
const HOURS = [5, 10, 15, 20];
const H_MIN = 1, H_MAX = 60;
const validHours = h => Number.isInteger(h) && h >= H_MIN && h <= H_MAX;
const QIDS = new Set(QUIZ.map(q => q.id)), WIDS = new Set(WRITE.map(w => w.id)), CIDS = new Set(CASES.map(c => c.id));
const blank = () => ({ v: SCHEMA, at: 0, profile: null, stats: {}, last: {}, write: {}, cases: {}, past: {}, pm: {}, pmrun: null, days: [], done: "", ob: null, sess: null, log: {}, qt: {} });
const HAS_PAST = typeof PAST !== "undefined" && PAST && Array.isArray(PAST.a2) && PAST.a2.length > 0;
const PID = (key, n) => key + "-" + n;
// 途中の演習（4択・過去問・事例）。1問ごとに保存し、メニューの「続きから」で再開する
const PSETS = HAS_PAST ? PAST.a2.concat(PAST.a1 || []) : [];
function pastItem(pid) {
  if (typeof pid !== "string") return null;
  const j = pid.lastIndexOf("-"), set = PSETS.find(s => s.key === pid.slice(0, j)), n = Number(pid.slice(j + 1));
  return set && Number.isInteger(n) && n >= 1 && n <= set.ans.length ? { set, n } : null;
}
function cleanSess(x) {
  if (!x || typeof x !== "object") return null;
  const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  if (x.k === "quiz" && Array.isArray(x.ids) && x.ids.length && x.ids.length <= 50 && x.ids.every(id => QIDS.has(id)) && int(x.i, x.ids.length - 1) && int(x.ok, x.i))
    return { k: "quiz", ids: x.ids.slice(), i: x.i, ok: x.ok, today: x.today === true, box: x.box === true };
  if (x.k === "past" && Array.isArray(x.items) && x.items.length && x.items.length <= 40 && x.items.every(pastItem) && int(x.i, x.items.length) && int(x.ok, x.items.length)) {
    const ans = x.items.map((_, j) => Array.isArray(x.ans) && [0, 1, 2, 3].includes(x.ans[j]) ? x.ans[j] : null);
    return { k: "past", items: x.items.slice(), i: x.i, ok: x.ok, exam: x.exam === true, ans, ms: Number.isFinite(x.ms) && x.ms >= 0 ? x.ms : 0, intro: typeof x.intro === "string" ? x.intro.slice(0, 300) : "" };
  }
  if (x.k === "case" && CIDS.has(x.id)) {
    const c = CASES.find(c => c.id === x.id);
    if (int(x.i, c.qs.length - 1) && x.i > 0 && Number.isFinite(x.score) && x.score >= 0 && x.score <= x.i) return { k: "case", id: x.id, i: x.i, score: x.score };
  }
  return null;
}
// 最初の設定の途中経過（再開用）を検査して取り込む
function cleanA(a) {
  const o = { weak: Array.isArray(a.weak) ? a.weak.filter(k => DOMAINS[k]) : [], exp: ["none", "some", "pro"].includes(a.exp) ? a.exp : "some", amI: ["exempt", "none", "unknown"].includes(a.amI) ? a.amI : "none" };
  if (TARGETS.includes(a.target)) o.target = a.target;
  if (validHours(a.hours)) o.hours = a.hours;
  if (isDate(a.exam)) o.exam = a.exam;
  if (isDate(a.aDate)) o.aDate = a.aDate;
  return o;
}
function migrate(d) {
  const s = blank();
  if (!d || typeof d !== "object" || Array.isArray(d)) return s;
  const t = todayStr();
  const p = d.profile;
  if (p && typeof p === "object" && TARGETS.includes(p.target) && isDate(p.exam) && validHours(p.hours) && Array.isArray(p.weak)) {
    s.profile = {
      target: p.target,
      amI: ["exempt", "none", "unknown"].includes(p.amI) ? p.amI : "none",
      exp: ["none", "some", "pro"].includes(p.exp) ? p.exp : "some",
      hours: p.hours,
      weak: p.weak.filter(k => DOMAINS[k]),
      exam: p.exam,
      start: isDate(p.start) && p.start <= p.exam ? p.start : (t < p.exam ? t : p.exam),
      aDate: p.target === "late" && isDate(p.aDate) && p.aDate < p.exam ? p.aDate : ""
    };
  }
  const obj = o => o && typeof o === "object" && !Array.isArray(o) ? o : {};
  for (const [k, v] of Object.entries(obj(d.stats))) if (DOMAINS[k] && v && Number.isInteger(v.n) && Number.isInteger(v.c) && v.c >= 0 && v.c <= v.n) s.stats[k] = { c: v.c, n: v.n };
  for (const [k, v] of Object.entries(obj(d.last))) if (QIDS.has(k) && typeof v === "boolean") s.last[k] = v;
  for (const [k, v] of Object.entries(obj(d.qt))) if (QIDS.has(k) && v && [0, 1, 2, 3, 4].includes(v.r) && isDate(v.t)) s.qt[k] = { r: v.r, t: v.t };
  for (const [k, v] of Object.entries(obj(d.write))) {
    if (!WIDS.has(k)) continue;
    if ([0, 1, 2].includes(v)) s.write[k] = { r: v, t };
    else if (v && [0, 1, 2].includes(v.r) && isDate(v.t)) s.write[k] = { r: v.r, t: v.t };
  }
  for (const [k, v] of Object.entries(obj(d.cases))) if (CIDS.has(k) && v && Number.isFinite(v.p) && v.p >= 0 && v.p <= 100 && isDate(v.t)) s.cases[k] = { p: v.p, t: v.t };
  for (const [k, v] of Object.entries(obj(d.past))) if (/^\d{4}r\d\d[ah]_(sc|nw|koudo_am1)-\d{1,2}$/.test(k) && v && typeof v.ok === "boolean" && isDate(v.t)) s.past[k] = { ok: v.ok, t: v.t };
  for (const [k, v] of Object.entries(obj(d.pm))) if (/^\d{4}r\d\d[ah]_(sc|nw)_pm2?$/.test(k) && v && [0, 1, 2, 3].includes(v.g) && Number.isFinite(v.min) && isDate(v.t)) s.pm[k] = { g: v.g, min: v.min, t: v.t };
  const r = d.pmrun;
  if (r && typeof r === "object" && /^\d{4}r\d\d[ah]_(sc|nw)_pm2?$/.test(r.key) && Number.isFinite(r.start)) s.pmrun = { key: r.key, start: r.start, paused: Number.isFinite(r.paused) ? r.paused : 0, pauseAt: Number.isFinite(r.pauseAt) ? r.pauseAt : 0, memo: typeof r.memo === "string" ? r.memo.slice(0, 5000) : "", seen: Number.isFinite(r.seen) ? r.seen : 0, hide: r.hide === true };
  // 演習中にアプリが終了したときは、最後に画面を見ていた時刻で止める
  if (s.pmrun && !s.pmrun.pauseAt && s.pmrun.seen) s.pmrun.pauseAt = Math.max(s.pmrun.start, s.pmrun.seen);
  if (Array.isArray(d.days)) s.days = d.days.filter(isDate).slice(-120);
  if (isDate(d.done)) s.done = d.done;
  for (const [k, v] of Object.entries(obj(d.log))) if (isDate(k) && v && Number.isInteger(v.n) && v.n >= 0 && Number.isFinite(v.ms) && v.ms >= 0) s.log[k] = { n: v.n, ms: v.ms };
  Object.keys(s.log).sort().slice(0, -60).forEach(k => delete s.log[k]);
  s.sess = cleanSess(d.sess);
  if (Number.isFinite(d.at) && d.at > 0) s.at = d.at;
  if (!s.profile && d.ob && typeof d.ob === "object" && d.ob.A && typeof d.ob.A === "object" && Number.isInteger(d.ob.i) && d.ob.i >= 0 && d.ob.i < 20) {
    const A = cleanA(d.ob.A);
    if (A.target) s.ob = { A, i: d.ob.i };
  }
  return s;
}
let S = blank(), storageOK = true, storageNotice = false;
try { S = migrate(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { S = blank(); }
try { localStorage.setItem(KEY + "-probe", "1"); localStorage.removeItem(KEY + "-probe"); } catch (e) { storageOK = false; storageNotice = true; }
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { if (storageOK) { storageOK = false; storageNotice = true; } }
}
function save() { S.at = Date.now(); saveLocal(); renderStatus(); queueCloud(); }

/* ===== クラウド保存
   Claudeの保存領域（db）の、閲覧している本人だけが読み書きできる場所（data/users/<本人のID>/）に記録を置く。
   アプリを閉じても、別の端末で開いても続きから再開できる。使えない環境ではブラウザ内だけに保存する ===== */
let cloud = null, cloudBusy = false, cloudDirty = false, cloudTimer = 0;
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
async function cloudInit() {
  try {
    if (!window.claude || typeof window.claude.use !== "function") return;
    const got = await withTimeout(Promise.all([window.claude.use("db"), window.claude.use("user")]), 8000);
    if (!got || !got[0] || !got[1]) return;
    const uid = await withTimeout(got[1].id(), 5000);
    if (!uid) return;
    const ref = got[0].doc("data/users/" + uid + "/" + KEY);
    const snap = await withTimeout(ref.get(), 8000);
    if (!snap) return;
    cloud = ref;
    let remote = null;
    if (snap.exists) { try { const b = snap.data(); remote = migrate(JSON.parse(b.s)); } catch (e) { remote = null; } }
    if (remote && remote.at > (S.at || 0)) { S = remote; saveLocal(); }
    else if ((S.at || 0) > (remote ? remote.at : 0)) pushCloud();
  } catch (e) { cloud = null; }
}
function queueCloud() { if (!cloud) return; clearTimeout(cloudTimer); cloudTimer = setTimeout(pushCloud, 800); }
async function pushCloud() {
  if (!cloud) return;
  if (cloudBusy) { cloudDirty = true; return; }
  cloudBusy = true;
  try { await cloud.set({ v: SCHEMA, at: S.at || Date.now(), s: JSON.stringify(S) }); }
  catch (e) {
    const code = e && e.code;
    if (code === "unavailable" || code === "resource_exhausted") { clearTimeout(cloudTimer); cloudTimer = setTimeout(pushCloud, 2000 + Math.random() * 2000); }
    else { cloud = null; storageNotice = !storageOK; }
  } finally {
    cloudBusy = false;
    if (cloudDirty) { cloudDirty = false; pushCloud(); }
  }
}
// 画面を閉じる・切り替えるときは待たずに保存する。午後の演習中なら、離れている間は時間を止める
let pmActive = null;
function pmHide() { const r = pmActive; if (r && !r.pauseAt) { r.pauseAt = Date.now(); saveLocal(); } }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { pmHide(); if (cloud) { clearTimeout(cloudTimer); pushCloud(); } return; }
  const r = pmActive;
  if (r && r.pauseAt) {
    const gap = Date.now() - r.pauseAt;
    r.paused += gap; r.pauseAt = 0; save();
    if (gap >= 60000) coach("<p>画面を離れていた約" + Math.round(gap / 60000) + "分は、時間を止めておきました。</p>", 0);
  }
});
window.addEventListener("pagehide", pmHide);
// 記述の下書き（問題ごと）。「やめる」でも消さず、次に同じ問題を開くと続きから書ける
function draftMap() {
  try {
    const d = JSON.parse(localStorage.getItem(DKEY) || "null");
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    if (typeof d.id === "string" && typeof d.text === "string") return d.text ? { [d.id]: d.text } : {};
    const o = {};
    for (const [k, v] of Object.entries(d)) if (typeof v === "string" && v) o[k] = v.slice(0, 6000);
    return o;
  } catch (e) { return {}; }
}
function loadDraft(id) { return draftMap()[id] || ""; }
function saveDraft(id, text) { try { const m = draftMap(); if (text) m[id] = text; else delete m[id]; localStorage.setItem(DKEY, JSON.stringify(m)); } catch (e) {} }
function clearDrafts() { try { localStorage.removeItem(DKEY); } catch (e) {} }
const writeDrafts = () => WRITE.filter(w => loadDraft(w.id).trim());

const norm = s => String(s).normalize("NFKC").toUpperCase().replace(/\s/g, "");
const clen = s => [...String(s).replace(/\s/g, "")].length;

/* ===== 開発用のデータ検証（コンソールに出る） ===== */
function grade(ans, item) {
  const A = norm(ans);
  let best = null;
  for (const g of [item.k].concat(item.alt || [])) {
    const hits = g.map(grp => grp.some(k => A.includes(norm(k))));
    const h = hits.filter(Boolean).length;
    if (!best || h / g.length > best.h / best.g.length) best = { g, hits, h };
  }
  return best;
}
(function validate() {
  const ids = new Set();
  const uniq = id => { console.assert(!ids.has(id), "重複ID", id); ids.add(id); };
  let longest = 0;
  for (const q of QUIZ) {
    uniq(q.id);
    console.assert(DOMAINS[q.d] && q.c.length === 4 && new Set(q.c).size === 4 && q.q && q.e, "4択データ不正", q.id);
    const L = q.c.map(c => [...c].length);
    if (L[0] > Math.max(...L.slice(1))) longest++;
  }
  console.assert(longest / QUIZ.length <= .3, "正解が最長の選択肢に偏っている", longest + "/" + QUIZ.length);
  const textOK = (w, id) => console.assert(Number.isInteger(w.lim) && clen(w.a) <= w.lim && w.k.every(g => g.length) && grade(w.a, w).h === w.k.length && w.note, "記述データ不正", id);
  for (const w of WRITE) { uniq(w.id); console.assert(DOMAINS[w.d] && w.s && w.q, "記述データ不正", w.id); textOK(w, w.id); }
  for (const c of CASES) {
    uniq(c.id);
    console.assert(DOMAINS[c.d] && c.fig && c.qs.length, "事例データ不正", c.id);
    c.qs.forEach((q, i) => q.type === "pick" ? console.assert(q.c.length <= 4 && q.ans >= 0 && q.ans < q.c.length && q.e, "事例の選択データ不正", c.id, i) : textOK(q, c.id + "-" + i));
  }
  const E = [EXAM.cur, EXAM.late];
  for (const x of E) console.assert([x.applyStart, x.applyEnd, x.aStart, x.aEnd, x.bStart, x.bEnd].every(isDate) && x.applyStart <= x.applyEnd && x.aStart <= x.aEnd && x.aEnd < x.bStart && x.bStart <= x.bEnd, "試験日程の不整合", x.name);
})();

/* ===== 画面の部品 ===== */
const $log = document.getElementById("log");
const $dock = document.getElementById("dock");
const $main = document.querySelector("main");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KANA = ["ア","イ","ウ","エ"];
const AV = "SC";
const BACK = "__back";

// キーボード操作中だけ、選択肢へ自動でフォーカスを移す
let kbd = false;
document.addEventListener("keydown", e => { if (e.key === "Tab" || e.key === "Enter" || e.key === " " || e.key.startsWith("Arrow")) kbd = true; }, true);
document.addEventListener("pointerdown", () => { kbd = false; }, true);

// キーボード（ソフトウェアキーボード）が開いているときは補助表示を隠す
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onR = () => document.body.classList.toggle("kb", vv.height < window.innerHeight * .75);
  vv.addEventListener("resize", onR);
}

function settle() {
  requestAnimationFrame(() => {
    const last = $log.lastElementChild;
    if (!last) return;
    // 最後の吹き出しが会話欄に収まれば一番下まで、収まらなければ吹き出しの先頭まで移動する
    const r = last.getBoundingClientRect(), m = $main.getBoundingClientRect();
    const behavior = reduce ? "auto" : "smooth";
    if (r.height > $main.clientHeight - 24) $main.scrollTo({ top: $main.scrollTop + r.top - m.top - 12, behavior });
    else $main.scrollTo({ top: $main.scrollHeight, behavior });
  });
}
function trimLog() { while ($log.childElementCount > 160) $log.firstElementChild.remove(); }

async function coach(html, wait = 450) {
  const m = document.createElement("div");
  m.className = "msg";
  m.innerHTML = '<div class="av" aria-hidden="true">' + AV + '</div><div class="bub"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span></div>';
  $log.appendChild(m); trimLog(); settle();
  await sleep(wait);
  m.querySelector(".bub").innerHTML = html;
  settle();
}
function me(text) {
  const m = document.createElement("div");
  m.className = "msg me";
  m.innerHTML = '<div class="bub">' + esc(text).replace(/\n/g, "<br>") + "</div>";
  $log.appendChild(m); settle();
}
function clearDock() {
  $dock.innerHTML = ""; $dock.className = "col";
  $dock.removeAttribute("aria-labelledby"); $dock.setAttribute("aria-label", "返答");
}
function setLead(text, cls) {
  const l = document.createElement("p");
  l.className = "lead" + (cls ? " " + cls : ""); l.id = "dockLead"; l.textContent = text;
  $dock.appendChild(l);
  $dock.removeAttribute("aria-label"); $dock.setAttribute("aria-labelledby", "dockLead");
}
function hint(text, err) { const h = document.createElement("p"); h.className = "hint" + (err ? " err" : ""); h.textContent = text; return h; }
function focusDock(el) {
  if (kbd && el) el.focus({ preventScroll: true });
  else $dock.focus({ preventScroll: true });
}

/*
 options: [{label, value, primary, quiet, danger, full}]
 opts.wide: 4択（ア〜エ表示、数字キー1〜4でも選べる）
 opts.extra: 下の行に右寄せで並べる小ボタン（誤タップ防止のため選択肢と離す）
 opts.lead: ドック上部の短い見出し / opts.grid: 2列 / opts.back: 「← 前の質問」
*/
function ask(options, opts = {}) {
  return new Promise(res => {
    clearDock();
    if (opts.grid) $dock.classList.add("grid2");
    if (opts.row4) $dock.classList.add("grid4");
    if (opts.cls) $dock.classList.add(opts.cls);
    let doneFlag = false;
    const finish = (label, value) => { if (doneFlag) return; doneFlag = true; document.removeEventListener("keydown", onKey); clearDock(); if (label !== null) me(label); res(value); $dock.focus({ preventScroll: true }); };
    if (opts.lead) setLead(opts.lead);
    options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (o.primary ? " primary" : "") + (o.quiet ? " quiet" : "") + (o.danger ? " danger" : "") + (opts.wide ? " wide" : "") + (o.full ? " full" : "");
      b.innerHTML = opts.wide ? '<span class="k">' + KANA[i] + '</span><span>' + esc(o.label) + "</span>" : esc(o.label);
      b.onclick = () => finish(opts.wide ? KANA[i] + "　" + o.label : o.label, o.value);
      $dock.appendChild(b);
    });
    const extra = (opts.extra || []).slice();
    if (opts.back) extra.unshift({ label: "← 前の質問", value: BACK });
    if (extra.length) {
      const row = document.createElement("div");
      row.className = "row end" + (opts.grid ? " full" : "");
      extra.forEach(o => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "opt quiet"; b.textContent = o.label;
        b.onclick = () => finish(o.label, o.value);
        row.appendChild(b);
      });
      $dock.appendChild(row);
    }
    if (opts.hint) $dock.appendChild(hint(opts.hint));
    function onKey(e) {
      if (!(opts.wide || opts.row4) || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      const i = ["1","2","3","4"].indexOf(e.key);
      if (i >= 0 && options[i]) { e.preventDefault(); finish(opts.wide ? KANA[i] + "　" + options[i].label : options[i].label, options[i].value); }
    }
    document.addEventListener("keydown", onKey);
    // 4択は誤答防止のため選択肢にフォーカスしない
    focusDock(opts.wide || opts.row4 ? null : ($dock.querySelector(".opt.primary") || $dock.querySelector("button")));
    settle();
  });
}
function askMulti(options, defaults, opts = {}) {
  return new Promise(res => {
    clearDock();
    if (opts.lead) setLead(opts.lead);
    const picked = new Set(defaults);
    options.forEach(o => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (picked.has(o.value) ? " on" : ""); b.textContent = o.label; b.setAttribute("aria-pressed", picked.has(o.value));
      b.onclick = () => { picked.has(o.value) ? picked.delete(o.value) : picked.add(o.value); b.classList.toggle("on"); b.setAttribute("aria-pressed", picked.has(o.value)); relabel(); };
      $dock.appendChild(b);
    });
    const row = document.createElement("div"); row.className = "row end";
    if (opts.back) {
      const bk = document.createElement("button"); bk.type = "button"; bk.className = "opt quiet"; bk.textContent = "← 前の質問";
      bk.onclick = () => { clearDock(); me("← 前の質問"); res(BACK); };
      row.appendChild(bk);
    }
    const d = document.createElement("button");
    d.type = "button"; d.className = "opt primary";
    const relabel = () => { d.textContent = picked.size ? "これで決定（" + picked.size + "）" : "特になし・次へ"; };
    relabel();
    d.onclick = () => {
      clearDock();
      const labels = options.filter(o => picked.has(o.value)).map(o => o.label);
      me(labels.length ? labels.join("、") : "特になし");
      res([...picked]);
    };
    row.appendChild(d);
    $dock.appendChild(row);
    focusDock($dock.querySelector("button"));
    settle();
  });
}
/* 記述の入力。戻り値: {text} | {skip:true} | {quit:true} | {extra:true}。下書きは入力のたびに保存し、「やめる」でも消さない */
function askText(id, lead, lim, extraLabel) {
  return new Promise(res => {
    clearDock();
    setLead(lead, "q");
    const wrap = document.createElement("div");
    wrap.className = "row";
    const KB = '<span class="kbonly">Ctrl＋Enter（Macは⌘＋Enter）でも送信できます。</span>';
    wrap.innerHTML = '<textarea id="ans" placeholder="' + lim + '字以内で解答" aria-describedby="cnt ansHint"></textarea>' +
      '<div class="row"><span class="count" id="cnt" aria-live="polite">0 / ' + lim + '字</span><span class="grow"></span>' +
      (extraLabel ? '<button type="button" class="opt quiet" id="extra">' + esc(extraLabel) + "</button>" : "") + "</div>" +
      '<div class="row"><button type="button" class="opt quiet" id="quit">やめる</button><span class="grow"></span>' +
      '<button type="button" class="opt quiet" id="skip">答えを見る</button><button type="button" class="opt primary" id="send">送信</button></div>' +
      '<p class="hint" id="ansHint">空白を除いて数えています。書いた内容は自動で保存されます。' + KB + "</p>";
    $dock.appendChild(wrap);
    const t = document.getElementById("ans"), c = document.getElementById("cnt"), h = document.getElementById("ansHint");
    t.setAttribute("aria-labelledby", "dockLead");
    const recount = () => {
      const n = clen(t.value);
      c.textContent = n + " / " + lim + "字" + (n > lim ? "（" + (n - lim) + "字オーバー）" : "");
      c.classList.toggle("over", n > lim);
    };
    t.value = loadDraft(id); recount();
    t.oninput = () => {
      recount(); saveDraft(id, t.value);
      if (t.value.trim() && h.classList.contains("err")) { t.removeAttribute("aria-invalid"); h.className = "hint"; h.innerHTML = "書いた内容は自動で保存されます。" + KB; }
    };
    const send = () => {
      const v = t.value.trim();
      if (!v) { t.setAttribute("aria-invalid", "true"); h.className = "hint err"; h.textContent = "解答を入力するか、「答えを見る」を押してください。"; t.focus(); return; }
      saveDraft(id, ""); clearDock(); me(v); res({ text: v });
    };
    t.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); send(); } };
    document.getElementById("send").onclick = send;
    document.getElementById("skip").onclick = () => { saveDraft(id, ""); clearDock(); me("答えを見る"); res({ skip: true }); };
    if (extraLabel) document.getElementById("extra").onclick = () => { clearDock(); me(extraLabel); res({ extra: true }); };
    document.getElementById("quit").onclick = () => { clearDock(); me("やめる"); res({ quit: true }); };
    focusDock(t);
    settle();
  });
}
/* 勉強時間：よく使う値のボタンと、自由入力欄。戻り値は時間（整数）か BACK */
function askHours(def, o = {}) {
  return new Promise(res => {
    clearDock();
    setLead("1週間の勉強時間");
    const done = (v, label) => { clearDock(); me(label); res(v); };
    HOURS.forEach(h => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt"; b.textContent = h + "時間";
      b.onclick = () => done(h, h + "時間");
      $dock.appendChild(b);
    });
    const row = document.createElement("div"); row.className = "row";
    row.innerHTML = '<label for="hrs" class="small">自由に入力</label><input type="number" id="hrs" inputmode="numeric" min="' + H_MIN + '" max="' + H_MAX + '" step="1" placeholder="例：8" aria-describedby="hrsHint"' + (def && !HOURS.includes(def) ? ' value="' + def + '"' : "") + '><span class="small">時間</span><button type="button" class="opt primary" id="hrsOk">この時間で決定</button>';
    $dock.appendChild(row);
    const h = hint(H_MIN + "〜" + H_MAX + "時間の整数で入力できます。"); h.id = "hrsHint"; $dock.appendChild(h);
    if (o.back) {
      const r2 = document.createElement("div"); r2.className = "row end";
      const bk = document.createElement("button"); bk.type = "button"; bk.className = "opt quiet"; bk.textContent = "← 前の質問";
      bk.onclick = () => done(BACK, "← 前の質問");
      r2.appendChild(bk); $dock.appendChild(r2);
    }
    const inp = document.getElementById("hrs");
    const submit = () => {
      const v = Number(String(inp.value).normalize("NFKC").trim());
      if (!validHours(v)) {
        inp.setAttribute("aria-invalid", "true"); h.className = "hint err";
        h.textContent = H_MIN + "〜" + H_MAX + "の整数を入力してください。";
        inp.focus(); return;
      }
      done(v, v + "時間");
    };
    inp.oninput = () => { inp.removeAttribute("aria-invalid"); h.className = "hint"; h.textContent = H_MIN + "〜" + H_MAX + "時間の整数で入力できます。"; };
    inp.onkeydown = e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(); } };
    document.getElementById("hrsOk").onclick = submit;
    focusDock($dock.querySelector("button"));
    settle();
  });
}
function askDate(def, hintText, o = {}) {
  return new Promise(res => {
    clearDock();
    const min = o.min || addDays(todayStr(), 1), max = o.max || "";
    if (def < min) def = min;
    if (max && def > max) def = max;
    const row = document.createElement("div"); row.className = "row";
    row.innerHTML = '<input type="date" id="exam" value="' + esc(def) + '" min="' + esc(min) + '"' + (max ? ' max="' + esc(max) + '"' : "") + ' aria-label="日付" aria-describedby="dateHint"><button type="button" class="opt primary" id="ok">この日で決定</button>';
    $dock.appendChild(row);
    const h = hint(hintText); h.id = "dateHint"; $dock.appendChild(h);
    if (o.back) {
      const r2 = document.createElement("div"); r2.className = "row end";
      const bk = document.createElement("button"); bk.type = "button"; bk.className = "opt quiet"; bk.textContent = "← 前の質問";
      bk.onclick = () => { clearDock(); me("← 前の質問"); res(BACK); };
      r2.appendChild(bk); $dock.appendChild(r2);
    }
    const inp = document.getElementById("exam");
    document.getElementById("ok").onclick = () => {
      const v = inp.value;
      if (!isDate(v) || v < min || (max && v > max)) {
        inp.setAttribute("aria-invalid", "true"); h.className = "hint err";
        h.textContent = max ? mds(min) + "〜" + mds(max) + "の日付を選んでください。" : mds(min) + "以降の日付を選んでください。";
        inp.focus(); return;
      }
      clearDock(); me(slash(v)); res(v);
    };
    focusDock(inp);
    settle();
  });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ===== 試験情報の表示 ===== */
function applyState(x) { const t = todayStr(); return t > x.applyEnd ? "（受付終了）" : t >= x.applyStart ? "（受付中）" : ""; }
function fmtHTML() { return '<div class="card"><dl class="kv">' + EXAM.fmt.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></div>"; }
function curCard() { const c = EXAM.cur; return '<div class="card"><dl class="kv"><dt>前期</dt><dd>' + esc(c.name) + "</dd><dt>申込受付</dt><dd>" + esc(c.apply + applyState(c)) + "</dd><dt>科目A</dt><dd>" + esc(c.a) + "</dd><dt>科目B</dt><dd><strong>" + esc(c.b) + "</strong></dd></dl></div>"; }
function lateCard() { const l = EXAM.late; return '<div class="card"><dl class="kv"><dt>後期</dt><dd>' + esc(l.name) + "</dd><dt>申込受付</dt><dd><strong>" + esc(l.apply + applyState(l)) + "</strong></dd><dt>科目A</dt><dd>" + esc(l.a) + "</dd><dt>科目B</dt><dd>" + esc(l.b) + "</dd><dt>ポイント</dt><dd>" + esc(l.note) + "</dd></dl></div>"; }
function nextCard() { return '<div class="card"><dl class="kv"><dt>2027年度〜</dt><dd>' + esc(EXAM.next) + "</dd></dl></div>"; }
function sourceHTML() {
  return '<p class="small">IPAの発表内容を' + esc(EXAM.asof) + "時点で確認したものです。新制度の内容は見込みです。申込の前に次のページで最新情報を確認してください。</p><ul class=\"small\">" +
    EXAM.links.map(([t, u]) => '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + "</a></li>").join("") + "</ul>";
}
const moreHTML = (title, html) => '<details class="more"><summary>' + esc(title) + "（タップで開く）</summary>" + html + "</details>";
function examHTML() { return fmtHTML() + curCard() + lateCard() + nextCard() + sourceHTML(); }

/* ===== 計画 =====
   計画は作成日（profile.start）を起点に固定し、日がたつとフェーズが進む */
function allocate(days, ratios) {
  const n = ratios.length;
  const sum = ratios.reduce((a, b) => a + b, 0);
  const extra = days - n;
  const raw = ratios.map(r => extra * r / sum);
  const out = raw.map(x => 1 + Math.floor(x));
  let left = days - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}
const written = p => p.target !== "next";
function phaseInfo(key, p) {
  return {
    base:  { t: "基礎固め", f: "科目A-2（旧午前II）・用語" },
    deep:  { t: "分野別の深掘り", f: "仕組みの理解＋科目Bを週2問" },
    b:     { t: "科目B 演習", f: written(p) ? "旧午後・150分で2問" : "事例の読解と設問演習" },
    acheck:{ t: "科目A 直前対策", f: "科目A-2の総仕上げ" },
    b2:    { t: "科目B 仕上げ", f: "科目Aのあと、科目Bに集中" },
    last:  { t: "直前仕上げ", f: "本番リハーサル" },
    sprint:{ t: "最終確認", f: "弱点と頻出論点だけ" }
  }[key];
}
function tasksFor(key, p) {
  const weak = p.weak.map(k => DOMAINS[k]);
  const a1 = p.target !== "r8b" && p.amI !== "exempt";
  const w = written(p);
  return {
    base:  [(HAS_PAST ? "「IPAの過去問」で" : "") + "科目A-2の過去問を3〜4回分くり返し、正答率8割を安定させる", "間違えた用語は「何を守るか・どう防ぐか」を自分の言葉で1行にまとめる", a1 ? "科目A-1（旧午前I）は応用情報の午前過去問を毎日10問。正答率7割を目標にする" : null],
    deep:  [weak.length ? "苦手分野を優先：" + weak.join("、") : "全分野をひととおり", "攻撃の流れ（侵入→横展開→持ち出し）と、各段階で効く対策を図に描いて説明する",
            w ? "科目B（旧午後）の過去問を週2問。記述トレーニングも週2回" : "科目Bの過去問の事例を週2問読み、設問の根拠を本文と図表から探す"],
    b:     w ? ["令和5年度以降の科目B（午後）の過去問を全問、1問70分で解く。続けて旧午後Iを1問45分で", "問題選択は最初の5分で決める。得意・不得意で選ぶ基準を作っておく", "CBTに合わせ、過去問のPDFを画面だけで読み、解答はキーボードで入力する", "解答例との差を「キーワード不足」「論点ずれ」「字数」に分類する", "記述トレーニングを毎日2題、事例演習を週2問"]
             : ["科目Bの過去問の事例を読み、設問ごとに根拠となる本文・図表の箇所を特定する", "IPAが公開している新制度のサンプル問題で形式に慣れる", "記述トレーニングで、答えを選んだ理由を説明できるようにする", "事例演習を週2問"],
    acheck:[(HAS_PAST ? "「IPAの過去問」で" : "") + "科目A-2の過去問を2回分解き直し、正答率8割を確認する", a1 ? "科目A-1は応用情報の午前過去問で、正答率7割を確認する" : null, "この期間は4択を1日10問。間違えた問題の見直しを優先する", "科目Aの受験日時・会場・本人確認書類を確認する"],
    b2:    ["科目Aのあとは科目Bに集中。令和5年度以降の過去問を、時間を計って解き直す", "事例演習と記述トレーニングで、弱点ノートの論点を確認する"],
    last:  [w ? "予約した時間帯と同じ時間に、科目B（150分・2問）を画面とキーボードで通しで解く" : "本番と同じ時間配分で、過去問の事例を通しで解く", "弱点ノートと間違えた問題だけを見直す", "前日は新しい問題に手を出さず、睡眠を優先する"],
    sprint:["弱点ノートと頻出論点（Web・認証・メール・インシデント対応）を見直す", "記述トレーニングで解答の書き方を確認する", "前日は早めに休み、受験票と本人確認書類を用意する"]
  }[key].filter(Boolean);
}
function buildPlan(p) {
  const t = todayStr();
  const left = diff(t, p.exam);
  if (left <= 0) return { done: left < 0, today: left === 0, days: left, phases: [] };
  const start = p.start <= t ? p.start : t;
  const phases = [];
  const seg = (from, to, keys, ratios) => {
    let days = diff(from, to);
    if (days <= 0) return;
    if (days < keys.length) { keys = keys.slice(-days); ratios = ratios.slice(-days); }
    const lens = allocate(days, ratios);
    let cur = from;
    keys.forEach((k, i) => { const f = cur; cur = addDays(cur, lens[i]); phases.push({ key: k, from: f, to: addDays(cur, -1) }); });
  };
  const total = diff(start, p.exam);
  const exr = { none: .3, some: .25, pro: .18 }[p.exp] || .25;
  if (total <= 3) seg(start, p.exam, ["sprint"], [1]);
  else if (p.target === "r8b" || (p.target === "late" && (!p.aDate || p.aDate < start))) seg(start, p.exam, ["b", "last"], [.7, .3]);
  else if (p.target === "late") {
    const acStart = maxD(start, addDays(p.aDate, -10));
    const pre = diff(start, acStart);
    if (pre >= 35) seg(start, acStart, ["base", "deep", "b"], [exr, .3, .3]);
    else if (pre >= 6) seg(start, acStart, ["base", "b"], [.5, .5]);
    else seg(start, acStart, ["base"], [1]);
    phases.push({ key: "acheck", from: acStart, to: p.aDate });
    const after = addDays(p.aDate, 1);
    const post = diff(after, p.exam);
    if (post >= 8) seg(after, p.exam, ["b2", "last"], [.6, .4]);
    else seg(after, p.exam, ["last"], [1]);
  }
  else if (total < 35) seg(start, p.exam, ["base", "b", "last"], [.3, .5, .2]);
  else seg(start, p.exam, ["base", "deep", "b", "last"], [exr, .27, .33, .12]);
  phases.forEach(ph => Object.assign(ph, phaseInfo(ph.key, p), { tasks: tasksFor(ph.key, p) }));
  const hpw = p.hours;
  const weekday = Math.min(Math.round(hpw * 60 * .4 / 5 / 30) * 30, Math.floor(hpw * 60 / 5 / 30) * 30);
  const weekend = (hpw * 60 - weekday * 5) / 2;
  return { days: left, total: Math.round(left / 7 * hpw), weekday, weekend, phases };
}
function currentPhase(plan) {
  const t = todayStr();
  const i = plan.phases.findIndex(ph => t <= ph.to);
  return i < 0 ? plan.phases.length - 1 : i;
}
function planHTML(plan) {
  const ci = currentPhase(plan);
  return '<div class="card">' + plan.phases.map((p, i) =>
    '<div class="phase"><span class="n">P' + (i+1) + '</span><div><h4>' + esc(p.t) + "｜" + esc(p.f) + (i === ci ? '<span class="pill">いまここ</span>' : "") +
    '</h4><div class="d">' + esc(mds(p.from)) + " 〜 " + esc(mds(p.to)) + "</div></div>" +
    (i === ci || plan.phases.length <= 3 ? "<ul>" + p.tasks.map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "") + "</div>").join("") + "</div>" +
    (plan.phases.length > 3 ? '<p class="small">いまのフェーズだけ、やることを表示しています。</p>' : "");
}
function datesHTML(p) {
  const rows = [];
  if (p.target === "r8b") rows.push(["科目B", slash(p.exam)]);
  else if (p.target === "late") {
    rows.push(["申込受付", EXAM.late.apply + applyState(EXAM.late)]);
    rows.push(["科目A", p.aDate ? slash(p.aDate) + "（予定）" : EXAM.late.a + "（受験済み）"]);
    rows.push(["科目B", slash(p.exam) + "（予定）"]);
  } else rows.push(["目標日", slash(p.exam) + "（仮。日程は公表待ち）"]);
  return '<div class="card"><dl class="kv">' + rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></div>";
}

/* ===== 状態表示 ===== */
function totals() { let c = 0, n = 0; Object.values(S.stats).forEach(s => { c += s.c; n += s.n; }); return { c, n }; }
function renderStatus() {
  const el = document.getElementById("status");
  if (!S.profile) { el.innerHTML = "<span>初回設定</span>"; return; }
  const plan = buildPlan(S.profile);
  const head = plan.done ? "試験終了" : plan.today ? "本日試験" : "あと" + plan.days + "日";
  let ph = "";
  if (plan.phases.length) { const i = currentPhase(plan); ph = "<span>P" + (i+1) + '<span class="ph-name"> ' + esc(plan.phases[i].t) + "</span></span>"; }
  const acc = "今日 " + todayLog().n + "問";
  el.innerHTML = "<span>" + head + "</span>" + ph + '<span class="acc">' + acc + "</span>";
}
function markDay() { const d = todayStr(); if (!S.days.includes(d)) { S.days.push(d); S.days = S.days.slice(-120); } }
function streak() {
  let n = 0; let d = todayStr();
  if (!S.days.includes(d)) d = addDays(d, -1);
  while (S.days.includes(d)) { n++; d = addDays(d, -1); }
  return n;
}
function weekDays() { const t = todayStr(); return S.days.filter(d => diff(d, t) < 7 && diff(d, t) >= 0).length; }
// 今日解いた数と勉強した時間（答えと答えの間隔から数える。5分以上あいた分は数えない）
let lastAct = 0;
const actStart = () => { lastAct = Date.now(); };
function logAct(n, ms) {
  const now = Date.now();
  if (ms === undefined) { ms = lastAct ? Math.min(now - lastAct, 5 * 60000) : 60000; lastAct = now; }
  const d = todayStr(), L = S.log[d] || (S.log[d] = { n: 0, ms: 0 });
  L.n += n; L.ms += Math.max(0, ms); markDay();
}
const todayLog = () => S.log[todayStr()] || { n: 0, ms: 0 };
const minTxt = ms => Math.max(1, Math.round(ms / 60000)) + "分";
function weekSolved() { const t = todayStr(); let n = 0; for (let k = 0; k < 7; k++) { const L = S.log[addDays(t, -k)]; if (L) n += L.n; } return n; }
function totalSolved() { return totals().n + Object.keys(S.past).length + Object.keys(S.write).length + Object.keys(S.cases).length; }
// 今週のカレンダー（学習した日に✓）
function weekHTML() {
  const t = todayStr(), W = "日月火水木金土";
  let h = "";
  for (let k = 6; k >= 0; k--) {
    const d = addDays(t, -k), on = S.days.includes(d);
    h += '<span class="' + (on ? "on" : "") + (k ? "" : " today") + '"><small>' + (k ? W[parseLocal(d).getDay()] : "今日") + "</small>" + (on ? "✓" : "・") + "</span>";
  }
  return '<div class="week" role="img" aria-label="この7日間で学習した日 ' + weekDays() + '日">' + h + "</div>";
}
function rewardHTML() { return '<div class="card"><p class="small">この7日間（✓は学習した日）</p>' + weekHTML() + '<p class="small mt">これまでに解いた問題：<strong>' + totalSolved() + "問</strong></p></div>"; }

/* ===== 4択 ===== */
/* 4択の出題順。間隔をあけてくり返す（間違えた問題は翌日、正解するたびに3日→7日→14日→30日後）。
   直近に解いた問題は後回しにし、まだ解いていない問題と、復習の時期が来た問題を先に出す */
const QGAP = [1, 3, 7, 14, 30];
function quizPriority(q, t) {
  const r = S.qt[q.id];
  if (!r) return q.id in S.last ? (S.last[q.id] ? 2 : 4) : 3;   // 日付の記録がない問題
  if (r.t === t) return -6;                                       // 今日解いた
  const due = addDays(r.t, QGAP[r.r]);
  return due <= t ? 3.5 + Math.min(diff(due, t), 30) * .03 - r.r * .2 : -3 + diff(t, due) * -.1;
}
function pickQuiz(n, domain, ids, mix) {
  const t = todayStr();
  const weak = new Set(S.profile ? S.profile.weak : []);
  const rank = list => list.map(q => {
    const st = S.stats[q.d], rate = st && st.n ? st.c / st.n : .5;
    return { q, s: quizPriority(q, t) + (weak.has(q.d) ? .8 : 0) + (rate < .6 ? .4 : 0) + Math.random() * 1.2 };
  }).sort((a, b) => b.s - a.s).map(x => x.q);
  const base = QUIZ.filter(q => !ids || ids.includes(q.id));
  // おすすめ：苦手分野から半分強、残りはほかの分野から
  if (mix && domain) {
    const k = Math.ceil(n / 2);
    const a = rank(base.filter(q => q.d === domain)).slice(0, k);
    const b = rank(base.filter(q => q.d !== domain)).slice(0, n - a.length);
    return shuffle(a.concat(b));
  }
  return rank(base.filter(q => !domain || q.d === domain)).slice(0, n);
}
/* o.today: 今日の学習から / o.one: 1問だけ / o.box: 10分だけ / o.resume: 続きから */
async function runQuiz(n, domain, ids, o = {}) {
  let sess = o.resume;
  actStart();
  if (sess) await coach("<p>続きから再開します。あと" + (sess.ids.length - sess.i) + "問です。</p>", 250);
  else {
    const qs0 = pickQuiz(n, domain, ids, o.mix);
    sess = { k: "quiz", ids: qs0.map(q => q.id), i: 0, ok: 0, today: !!o.today, box: !!o.box };
    if (!o.today) await coach("<p>" + (o.one ? "4択を1問だけいきます。" : o.box ? "10分だけ、4択を解きます。10分たったらお知らせします。" : ids ? "復習リストの問題を" + qs0.length + "問いきます。" : "科目A-2（旧午前II）形式の4択を" + qs0.length + "問いきます（約" + qs0.length + "分）。") + '</p><p class="small kbonly">キーボードなら1〜4キーでも答えられます。</p>', 350);
  }
  const qs = sess.ids.map(id => QUIZ.find(q => q.id === id));
  const start = sess.i, t0 = Date.now();
  S.sess = sess; save();
  let quit = false, boxEnd = false, boxAsk = sess.box;
  for (let i = start; i < qs.length; i++) {
    const q = qs[i];
    const order = shuffle(q.c.map((t, k) => ({ t, k })));
    await coach('<span class="tag">Q' + (i+1) + (sess.box ? "" : "/" + qs.length) + '</span><p class="qtext">' + esc(q.q) + "</p>", i > start ? 250 : 450);
    const pick = await ask(order.map(o => ({ label: o.t, value: o.k })), { wide: true, lead: "答えを選んでください", extra: [{ label: "やめる", value: -1 }] });
    if (pick === -1) { quit = true; break; }
    const right = pick === 0;
    sess.i = i + 1; if (right) sess.ok++;
    const st = S.stats[q.d] || (S.stats[q.d] = { c: 0, n: 0 });
    st.n++; if (right) st.c++;
    S.last[q.id] = right;
    const pr = S.qt[q.id];
    S.qt[q.id] = { r: right ? (pr && pr.t !== todayStr() ? Math.min(pr.r + 1, 4) : pr ? pr.r : 1) : 0, t: todayStr() };
    logAct(1);
    if (sess.i >= qs.length) S.sess = null;
    save();
    const ansKana = KANA[order.findIndex(o => o.k === 0)], mineKana = KANA[order.findIndex(o => o.k === pick)];
    await coach('<span class="tag">' + esc(DOMAINS[q.d]) + "</span>" +
      (right ? '<p><span class="ok">✓ 正解</span>　' + ansKana + "　" + esc(q.c[0]) + "</p>"
             : '<p><span class="ng">✕ 不正解</span></p><ul><li>あなたの解答：' + mineKana + "　" + esc(q.c[pick]) + "</li><li><strong>正解：" + ansKana + "　" + esc(q.c[0]) + "</strong></li></ul>") +
      explainHTML(q.e, q.id, [q.q].concat(q.c, [q.e])), 250);
    if (i < qs.length - 1) {
      if (boxAsk && Date.now() - t0 >= 10 * 60000) {
        const more = await ask([{ label: "ここで終える", value: false, primary: true }], { lead: "10分たちました。おつかれさまです", extra: [{ label: "もう少し続ける", value: true }] });
        if (!more) { boxEnd = true; break; }
        boxAsk = false;
      } else {
        const go = await ask([{ label: "次の問題", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
        if (!go) { quit = true; break; }
      }
    }
  }
  const done = sess.i, ok = sess.ok;
  const keep = quit && done > 0 && done < qs.length;
  if (!keep) S.sess = null;
  save();
  if (!done) { await coach("<p>中断しました。メニューに戻ります。</p>", 200); return { n: 0, ok: 0, quit: true }; }
  if (o.one) return { n: done, ok, quit: false };
  const rate = Math.round(ok / done * 100);
  let msg = ok === 0 ? done + "問チャレンジしました。解説を読んだ分だけ、確実に前に進んでいます。"
    : done + "問解きました（そのうち" + ok + "問正解）。" + (done >= 10 ? (rate >= 80 ? "科目A-2の合格ラインを十分に越えています。" : rate >= 60 ? "合格ラインの60%を越えています。" : "") : "");
  if (ok < done) msg += "間違えた問題は「復習リスト」に入れておきました。";
  if (keep) msg += "続きは、メニューの一番上の「続きから」で再開できます。";
  await coach("<p>" + msg + "</p>" + (o.today ? "" : rewardHTML()));
  return { n: done, ok, quit: keep || quit };
}

/* ===== 記述 ===== */
const GAP = [1, 3, 14];
const GAP_TXT = ["明日もう一度出します。", "3日後にもう一度出します。", "2週間後に確認で出します。"];
function gradeHTML(ans, item) {
  const g = grade(ans, item);
  const ratio = g.h / g.g.length;
  const sug = ratio >= 1 ? "○" : ratio >= .5 ? "△" : "×";
  const rows = g.g.map((grp, i) => "<li>" + (g.hits[i] ? '<span class="ok">✓ 含む</span>' : '<span class="na">－ 見当たらない</span>') + "　" + esc(grp[0]) + (grp.length > 1 ? " など" : "") + "</li>").join("");
  const len = clen(ans);
  return { sug, html: "<p>解答例の要素のうち <strong>" + g.h + " / " + g.g.length + "</strong> が含まれています" + (len > item.lim ? "。字数が" + (len - item.lim) + "字オーバーしています。本番では減点や採点対象外になりえます" : "") + "。</p><ul>" + rows + "</ul><p class=\"small\">語句の一致による目安です。言い回しが違っても、論点が合っていれば正解です。</p>" };
}
function pickWrite(domain) {
  // 書きかけの下書きがある問題を先に出す
  const dr = writeDrafts().filter(w => !domain || w.d === domain);
  if (dr.length) return dr[0];
  const t = todayStr();
  const weak = new Set(S.profile ? S.profile.weak : []);
  const pool = WRITE.filter(w => !domain || w.d === domain).map(w => {
    const r = S.write[w.id];
    let s;
    if (!r) s = 3;
    else { const due = addDays(r.t, GAP[r.r]); s = due <= t ? 4 + diff(due, t) * .01 : -diff(t, due) * .05; }
    return { w, s: s + (weak.has(w.d) ? 1.5 : 0) + Math.random() };
  }).sort((a, b) => b.s - a.s);
  return pool[0].w;
}
async function runWrite(domain, id) {
  const w = (id && WRITE.find(x => x.id === id)) || pickWrite(domain);
  const draft = loadDraft(w.id).trim();
  actStart();
  await coach('<span class="tag">記述　' + esc(DOMAINS[w.d]) + "</span><p>" + esc(w.s) + "</p><p><strong>" + esc(w.q.replace(/。$/, "")) + "（" + w.lim + "字以内）。</strong></p>" + (draft ? '<p class="small">前回の下書きを入れてあります。続きから書けます。</p>' : '<p class="small">「何が起きたか」と「なぜそうなるか」をセットで書くのがコツです。</p>'));
  const r = await askText(w.id, "設問：" + w.q.replace(/。$/, "") + "（" + w.lim + "字以内）", w.lim);
  if (r.quit) { await coach("<p>" + (loadDraft(w.id).trim() ? "下書きを保存しました。メニューの「書きかけの記述を続ける」から続きを書けます。" : "中断しました。メニューに戻ります。") + "</p>", 200); return { n: 0, quit: true }; }
  const ansHTML = whatHTML(w.x) + '<p class="answer"><span class="tag">解答例</span><br>' + esc(w.a) + "</p>" + explainHTML(w.note, w.id, [w.s, w.q, w.x, w.a, w.note]);
  if (r.skip) {
    S.write[w.id] = { r: 0, t: todayStr() }; logAct(0); save();
    await coach(ansHTML + "<p>解答例を一度書き写すと、言い回しが身につきます。この問題は" + GAP_TXT[0] + "</p>");
    return { n: 0 };
  }
  const gh = gradeHTML(r.text, w);
  await coach(gh.html + ansHTML);
  const g = await ask([{ label: "○ 書けた", value: 2 }, { label: "△ 惜しい", value: 1 }, { label: "× 書けなかった", value: 0 }], { lead: "解答例と比べて自己採点してください（語句の一致からの目安：" + gh.sug + "）" });
  S.write[w.id] = { r: g, t: todayStr() }; logAct(1); save();
  await coach("<p>" + ["大丈夫です。解答例を一度書き写すと、言い回しが身につきます。", "あと一歩です。足りなかった要素を意識して、また書いてみましょう。", "いい調子です。本番でもこの書き方で十分戦えます。"][g] + "この問題は" + GAP_TXT[g] + "</p>", 250);
  return { n: 1 };
}

/* ===== 事例演習（科目B形式） ===== */
function figHTML(f) {
  if (f.type === "table") return '<div class="fig"><p class="cap">' + esc(f.cap) + '</p><div class="tw"><table class="t"><thead><tr>' + f.head.map(h => '<th scope="col">' + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + f.rows.map(r => "<tr>" + r.map(c => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div></div>";
  return '<div class="fig"><p class="cap">' + esc(f.cap) + '</p><pre class="log" tabindex="0">' + esc(f.lines.join("\n")) + "</pre></div>";
}
function pickCase() {
  const weak = new Set(S.profile ? S.profile.weak : []);
  return CASES.map(c => ({ c, s: (S.cases[c.id] ? (100 - S.cases[c.id].p) / 50 : 3) + (weak.has(c.d) ? 1 : 0) + Math.random() })).sort((a, b) => b.s - a.s)[0].c;
}
async function runCase(resume) {
  const c = (resume && CASES.find(x => x.id === resume.id)) || pickCase();
  const n = c.qs.length;
  const sess = resume || { k: "case", id: c.id, i: 0, score: 0 };
  actStart();
  await coach((resume ? "<p>事例演習の続きです。設問" + (sess.i + 1) + "から再開します。</p>" : "") + '<span class="tag">事例　' + esc(DOMAINS[c.d]) + "</span><p><strong>" + esc(c.title) + "</strong></p><p>" + esc(c.s) + "</p>" + figHTML(c.fig) + '<p class="small">設問は' + n + "問です。図表は「図表を見る」でいつでも再表示できます。</p>" + abbrHTML([c.s].concat(c.fig.lines || [], (c.fig.rows || []).flat())), 600);
  // 1問以上答えたあとに「やめる」を押したら、誤タップでないか確かめる
  const quitOK = () => sess.i > 0 ? ask([{ label: "続ける", value: false, primary: true }], { lead: "ここまでの解答は保存してあります。やめても、あとで続きから再開できます", extra: [{ label: "やめる", value: true }] }) : Promise.resolve(true);
  let quit = false;
  for (let i = sess.i; i < n && !quit; i++) {
    const sq = c.qs[i];
    const head = '<span class="tag">設問' + (i+1) + "/" + n + "</span><p>" + esc(sq.q) + "</p>";
    await coach(head, 250);
    if (sq.type === "pick") {
      const order = sq.fixed ? sq.c.map((t, k) => ({ t, k })) : shuffle(sq.c.map((t, k) => ({ t, k })));
      let pick;
      for (;;) {
        pick = await ask(order.map(o => ({ label: o.t, value: o.k })), { wide: true, lead: "設問" + (i+1) + "：答えを選んでください", extra: [{ label: "図表を見る", value: -2 }, { label: "やめる", value: -1 }] });
        if (pick !== -2) break;
        await coach(figHTML(c.fig), 150); await coach(head, 150);
      }
      if (pick === -1) { if (await quitOK()) { quit = true; break; } i--; continue; }
      const right = pick === sq.ans;
      if (right) sess.score++;
      const ak = KANA[order.findIndex(o => o.k === sq.ans)];
      await coach((right ? '<p><span class="ok">✓ 正解</span></p>' : '<p><span class="ng">✕ 不正解</span>　正解は <strong>' + ak + "　" + esc(sq.c[sq.ans]) + "</strong></p>") + explainHTML(sq.e, c.id + "-" + i, [sq.q].concat(sq.c, [sq.e])), 250);
    } else {
      let r;
      for (;;) {
        r = await askText(c.id + "-" + i, "設問" + (i+1) + "：" + sq.q, sq.lim, "図表を見る");
        if (!r.extra) break;
        await coach(figHTML(c.fig), 150); await coach(head, 150);
      }
      if (r.quit) { if (await quitOK()) { quit = true; break; } i--; continue; }
      const ansHTML = whatHTML(sq.x) + '<p class="answer"><span class="tag">解答例</span><br>' + esc(sq.a) + "</p>" + explainHTML(sq.note, c.id + "-" + i, [sq.q, sq.x, sq.a, sq.note]);
      if (r.skip) await coach(ansHTML, 250);
      else {
        const gh = gradeHTML(r.text, sq);
        await coach(gh.html + ansHTML, 250);
        const g = await ask([{ label: "○ 書けた", value: 2 }, { label: "△ 惜しい", value: 1 }, { label: "× 書けなかった", value: 0 }], { lead: "自己採点してください（語句の一致からの目安：" + gh.sug + "）" });
        sess.score += [0, .5, 1][g];
      }
    }
    sess.i = i + 1;
    S.sess = sess.i < n ? sess : null; logAct(0); save();
    if (i < n - 1) {
      const go = await ask([{ label: "次の設問へ", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
      if (!go) quit = true;
    }
  }
  if (sess.i < n) {
    if (sess.i > 0) { S.sess = sess; save(); }
    await coach("<p>" + (sess.i > 0 ? "設問" + sess.i + "までの解答を保存しました。メニューの「続きから」で設問" + (sess.i + 1) + "から再開できます。" : "中断しました。メニューに戻ります。") + "</p>", 200);
    return { n: 0, quit: true };
  }
  const p = Math.round(sess.score / n * 100);
  S.cases[c.id] = { p, t: todayStr() }; S.sess = null; logAct(1, 0); save();
  await coach("<p>この事例の得点の目安は <strong>" + p + "点</strong> です（設問ごとに等配点で計算）。本番の科目Bは60点が合格基準です。</p><p class=\"small\">本番の事例は数ページあり、設問も10前後あります。IPAの過去問でも同じ手順（図表から根拠を探す→指定の字句を使う→字数内でまとめる）で練習しましょう。</p>" + rewardHTML());
  return { n: 1 };
}

/* ===== 解説の図解と略語 ===== */
const HAS_FIG = typeof FIG !== "undefined" && typeof FIGMAP !== "undefined";
let figSeq = 0;
function svgLines(x, y, text, o = {}) {
  const lines = String(text).split("\n"), lh = o.lh || 13;
  const y0 = y - (lines.length - 1) * lh / 2;
  return lines.map((t, i) => '<text x="' + x + '" y="' + (y0 + i * lh) + '" text-anchor="' + (o.anchor || "middle") + '" dominant-baseline="middle"' + (o.cls ? ' class="' + o.cls + '"' : "") + (o.fs ? ' style="font-size:' + o.fs + 'px"' : "") + ">" + esc(t) + "</text>").join("");
}
// 文字の幅の目安（全角は文字の大きさ、半角はその約半分）で、指定の幅に収まるように折り返す
function wrapText(text, maxW, fs = 10) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "", w = 0, lastBreak = -1;
    for (const ch of para) {
      const cw = /[\x00-\x7f]/.test(ch) ? fs * 0.56 : fs;
      if (w + cw > maxW && line) {
        const cut = lastBreak > 0 ? lastBreak : line.length;
        out.push(line.slice(0, cut)); line = line.slice(cut); w = [...line].reduce((a, c) => a + (/[\x00-\x7f]/.test(c) ? fs * 0.56 : fs), 0); lastBreak = -1;
      }
      line += ch; w += cw;
      if ("、。／→ ）".includes(ch)) lastBreak = line.length;
    }
    out.push(line);
  }
  return out;
}
function edgePt(n, tx, ty) {
  // 箱の中心から (tx,ty) へ向かう線が、箱の縁と交わる点
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs((n.w / 2 + 3) / (dx || 1e-9)), Math.abs((n.h / 2 + 3) / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}
function marker(id) {
  return '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="ah"/></marker></defs>';
}
function figGraph(s) {
  const W = s.w || 320, H = s.h, id = "ah" + (++figSeq);
  const N = {};
  s.n.forEach(n => { N[n.id] = Object.assign({ w: 80, h: 32 }, n); });
  let out = marker(id);
  for (const [a, b, label, opt = ""] of s.e) {
    const A = N[a], B = N[b];
    const [x1, y1] = edgePt(A, B.x + B.w / 2, B.y + B.h / 2), [x2, y2] = edgePt(B, A.x + A.w / 2, A.y + A.h / 2);
    const cls = "ln" + (opt.includes("bad") ? " bad" : opt.includes("ok") ? " ok" : "") + (opt.includes("dash") ? " dash" : "");
    const mk = opt.includes("none") ? "" : ' marker-end="url(#' + id + ')"' + (opt.includes("both") ? ' marker-start="url(#' + id + ')"' : "");
    out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" class="' + cls + '"' + mk + "/>";
    if (label) {
      const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1) * 0.35;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const lw = [...label].reduce((s, c) => s + (/[\x00-\x7f]/.test(c) ? 5.6 : 10), 0);
      // ラベルが箱に重ならない位置を、線の上・下・少し離れた位置の順に探す
      const hits = (lx, ly, anchor) => { const x0 = anchor === "start" ? lx : lx - lw / 2;
        return Object.values(N).some(n => x0 < n.x + n.w && n.x < x0 + lw && ly - 7 < n.y + n.h && n.y < ly + 7); };
      const cands = vertical ? [[mx + 6, my, "start"], [mx - 6 - lw, my, "start"]] : [[mx, my - 9, "middle"], [mx, my + 11, "middle"], [mx, my - 20, "middle"], [mx, my + 22, "middle"], [mx, my - 30, "middle"], [mx, my + 32, "middle"], [mx, my - 40, "middle"], [mx, my + 42, "middle"]];
      const [lx, ly, la] = cands.find(c => !hits(...c)) || cands[0];
      out += svgLines(lx, ly, label, { cls: "lbl", anchor: la });
    }
  }
  for (const n of Object.values(N)) {
    out += '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="6" class="box' + (n.c ? " " + n.c : "") + '"/>' + svgLines(n.x + n.w / 2, n.y + n.h / 2, n.t);
  }
  let extra = 0;
  for (const [x, y, t, anchor] of s.notes || []) {
    const a = anchor || "middle";
    const lines = wrapText(t, a === "middle" ? W - 8 : W - x - 4);
    // 折り返した行は下へ伸ばし、図の下端の補足なら図の高さも伸ばす
    lines.forEach((ln, i) => { out += svgLines(x, y + i * 12, ln, { cls: "note", anchor: a }); });
    if (y > H - 30 && lines.length > 1) extra = Math.max(extra, (lines.length - 1) * 12 + 6);
  }
  return { W, H: H + extra, body: out };
}
function figSeqDiagram(s) {
  const W = s.w || 320, k = s.a.length, colW = W / k, id = "ah" + (++figSeq), top = 34, row = 26;
  const noteLines = s.note ? wrapText(s.note, W - 8) : [];
  const H = top + s.m.length * row + 12 + (noteLines.length ? 14 + noteLines.length * 12 : 0);
  const cx = i => colW * i + colW / 2;
  let out = marker(id);
  s.a.forEach((a, i) => {
    out += '<line x1="' + cx(i) + '" y1="' + (top - 6) + '" x2="' + cx(i) + '" y2="' + (top + s.m.length * row) + '" class="life"/>';
    // 名前が枠に収まらないときは文字を小さくする
    const est = [...a].reduce((s, c) => s + (/[\x00-\x7f]/.test(c) ? 0.56 : 1), 0) * 11;
    out += '<rect x="' + (cx(i) - colW / 2 + 3) + '" y="2" width="' + (colW - 6) + '" height="24" rx="6" class="box"/>' + svgLines(cx(i), 14, a, { fs: est > colW - 12 ? Math.max(8, Math.floor(11 * (colW - 12) / est)) : 0 });
  });
  s.m.forEach(([f, t, label, opt = ""], j) => {
    const y = top + j * row + row - 4;
    const cls = "ln" + (opt.includes("bad") ? " bad" : opt.includes("ok") ? " ok" : "") + (opt.includes("dash") ? " dash" : "");
    if (f === t) {
      out += '<circle cx="' + cx(f) + '" cy="' + (y - 4) + '" r="3" class="dot' + (opt.includes("bad") ? " bad" : opt.includes("ok") ? " ok" : "") + '"/>';
      out += svgLines(cx(f) + (f < k / 2 ? 8 : -8), y - 4, label, { cls: "lbl", anchor: f < k / 2 ? "start" : "end" });
    } else {
      const x1 = cx(f) + (t > f ? 3 : -3), x2 = cx(t) + (t > f ? -3 : 3);
      out += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" class="' + cls + '" marker-end="url(#' + id + ')"/>';
      out += svgLines((x1 + x2) / 2, y - 9, label, { cls: "lbl" });
    }
  });
  noteLines.forEach((ln, i) => { out += svgLines(W / 2, H - 8 - (noteLines.length - 1 - i) * 12, ln, { cls: "note" }); });
  return { W, H, body: out };
}
function diagHTML(qid) {
  if (!HAS_FIG || !FIGMAP[qid] || !FIG[FIGMAP[qid]]) return "";
  const s = FIG[FIGMAP[qid]];
  const r = s.type === "seq" ? figSeqDiagram(s) : figGraph(s);
  return '<figure class="fig"><figcaption class="small">図解：' + esc(s.cap) + '</figcaption><svg viewBox="0 0 ' + r.W + " " + r.H + '" role="img" aria-label="' + esc(s.cap) + '">' + r.body + "</svg></figure>";
}
// 対策を問う設問では、解答例の前に「何が起きているか」（攻撃や事象の説明）を示す
const whatHTML = x => x ? '<div class="card what"><p class="small">何が起きているか</p><p>' + esc(x) + "</p></div>" : "";
// 解説は要点（最初の1文）だけを見せ、残りと図解は「くわしく」に畳む
function explainHTML(text, qid, texts) {
  const s = String(text), k = s.indexOf("。");
  const cut = k >= 0 && k < s.length - 1;
  const head = cut ? s.slice(0, k + 1) : s, rest = cut ? s.slice(k + 1) : "";
  const dg = diagHTML(qid);
  const more = rest || dg ? '<details class="more"><summary>くわしく' + (dg ? "（図解あり）" : "") + "</summary>" + (rest ? "<p>" + esc(rest) + "</p>" : "") + dg + "</details>" : "";
  return "<p>" + esc(head) + "</p>" + more + abbrHTML(texts);
}
// 文章に出てくる略語を ABBR から探し、正式名称の一覧にする
function abbrHTML(texts) {
  if (typeof ABBR === "undefined") return "";
  const found = new Map();
  const tryKey = k => { if (ABBR[k] && !found.has(k)) found.set(k, ABBR[k]); return !!ABBR[k]; };
  for (const t of texts) {
    for (const m of String(t || "").matchAll(/[A-Za-z][A-Za-z0-9]*(?:[\-\/][A-Za-z0-9]+)*/g)) {
      const tok = m[0];
      if (tryKey(tok)) continue;
      for (const part of tok.split(/[\-\/]/)) {
        if (tryKey(part)) continue;
        const base = part.replace(/v?\d+$/, "");
        if (base && base !== part) tryKey(base);
      }
    }
  }
  if (!found.size) return "";
  const keys = [...found.keys()];
  const sum = "略語：" + (keys.length > 6 ? keys.slice(0, 6).join("・") + " ほか" : keys.join("・")) + "（タップで正式名称）";
  return '<details class="abbr"><summary>' + esc(sum) + "</summary><dl>" +
    [...found].map(([k, [en, ja]]) => "<dt>" + esc(k) + "</dt><dd>" + esc(en) + (ja ? "<span>" + esc(ja) + "</span>" : "") + "</dd>").join("") + "</dl></details>";
}

/* ===== IPAの過去問（科目A-1・A-2は4択、午後は本番演習） ===== */
const A2 = HAS_PAST ? PAST.a2 : [], A1 = HAS_PAST ? PAST.a1 : [], PM = HAS_PAST ? PAST.pm : [];
const ALL_A = () => A2.concat(A1);
function pastSummary() {
  const v = Object.values(S.past);
  const pm = Object.keys(S.pm).length;
  return "解いた問題 " + v.length + "問" + (v.length ? "・正答率 " + Math.round(v.filter(x => x.ok).length / v.length * 100) + "%" : "") + (pm ? "・午後 " + pm + "回" : "");
}
function pastImg(set, n) {
  const f = set.dir + "/" + set.key + "/q" + String(n).padStart(2, "0");
  const alt = set.src + " 問" + n + "の問題（画像）";
  return '<figure class="pq"><picture><source media="(max-width: 640px)" srcset="' + f + 'n.png"><img src="' + f + '.png" alt="' + esc(alt) + '" data-full="' + f + '.png"></picture>' +
    '<figcaption class="small">出典：' + esc(set.src) + " 問" + n + "（IPA）。スマホでは行を折り返して表示しています。画像をタップすると拡大します。</figcaption></figure>";
}
// 問題画像のタップで、元の大きさの画像を全画面に表示する
function openZoom(src, alt) {
  const o = document.createElement("div");
  o.className = "zoom"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", alt || "拡大表示");
  o.innerHTML = '<button type="button" class="opt zclose">閉じる</button><div class="zwrap"><img src="' + esc(src) + '" alt="' + esc(alt || "") + '"></div>';
  document.body.appendChild(o);
  const back = document.activeElement;
  const onKey = e => { if (e.key === "Escape") close(); };
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); if (back && back.focus) back.focus({ preventScroll: true }); };
  o.querySelector(".zclose").onclick = close;
  document.addEventListener("keydown", onKey);
  o.querySelector(".zclose").focus();
}
document.addEventListener("click", e => {
  const im = e.target && e.target.closest ? e.target.closest(".pq img, .pg img") : null;
  if (im) openZoom(im.dataset.full || im.src, im.alt);
});
// 午後の本文のかたまりは、どの画面でも同じ文字の大きさになるよう縮尺をそろえる
document.addEventListener("load", e => {
  const im = e.target;
  if (im && im.classList && im.classList.contains("pb")) im.style.width = Math.round(im.naturalWidth * 0.75) + "px";
}, true);
function pastLink(set, kind) {
  return set.pdf && set.pdf[kind] ? '<a href="' + esc(set.pdf[kind]) + '" target="_blank" rel="noopener">' + (kind === "ans" ? "解答例" : "問題冊子") + "（IPA・PDF）</a>" : "";
}
/* items: [{set, n}]。o.exam=true は本番形式（途中で正誤を出さず、見直してから採点する）。o.resume: 続きから */
async function runPast(items, o = {}) {
  let sess = o.resume;
  if (sess) items = sess.items.map(pastItem);
  else sess = { k: "past", items: items.map(x => PID(x.set.key, x.n)), i: 0, ok: 0, exam: !!o.exam, ans: items.map(() => null), ms: 0, intro: o.intro || "" };
  const L = items.length, set0 = items[0].set;
  actStart();
  if (o.resume) await coach("<p>IPAの過去問の続きです。" + (sess.exam ? "ここまでの解答は保存してあります。" : "") + "</p>", 250);
  else await coach("<p>" + esc(sess.intro) + '</p><p class="small">問題は、IPAが公表している問題冊子の画像です。解説は公表されていないため、正解だけを表示します。<span class="kbonly">キーボードなら1〜4キーでも答えられます。</span></p>', 300);
  S.sess = sess; save();
  let seg = Date.now();
  const elapsed = () => sess.ms + (Date.now() - seg);
  const flush = () => { sess.ms = elapsed(); seg = Date.now(); };
  const show = (i, wait) => coach('<span class="tag">' + (i + 1) + "/" + L + "　" + esc(items[i].set.subj) + "</span>" + pastImg(items[i].set, items[i].n), wait);
  const askAns = (i, extra) => {
    const { set, n } = items[i], a = sess.ans[i];
    return ask(KANA.map((k, j) => ({ label: k, value: j })), { row4: true, lead: set.label + " 問" + n + (sess.exam ? "　経過" + Math.floor(elapsed() / 60000) + "分 / " + set.min + "分" + (a === null ? "" : "（選んだ答え：" + KANA[a] + "）") : "") + "：答えを選んでください", extra });
  };
  let quit = false;
  let i = sess.exam ? (sess.ans.indexOf(null) < 0 ? L : sess.ans.indexOf(null)) : sess.i;
  const first = i;
  while (i < L) {
    await show(i, i > first ? 200 : 350);
    const pick = await askAns(i, (sess.exam && i > 0 ? [{ label: "← 前の問題", value: -3 }] : []).concat([{ label: "やめる", value: -1 }]));
    if (pick === -1) { quit = true; break; }
    if (pick === -3) { i--; continue; }
    if (sess.exam) { sess.ans[i] = pick; i++; sess.i = Math.max(sess.i, i); flush(); logAct(0); save(); continue; }
    const { set, n } = items[i];
    const correct = set.ans[n - 1], mine = KANA[pick], right = mine === correct;
    if (right) sess.ok++;
    i++; sess.i = i;
    S.past[PID(set.key, n)] = { ok: right, t: todayStr() }; logAct(1);
    if (i >= L) S.sess = null;
    save();
    await coach((right ? '<p><span class="ok">✓ 正解</span>　' + correct + "</p>" : '<p><span class="ng">✕ 不正解</span>　あなたの解答は ' + mine + "、<strong>正解は " + correct + "</strong></p>") +
      '<p class="small">' + pastLink(set, "ans") + "</p>", 200);
    if (i < L) {
      const go = await ask([{ label: "次の問題", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
      if (!go) { quit = true; break; }
    }
  }
  if (sess.exam && !quit) {
    // 採点の前に見直す
    for (;;) {
      await coach("<p>全" + L + "問に答えました（経過" + Math.floor(elapsed() / 60000) + "分）。採点の前に、答えを見直せます。</p><div class=\"card\"><p class=\"small\">あなたの解答</p><div class=\"ansgrid\">" + sess.ans.map((a, j) => "<span><b>" + (j + 1) + "</b>" + (a === null ? "－" : KANA[a]) + "</span>").join("") + "</div></div>", 250);
      const v = await ask([{ label: "採点する", value: "grade", primary: true }], { extra: [{ label: "見直す問題を選ぶ", value: "pick" }, { label: "やめる", value: "quit" }] });
      if (v === "grade") break;
      if (v === "quit") { quit = true; break; }
      const j = await ask(items.map((_, j) => ({ label: (j + 1) + " " + (sess.ans[j] === null ? "－" : KANA[sess.ans[j]]), value: j })), { lead: "見直す問題の番号を選んでください", cls: "grid6", extra: [{ label: "← 戻る", value: -1 }] });
      if (j < 0) continue;
      await show(j, 200);
      const p = await askAns(j, [{ label: "変えずに戻る", value: -1 }]);
      if (p >= 0) sess.ans[j] = p;
      flush(); save();
    }
  }
  flush();
  if (quit) {
    const any = sess.exam ? sess.ans.some(a => a !== null) : sess.i > 0;
    if (!any) { S.sess = null; save(); await coach("<p>中断しました。メニューに戻ります。</p>", 200); return { n: 0, ok: 0, quit: true }; }
    S.sess = sess; save();
    if (sess.exam) { await coach("<p>途中で止めました。ここまでの解答と経過時間は保存してあります。メニューの一番上の「続きから」で再開できます。</p>", 200); return { n: 0, ok: 0, quit: true }; }
  }
  let html, ok;
  if (sess.exam) {
    ok = 0;
    const wrong = [];
    items.forEach(({ set, n }, j) => {
      const correct = set.ans[n - 1], mine = sess.ans[j] === null ? "－" : KANA[sess.ans[j]], right = mine === correct;
      if (right) ok++; else wrong.push({ n, mine, correct });
      S.past[PID(set.key, n)] = { ok: right, t: todayStr() };
    });
    S.sess = null; logAct(L, 0); save();
    const rate = Math.round(ok / L * 100);
    html = "<p>" + L + "問中 <strong>" + ok + "問正解</strong>（" + rate + "%）でした。解答時間は約" + Math.round(sess.ms / 60000) + "分（本番は" + set0.min + "分）。" + (rate >= 60 ? set0.subj + "の基準点（60点）を越えています。" : set0.subj + "の基準点（60点）まであと少しです。") + "</p>";
    if (wrong.length) html += '<div class="card"><p class="small">見直したい問題</p><ul>' + wrong.map(r => "<li>問" + r.n + "：あなた " + r.mine + " → 正解 " + r.correct + "</li>").join("") + "</ul></div>";
    html += '<p class="small">' + pastLink(set0, "ans") + "　間違えた問題は、「IPAの過去問」→「過去問の復習リスト」から解き直せます。</p>";
  } else {
    ok = sess.ok;
    html = "<p>" + (ok === 0 ? sess.i + "問チャレンジしました。" : sess.i + "問解きました（そのうち" + ok + "問正解）。") + (quit ? "続きは、メニューの一番上の「続きから」で再開できます。" : "") + "</p>";
  }
  await coach(html + rewardHTML());
  return { n: sess.exam ? L : sess.i, ok, quit };
}
function pastPool(sets, filter) {
  const out = [];
  for (const set of sets) for (let n = 1; n <= set.ans.length; n++) if (filter(PID(set.key, n))) out.push({ set, n });
  return out;
}
const needA1 = () => !S.profile || S.profile.amI !== "exempt";
async function pickSet(sets, lead) {
  const key = await ask(sets.map(s => ({ label: s.label + "（" + pastPool([s], id => S.past[id]).length + "/" + s.ans.length + "）", value: s.key })), { lead, grid: true, extra: [{ label: "← 戻る", value: null }] });
  return key ? sets.find(s => s.key === key) : null;
}
async function pastMenu() {
  const scope = needA1() ? ALL_A() : A2;
  const wrong = pastPool(ALL_A(), id => S.past[id] && !S.past[id].ok);
  const fresh = pastPool(scope, id => !S.past[id]);
  const v = await ask([
    { label: "科目A-2：回を選んで25問（40分）", value: "a2", primary: true, full: true },
    A1.length ? { label: "科目A-1：回を選んで30問（50分）", value: "a1" } : null,
    { label: "科目A-2からランダムに10問", value: "rand" },
    { label: "まだ解いていない問題から10問", value: "new" },
    wrong.length ? { label: "過去問の復習リスト（" + wrong.length + "問）", value: "wrong" } : null,
    PM.length ? { label: "午後の本番演習（" + esc(PM[0].subjAll) + "）", value: "pm", full: true } : null,
    { label: "午後の過去問PDF（リンク）", value: "pdf" }
  ].filter(Boolean), { lead: "IPAの過去問（直近5年）", grid: true, extra: [{ label: "← メニューへ", value: null }] });
  if (v === "a2" || v === "a1") {
    const set = await pickSet(v === "a2" ? A2 : A1, "解く回を選んでください");
    if (!set) return;
    await runPast(Array.from({ length: set.ans.length }, (_, i) => ({ set, n: i + 1 })), { exam: true, intro: set.src + "の" + set.ans.length + "問を、本番と同じく" + set.min + "分を目安に解きます。正誤は最後にまとめて表示します。前の問題に戻ったり、採点の前に見直したりできます。" });
  } else if (v === "rand") await runPast(shuffle(pastPool(A2, () => true)).slice(0, 10), { intro: "直近5年の科目A-2から、ランダムに10問出します。" });
  else if (v === "new") {
    if (!fresh.length) { await coach("<p>すべての過去問を一度は解きました。おつかれさまでした。間違えた問題の解き直しがおすすめです。</p>", 200); return; }
    await runPast(shuffle(fresh).slice(0, 10), { intro: "まだ解いていない過去問から10問出します。" + (needA1() ? "科目A-1も含みます。" : "") });
  } else if (v === "wrong") await runPast(shuffle(wrong).slice(0, 10), { intro: "前回間違えた過去問を、最大10問解き直します。" });
  else if (v === "pm") await pmMenu();
  else if (v === "pdf") await coach(pmHTML(), 300);
}
function pmHTML() {
  const kind = { qs: "問題", ans: "解答例", cmnt: "採点講評" };
  const rows = A2.map(s => {
    const parts = (s.pm || []).map(p => "<li>" + esc(p.name) + "：" + ["qs", "ans", "cmnt"].filter(k => p[k]).map(k => '<a href="' + esc(p[k]) + '" target="_blank" rel="noopener">' + kind[k] + "</a>").join("　") + "</li>").join("");
    return '<div class="card"><p><strong>' + esc(s.label) + "</strong></p><ul>" + parts + "</ul></div>";
  }).join("");
  return "<p>午後のPDFはIPAの公式サイトにあります。アプリ内で解く場合は「午後の本番演習」を使ってください。</p>" + rows;
}

/* ----- 午後の本番演習 ----- */
function pmPageHTML(set, page, alt) {
  const d = set.dir + "/" + set.key + "/" + page.id;
  return '<div class="pg"><div class="pg-wide"><img src="' + d + '.png" loading="lazy" alt="' + esc(alt) + '"></div><div class="pg-narrow">' +
    [...page.b].map((t, k) => '<img class="pb pb-' + t + '" src="' + d + "_" + (k + 1) + '.png" loading="lazy" data-full="' + d + '.png" alt="' + (k ? "" : esc(alt)) + '">').join("") + "</div></div>";
}
function pmPagesHTML(set, pages, what) {
  return pages.map((p, i) => pmPageHTML(set, p, set.src + " " + what + "（" + (i + 1) + "/" + pages.length + "ページ）")).join("");
}
const pmElapsed = r => Math.max(0, (r.pauseAt || Date.now()) - r.start - (r.paused || 0));
const pmMin = r => Math.floor(pmElapsed(r) / 60000);
/* 演習中の操作パネル。経過時間は分単位で表示し、隠すこともできる。戻り値: {prob:n} | "memo" | "end" | "pause" */
function pmDock(set, run) {
  return new Promise(res => {
    clearDock(); $dock.classList.add("pmdock");
    setLead("");
    const lead = document.getElementById("dockLead");
    const tick = () => {
      const ms = pmElapsed(run), lim = set.min * 60000;
      run.seen = Date.now();
      lead.textContent = set.label + " " + set.subj + (run.hide ? "" : "　経過 " + Math.floor(ms / 60000) + "分 / " + set.min + "分" + (ms > lim ? "（時間切れ）" : "（残り" + Math.ceil((lim - ms) / 60000) + "分）"));
    };
    tick(); saveLocal();
    const timer = setInterval(() => { tick(); saveLocal(); }, 15000);
    const done = (label, v) => { clearInterval(timer); clearDock(); me(label); res(v); };
    // 問題を読む場所を広く取るため、操作は2行にまとめる。「終了」は控えめにして離して置く
    const btn = (label, cls, said, v, parent) => { const b = document.createElement("button"); b.type = "button"; b.className = "opt " + cls; b.textContent = label; b.onclick = () => done(said, v); parent.appendChild(b); return b; };
    const r1 = document.createElement("div"); r1.className = "row probs";
    set.probs.forEach(p => btn("問" + p.n, "", "問" + p.n + "を開く", { prob: p.n }, r1));
    $dock.appendChild(r1);
    const r2 = document.createElement("div"); r2.className = "row";
    btn("メモ" + (run.memo ? "✓" : ""), "", "解答メモ", "memo", r2);
    btn("中断", "quiet", "中断（あとで続ける）", "pause", r2);
    const h = document.createElement("button"); h.type = "button"; h.className = "opt quiet";
    const hl = () => { h.textContent = run.hide ? "時間を表示" : "時間を隠す"; h.setAttribute("aria-pressed", run.hide ? "true" : "false"); };
    hl(); h.onclick = () => { run.hide = !run.hide; hl(); tick(); saveLocal(); };
    r2.appendChild(h);
    const sp = document.createElement("span"); sp.className = "sep"; r2.appendChild(sp);
    btn("終了", "quiet", "終了する", "end", r2);
    $dock.appendChild(r2);
    focusDock(r1.firstChild); settle();
  });
}
async function runPm(set) {
  let run = S.pmrun && S.pmrun.key === set.key ? S.pmrun : null;
  if (run) {
    const away = run.pauseAt ? Date.now() - run.pauseAt : 0;
    if (run.pauseAt) { run.paused = (run.paused || 0) + away; run.pauseAt = 0; }
    await coach("<p>" + esc(set.src) + "の続きです。" + (away >= 60000 ? "離れていた間は時間を止めていたので、" : "") + "経過時間は " + pmMin(run) + "分 です。</p>", 250);
  } else {
    run = { key: set.key, start: Date.now(), paused: 0, pauseAt: 0, memo: "", seen: Date.now(), hide: false };
    await coach("<p>" + esc(set.src) + "を、本番と同じく<strong>" + set.min + "分</strong>で解きます。" + esc(set.pick) + "です。</p>" +
      '<p class="small">問題はIPAが公表している問題冊子の画像です。画像をタップすると拡大します。解答は「メモ」に入力できます。アプリを閉じたり別の画面に切り替えたりすると、その間は時間が自動で止まります。</p>', 350);
  }
  S.pmrun = run; pmActive = run; save();
  try {
    for (;;) {
      const a = await pmDock(set, run);
      if (a && a.prob) {
        const p = set.probs.find(x => x.n === a.prob);
        await coach('<span class="tag">' + esc(set.subj) + " 問" + p.n + "</span>" + pmPagesHTML(set, p.pages, "問" + p.n) + '<p class="small">出典：' + esc(set.src) + " 問" + p.n + "（IPA）。スマホでは本文を折り返して表示しています。</p>", 300);
      } else if (a === "memo") {
        const r = await askText("pm-" + set.key, "解答メモ（" + set.subj + "）", 5000);
        if (r.text) { run.memo = r.text; save(); await coach("<p>解答メモを保存しました。</p>", 150); }
      } else if (a === "pause") {
        run.pauseAt = Date.now(); save();
        await coach("<p>中断しました。経過 " + pmMin(run) + "分 で止めています。メニューの一番上の「午後演習の続き」から再開できます。</p>", 200);
        return;
      } else if (a === "end") {
        const left = set.min - pmMin(run);
        if (left > 0) {
          const y = await ask([{ label: "続ける", value: false, primary: true }], { lead: "まだ" + left + "分あります。終了して解答例を見ますか", extra: [{ label: "終了して解答例を見る", value: true }] });
          if (!y) continue;
        }
        const ms = pmElapsed(run);
        pmActive = null;
        await coach("<p>おつかれさまでした。解答時間は <strong>約" + Math.round(ms / 60000) + "分</strong>（本番は" + set.min + "分）でした。</p>" +
          (run.memo ? '<div class="card"><p class="small">あなたの解答メモ</p><p class="qtext">' + esc(run.memo) + "</p></div>" : ""), 250);
        await coach('<span class="tag">解答例</span>' + pmPagesHTML(set, set.ans, "解答例") + '<p class="small">出典：' + esc(set.src) + " 解答例（IPA）</p>", 400);
        if (set.cmnt.length) await coach('<span class="tag">採点講評</span>' + pmPagesHTML(set, set.cmnt, "採点講評") + '<p class="small">出典：' + esc(set.src) + " 採点講評（IPA）</p>", 300);
        const g = await ask([{ label: "60点以上", value: 3 }, { label: "50〜59点", value: 2 }, { label: "40〜49点", value: 1 }, { label: "40点未満", value: 0 }], { lead: "解答例と比べて、自己採点の目安を選んでください（合格基準は60点）", grid: true });
        S.pm[set.key] = { g, min: Math.round(ms / 60000), t: todayStr() };
        S.pmrun = null; logAct(1, ms); save();
        await coach("<p>" + ["まずは解答例の言い回しを書き写して、根拠になった本文の箇所を確かめましょう。", "あと一歩です。採点講評で、多くの人が落とした論点を確認しましょう。", "合格ラインまでもう少しです。字数と、設問が求める字句の使い方を見直しましょう。", "合格ラインを越えています。この調子で、別の回にも挑戦しましょう。"][g] + "</p>" + rewardHTML(), 200);
        return;
      }
    }
  } finally { pmActive = null; }
}
async function pmMenu() {
  const opts = PM.map(s => {
    const r = S.pm[s.key], cur = S.pmrun && S.pmrun.key === s.key;
    return { label: s.label + " " + s.subj + (cur ? "（途中から再開）" : r ? "（" + ["40点未満", "40〜49点", "50〜59点", "60点以上"][r.g] + "）" : ""), value: s.key, primary: cur };
  });
  const key = await ask(opts, { lead: "午後の本番演習：解く回を選んでください", grid: true, extra: [{ label: "← 戻る", value: null }] });
  if (!key) return;
  const set = PM.find(s => s.key === key);
  if (S.pmrun && S.pmrun.key !== key) {
    const ok = await ask([{ label: "新しく始める", value: true, primary: true }], { lead: "途中の演習（" + (PM.find(s => s.key === S.pmrun.key) || {}).label + "）があります。破棄して新しく始めますか", extra: [{ label: "やめる", value: false }] });
    if (!ok) return;
    S.pmrun = null;
  }
  await runPm(set);
}

/* ===== 分析 ===== */
function domainScore(k) {
  const weak = S.profile ? S.profile.weak : [];
  const s = S.stats[k];
  const qr = s && s.n ? s.c / s.n : null;
  const ws = WRITE.filter(w => w.d === k && S.write[w.id]).map(w => S.write[w.id].r / 2);
  const wr = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
  if (qr === null && wr === null) return weak.includes(k) ? .3 : .55;
  if (qr === null) return wr;
  if (wr === null) return qr;
  return (qr + wr) / 2;
}
function weakest() { return Object.keys(DOMAINS).map(k => [k, domainScore(k)]).sort((a, b) => a[1] - b[1])[0][0]; }
const wrongIds = () => Object.keys(S.last).filter(k => S.last[k] === false);

async function showProgress() {
  const t = totals();
  const weakSet = new Set(S.profile.weak);
  const bars = Object.entries(DOMAINS).map(([k, label]) => {
    const s = S.stats[k]; const r = s && s.n ? s.c / s.n : 0;
    const pct = Math.round(r * 100);
    return '<div class="bar" role="img" aria-label="' + esc(label) + "：" + (s && s.n ? "正答率" + pct + "%、" + s.n + "問" : "未着手") + '"><span>' + esc(label) + (weakSet.has(k) ? "（苦手）" : "") + '</span><span class="t"><b class="' + (s && s.n && r < .6 ? "low" : "") + '" style="width:' + Math.max(s && s.n ? 3 : 0, pct) + '%"></b></span><span class="v">' + (s && s.n ? pct + "%（" + s.n + "問）" : "未着手") + "</span></div>";
  }).join("");
  const wv = Object.values(S.write);
  const cv = Object.values(S.cases);
  const plan = buildPlan(S.profile);
  const phaseTxt = plan.phases.length ? "P" + (currentPhase(plan)+1) + "　" + plan.phases[currentPhase(plan)].t : "—";
  const dayTxt = plan.done ? "試験日を過ぎました" : plan.today ? "本日" : plan.days + "日";
  const weakNow = Object.entries(S.stats).filter(([, s]) => s.n >= 3 && s.c / s.n < .6).map(([k]) => DOMAINS[k]);
  await coach('<div class="card"><dl class="kv"><dt>試験まで</dt><dd>' + esc(dayTxt) + "（" + esc(slash(S.profile.exam)) + "）</dd><dt>現在のフェーズ</dt><dd>" + esc(phaseTxt) +
    "</dd><dt>4択</dt><dd>" + t.n + "問・正答率 " + (t.n ? Math.round(t.c / t.n * 100) + "%" : "—") + "</dd><dt>記述</dt><dd>" + wv.length + " / " + WRITE.length + "題（○ " + wv.filter(v => v.r === 2).length + "）</dd><dt>事例</dt><dd>" + cv.length + " / " + CASES.length + "事例" + (cv.length ? "（平均 " + Math.round(cv.reduce((a, b) => a + b.p, 0) / cv.length) + "点）" : "") +
    "</dd>" + (HAS_PAST ? "<dt>IPAの過去問</dt><dd>" + pastSummary() + "</dd>" : "") + "<dt>復習リスト</dt><dd>" + wrongIds().length + "問</dd><dt>今週解いた問題</dt><dd>" + weekSolved() + "問（" + weekDays() + " / 7日・連続 " + streak() + "日）</dd><dt>累計</dt><dd>" + totalSolved() + "問</dd><dt>記録の保存先</dt><dd>" + (cloud ? "Claudeの保存領域（別の端末でも続きから再開できます）" : "この端末（ブラウザ）の中") + "</dd></dl>" + weekHTML() + "</div><div class=\"card\">" + bars + "</div>" +
    (weakNow.length ? "<p>伸びしろが大きい分野：<strong>" + esc(weakNow.join("、")) + "</strong>。ここから優先して出題します。</p>" : t.n ? "<p>60%を下回っている分野はありません。未着手の分野を埋めていきましょう。</p>" : "<p>まだ記録がありません。「今日の学習」から始めましょう。</p>"), 450);
}

/* ===== 会話の流れ ===== */
function targetOptions() {
  const t = todayStr(), L = EXAM.late, C = EXAM.cur;
  const o = [];
  if (t <= L.bEnd) o.push({ label: "令和8年度後期を受ける（" + (t <= L.applyEnd ? "申込 " + mds(L.applyStart) + "〜" + mds(L.applyEnd) : "申込済みの方") + "）", value: "late" });
  if (t <= C.bEnd) o.push({ label: "令和8年度前期の科目Bを受ける（申込済みの方・" + mds(C.bStart) + "〜" + mds(C.bEnd) + "）", value: "r8b" });
  o.push({ label: "2027年度以降の試験を目指す（新制度）", value: "next" });
  return o;
}
async function onboarding(redo) {
  const old = redo ? S.profile : null;
  if (!redo) await coach("<p>はじめまして。情報処理安全確保支援士試験（SC）の合格まで伴走するコーチです。</p><p>6つほどの質問に答えてもらえれば、あなた専用の学習計画を作ります。1分ほどで終わります。答えを間違えたら「← 前の質問」で戻れます。</p>");
  if (!redo && !S.ob) {
    const v0 = await ask([{ label: "質問に答える（約1分）", value: "go", primary: true }, { label: "まず1問だけやってみる", value: "one" }], { lead: "どちらから始めますか" });
    if (v0 === "one") { await runQuiz(1, null, null, { one: true }); await coach("<p>こんな感じで進めていきます。では、計画づくりの質問に答えてください。</p>", 250); }
  }
  const A = old ? Object.assign({}, old, { weak: old.weak.slice() }) : { weak: [], exp: "some", amI: "none" };
  const t = () => todayStr();
  const lateAOpen = () => A.target === "late" && t() <= EXAM.late.aEnd;
  const steps = [
    { run: async back => {
        await coach("<p>どの試験を目指しますか。</p>", 300);
        const opts = targetOptions();
        if (S.profile) opts.push({ label: "作り直しをやめる", value: "cancel", quiet: true });
        const v = await ask(opts, { lead: "目指す試験", back });
        if (v === BACK || v === "cancel") return v;
        A.target = v;
        if (v === "r8b") await coach("<p>科目Bの期間中ですね。ここからは記述対策に絞った短期集中プランにします。</p>" + moreHTML("試験の形式と日程", fmtHTML() + curCard()), 400);
        else if (v === "late") await coach("<p>後期は、記述式の科目Bを受けられる最後の回になる見込みです。申込期間を忘れずに予約しましょう。</p>" + moreHTML("試験の形式と日程", fmtHTML() + lateCard() + sourceHTML()), 400);
        else await coach("<p>2027年度からは新しい試験制度に移行し、科目Bは選択式に変わる見込みです。セキュリティの知識そのものは変わらず役に立つので、このまま準備を進めましょう。</p>" + moreHTML("試験の形式と日程", nextCard() + sourceHTML()), 400);
        return v;
      } },
    { skip: () => A.target === "r8b", run: async back => {
        await coach("<p>科目A-1（旧午前I）の免除について教えてください。次のいずれかから2年以内で、申込時に申請すれば免除されます。</p><ul><li>応用情報技術者試験に合格</li><li>高度試験または情報処理安全確保支援士試験に合格</li><li>高度試験・支援士試験の科目A-1（午前I）で基準点以上</li></ul>" + (A.target === "next" ? "<p class=\"small\">新制度での免除の扱いは公表待ちです。</p>" : ""), 300);
        const v = await ask([{ label: "免除される", value: "exempt" }, { label: "免除されない", value: "none" }, { label: "よくわからない", value: "unknown" }], { lead: "科目A-1の免除", back });
        if (v === BACK) return v;
        A.amI = v;
        if (v === "unknown") await coach("<p>わかりました。免除されない前提で、科目A-1の対策も計画に入れておきます。</p>", 250);
        return v;
      } },
    { skip: () => A.target === "r8b", run: async back => {
        await coach("<p>セキュリティの実務経験はどのくらいありますか。</p>", 300);
        const v = await ask([{ label: "ほぼない（独学・学生）", value: "none" }, { label: "少しある（運用・社内ITでの対応）", value: "some" }, { label: "専門業務をしている（SOC・診断・CSIRTなど）", value: "pro" }], { lead: "実務経験", back });
        if (v !== BACK) A.exp = v;
        return v;
      } },
    { run: async back => {
        await coach("<p>1週間で勉強に使えるのは何時間くらいですか。無理のない数字で大丈夫です。</p>", 300);
        const v = await askHours(A.hours, { back });
        if (v !== BACK) A.hours = v;
        return v;
      } },
    { run: async back => {
        await coach("<p>苦手、または自信がない分野を選んでください。選んだ分野から優先して出題します。</p>", 300);
        const v = await askMulti(Object.entries(DOMAINS).map(([value, label]) => ({ value, label })), A.weak, { lead: "苦手な分野（複数選べます）", back });
        if (v !== BACK) A.weak = v;
        return v;
      } },
    { skip: () => !lateAOpen(), run: async back => {
        await coach("<p>科目Aを受ける予定の日を教えてください。まだ予約していなければ仮の日付で大丈夫です。</p>", 300);
        const min = maxD(addDays(t(), 1), EXAM.late.aStart);
        const v = await askDate(A.aDate || EXAM.late.aStart, "後期の科目Aの実施期間は " + EXAM.late.a + " です。", { min, max: EXAM.late.aEnd, back });
        if (v !== BACK) A.aDate = v;
        return v;
      } },
    { run: async back => {
        let v;
        if (A.target === "r8b") {
          await coach("<p>予約した科目Bの受験日を教えてください。</p>", 300);
          const min = maxD(t(), EXAM.cur.bStart);
          v = await askDate(A.target === (old && old.target) && old.exam >= min ? old.exam : min, "科目Bの実施期間は " + EXAM.cur.b + " です。予約内容はIPAのマイページで確認できます。", { min, max: EXAM.cur.bEnd, back });
        } else if (A.target === "late") {
          await coach("<p>科目Bを受ける予定の日を教えてください。まだ予約していなければ仮の日付で大丈夫です。</p>", 300);
          const min = maxD(maxD(t(), EXAM.late.bStart), lateAOpen() && A.aDate ? addDays(A.aDate, 1) : "");
          v = await askDate(old && old.target === "late" && old.exam >= min ? old.exam : min, "後期の科目Bの実施期間は " + EXAM.late.b + " です。予約したら「その他」→「計画を作り直す」で日付を合わせてください。", { min, max: EXAM.late.bEnd, back });
        } else {
          await coach("<p>目標の受験日を決めましょう。2027年度の日程は未発表なので、仮の日付で計画を作ります。日程が発表されたら「その他」→「計画を作り直す」で更新してください。</p>", 300);
          const d0 = "2027-10-16";
          v = await askDate(old && old.target === "next" && old.exam > t() ? old.exam : (d0 > t() ? d0 : addDays(t(), 180)), "初期値は仮の日付です（2026年度前期の科目Aの開始時期を参考にした目安）。", { back });
        }
        if (v !== BACK) A.exam = v;
        return v;
      } }
  ];
  for (;;) {
    let i = 0, dir = 1;
    if (!redo && !S.profile && S.ob) { Object.assign(A, S.ob.A); i = Math.min(S.ob.i, steps.length - 1); await coach("<p>前回の続きから再開します。</p>", 200); }
    while (i < steps.length) {
      const st = steps[i];
      if (st.skip && st.skip()) { i += dir; if (i < 0) { i = 0; dir = 1; } continue; }
      const r = await st.run(i > 0);
      if (r === "cancel") { await coach("<p>今の計画のままにしておきます。</p>", 200); return false; }
      if (r === BACK) { dir = -1; i = Math.max(0, i - 1); } else { dir = 1; i++; }
      if (!S.profile) { S.ob = { A: Object.assign({}, A, { weak: A.weak.slice() }), i }; save(); }
    }
    S.profile = {
      target: A.target, amI: A.target === "r8b" ? "exempt" : A.amI, exp: A.exp, hours: A.hours,
      weak: A.weak, exam: A.exam, aDate: lateAOpen() ? A.aDate : "", start: todayStr()
    };
    S.ob = null;
    save();
    await showPlan(true);
    const ok = await ask([{ label: "この計画で始める", value: true, primary: true }], { lead: "この計画でよいですか", extra: [{ label: "回答を直す", value: false }] });
    if (ok) { await coach("<p>では始めましょう。まずは「今日の学習」がおすすめです。</p>", 250); return true; }
    redo = true;
  }
}
async function showPlan(first) {
  const p = S.profile;
  const plan = buildPlan(p);
  if (plan.done || plan.today) { await coach(plan.today ? "<p>今日が試験日です。ここまでの積み重ねを信じて、落ち着いていきましょう。</p>" : "<p>設定した試験日を過ぎています。「その他」→「計画を作り直す」で次の目標を設定してください。</p>", 300); return; }
  if (first) {
    // 最初は「いまの期間」と「今日やること」だけ。全体は「その他」から見られる
    const ci = currentPhase(plan), ph = plan.phases[ci];
    await coach("<p>計画ができました。試験まで <strong>" + plan.days + "日</strong> です。</p><div class=\"card\"><p>いまの期間：<strong>P" + (ci + 1) + " " + esc(ph.t) + "</strong>（" + esc(mds(ph.to)) + "まで）</p><p class=\"mt\">今日やること：<strong>「今日の学習」を1回（約10分）</strong></p></div><p class=\"small\">全体の計画と時間割は、いつでも「その他」→「学習計画を見る」で見られます。</p>", 500);
    return;
  }
  let note = "";
  if (p.target !== "r8b") {
    const need = { none: 300, some: 200, pro: 100 }[p.exp];
    const who = { none: "セキュリティの実務経験がほぼない人", some: "応用情報に合格していて実務経験が少しある人", pro: "セキュリティの専門業務をしている人" }[p.exp];
    if (plan.total < need) note = '<p class="small">参考：' + who + "は、合格まで" + need + "時間前後が一つの目安と言われます。今の設定では約" + plan.total + "時間です。足りない分は、過去問を解く量で少しずつ補えば大丈夫です。</p>";
  }
  await coach("<p>現在の学習計画です。試験まで <strong>" + plan.days + "日</strong>、勉強時間は合計で約 <strong>" + plan.total + "時間</strong> の見込みです。</p>" + datesHTML(p) + planHTML(plan) + "<p>目安の時間割は <strong>" + (plan.weekday ? "平日" + hm(plan.weekday) + " ＋ " : "") + "土日" + hm(plan.weekend) + "ずつ</strong>（週" + p.hours + "時間）です。</p>" + note, 600);
}
async function todaySession(resume) {
  const plan = buildPlan(S.profile);
  const ph = plan.phases.length ? plan.phases[currentPhase(plan)] : null;
  const key = ph ? ph.key : "base";
  const early = ["base", "deep", "acheck"].includes(key);
  const nq = key === "acheck" ? 10 : early ? 5 : 3;
  let intro;
  if (plan.done) intro = "試験日を過ぎたので、復習モードです。苦手分野を中心に4択" + nq + "問と記述1題をやりましょう。次の目標は「その他」→「計画を作り直す」で設定できます。";
  else {
    const label = ph ? "今日はP" + (currentPhase(plan)+1) + "「" + ph.t + "」の期間です。" : "";
    intro = label + (key === "acheck" ? "科目Aが近いので、4択10問で仕上げましょう。記述は余裕があれば1題。" : early ? "4択5問で知識を確認してから、記述を1題やりましょう。" : "科目B対策の時期なので記述が中心です。まず4択3問でウォームアップしましょう。" + (written(S.profile) ? "" : "（新制度の科目Bは選択式の見込みですが、理由を説明できる力はそのまま得点につながります）"));
  }
  if (!resume) await coach("<p>" + esc(intro) + "（約10分）</p>");
  const q = await runQuiz(nq, null, null, { today: true, resume });
  if (q.n) { S.done = todayStr(); markDay(); save(); }
  if (q.quit) return;
  let wrote = 0, cased = 0;
  const go = await ask([{ label: "記述に進む", value: true, primary: true }], { extra: [{ label: "今日はここまで", value: false }] });
  if (go) {
    const w = await runWrite();
    if (w.quit) return;
    wrote += w.n;
    if (!early && !plan.done) {
      const more = await ask([{ label: "もう1題書く", value: "w", primary: true }, { label: "事例演習を1問", value: "c" }], { extra: [{ label: "今日はここまで", value: "" }] });
      if (more === "w") { const w2 = await runWrite(); if (w2.quit) return; wrote += w2.n; }
      else if (more === "c") { const c2 = await runCase(); if (c2.quit) return; cased += c2.n; }
    }
  }
  S.done = todayStr(); markDay(); save();
  const next = DOMAINS[weakest()];
  await coach('<div class="card"><dl class="kv"><dt>今日やったこと</dt><dd>4択 ' + q.n + "問・記述 " + wrote + "題" + (cased ? "・事例 " + cased + "問" : "") + "（約" + minTxt(todayLog().ms) + "）</dd><dt>明日のおすすめ</dt><dd>" + esc(next) + "の4択と記述</dd></dl></div>" + rewardHTML() + "<p>" + (HAS_PAST ? "おつかれさまでした。IPAの過去問は、メニューの「IPAの過去問」から回ごとに解けます。" : "おつかれさまでした。過去問演習は、IPA公式サイトで公開されている問題で並行して進めてください。") + "</p>", 350);
}
async function pickDomain(kind) {
  const keys = Object.keys(DOMAINS).filter(k => kind !== "write" || WRITE.some(w => w.d === k));
  const opts = [{ label: "おまかせ（苦手優先）", value: "", primary: true, full: true }].concat(keys.map(k => ({ label: DOMAINS[k], value: k })));
  return ask(opts, { lead: "分野を選んでください", grid: true, extra: [{ label: "← メニューへ", value: null }] });
}
async function resetFlow() {
  await coach("<p>学習記録と計画をすべて消去します。元に戻せませんが、よろしいですか。</p>", 250);
  const y = await ask([{ label: "やめておく", value: false, primary: true }], { extra: [{ label: "記録をすべて消去する", value: true }] });
  if (!y) return;
  S = blank(); save(); clearDrafts(); $log.innerHTML = "";
  await onboarding(false);
}
async function otherMenu() {
  const v = await ask([
    { label: "学習計画を見る", value: "plan" },
    { label: "試験日程を見る", value: "exam" },
    { label: "計画を作り直す", value: "redo" },
    { label: "記録を消去", value: "reset", danger: true }
  ], { lead: "その他", grid: true, extra: [{ label: "← 戻る", value: null }] });
  if (v === "plan") await showPlan(false);
  else if (v === "exam") await coach(examHTML(), 300);
  else if (v === "redo") { await coach("<p>学習記録は残したまま、計画を作り直します。</p>", 250); await onboarding(true); }
  else if (v === "reset") await resetFlow();
}
function sessLabel() {
  const s = S.sess;
  if (!s) return "";
  if (s.k === "quiz") return (s.today ? "今日の学習" : "4択") + "（あと" + (s.ids.length - s.i) + "問）";
  if (s.k === "past") {
    const left = s.exam ? s.ans.filter(a => a === null).length : s.items.length - s.i, it = pastItem(s.items[0]);
    return "IPAの過去問" + (it ? " " + it.set.label : "") + (left ? "（あと" + left + "問）" : "（採点の前）");
  }
  const c = CASES.find(x => x.id === s.id);
  return "事例演習「" + c.title + "」（設問" + (s.i + 1) + "から）";
}
async function resumeSess() {
  const s = S.sess;
  if (s.k === "quiz") { if (s.today) await todaySession(s); else await runQuiz(0, null, null, { resume: s }); }
  else if (s.k === "past") await runPast(null, { resume: s });
  else await runCase(s);
}
async function moreMenu() {
  const wrong = wrongIds();
  const v = await ask([
    { label: "4択を5問（おまかせ・約5分）", value: "quiz", primary: true, full: true },
    { label: "4択の分野を選ぶ", value: "quizd" },
    { label: "10分だけ4択", value: "box" },
    { label: "記述トレーニング（約5分）", value: "write" },
    { label: "事例演習（約15分）", value: "case" },
    wrong.length ? { label: "復習リスト（" + wrong.length + "問）", value: "wrong" } : null,
    HAS_PAST ? { label: "IPAの過去問（直近5年）", value: "past" } : null,
    S.done === todayStr() ? { label: "今日の学習をもう一度", value: "today" } : null
  ].filter(Boolean), { lead: "ほかの学習", grid: true, extra: [{ label: "← 戻る", value: null }] });
  if (v === "quiz") await runQuiz(5);
  else if (v === "quizd") { const d = await pickDomain("quiz"); if (d !== null) await runQuiz(5, d || null); }
  else if (v === "box") await runQuiz(20, null, null, { box: true });
  else if (v === "write") await runWrite();
  else if (v === "case") await runCase();
  else if (v === "wrong") await runQuiz(Math.min(10, wrong.length), null, wrong);
  else if (v === "past") await pastMenu();
  else if (v === "today") await todaySession();
}
async function oneQuestion() {
  const r = await runQuiz(1, null, null, { one: true });
  if (!r.n) return;
  const first = S.done !== todayStr();
  S.done = todayStr(); save();
  await coach("<p>" + (first ? "今日の分はOKです。1問でも、続けたことに意味があります。" : "おつかれさまです。") + "</p>" + rewardHTML(), 250);
}
async function menuOnce() {
  renderStatus();
  if (storageNotice && !cloud) { storageNotice = false; await coach("<p>この環境では学習記録を保存できません。ページを閉じると記録が消えます。</p>", 200); }
  const doneToday = S.done === todayStr();
  const rec = weakest(), drafts = writeDrafts();
  const pmSet = S.pmrun ? PM.find(s => s.key === S.pmrun.key) : null;
  // 次にやることを大きなボタン1つで示す（続き → 今日の学習 → おすすめ の順）
  const opts = [];
  if (S.sess) opts.push({ label: "続きから：" + sessLabel(), value: "resume", primary: true, full: true });
  if (pmSet) opts.push({ label: "午後演習の続き（" + pmSet.label + "・経過" + pmMin(S.pmrun) + "分）", value: "pm", primary: !opts.length, full: true });
  if (!doneToday) opts.push({ label: "今日の学習（約10分）", value: "today", primary: !opts.length, full: true });
  else if (!opts.length) opts.push({ label: "おすすめの4択（" + DOMAINS[rec] + "中心・約5分）", value: "rec", primary: true, full: true });
  if (drafts.length) opts.push({ label: "書きかけの記述を続ける", value: "draft", full: true });
  opts.push({ label: "1問だけ（約1分）", value: "one" }, { label: "ほかの学習…", value: "more" });
  const v = await ask(opts, { lead: doneToday ? "今日の分は完了しています ✓" : "次は何をしますか", grid: true, extra: [{ label: "進捗を見る", value: "progress" }, { label: "その他", value: "other" }] });
  if (v === "resume") await resumeSess();
  else if (v === "pm") await runPm(pmSet);
  else if (v === "today") await todaySession();
  else if (v === "rec") await runQuiz(5, rec, null, { mix: true });
  else if (v === "draft") await runWrite(null, drafts[0].id);
  else if (v === "one") await oneQuestion();
  else if (v === "more") await moreMenu();
  else if (v === "progress") await showProgress();
  else if (v === "other") await otherMenu();
}
async function menu() {
  for (;;) {
    try { await menuOnce(); }
    catch (e) { console.error(e); await coach("<p>表示中に問題が起きました。メニューに戻ります。</p>", 0); }
  }
}
async function main() {
  // 端末内の保存データをブラウザに自動削除させないよう依頼する（対応ブラウザのみ）
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const wait = document.createElement("div");
  wait.className = "msg";
  wait.innerHTML = '<div class="av" aria-hidden="true">' + AV + '</div><div class="bub"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> <span class="small">記録を読み込んでいます</span></div>';
  $log.appendChild(wait);
  await cloudInit();
  wait.remove();
  renderStatus();
  if (!cloud && window.claude && (S.profile || S.ob)) await coach('<p class="small">この表示では、記録はこのブラウザの中にだけ保存されます。Claudeにログインした状態で開くと、どの端末からでも続きから再開できます。</p>', 0);
  if (!S.profile) await onboarding(false);
  else {
    const p = S.profile;
    const plan = buildPlan(p);
    const s = streak();
    const t = todayStr();
    let extra = "";
    if (p.target === "late" && t >= addDays(EXAM.late.applyStart, -7) && t <= EXAM.late.applyEnd)
      extra = "<p><strong>後期の申込受付" + (t < EXAM.late.applyStart ? "が" + mds(EXAM.late.applyStart) + "から始まります" : "中です（" + mds(EXAM.late.applyEnd) + "まで）") + "。</strong>科目Aと科目Bの受験日時も予約しましょう。</p>";
    if (plan.done) await coach("<p>おかえりなさい。設定した試験日（" + esc(slash(p.exam)) + "）を過ぎました。おつかれさまでした。</p><p>次の試験を目指すなら「その他」→「計画を作り直す」で目標を設定してください。演習はこのまま続けられます。</p>");
    else if (plan.today) await coach("<p>おかえりなさい。今日が試験日です。新しいことには手を出さず、弱点ノートを軽く見直して臨みましょう。</p>");
    else await coach("<p>おかえりなさい。試験まであと <strong>" + plan.days + "日</strong>、いまはP" + (currentPhase(plan)+1) + "「" + esc(plan.phases[currentPhase(plan)].t) + "」の期間です。" +
      (s ? "連続" + s + "日学習中です。" : S.days.length ? "また今日から始めましょう。" : "") + (S.sess || S.pmrun ? "前回の続きから再開できます。" : "") + "</p>" + (S.days.length ? weekHTML() : "") + extra);
  }
  await menu();
}
main().catch(e => {
  console.error(e);
  $dock.innerHTML = '<p class="lead">読み込み中に問題が起きました。</p><button type="button" class="opt primary" id="rl">再読み込み</button><button type="button" class="opt danger" id="wipe">記録を消去して再開</button>';
  document.getElementById("rl").onclick = () => location.reload();
  document.getElementById("wipe").onclick = () => { try { localStorage.removeItem(KEY); } catch (_) {} location.reload(); };
});
