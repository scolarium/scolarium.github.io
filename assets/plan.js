// КТП: тема, домашнее задание и тип урока на весь семестр в одной таблице.
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const TYPES = ["Урок","Суммативное оценивание","Формативное оценивание","Практическая работа","Лабораторная работа","Теза","Отработка"];
// Семестры 2026/2027 учебного года (те же даты, что в журнале). Для следующего года поменяйте даты здесь и в journal.js.
const SEMESTERS = [{n:1, label:"I семестр", start:"2026-09-01", end:"2026-12-24"}, {n:2, label:"II семестр", start:"2027-01-11", end:"2027-05-31"}];
const FIELDS = ["topic", "hw"];   // порядок столбцов для вставки из Excel
let ME, ASSIGN = [], A = null, SLOTS = [], BREAKS = [], sem = SEMESTERS[0], rows = [], onlyEmpty = false, msgTimer;

function h(tag, props = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(props)){
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, k.startsWith("aria-") ? "true" : "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) e.append(c instanceof Node ? c : document.createTextNode(c ?? ""));
  return e;
}
function say(text, ok = true){
  const m = document.getElementById("msg"); m.textContent = text; m.className = ok ? "ok" : "bad"; m.hidden = false;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 5000);
}
const fail = e => say("Ошибка: " + (e.message || e), false);
const iso = d => d.toLocaleDateString("sv");
const today = () => new Date().toLocaleDateString("sv", {timeZone:"Europe/Chisinau"});
const fmt = d => d.slice(8,10) + "." + d.slice(5,7);
const fmtFull = d => d.slice(8,10) + "." + d.slice(5,7) + "." + d.slice(0,4);
const wd = d => new Date(d + "T00:00").toLocaleDateString("ru", {weekday:"short"});
const aName = a => a.classes.name + " — " + a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : "");
async function fetchAll(make){
  let out = [];
  for (let i = 0; ; i += 1000){ const r = await make().range(i, i + 999); if (r.error) throw r.error; out = out.concat(r.data); if (r.data.length < 1000) return out; }
}

const dirtyRows = () => rows.filter(r => r.type !== r.o.type || r.topic !== r.o.topic || r.hw !== r.o.hw);
addEventListener("beforeunload", e => { if (dirtyRows().length){ e.preventDefault(); e.returnValue = ""; } });

async function init(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  const { data: me } = await db.from("profiles").select("id, full_name, role, can_schedule").eq("id", session.user.id).single();
  if (!me || !["teacher","admin"].includes(me.role)) return location.replace("/cabinet/");
  ME = me;
  document.getElementById("who").textContent = me.full_name;
  document.getElementById("adm").hidden = me.role !== "admin";
  document.getElementById("sch").hidden = !(me.role === "admin" || me.can_schedule);
  db.from("classes").select("id").eq("homeroom_teacher_id", me.id).limit(1).then(r => { document.getElementById("hr").hidden = !(me.role === "admin" || (r.data && r.data.length)); });
  const { data, error } = await db.from("teacher_assignments")
    .select("id, class_id, subject_id, group_id, classes(name, school_year), subjects(name), class_groups(name)").eq("teacher_id", me.id);
  if (error) return say("Не удалось загрузить ваши классы: " + error.message, false);
  ASSIGN = (data || []).sort((a,b) => (a.classes.name + a.subjects.name).localeCompare(b.classes.name + b.subjects.name, "ru", {numeric:true}));
  if (!ASSIGN.length) return document.getElementById("grid").append(h("p", {class:"note"}, "Вам пока не назначен ни один класс и предмет. Обратитесь в администрацию школы."));
  const [sl, br] = await Promise.all([db.from("schedule_slots").select("*").in("assignment_id", ASSIGN.map(a => a.id)), db.from("school_breaks").select("*")]);
  if (sl.error || br.error) return fail(sl.error || br.error);
  SLOTS = sl.data; BREAKS = br.data;
  const t = document.getElementById("tabs"); t.hidden = false;
  t.replaceChildren(...[["Журнал", () => go("/teacher/")], ["Моё расписание", () => go("/teacher/schedule/")], ["КТП", null]].map(([n, f]) =>
    h("button", {role:"tab", "aria-selected":!f, onclick:f || (() => {})}, n)));
  pick(ASSIGN.find(x => String(x.id) === Route.param("a")) || ASSIGN[0]);
}
function go(path){
  if (dirtyRows().length && !confirm("Есть несохранённые изменения. Уйти без сохранения?")) return;
  const q = path === "/teacher/" ? "?a=" + A.id + "&sem=" + sem.n : "";
  rows = []; location.href = path + q;   // rows пуст: окно «уйти со страницы?» не появится второй раз
}

