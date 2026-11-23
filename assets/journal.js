
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const ATT = {present:"Был", absent:"Н — отсутствовал", excused:"Уважительная", late:"Опоздал"};
const MARK = {absent:"н", excused:"у", late:"оп"};
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
// Семестры 2026/2027 учебного года. Для следующего года поменяйте даты здесь.
const SEMESTERS = [{n:1, label:"I семестр", start:"2026-09-01", end:"2026-12-24"}, {n:2, label:"II семестр", start:"2027-01-11", end:"2027-05-31"}];
const fmtFull = d => d.slice(8,10) + "." + d.slice(5,7) + "." + d.slice(0,4);
async function fetchAll(make){   // сервер отдаёт не больше 1000 строк за раз: читаем страницами
  let out = [];
  for (let i = 0; ; i += 1000){ const r = await make().range(i, i + 999); if (r.error) throw r.error; out = out.concat(r.data); if (r.data.length < 1000) return out; }
}
const DAYS_FULL = ["","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
let ME, ASSIGN = [], A = null, SLOTS = [], BREAKS = [], sem = SEMESTERS[0], students = [], cols = [], grades = {}, att = {}, view = location.pathname.startsWith("/teacher/schedule") ? "schedule" : "journal", msgTimer;
const dlg = document.getElementById("dlg");
dlg.addEventListener("close", () => Route.q({lesson:null}));
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

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
const label = (t, el) => h("label", {}, t, el);
const aName = a => a.classes.name + " — " + a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : "");
const fmt = d => d.slice(8,10) + "." + d.slice(5,7);
const wd = d => new Date(d + "T00:00").toLocaleDateString("ru", {weekday:"short"});
const today = () => new Date().toLocaleDateString("sv");
// Оценки за прошедшие месяцы закрыты для всех (по времени школы), даже для администратора, пока директор не откроет колонки до даты.
// Эта проверка нужна для вида страницы; настоящая защита стоит в базе.
const schoolDay = () => new Date().toLocaleDateString("sv", {timeZone:"Europe/Chisinau"});
let UNL = [];   // открытия, сделанные директором: {from_date, to_date, open_until}
const isPast = date => date.slice(0, 7) < schoolDay().slice(0, 7);
const unlockFor = date => UNL.find(u => date >= u.from_date && date <= u.to_date && u.open_until >= schoolDay());
const isClosed = date => isPast(date) && !unlockFor(date);
const shiftMonth = (m, n) => { const d = new Date(+m.slice(0,4), +m.slice(5,7) - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
const fail = e => say("Ошибка: " + (e.message || e), false);
const lid = c => c.lesson?.id;

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
  if (!ASSIGN.length){
    return document.getElementById("grid").append(h("p", {class:"note"}, me.role === "admin"
      ? "Вам не назначен ни один класс и предмет. В «Администрирование» → «Назначения» назначьте себя."
      : "Вам пока не назначен ни один класс и предмет. Обратитесь в администрацию школы."));
  }
  const [sl, br] = await Promise.all([db.from("schedule_slots").select("*").in("assignment_id", ASSIGN.map(a => a.id)), db.from("school_breaks").select("*")]);
  if (sl.error || br.error) return fail(sl.error || br.error);
  SLOTS = sl.data; BREAKS = br.data;
  const t = document.getElementById("tabs"); t.hidden = false;
  t.replaceChildren(...[["journal","Журнал"],["schedule","Моё расписание"]].map(([k,n]) => h("button", {role:"tab", "aria-selected":view === k, onclick:() => { view = k; Route.push(k === "schedule" ? "/teacher/schedule/" : "/teacher/"); init2(); }}, n)));
  pick(ASSIGN.find(x => String(x.id) === Route.param("a")) || ASSIGN[0]);
}
function init2(){
  document.querySelectorAll("#tabs button").forEach((b, i) => b.setAttribute("aria-selected", String((i === 0) === (view === "journal"))));
  render();
}

function pick(a){
  A = a; sem = SEMESTERS.find(x => String(x.n) === Route.param("sem")) || (today() <= SEMESTERS[0].end ? SEMESTERS[0] : SEMESTERS[1]);
  Route.q({a:a.id, sem:sem.n, lesson:null});
  document.getElementById("title").textContent = "Журнал: " + a.classes.name + " · " + a.subjects.name + (a.class_groups ? " · " + a.class_groups.name + " группа" : "");
  const box = document.getElementById("pick");
  box.replaceChildren(...ASSIGN.map(x => h("button", {type:"button", "aria-pressed":x.id === a.id, onclick:() => pick(x)}, aName(x))));
  Promise.all([db.from("students").select("profile_id, profiles!students_profile_id_fkey(full_name)").eq("class_id", a.class_id),
               a.group_id ? db.from("student_groups").select("student_id").eq("group_id", a.group_id) : Promise.resolve({data:null})]).then(([st, gr]) => {
    if (st.error || gr.error) return fail(st.error || gr.error);
    const ok = gr.data ? new Set(gr.data.map(x => x.student_id)) : null;   // у группового предмета только ученики этой группы
    students = st.data.filter(s => !ok || ok.has(s.profile_id)).map(s => ({id:s.profile_id, name:s.profiles?.full_name || "—"})).sort((x,y) => x.name.localeCompare(y.name, "ru"));
    loadSem();
  });
}

// колонки журнала = уроки по расписанию за семестр (кроме каникул) + уже существующие уроки
function buildCols(rows){
  const mine = SLOTS.filter(s => s.assignment_id === A.id), out = [];
  for (let d = new Date(sem.start + "T00:00"); d.toLocaleDateString("sv") <= sem.end; d.setDate(d.getDate() + 1)){
    const date = d.toLocaleDateString("sv"), dow = d.getDay();
    if (!dow || BREAKS.some(b => date >= b.start_date && date <= b.end_date)) continue;
    mine.filter(s => s.weekday === dow).sort((a,b) => a.lesson_no - b.lesson_no).forEach(s => out.push({date, no:s.lesson_no, lesson:null}));
  }
  for (const l of rows){ const c = out.find(x => x.date === l.lesson_date && x.no === l.lesson_no && !x.lesson); if (c) c.lesson = l; else out.push({date:l.lesson_date, no:l.lesson_no, lesson:l}); }
  return out.sort((a,b) => a.date.localeCompare(b.date) || (a.no ?? 99) - (b.no ?? 99));
}

async function loadSem(){
  try {
    const rows = await fetchAll(() => db.from("lessons").select("*").eq("class_id", A.class_id).eq("subject_id", A.subject_id)
      .eq("teacher_id", ME.id).gte("lesson_date", sem.start).lte("lesson_date", sem.end).order("id"));
    grades = {}; att = {};
    const un = await db.from("grade_unlocks").select("*").eq("teacher_id", ME.id).eq("class_id", A.class_id).eq("subject_id", A.subject_id);
    UNL = (un.data || []).filter(u => u.group_id == null || u.group_id === A.group_id);
    if (rows.length){
      const ids = rows.map(l => l.id);
      const [g, t] = await Promise.all([fetchAll(() => db.from("grades").select("lesson_id, student_id, value").in("lesson_id", ids).order("id")),
                                        fetchAll(() => db.from("attendance").select("lesson_id, student_id, status").in("lesson_id", ids).order("id"))]);
      g.forEach(r => (grades[r.lesson_id] ??= {})[r.student_id] = r.value);
      t.forEach(r => (att[r.lesson_id] ??= {})[r.student_id] = r.status);
    }
    cols = buildCols(rows); render(); deepLink();
  } catch (e) { fail(e); }
}

function render(){
  const j = view === "journal";
  document.getElementById("pick").hidden = !j || ASSIGN.length < 2;
  document.getElementById("title").textContent = j ? "Журнал: " + A.classes.name + " · " + A.subjects.name + (A.class_groups ? " · " + A.class_groups.name + " группа" : "") : "Моё расписание";
  document.getElementById("bar").replaceChildren(...(j ? [h("div", {class:"bar"},
    SEMESTERS.map(x => h("button", {class:"btn" + (x === sem ? "" : " ghost"), type:"button", "aria-pressed":x === sem, onclick:() => { sem = x; Route.q({sem:x.n, lesson:null}); loadSem(); }}, x.label)),
    h("span", {class:"muted"}, fmtFull(sem.start) + " — " + fmtFull(sem.end)),
    h("button", {class:"btn ghost", type:"button", onclick:signAll}, "Подписать всё до сегодня"))] : []));
  document.getElementById("grid").replaceChildren(j ? journal() : weekly());
}

function journal(){
  if (!students.length) return h("p", {class:"note"}, A.group_id ? "В группе «" + A.class_groups.name + "» пока нет учеников. Администрация распределяет учеников по группам." : "В классе " + A.classes.name + " пока нет учеников.");
  if (!cols.length) return h("div", {}, h("p", {class:"note", style:"margin-bottom:12px"}, "В этом семестре по расписанию нет уроков по этому предмету. Расписание составляет администрация (директор или завуч). Колонки появятся здесь сами."),
    h("div", {class:"tw"}, h("table", {}, h("tbody", {}, students.map(s => h("tr", {}, h("td", {}, s.name)))))));
  const avg = s => { const v = cols.map(c => grades[lid(c)]?.[s.id]).filter(Boolean); return v.length ? (v.reduce((a,b) => a + b, 0) / v.length).toLocaleString("ru", {maximumFractionDigits:1}) : ""; };
  const groups = []; cols.forEach(c => { const m = c.date.slice(0, 7), last = groups[groups.length - 1]; if (last && last.m === m) last.n++; else groups.push({m, n:1}); });
  const head0 = h("tr", {class:"mrow"}, h("th", {}, ""), groups.map(g => h("th", {colspan:g.n, style:"text-align:center"}, MONTHS[+g.m.slice(5) - 1] + " " + g.m.slice(0, 4))), h("th", {class:"avg"}, ""));
  const head = h("tr", {class:"drow"}, h("th", {}, "Ученик"),
    cols.map(c => h("th", {}, h("button", {class:"hd", type:"button", title:(c.lesson?.topic || "Тема не указана") + " — перейти к уроку", onclick:() => openLesson(c)},
      h("small", {}, wd(c.date)), fmt(c.date), c.no ? h("small", {}, c.no + " ур.") : "",
        isClosed(c.date) ? h("small", {title:"Колонка закрыта: оценки изменить нельзя"}, "🔒") : (isPast(c.date) ? h("small", {title:"Колонка открыта директором до " + fmtFull(unlockFor(c.date).open_until)}, "🔓") : "")),
      h("button", {class:"sig" + (c.lesson?.signed_at ? " on" : ""), type:"button", title:c.lesson?.signed_at ? "Колонка подписана: ученики видят оценки. Нажмите, чтобы снять подпись" : "Колонка не подписана: ученики и родители не видят оценки. Нажмите, чтобы подписать", onclick:() => toggleSign(c)}, c.lesson?.signed_at ? "✓ подписано" : "подписать"))),
    h("th", {class:"avg"}, "Средняя за семестр"));
  const rows = students.map(s => h("tr", {}, h("td", {}, s.name),
    cols.map(c => { const v = grades[lid(c)]?.[s.id], st = att[lid(c)]?.[s.id], txt = v ? String(v) : (MARK[st] || "");
      return h("td", {}, h("button", {type:"button", class:"cell" + (v && v <= 4 ? " low" : "") + (!v && txt ? " mk" : ""),
        "aria-label":s.name + ", " + fmt(c.date) + ": " + (txt || "пусто"), onclick:() => openCell(s, c)}, txt)); }),
    h("td", {class:"avg"}, avg(s))));
  return h("div", {class:"tw"}, h("table", {}, h("thead", {}, head0, head), h("tbody", {}, rows)));
}

function weekly(){
  if (!SLOTS.length) return h("p", {class:"note"}, "Ваше расписание пока не составлено. Его создаёт администрация (директор или завуч).");
  const days = SLOTS.some(s => s.weekday === 6) ? [1,2,3,4,5,6] : [1,2,3,4,5], maxNo = Math.max(8, ...SLOTS.map(s => s.lesson_no));
  const rows = Array.from({length:maxNo}, (_, i) => i + 1).map(n => h("tr", {}, h("td", {class:"no"}, String(n)),
    days.map(d => h("td", {}, SLOTS.filter(s => s.weekday === d && s.lesson_no === n).map(s => { const a = ASSIGN.find(x => x.id === s.assignment_id);
      return h("div", {}, h("b", {}, a.classes.name + " · " + a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : "")), s.room ? h("div", {}, h("small", {}, "каб. " + s.room)) : ""); })))));
  return h("div", {class:"tw"}, h("table", {class:"sched"}, h("thead", {}, h("tr", {}, h("th", {}, "№"), days.map(d => h("th", {}, DAYS_FULL[d])))), h("tbody", {}, rows)));
}

