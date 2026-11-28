// Многоязычность: русский (по умолчанию) и румынский.
// Тексты в коде и HTML остаются русскими. Для румынского страница переводится по словарю, где ключ — русский текст.
// Чего в словаре нет, остаётся по-русски: поэтому переводить можно по шагам, ничего не ломая.
//
// Как добавить перевод: assets/i18n/ro-<пакет>.js  →  I18n.add("ro", {"Русский текст": "Text românesc", "Учеников: {n}": "Elevi: {n}"});
// Новый пакет нужно один раз вписать в PACKS ниже. {имя} в ключе — место для любого текста (число, имя), оно переносится в перевод.
// Пользовательский текст (сообщения чата, темы уроков) помечайте translate="no": такие блоки не переводятся.
(() => {
  const LANGS = {ru:{label:"RU", locale:"ru-RU"}, ro:{label:"RO", locale:"ro-RO"}};
  const PACKS = ["common", "login", "landing"];   // шаги 1–2; следующие шаги дописывают сюда имена пакетов

  const me = document.currentScript, ver = ((me && /[?&]v=([\w.-]+)/.exec(me.src)) || [])[1] || "";
  let lang = "ru";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (LANGS[q]) localStorage.setItem("lang", q);
    const s = localStorage.getItem("lang"); if (LANGS[s]) lang = s;
  } catch {}
  const root = document.documentElement; root.lang = lang;

  const MAP = {}, TPL = {}, PAT = {};
  const norm = s => String(s).replace(/\s+/g, " ").trim();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function add(l, obj){
    const m = MAP[l] ??= new Map(), t = TPL[l] ??= new Map(), p = PAT[l] ??= [];
    for (const [k, v] of Object.entries(obj)){
      const key = norm(k);
      if (!key.includes("{")) { m.set(key, v); continue; }
      t.set(key, v);
      const re = new RegExp("^" + key.split(/(\{\w+\})/).map(x => /^\{\w+\}$/.test(x) ? "(?<" + x.slice(1, -1) + ">.+?)" : esc(x)).join("") + "$");
      p.push({re, v});
    }
  }
  function lookup(core){
    const r = MAP[lang]?.get(core); if (r != null) return r;
    for (const p of PAT[lang] || []){ const x = p.re.exec(core); if (x) return p.v.replace(/\{(\w+)\}/g, (_, n) => x.groups[n] ?? ""); }
    return null;
  }
  // для строк, которые собираются в коде: I18n.t("Класс {c}", {c:"7А"})
  function t(ru, vars){
    const tpl = lang === "ru" ? null : (TPL[lang]?.get(norm(ru)) ?? MAP[lang]?.get(norm(ru)));
    const s = tpl ?? ru;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : s;
  }
  function tr(text){
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text); const core = norm(m[2]); if (!core) return null;
    const r = lookup(core); return r == null ? null : m[1] + r + m[3];
  }

  // ───── перевод страницы (только если язык не русский) ─────
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const inNo = el => !!(el && el.closest && el.closest('[translate="no"]'));
  function attrs(el){
    for (const a of ATTRS){ const v = el.getAttribute && el.getAttribute(a); if (v){ const r = tr(v); if (r !== null && r !== v) el.setAttribute(a, r); } }
    if (el.nodeName === "META" && (el.name === "description" || /^og:/.test(el.getAttribute("property") || ""))){ const v = el.content, r = v && tr(v); if (r) el.content = r; }
    if (el.nodeName === "INPUT" && /^(submit|button|reset)$/.test(el.type)){ const r = tr(el.value); if (r !== null) el.value = r; }
  }
  function walk(n){
    if (n.nodeType === 3){ const p = n.parentNode; if (p && !SKIP.has(p.nodeName)){ const r = tr(n.nodeValue); if (r !== null && r !== n.nodeValue) n.nodeValue = r; } return; }
    if (n.nodeType !== 1 || SKIP.has(n.nodeName) || n.getAttribute("translate") === "no") return;
    attrs(n); for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  function translatePage(){ walk(root); }

  let started = false;
  function start(){
    if (started || lang === "ru") return; started = true;
    new MutationObserver(recs => { for (const r of recs){
      if (r.type === "childList") r.addedNodes.forEach(n => { if (!inNo(n.nodeType === 1 ? n : n.parentNode)) walk(n); });
      else if (r.type === "characterData"){ const p = r.target.parentNode; if (p && !SKIP.has(p.nodeName) && !inNo(p)){ const x = tr(r.target.nodeValue); if (x !== null && x !== r.target.nodeValue) r.target.nodeValue = x; } }
      else if (r.type === "attributes" && !inNo(r.target)) attrs(r.target);
    } }).observe(root, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:ATTRS});
    translatePage();
    // словари при document.write выполняются уже после этого прохода: повторяем, когда страница разобрана (заголовок, meta)
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", translatePage);
  }

  // ───── словари ─────
  if (lang !== "ru"){
    const src = p => "/assets/i18n/" + lang + "-" + p + ".js" + (ver ? "?v=" + ver : "");
    if (document.readyState === "loading"){ PACKS.forEach(p => document.write('<script src="' + src(p) + '"><\/script>')); start(); }   // синхронно: страница не мигает русским
    else { let left = PACKS.length; PACKS.forEach(p => { const s = document.createElement("script"); s.src = src(p); s.onload = s.onerror = () => { if (!--left) { started = false; start(); } }; document.head.append(s); }); }
  }

  // ───── переключатель языка ─────
  function mountSwitcher(){
    if (document.querySelector(".lang-sw")) return;
    const st = document.createElement("style");
    st.textContent = ".lang-sw{display:inline-flex;gap:2px;padding:3px;border-radius:999px;border:1.5px solid var(--line,#dbe4f2);background:var(--sheet,#fff);font:600 .78rem/1 var(--sans,system-ui,sans-serif);flex:none}"
      + ".lang-sw button{border:0;background:transparent;color:var(--muted,#5a6784);padding:7px 11px;border-radius:999px;cursor:pointer;font:inherit;letter-spacing:.04em}"
      + ".lang-sw button:hover{color:var(--ink,#16213d)}.lang-sw button[aria-pressed=true]{background:linear-gradient(135deg,var(--accent2,#4c7dff),var(--accent,#233f8f));color:var(--on-accent,#fff)}"
      + ".lang-sw.fixed{position:fixed;top:14px;right:14px;z-index:60;box-shadow:0 8px 20px -10px rgba(22,33,61,.4)}.lang-grp{display:flex;gap:8px;align-items:center}";
    document.head.append(st);
    const sw = document.createElement("div"); sw.className = "lang-sw"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Язык / Limbă"); sw.translate = false;
    Object.entries(LANGS).forEach(([k, v]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = v.label; b.lang = k;
      b.setAttribute("aria-pressed", String(k === lang)); b.onclick = () => I18n.set(k); sw.append(b); });
    const hd = document.querySelector("header");
    const host = hd && (hd.querySelector(".right") || hd.querySelector("nav"));
    if (host){ const btn = host.querySelector("button.out, a.btn, #out, button"); host.insertBefore(sw, btn && btn.parentNode === host ? btn : host.firstChild); }
    else if (hd){ const btn = hd.querySelector("button.out, #logout, #out, button");
      if (btn){ const g = document.createElement("div"); g.className = "lang-grp"; btn.replaceWith(g); g.append(sw, btn); } else hd.append(sw); }
    else sw.classList.add("fixed"), document.body.append(sw);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSwitcher); else mountSwitcher();

  window.I18n = {add, t, get lang(){ return lang; }, get locale(){ return LANGS[lang].locale; }, languages:LANGS,
    set(l){ if (!LANGS[l]) return; try { localStorage.setItem("lang", l); } catch {} const u = new URL(location.href); u.searchParams.delete("lang"); location.href = u.toString(); },
    translatePage};
})();