function pick(a){
  if (dirtyRows().length && !confirm("Есть несохранённые изменения. Продолжить без сохранения?")) return;
  A = a; sem = SEMESTERS.find(x => String(x.n) === Route.param("sem")) || (today() <= SEMESTERS[0].end ? SEMESTERS[0] : SEMESTERS[1]);
  Route.q({a:a.id, sem:sem.n});
  document.getElementById("title").textContent = "КТП: " + aName(a);
  const box = document.getElementById("pick"); box.hidden = ASSIGN.length < 2;
  box.replaceChildren(...ASSIGN.map(x => h("button", {type:"button", "aria-pressed":x.id === a.id, onclick:() => pick(x)}, aName(x))));
  loadSem();
}

// уроки = занятия по расписанию за семестр (кроме каникул) + уже существующие уроки
function buildRows(lessons){
  const mine = SLOTS.filter(s => s.assignment_id === A.id), out = [];
  for (let d = new Date(sem.start + "T00:00"); iso(d) <= sem.end; d.setDate(d.getDate() + 1)){
    const date = iso(d), dow = d.getDay();
    if (!dow || BREAKS.some(b => date >= b.start_date && date <= b.end_date)) continue;
    mine.filter(s => s.weekday === dow).sort((a,b) => a.lesson_no - b.lesson_no).forEach(s => out.push({date, no:s.lesson_no, lesson:null}));
  }
  for (const l of lessons){ const c = out.find(x => x.date === l.lesson_date && x.no === l.lesson_no && !x.lesson); if (c) c.lesson = l; else out.push({date:l.lesson_date, no:l.lesson_no, lesson:l}); }
  out.sort((a,b) => a.date.localeCompare(b.date) || (a.no ?? 99) - (b.no ?? 99));
  return out.map(c => { const o = {type:c.lesson?.lesson_type || "Урок", topic:c.lesson?.topic || "", hw:c.lesson?.homework || ""};
    return {date:c.date, no:c.no, ...o, o}; });
}

async function loadSem(){
  try {
    const lessons = await fetchAll(() => db.from("lessons").select("id, lesson_date, lesson_no, topic, homework, lesson_type")
      .eq("class_id", A.class_id).eq("subject_id", A.subject_id).eq("teacher_id", ME.id)
      .gte("lesson_date", sem.start).lte("lesson_date", sem.end).order("id"));
    rows = buildRows(lessons); render();
  } catch (e) { fail(e); }
}

async function save(){
  const dirty = dirtyRows(); if (!dirty.length) return;
  const btn = document.getElementById("saveBtn"); if (btn) btn.disabled = true;
  try {
    for (let i = 0; i < dirty.length; i += 150){
      const part = dirty.slice(i, i + 150);
      const r = await db.from("lessons").upsert(part.map(x => ({class_id:A.class_id, subject_id:A.subject_id, teacher_id:ME.id, lesson_date:x.date, lesson_no:x.no,
        group_id:A.group_id ?? null, lesson_type:x.type, topic:x.topic.trim(), homework:x.hw.trim()})), {onConflict:"class_id,subject_id,teacher_id,lesson_date,lesson_no"});
      if (r.error) throw r.error;
      part.forEach(x => { x.topic = x.topic.trim(); x.hw = x.hw.trim(); x.o = {type:x.type, topic:x.topic, hw:x.hw}; });
    }
    say("Сохранено уроков: " + dirty.length); render();
  } catch (e) { fail(e); if (btn) btn.disabled = false; }
}

const val = (r, f) => f === "topic" ? r.topic : r.hw;
function setVal(r, f, v){ if (f === "topic") r.topic = v; else r.hw = v; }

// вставка из Excel: несколько строк и столбцов раскладываются по урокам подряд
function onPaste(e, vis, i, f){
  const txt = (e.clipboardData || window.clipboardData).getData("text").replace(/\r/g, "").replace(/\n$/, "");
  const grid = txt.split("\n").map(l => l.split("\t"));
  if (grid.length < 2 && grid[0].length < 2) return;   // обычная вставка внутри ячейки
  e.preventDefault();
  const f0 = FIELDS.indexOf(f);
  grid.forEach((cells, dy) => cells.forEach((v, dx) => {
    const r = vis[i + dy], ff = FIELDS[f0 + dx]; if (r && ff) setVal(r, ff, v.trim());
  }));
  render(); say("Вставлено строк: " + Math.min(grid.length, vis.length - i) + ". Не забудьте нажать «Сохранить».");
}