// урок создаётся в базе при первом обращении (оценка, тема, файлы)
async function ensure(c){
  if (c.lesson) return c.lesson;
  const key = {class_id:A.class_id, subject_id:A.subject_id, teacher_id:ME.id, lesson_date:c.date, lesson_no:c.no};
  let r = await db.from("lessons").insert({...key, group_id:A.group_id ?? null, topic:"", homework:""}).select().single();
  if (r.error && r.error.code === "23505") r = await db.from("lessons").select("*").match(key).single();
  if (r.error) throw r.error;
  return c.lesson = r.data;
}

async function toggleSign(c){
  try {
    const l = await ensure(c), val = l.signed_at ? null : new Date().toISOString();
    const r = await db.from("lessons").update({signed_at:val}).eq("id", l.id); if (r.error) throw r.error;
    l.signed_at = val; render();
    say(val ? "Колонка подписана: ученики и родители видят оценки" : "Подпись снята: оценки скрыты от учеников и родителей");
  } catch (e) { fail(e); }
}
async function signAll(){
  const t = today(), todo = cols.filter(c => c.date <= t && !c.lesson?.signed_at);
  if (!todo.length) return say("Все колонки до сегодняшнего дня уже подписаны");
  if (!confirm("Подписать колонок: " + todo.length + "? Ученики и родители увидят оценки в них.")) return;
  const now = new Date().toISOString(), have = todo.filter(c => c.lesson).map(c => c.lesson.id), missing = todo.filter(c => !c.lesson);
  try {
    if (have.length){ const r = await db.from("lessons").update({signed_at:now}).in("id", have); if (r.error) throw r.error; }
    if (missing.length){ const r = await db.from("lessons").upsert(missing.map(c => ({class_id:A.class_id, subject_id:A.subject_id, teacher_id:ME.id, lesson_date:c.date, lesson_no:c.no,
      group_id:A.group_id ?? null, topic:"", homework:"", signed_at:now})), {onConflict:"class_id,subject_id,teacher_id,lesson_date,lesson_no"}); if (r.error) throw r.error; }
    say("Подписано колонок: " + todo.length); loadSem();
  } catch (e) { fail(e); }
}

