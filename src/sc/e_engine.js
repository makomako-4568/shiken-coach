
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
const blank = () => ({ v: SCHEMA, at: 0, profile: null, stats: {}, last: {}, write: {}, cases: {}, past: {}, days: [], done: "", ob: null });
const HAS_PAST = typeof PAST !== "undefined" && Array.isArray(PAST) && PAST.length > 0;
const PID = (key, n) => key + "-" + n;
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
  for (const [k, v] of Object.entries(obj(d.write))) {
    if (!WIDS.has(k)) continue;
    if ([0, 1, 2].includes(v)) s.write[k] = { r: v, t };
    else if (v && [0, 1, 2].includes(v.r) && isDate(v.t)) s.write[k] = { r: v.r, t: v.t };
  }
  for (const [k, v] of Object.entries(obj(d.cases))) if (CIDS.has(k) && v && Number.isFinite(v.p) && v.p >= 0 && v.p <= 100 && isDate(v.t)) s.cases[k] = { p: v.p, t: v.t };
  for (const [k, v] of Object.entries(obj(d.past))) if (/^\d{4}r\d\d[ah]_(sc|nw)-\d{1,2}$/.test(k) && v && typeof v.ok === "boolean" && isDate(v.t)) s.past[k] = { ok: v.ok, t: v.t };
  if (Array.isArray(d.days)) s.days = d.days.filter(isDate).slice(-120);
  if (isDate(d.done)) s.done = d.done;
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
// 画面を閉じる・切り替えるときは待たずに保存する
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && cloud) { clearTimeout(cloudTimer); pushCloud(); } });
function loadDraft(id) { try { const d = JSON.parse(localStorage.getItem(DKEY) || "null"); return d && d.id === id && typeof d.text === "string" ? d.text : ""; } catch (e) { return ""; } }
function saveDraft(id, text) { try { if (text) localStorage.setItem(DKEY, JSON.stringify({ id, text })); else localStorage.removeItem(DKEY); } catch (e) {} }

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
/* 記述の入力。戻り値: {text} | {skip:true} | {quit:true} | {extra:true} */
function askText(id, lead, lim, extraLabel) {
  return new Promise(res => {
    clearDock();
    setLead(lead, "q");
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.innerHTML = '<textarea id="ans" placeholder="' + lim + '字以内で解答" aria-describedby="cnt ansHint"></textarea>' +
      '<div class="row"><button type="button" class="opt quiet" id="quit">やめる</button><span class="grow"></span>' +
      (extraLabel ? '<button type="button" class="opt quiet" id="extra">' + esc(extraLabel) + "</button>" : "") +
      '<button type="button" class="opt quiet" id="skip">答えを見る</button><button type="button" class="opt primary" id="send">送信</button></div>' +
      '<div class="row"><span class="count" id="cnt" aria-live="polite">0 / ' + lim + '字</span></div>' +
      '<p class="hint" id="ansHint">空白を除いて数えています（本番の数え方はIPAの案内で確認してください）。Ctrl＋Enter（Macは⌘＋Enter）でも送信できます。</p>';
    $dock.appendChild(wrap);
    const t = document.getElementById("ans"), c = document.getElementById("cnt"), h = document.getElementById("ansHint"), q = document.getElementById("quit");
    t.setAttribute("aria-labelledby", "dockLead");
    let armed = false;
    const recount = () => {
      const n = clen(t.value);
      c.textContent = n + " / " + lim + "字" + (n > lim ? "（" + (n - lim) + "字オーバー）" : "");
      c.classList.toggle("over", n > lim);
    };
    t.value = loadDraft(id); recount();
    t.oninput = () => {
      recount(); saveDraft(id, t.value);
      if (t.value.trim()) { t.removeAttribute("aria-invalid"); h.className = "hint"; h.textContent = "Ctrl＋Enter（Macは⌘＋Enter）でも送信できます。"; }
      if (armed) { armed = false; q.textContent = "やめる"; }
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
    q.onclick = () => {
      if (t.value.trim() && !armed) {
        armed = true; q.textContent = "消してやめる";
        h.className = "hint err"; h.textContent = "書いた内容は消えます。やめる場合は「消してやめる」を押してください。";
        return;
      }
      saveDraft(id, ""); clearDock(); me("やめる"); res({ quit: true });
    };
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
  const t = totals();
  const head = plan.done ? "試験終了" : plan.today ? "本日試験" : "あと" + plan.days + "日";
  let ph = "";
  if (plan.phases.length) { const i = currentPhase(plan); ph = "<span>P" + (i+1) + '<span class="ph-name"> ' + esc(plan.phases[i].t) + "</span></span>"; }
  const acc = t.n >= 5 ? "正答率 " + Math.round(t.c / t.n * 100) + "%" : "4択 " + t.n + "問";
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

/* ===== 4択 ===== */
function pickQuiz(n, domain, ids) {
  const weak = new Set(S.profile ? S.profile.weak : []);
  const pool = QUIZ.filter(q => (!domain || q.d === domain) && (!ids || ids.includes(q.id))).map(q => {
    const st = S.stats[q.d], rate = st && st.n ? st.c / st.n : .5;
    let w = 1 + (weak.has(q.d) ? 2 : 0) + (rate < .6 ? 1 : 0);
    if (S.last[q.id] === true) w *= .25;
    if (S.last[q.id] === false) w *= 2;
    if (!(q.id in S.last)) w *= 1.5;
    return { q, w: w * Math.random() };
  });
  pool.sort((a, b) => b.w - a.w);
  return pool.slice(0, n).map(x => x.q);
}
async function runQuiz(n, domain, ids) {
  const qs = pickQuiz(n, domain, ids);
  let ok = 0, done = 0, quit = false;
  await coach("<p>" + (ids ? "前回間違えた問題を" : "科目A-2（旧午前II）形式の4択を") + qs.length + "問いきます。ほかの選択肢がなぜ違うかも考えてみてください。</p><p class=\"small\">キーボードなら1〜4キーでも答えられます。</p>");
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const order = shuffle(q.c.map((t, k) => ({ t, k })));
    await coach('<span class="tag">Q' + (i+1) + "/" + qs.length + "　正解" + ok + '</span><p class="qtext">' + esc(q.q) + "</p>", i ? 250 : 450);
    const pick = await ask(order.map(o => ({ label: o.t, value: o.k })), { wide: true, lead: "答えを選んでください", extra: [{ label: "やめる", value: -1 }] });
    if (pick === -1) { quit = true; break; }
    const right = pick === 0;
    if (right) ok++;
    done++;
    const st = S.stats[q.d] || (S.stats[q.d] = { c: 0, n: 0 });
    st.n++; if (right) st.c++;
    S.last[q.id] = right; markDay(); save();
    const ansKana = KANA[order.findIndex(o => o.k === 0)], mineKana = KANA[order.findIndex(o => o.k === pick)];
    await coach('<span class="tag">' + esc(DOMAINS[q.d]) + "</span>" +
      (right ? '<p><span class="ok">✓ 正解</span>　' + ansKana + "　" + esc(q.c[0]) + "</p>"
             : '<p><span class="ng">✕ 不正解</span></p><ul><li>あなたの解答：' + mineKana + "　" + esc(q.c[pick]) + "</li><li><strong>正解：" + ansKana + "　" + esc(q.c[0]) + "</strong></li></ul>") +
      "<p>" + esc(q.e) + "</p>", 250);
    if (i < qs.length - 1) {
      const go = await ask([{ label: "次の問題", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
      if (!go) { quit = true; break; }
    }
  }
  if (!done) { await coach("<p>中断しました。メニューに戻ります。</p>", 200); return { n: 0, ok: 0, quit: true }; }
  const rate = Math.round(ok / done * 100);
  const msg = done < 10
    ? "今回は" + done + "問中 <strong>" + ok + "問正解</strong>でした。" + (rate >= 80 ? "この調子で続けましょう。" : rate >= 60 ? "間違えた問題は、メニューの「間違えた問題」から復習できます。" : "解説の用語をテキストで確認してから、もう一度挑戦しましょう。")
    : done + "問中 <strong>" + ok + "問正解</strong>（" + rate + "%）でした。" + (rate >= 80 ? "科目A-2の合格ラインを十分に越えています。" : rate >= 60 ? "合格ラインの60%は越えています。間違えた問題は今日中に見直しましょう。" : "まだ伸びしろが大きいところです。解説の用語を確認してから、もう一度挑戦しましょう。");
  await coach("<p>" + msg + (quit ? "（途中でやめました。ここまでの記録は保存しています）" : "") + "</p>");
  return { n: done, ok, quit };
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
async function runWrite(domain) {
  const w = pickWrite(domain);
  await coach('<span class="tag">記述　' + esc(DOMAINS[w.d]) + "</span><p>" + esc(w.s) + "</p><p><strong>" + esc(w.q.replace(/。$/, "")) + "（" + w.lim + "字以内）。</strong></p><p class=\"small\">科目Bでは「何が起きたか」と「なぜそうなるか」をセットで書くのがコツです。</p>");
  const r = await askText(w.id, "設問：" + w.q.replace(/。$/, "") + "（" + w.lim + "字以内）", w.lim);
  if (r.quit) { await coach("<p>中断しました。メニューに戻ります。</p>", 200); return { n: 0, quit: true }; }
  const ansHTML = '<p class="answer"><span class="tag">解答例</span><br>' + esc(w.a) + "</p><p>" + esc(w.note) + "</p>";
  if (r.skip) {
    S.write[w.id] = { r: 0, t: todayStr() }; save();
    await coach(ansHTML + "<p>解答例を一度書き写すと、言い回しが身につきます。この問題は" + GAP_TXT[0] + "</p>");
    return { n: 0 };
  }
  const gh = gradeHTML(r.text, w);
  await coach(gh.html + ansHTML);
  const g = await ask([{ label: "○ 書けた", value: 2 }, { label: "△ 惜しい", value: 1 }, { label: "× 書けなかった", value: 0 }], { lead: "解答例と比べて自己採点してください（語句の一致からの目安：" + gh.sug + "）" });
  S.write[w.id] = { r: g, t: todayStr() }; markDay(); save();
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
async function runCase() {
  const c = pickCase();
  const n = c.qs.length;
  await coach('<span class="tag">事例　' + esc(DOMAINS[c.d]) + "</span><p><strong>" + esc(c.title) + "</strong></p><p>" + esc(c.s) + "</p>" + figHTML(c.fig) + '<p class="small">設問は' + n + "問です。図表は「図表を見る」でいつでも再表示できます。</p>", 600);
  let score = 0, answered = 0, quit = false;
  for (let i = 0; i < n && !quit; i++) {
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
      if (pick === -1) { quit = true; break; }
      const right = pick === sq.ans;
      if (right) score++;
      const ak = KANA[order.findIndex(o => o.k === sq.ans)];
      await coach((right ? '<p><span class="ok">✓ 正解</span></p>' : '<p><span class="ng">✕ 不正解</span>　正解は <strong>' + ak + "　" + esc(sq.c[sq.ans]) + "</strong></p>") + "<p>" + esc(sq.e) + "</p>", 250);
    } else {
      let r;
      for (;;) {
        r = await askText(c.id + "-" + i, "設問" + (i+1) + "：" + sq.q, sq.lim, "図表を見る");
        if (!r.extra) break;
        await coach(figHTML(c.fig), 150); await coach(head, 150);
      }
      if (r.quit) { quit = true; break; }
      const ansHTML = '<p class="answer"><span class="tag">解答例</span><br>' + esc(sq.a) + "</p><p>" + esc(sq.note) + "</p>";
      if (r.skip) await coach(ansHTML, 250);
      else {
        const gh = gradeHTML(r.text, sq);
        await coach(gh.html + ansHTML, 250);
        const g = await ask([{ label: "○ 書けた", value: 2 }, { label: "△ 惜しい", value: 1 }, { label: "× 書けなかった", value: 0 }], { lead: "自己採点してください（語句の一致からの目安：" + gh.sug + "）" });
        score += [0, .5, 1][g];
      }
    }
    answered++;
    if (i < n - 1) {
      const go = await ask([{ label: "次の設問へ", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
      if (!go) quit = true;
    }
  }
  if (quit && answered < n) {
    await coach("<p>中断しました。" + (answered ? "途中までの結果は記録しません。" : "") + "メニューに戻ります。</p>", 200);
    return { n: 0, quit: true };
  }
  const p = Math.round(score / n * 100);
  S.cases[c.id] = { p, t: todayStr() }; markDay(); save();
  await coach("<p>この事例の得点の目安は <strong>" + p + "点</strong> です（設問ごとに等配点で計算）。本番の科目Bは60点が合格基準です。</p><p class=\"small\">本番の事例は数ページあり、設問も10前後あります。IPAの過去問でも同じ手順（図表から根拠を探す→指定の字句を使う→字数内でまとめる）で練習しましょう。</p>");
  return { n: 1 };
}


/* ===== IPAの過去問（午前II） ===== */
function pastSummary() {
  const v = Object.values(S.past);
  const total = PAST.length * 25;
  return v.length + " / " + total + "問" + (v.length ? "・正答率 " + Math.round(v.filter(x => x.ok).length / v.length * 100) + "%" : "");
}
function pastImg(set, n) {
  const f = "past/" + set.key + "/q" + String(n).padStart(2, "0");
  const alt = set.src + " 問" + n + "の問題（画像）";
  return '<figure class="pq"><picture><source media="(max-width: 640px)" srcset="' + f + 'n.png"><img src="' + f + '.png" alt="' + esc(alt) + '" data-full="' + f + '.png"></picture>' +
    '<figcaption class="small">出典：' + esc(set.src) + " 問" + n + "（IPA）。スマホでは行を折り返して表示しています。画像をタップすると拡大します。</figcaption></figure>";
}
// 問題画像のタップで、元の大きさの画像を全画面に表示する
function openZoom(src, alt) {
  const o = document.createElement("div");
  o.className = "zoom"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", alt);
  o.innerHTML = '<button type="button" class="opt zclose">閉じる</button><div class="zwrap"><img src="' + esc(src) + '" alt="' + esc(alt) + '"></div>';
  document.body.appendChild(o);
  const back = document.activeElement;
  const onKey = e => { if (e.key === "Escape") close(); };
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); if (back && back.focus) back.focus({ preventScroll: true }); };
  o.querySelector(".zclose").onclick = close;
  document.addEventListener("keydown", onKey);
  o.querySelector(".zclose").focus();
}
document.addEventListener("click", e => {
  const im = e.target && e.target.closest ? e.target.closest(".pq img") : null;
  if (im) openZoom(im.dataset.full || im.src, im.alt);
});
function pastLink(set, kind) {
  const p = set.pdf.find(x => x.name === "午前II");
  return p && p[kind] ? '<a href="' + esc(p[kind]) + '" target="_blank" rel="noopener">' + (kind === "ans" ? "解答例" : "問題冊子") + "（IPA・PDF）</a>" : "";
}
/* items: [{set, n}]。o.exam=true は本番形式（途中で正誤を出さず、最後にまとめて表示） */
async function runPast(items, o = {}) {
  let ok = 0, done = 0, quit = false;
  const t0 = Date.now(), res = [];
  await coach("<p>" + esc(o.intro) + "</p><p class=\"small\">問題は、IPAが公表している問題冊子の画像です。解説は公表されていないため、正解だけを表示します。キーボードなら1〜4キーでも答えられます。</p>", 300);
  for (let i = 0; i < items.length; i++) {
    const { set, n } = items[i];
    await coach('<span class="tag">' + (i + 1) + "/" + items.length + (o.exam ? "" : "　正解" + ok) + "</span>" + pastImg(set, n), i ? 200 : 350);
    const pick = await ask(KANA.map((k, j) => ({ label: k, value: j })), { row4: true, lead: set.label + " 問" + n + "：答えを選んでください", extra: [{ label: "やめる", value: -1 }] });
    if (pick === -1) { quit = true; break; }
    const correct = set.ans[n - 1], mine = KANA[pick], right = mine === correct;
    if (right) ok++;
    done++;
    res.push({ set, n, mine, correct, right });
    S.past[PID(set.key, n)] = { ok: right, t: todayStr() }; markDay(); save();
    if (!o.exam) {
      await coach((right ? '<p><span class="ok">✓ 正解</span>　' + correct + "</p>" : '<p><span class="ng">✕ 不正解</span>　あなたの解答は ' + mine + "、<strong>正解は " + correct + "</strong></p>") +
        '<p class="small">' + pastLink(set, "ans") + "</p>", 200);
      if (i < items.length - 1) {
        const go = await ask([{ label: "次の問題", value: true, primary: true }], { extra: [{ label: "ここでやめる", value: false }] });
        if (!go) { quit = true; break; }
      }
    }
  }
  if (!done) { await coach("<p>中断しました。メニューに戻ります。</p>", 200); return { n: 0, ok: 0, quit: true }; }
  const rate = Math.round(ok / done * 100);
  const min = Math.round((Date.now() - t0) / 60000);
  let html = "<p>" + done + "問中 <strong>" + ok + "問正解</strong>（" + rate + "%）でした。" + (o.exam && done === 25 ? "解答時間は約" + min + "分（本番は40分）。" + (rate >= 60 ? "科目A-2の基準点（60点）を越えています。" : "科目A-2の基準点（60点）まであと少しです。") : "") + "</p>";
  const wrong = res.filter(r => !r.right);
  if (o.exam && wrong.length) html += '<div class="card"><p class="small">間違えた問題</p><ul>' + wrong.map(r => "<li>問" + r.n + "：あなた " + r.mine + " → 正解 " + r.correct + "</li>").join("") + "</ul></div>";
  if (o.exam) html += '<p class="small">' + pastLink(items[0].set, "ans") + "　間違えた問題は、メニューの「IPAの過去問」→「間違えた過去問」から解き直せます。</p>";
  await coach(html + (quit ? "<p class=\"small\">（途中でやめました。ここまでの記録は保存しています）</p>" : ""));
  return { n: done, ok, quit };
}
function pastPool(filter) {
  const out = [];
  for (const set of PAST) for (let n = 1; n <= 25; n++) if (filter(PID(set.key, n))) out.push({ set, n });
  return out;
}
async function pastMenu() {
  const wrong = pastPool(id => S.past[id] && !S.past[id].ok);
  const fresh = pastPool(id => !S.past[id]);
  const v = await ask([
    { label: "回を選んで25問（本番形式・40分）", value: "set", primary: true, full: true },
    { label: "全回からランダムに10問", value: "rand" },
    { label: "まだ解いていない問題から10問（残り" + fresh.length + "問）", value: "new" },
    wrong.length ? { label: "間違えた過去問（" + wrong.length + "問）", value: "wrong" } : null,
    { label: "午後（科目B）の過去問", value: "pm" }
  ].filter(Boolean), { lead: "IPAの過去問（午前II・直近5年）", grid: true, extra: [{ label: "← メニューへ", value: null }] });
  if (v === "set") {
    const key = await ask(PAST.map(s => ({ label: s.label + "（" + pastPool(id => id.startsWith(s.key + "-") && S.past[id]).length + "/25）", value: s.key })), { lead: "解く回を選んでください", grid: true, extra: [{ label: "← 戻る", value: null }] });
    if (!key) return;
    const set = PAST.find(s => s.key === key);
    await runPast(Array.from({ length: 25 }, (_, i) => ({ set, n: i + 1 })), { exam: true, intro: set.src + "の25問を、本番と同じく40分を目安に解きます。正誤は最後にまとめて表示します。" });
  } else if (v === "rand") await runPast(shuffle(pastPool(() => true)).slice(0, 10), { intro: "直近5年の午前IIから、ランダムに10問出します。" });
  else if (v === "new") {
    if (!fresh.length) { await coach("<p>すべての過去問を一度は解きました。おつかれさまでした。間違えた問題の解き直しがおすすめです。</p>", 200); return; }
    await runPast(shuffle(fresh).slice(0, 10), { intro: "まだ解いていない過去問から10問出します。" });
  } else if (v === "wrong") await runPast(shuffle(wrong).slice(0, 10), { intro: "前回間違えた過去問を、最大10問解き直します。" });
  else if (v === "pm") await coach(pmHTML(), 300);
}
function pmHTML() {
  const kind = { qs: "問題", ans: "解答例", cmnt: "採点講評" };
  const rows = PAST.map(s => {
    const parts = s.pdf.filter(p => p.name !== "午前II").map(p => "<li>" + esc(p.name) + "：" + ["qs", "ans", "cmnt"].filter(k => p[k]).map(k => '<a href="' + esc(p[k]) + '" target="_blank" rel="noopener">' + kind[k] + "</a>").join("　") + "</li>").join("");
    return '<div class="card"><p><strong>' + esc(s.label) + "</strong></p><ul>" + parts + "</ul></div>";
  }).join("");
  return "<p>午後（科目B）は長文と図が中心なので、IPAのPDFで解きます。時間を計って解き、解答例と採点講評で答え合わせをしましょう。</p>" + rows + '<p class="small">リンク先はIPAの公式サイトのPDFです。</p>';
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
    "</dd><dt>4択</dt><dd>" + t.n + "問・正答率 " + (t.n ? Math.round(t.c / t.n * 100) + "%" : "—") + "（全" + QUIZ.length + "問）</dd><dt>記述</dt><dd>" + wv.length + " / " + WRITE.length + "題（○ " + wv.filter(v => v.r === 2).length + "）</dd><dt>事例</dt><dd>" + cv.length + " / " + CASES.length + "事例" + (cv.length ? "（平均 " + Math.round(cv.reduce((a, b) => a + b.p, 0) / cv.length) + "点）" : "") +
    "</dd>" + (HAS_PAST ? "<dt>IPAの過去問</dt><dd>" + pastSummary() + "</dd>" : "") + "<dt>間違えた問題</dt><dd>" + wrongIds().length + "問</dd><dt>今週の学習</dt><dd>" + weekDays() + " / 7日（連続 " + streak() + "日）</dd><dt>記録の保存先</dt><dd>" + (cloud ? "Claudeの保存領域（別の端末でも続きから再開できます）" : "この端末（ブラウザ）の中") + "</dd></dl></div><div class=\"card\">" + bars + "</div>" +
    (weakNow.length ? "<p>正答率が60%を下回っている分野：<strong>" + esc(weakNow.join("、")) + "</strong>。ここを集中的に回しましょう。</p>" : t.n ? "<p>60%を下回っている分野はありません。未着手の分野を埋めていきましょう。</p>" : "<p>まだ記録がありません。「今日の学習」から始めましょう。</p>"), 450);
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
        if (v === "r8b") await coach("<p>科目Bの期間中ですね。ここからは記述対策に絞った短期集中プランにします。</p>" + fmtHTML() + curCard(), 400);
        else if (v === "late") await coach("<p>後期は、記述式の科目Bを受けられる最後の回になる見込みです。申込期間を忘れずに予約しましょう。</p>" + fmtHTML() + lateCard() + sourceHTML(), 400);
        else await coach("<p>2027年度からは新しい試験制度に移行し、科目Bは選択式に変わる見込みです。セキュリティの知識そのものは変わらず役に立つので、このまま準備を進めましょう。</p>" + nextCard() + sourceHTML(), 400);
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
  if (first && p.target !== "r8b") {
    const need = { none: 300, some: 200, pro: 100 }[p.exp];
    const who = { none: "セキュリティの実務経験がほぼない人", some: "応用情報に合格していて実務経験が少しある人", pro: "セキュリティの専門業務をしている人" }[p.exp];
    if (plan.total < need) await coach('<div class="card warn"><p><strong>先に一つだけ。</strong>' + who + "の一般的な目安は、合格まで" + need + "時間前後です。今の設定だと約" + plan.total + "時間なので、週の時間を増やすか、過去問を解く量で補うと安心です。</p></div>", 300);
  }
  const msg = first ? "<p>計画ができました。試験まで <strong>" + plan.days + "日</strong>、勉強時間は合計で約 <strong>" + plan.total + "時間</strong> の見込みです。</p>" : "<p>現在の学習計画です。</p>";
  await coach(msg + datesHTML(p) + planHTML(plan) + "<p>目安の時間割は <strong>" + (plan.weekday ? "平日" + hm(plan.weekday) + " ＋ " : "") + "土日" + hm(plan.weekend) + "ずつ</strong>（週" + p.hours + "時間）です。</p>", 600);
}
async function todaySession() {
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
  await coach("<p>" + esc(intro) + "</p>");
  const q = await runQuiz(nq);
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
  await coach('<div class="card"><dl class="kv"><dt>今日の成果</dt><dd>4択 ' + q.n + "問（正解" + q.ok + "）・記述 " + wrote + "題" + (cased ? "・事例 " + cased + "問" : "") + "</dd><dt>今週の学習</dt><dd>" + weekDays() + " / 7日</dd><dt>明日のおすすめ</dt><dd>" + esc(next) + "の4択と記述</dd></dl></div><p>" + (HAS_PAST ? "おつかれさまでした。IPAの過去問は、メニューの「IPAの過去問」から回ごとに解けます。" : "おつかれさまでした。過去問演習は、IPA公式サイトで公開されている問題で並行して進めてください。") + "</p>", 350);
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
  S = blank(); save(); saveDraft("", ""); $log.innerHTML = "";
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
async function menuOnce() {
  renderStatus();
  if (storageNotice && !cloud) { storageNotice = false; await coach("<p>この環境では学習記録を保存できません。ページを閉じると記録が消えます。</p>", 200); }
  const doneToday = S.done === todayStr();
  const wrong = wrongIds();
  const rec = weakest();
  const opts = [];
  if (doneToday) opts.push({ label: "おすすめ：" + DOMAINS[rec] + "の4択", value: "rec", primary: true, full: true }, { label: "今日の学習をもう一度", value: "today" });
  else opts.push({ label: "今日の学習", value: "today", primary: true, full: true });
  opts.push({ label: "4択演習（科目A-2）", value: "quiz" }, { label: "記述トレーニング", value: "write" }, { label: "事例演習（科目B形式）", value: "case" });
  if (wrong.length) opts.push({ label: "間違えた問題（" + wrong.length + "問）", value: "wrong" });
  if (HAS_PAST) opts.push({ label: "IPAの過去問（直近5年）", value: "past" });
  opts.push({ label: "進捗を見る", value: "progress" });
  const v = await ask(opts, { lead: doneToday ? "今日の学習は完了しています ✓　次は何をしますか" : "次は何をしますか", grid: true, extra: [{ label: "その他", value: "other" }] });
  if (v === "today") await todaySession();
  else if (v === "rec") await runQuiz(5, rec);
  else if (v === "quiz") { const d = await pickDomain("quiz"); if (d !== null) await runQuiz(5, d || null); }
  else if (v === "write") { const d = await pickDomain("write"); if (d !== null) await runWrite(d || null); }
  else if (v === "case") await runCase();
  else if (v === "wrong") await runQuiz(Math.min(10, wrong.length), null, wrong);
  else if (v === "past") await pastMenu();
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
      (s ? "連続" + s + "日学習中です。" : S.days.length ? "また今日から始めましょう。" : "") + "</p>" + extra);
  }
  await menu();
}
main().catch(e => {
  console.error(e);
  $dock.innerHTML = '<p class="lead">読み込み中に問題が起きました。</p><button type="button" class="opt primary" id="rl">再読み込み</button><button type="button" class="opt danger" id="wipe">記録を消去して再開</button>';
  document.getElementById("rl").onclick = () => location.reload();
  document.getElementById("wipe").onclick = () => { try { localStorage.removeItem(KEY); } catch (_) {} location.reload(); };
});