function render(){
  const total = rows.length, empty = rows.filter(r => !r.topic.trim()).length, nd = dirtyRows().length, t = today();
  document.getElementById("bar").replaceChildren(h("div", {class:"bar planbar"},
    SEMESTERS.map(x => h("button", {class:"btn" + (x === sem ? "" : " ghost"), type:"button", "aria-pressed":x === sem, onclick:() => {
      if (nd && !confirm("Есть несохранённые изменения. Продолжить без сохранения?")) return; sem = x; Route.q({sem:x.n}); loadSem(); }}, x.label)),
    h("span", {class:"muted"}, fmtFull(sem.start) + " — " + fmtFull(sem.end) + " · уроков: " + total + ", без темы: " + empty),
    h("label", {class:"chk"}, h("input", {type:"checkbox", checked:onlyEmpty, onchange:e => { onlyEmpty = e.target.checked; render(); }}), "Только без темы"),
    h("button", {class:"btn", id:"saveBtn", type:"button", disabled:!nd, onclick:save}, nd ? "Сохранить (" + nd + ")" : "Сохранено")));
  const vis = rows.filter(r => !onlyEmpty || !r.topic.trim());
  if (!rows.length) return document.getElementById("grid").replaceChildren(h("p", {class:"note"}, "В этом семестре по расписанию нет уроков по этому предмету. Расписание составляет администрация. Уроки появятся здесь сами."));
  const body = []; let lastM = "";
  vis.forEach((r, i) => {
    const m = r.date.slice(0, 7);
    if (m !== lastM){ lastM = m; body.push(h("tr", {class:"mon"}, h("td", {colspan:5}, MONTHS[+m.slice(5) - 1] + " " + m.slice(0, 4)))); }
    const dirty = r.type !== r.o.type || r.topic !== r.o.topic || r.hw !== r.o.hw;
    const sel = h("select", {class:"ty" + (r.type !== "Урок" ? " sp" : ""), "aria-label":"Тип урока " + fmt(r.date), onchange:() => { r.type = sel.value; sel.classList.toggle("sp", r.type !== "Урок"); mark(); }},
      TYPES.map(x => h("option", {value:x, selected:x === r.type}, x)));
    const mk = f => {
      const inp = h("textarea", {rows:1, maxlength:f === "topic" ? 200 : 2000, "data-f":f, "data-i":i, placeholder:f === "topic" ? "Тема урока" : "Домашнее задание",
        "aria-label":(f === "topic" ? "Тема " : "ДЗ ") + fmt(r.date), oninput:() => { setVal(r, f, inp.value.replace(/\n/g, " ")); grow(inp); mark(); },
        onpaste:e => onPaste(e, vis, i, f),
        onkeydown:e => { if (e.key === "Enter"){ e.preventDefault(); const nx = document.querySelector('textarea[data-f="' + f + '"][data-i="' + (i + 1) + '"]'); if (nx) nx.focus(); } }}, val(r, f));
      return inp;
    };
    const tr = h("tr", {class:(r.date === t ? "today " : "") + (r.date < t ? "past " : "") + (dirty ? "dirty" : ""), "data-i":i},
      h("td", {class:"d"}, h("b", {}, fmt(r.date)), h("small", {}, wd(r.date) + (r.no ? ", " + r.no + " ур." : ""))),
      h("td", {class:"t"}, sel), h("td", {}, mk("topic")), h("td", {}, mk("hw")), h("td", {class:"s"}, dirty ? "●" : ""));
    tr._r = r; body.push(tr);
  });
  const wrap = h("div", {class:"tw plan"}, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Дата"), h("th", {}, "Тип урока"), h("th", {}, "Тема"), h("th", {}, "Домашнее задание"), h("th", {}, ""))), h("tbody", {}, body)));
  const hint = h("p", {class:"note", style:"margin:0 0 12px"}, "Заполняйте тему, ДЗ и тип урока прямо в таблице. Enter переходит на следующий урок. Столбец из Excel можно скопировать и вставить в первую ячейку: тексты разойдутся по урокам подряд (два столбца заполнят «Тему» и «ДЗ»).");
  document.getElementById("grid").replaceChildren(hint, vis.length ? wrap : h("p", {class:"note"}, "У всех уроков уже есть темы."));
  document.querySelectorAll("#grid textarea").forEach(grow);
}
function grow(el){ el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
// обновить кнопку и отметки без перерисовки таблицы (чтобы не терять фокус при вводе)
function mark(){
  const nd = dirtyRows().length, b = document.getElementById("saveBtn");
  if (b){ b.disabled = !nd; b.textContent = nd ? "Сохранить (" + nd + ")" : "Сохранено"; }
  document.querySelectorAll("#grid tbody tr[data-i]").forEach(tr => {
    const r = tr._r; if (!r) return;
    const d = r.type !== r.o.type || r.topic !== r.o.topic || r.hw !== r.o.hw;
    tr.classList.toggle("dirty", d); tr.lastElementChild.textContent = d ? "●" : "";
  });
}

document.getElementById("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });
init();