function show(...nodes){ dlg.replaceChildren(...nodes); if (!dlg.open) dlg.showModal(); }
const closeBtn = () => h("button", {class:"btn ghost", type:"button", onclick:() => dlg.close()}, "Закрыть");

function openCell(s, c){
  let g = grades[lid(c)]?.[s.id] ?? null, st = att[lid(c)]?.[s.id] ?? "present";
  const closed = isClosed(c.date), gb = [], ab = [];
  const paint = () => { gb.forEach(([v,b]) => b.setAttribute("aria-pressed", String(v === g))); ab.forEach(([k,b]) => b.setAttribute("aria-pressed", String(k === st))); };
  for (let i = 1; i <= 10; i++) gb.push([i, h("button", {type:"button", class:"opt", disabled:closed, onclick:() => { g = i; paint(); }}, String(i))]);
  gb.push([null, h("button", {type:"button", class:"opt", disabled:closed, onclick:() => { g = null; paint(); }}, "Без оценки")]);
  Object.entries(ATT).forEach(([k,t]) => ab.push([k, h("button", {type:"button", class:"opt", onclick:() => { st = k; paint(); }}, t)]));
  paint();
  const save = h("button", {class:"btn", type:"button"}, "Сохранить");
  save.onclick = async () => {
    save.disabled = true;
    try {
      const l = await ensure(c);
      if (closed){}   // оценки закрытого месяца не трогаем, посещаемость сохраняется
      else if (g){ const r = await db.from("grades").upsert({lesson_id:l.id, student_id:s.id, value:g}, {onConflict:"lesson_id,student_id"}); if (r.error) throw r.error; }
      else { const r = await db.from("grades").delete().eq("lesson_id", l.id).eq("student_id", s.id); if (r.error) throw r.error; }
      const r2 = await db.from("attendance").upsert({lesson_id:l.id, student_id:s.id, status:st}, {onConflict:"lesson_id,student_id"}); if (r2.error) throw r2.error;
      if (!closed){ (grades[l.id] ??= {})[s.id] = g; if (!g) delete grades[l.id][s.id]; }
      (att[l.id] ??= {})[s.id] = st;
      render(); dlg.close(); say("Сохранено");
    } catch (e) { fail(e); save.disabled = false; }
  };
  show(h("h2", {}, s.name), h("p", {class:"sub"}, wd(c.date) + ", " + fmt(c.date) + (c.no ? " · " + c.no + " урок" : "") + (c.lesson?.topic ? " · " + c.lesson.topic : "")),
    c.lesson?.signed_at ? "" : h("p", {class:"sub", style:"color:var(--pen)"}, "Колонка не подписана: ученики и родители пока не видят оценки."),
    h("h3", {}, "Оценка"), closed ? h("p", {class:"sub", style:"color:var(--pen)"}, "🔒 Месяц закрыт: оценки за него изменить нельзя. Посещаемость можно менять. Чтобы исправить оценку, попросите директора открыть колонку.")
      : isPast(c.date) ? h("p", {class:"sub", style:"color:var(--ok)"}, "🔓 Колонка открыта директором до " + fmtFull(unlockFor(c.date).open_until) + ": оценки можно менять.") : "",
    h("div", {class:"grid10"}, gb.map(x => x[1])),
    h("h3", {}, "Посещаемость"), h("div", {class:"seg"}, ab.map(x => x[1])),
    h("div", {class:"acts"}, save, h("button", {class:"btn ghost", type:"button", onclick:() => openLesson(c)}, "Перейти к уроку →"), closeBtn()));
}

let deepDone = false;   // ссылка на урок: /teacher/?a=..&sem=..&lesson=2026-09-03_2
function deepLink(){
  if (deepDone) return; deepDone = true;
  const q = Route.param("lesson"); if (!q || view !== "journal") return;
  const c = cols.find(x => x.date + "_" + (x.no ?? 0) === q); if (c) openLesson(c);
}
async function openLesson(c){
  Route.q({lesson: c.date + "_" + (c.no ?? 0)});
  let l; try { l = await ensure(c); } catch (e) { return fail(e); }
  const LESSON_TYPES = ["Урок","Суммативное оценивание","Формативное оценивание","Практическая работа","Лабораторная работа","Теза","Отработка"];
  const ty = h("select", {}, LESSON_TYPES.map(x => h("option", {value:x, selected:x === (l.lesson_type || "Урок")}, x)));
  const t = h("input", {maxlength:200, value:l.topic || "", placeholder:"Тема урока"}),
        hw = h("textarea", {maxlength:2000, placeholder:"Домашнее задание"}, l.homework || ""), list = h("ul", {class:"files"}),
        up = h("input", {type:"file", multiple:true}), upMsg = h("small", {});
  const loadFiles = async () => {
    const { data, error } = await db.from("lesson_files").select("*").eq("lesson_id", l.id).order("created_at");
    if (error) return list.replaceChildren(h("li", {}, "Не удалось загрузить файлы"));
    list.replaceChildren(...(data.length ? data.map(f => h("li", {}, h("span", {class:"n"}, f.name + " ", h("small", {}, size(f.size))),
      h("button", {class:"mini", type:"button", onclick:async () => { const r = await db.storage.from("lesson-materials").createSignedUrl(f.path, 60, {download:f.name});
        if (r.error) return fail(r.error); const a = document.createElement("a"); a.href = r.data.signedUrl; a.click(); }}, "Скачать"),
      h("button", {class:"mini del", type:"button", onclick:async () => { if (!confirm("Удалить файл «" + f.name + "»?")) return;
        await db.storage.from("lesson-materials").remove([f.path]); const r = await db.from("lesson_files").delete().eq("id", f.id); if (r.error) return fail(r.error); loadFiles(); }}, "Удалить")))
      : [h("li", {}, h("small", {}, "Файлов пока нет."))]));
  };
  up.onchange = async () => {
    for (const [i, f] of [...up.files].entries()){
      if (f.size > 10485760){ say("«" + f.name + "» больше 10 МБ", false); continue; }
      upMsg.textContent = "Загрузка: " + f.name + "…";
      const ext = (f.name.match(/\.([A-Za-z0-9]{1,8})$/) || [,"bin"])[1].toLowerCase(), path = l.id + "/" + Date.now() + "-" + i + "." + ext;
      const u = await db.storage.from("lesson-materials").upload(path, f, {contentType:f.type || "application/octet-stream"});
      if (u.error){ fail(u.error); continue; }
      const r = await db.from("lesson_files").insert({lesson_id:l.id, name:f.name, path, size:f.size});
      if (r.error){ await db.storage.from("lesson-materials").remove([path]); fail(r.error); }
    }
    upMsg.textContent = ""; up.value = ""; loadFiles();
  };
  const sigBtn = h("button", {class:"btn ghost", type:"button"}, l.signed_at ? "Снять подпись колонки" : "Подписать колонку");
  sigBtn.onclick = async () => { await toggleSign(c); sigBtn.textContent = l.signed_at ? "Снять подпись колонки" : "Подписать колонку"; };
  const save = h("button", {class:"btn", type:"button"}, "Сохранить урок");
  save.onclick = async () => {
    save.disabled = true;
    const r = await db.from("lessons").update({lesson_type:ty.value, topic:t.value.trim(), homework:hw.value.trim()}).eq("id", l.id);
    if (r.error){ save.disabled = false; return fail(r.error); }
    l.lesson_type = ty.value; l.topic = t.value.trim(); l.homework = hw.value.trim(); render(); dlg.close(); say("Урок сохранён");
  };
  show(h("h2", {}, "Урок"), h("p", {class:"sub"}, A.classes.name + " · " + A.subjects.name + (A.class_groups ? " · " + A.class_groups.name : "") + " · " + wd(c.date) + ", " + fmt(c.date) + (c.no ? ", " + c.no + " урок" : "")),
    label("Тип урока", ty), label("Тема урока", t), label("Домашнее задание", hw),
    h("h3", {}, "Материалы (до 10 МБ каждый)"), list, label("Прикрепить файлы", up), upMsg,
    h("div", {class:"acts"}, save, sigBtn, closeBtn()));
  loadFiles();
}

document.getElementById("out").addEventListener("click", async () => { await db.auth.signOut(); location.replace("/login/"); });
init();

addEventListener("popstate", () => { const v = location.pathname.startsWith("/teacher/schedule") ? "schedule" : "journal"; if (v !== view && ME && ASSIGN.length){ view = v; init2(); } });
