
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
// Даты семестров лежат в базе (таблица school_years): см. years.js
const SEMESTERS = Years.SEMESTERS;
const DAYS_FULL = ["","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const TABS = [["people","Ученики и родители"],["grades","Ведомость"],["attendance","Посещаемость"],["schedule","Расписание"]];
const today = () => new Date().toLocaleDateString("sv");
let ME, CL = [], C = null, tab = Route.tab("/teacher/homeroom/", TABS.map(t => t[0]), "people"), semSel = today() <= SEMESTERS[0].end ? 1 : 2, STU = [], GRP = new Map(), PAR = new Map(), PARD = new Map(), ASG = [], SLOTS = [], msgTimer, token = 0;

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
function oops(e){ const m = document.getElementById("msg"); m.textContent = "Ошибка: " + (e.message || e); m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 6000); }
const note = t => h("p", {class:"note"}, t);
const num = n => Number(n).toLocaleString("ru", {maximumFractionDigits:2});
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const range = () => semSel === 0 ? [SEMESTERS[0].start, SEMESTERS[1].end] : [SEMESTERS[semSel - 1].start, SEMESTERS[semSel - 1].end];

async function init(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  await Years.load(db, Route.param("y")); semSel = Years.archive || today() <= SEMESTERS[0].end ? 1 : 2;
  const { data: me } = await db.from("profiles").select("id, full_name, role").eq("id", session.user.id).single();
  if (!me || !["teacher","admin"].includes(me.role)) return location.replace("/cabinet/");
  ME = me; document.getElementById("who").textContent = me.full_name; document.getElementById("adm").hidden = me.role !== "admin";
  const sortC = d => d.sort((a, b) => a.name.localeCompare(b.name, "ru", {numeric:true}));
  const r = await db.from("classes").select("id, name, school_year").eq("homeroom_teacher_id", me.id);   // только свои классы
  if (r.error) return oops(r.error);
  CL = sortC(r.data);
  document.getElementById("tabs").hidden = false; drawTabs(); applyList();
}
function applyList(){
  if (!CL.length){
    document.getElementById("title").textContent = "Мой класс"; document.getElementById("sub").textContent = "";
    document.getElementById("view").replaceChildren(note("Вы не назначены классным руководителем. Назначает администратор: «Администрирование» → «Классы»."));
    return;
  }
  pick(CL[0]);
}
function drawClassBar(){
  const cb = document.getElementById("classes");
  cb.hidden = CL.length < 2;   // кнопки нужны, только если классов несколько
  cb.replaceChildren(...CL.map(x => h("button", {type:"button", "aria-pressed":!!C && x.id === C.id, onclick:() => pick(x)}, "Класс " + x.name)));
}
function drawTabs(){ document.getElementById("tabs").replaceChildren(...TABS.map(([k,n]) => h("button", {role:"tab", "aria-selected":k === tab, onclick:() => { tab = k; Route.go("/teacher/homeroom/", k); drawTabs(); render(); }}, n))); }

async function pick(c){
  const my = ++token; C = c;
  drawClassBar();
  document.getElementById("title").textContent = "Мой класс: " + c.name;
  document.getElementById("sub").textContent = "Учебный год " + c.school_year;
  document.getElementById("view").replaceChildren(note("Загрузка…"));
  try {
    const st = await db.from("students").select("profile_id, profiles!students_profile_id_fkey(full_name, username)").eq("class_id", c.id);
    if (st.error) throw st.error;
    const stu = st.data.map(s => ({id:s.profile_id, name:s.profiles?.full_name || "—", login:s.profiles?.username || ""})).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const ids = stu.map(s => s.id), none = {data:[]};
    const [sg, ps, a] = await Promise.all([ids.length ? db.from("student_groups").select("student_id, class_groups(name)").in("student_id", ids) : none,
      ids.length ? db.from("parent_students").select("student_id, parent_id").in("student_id", ids) : none,
      db.from("teacher_assignments").select("id, subject_id, teacher_id, group_id, subjects(name), class_groups(name), profiles!teacher_assignments_teacher_id_fkey(full_name)").eq("class_id", c.id)]);
    if (sg.error || ps.error || a.error) throw sg.error || ps.error || a.error;
    const pids = [...new Set(ps.data.map(x => x.parent_id))];
    const pr = pids.length ? await db.from("profiles").select("id, full_name, username").in("id", pids) : none;
    if (pr.error) throw pr.error;
    const sl = a.data.length ? await db.from("schedule_slots").select("*").in("assignment_id", a.data.map(x => x.id)) : none;
    if (sl.error) throw sl.error;
    if (my !== token) return;
    STU = stu; ASG = a.data; SLOTS = sl.data; GRP = new Map(); PAR = new Map(); PARD = new Map();
    sg.data.forEach(x => { if (x.class_groups?.name) (GRP.get(x.student_id) ?? GRP.set(x.student_id, []).get(x.student_id)).push(x.class_groups.name); });
    ps.data.forEach(x => { const p = pr.data.find(y => y.id === x.parent_id); (PAR.get(x.student_id) ?? PAR.set(x.student_id, []).get(x.student_id)).push(p ? p.full_name + (p.username ? " (" + p.username + ")" : "") : "—"); });
    ps.data.forEach(x => { const p = pr.data.find(y => y.id === x.parent_id); (PARD.get(x.student_id) ?? PARD.set(x.student_id, []).get(x.student_id)).push({name:p ? p.full_name : "—", login:p?.username || ""}); });
    document.getElementById("exportBtn").hidden = false;
    render();
  } catch (e) { oops(e); }
}

function render(){
  const pb = document.getElementById("period"), usesPeriod = tab === "grades" || tab === "attendance"; pb.hidden = !usesPeriod;
  pb.replaceChildren(...[[1, SEMESTERS[0].label], [2, SEMESTERS[1].label], [0, "Весь год"]].map(([k, n]) => h("button", {type:"button", "aria-pressed":semSel === k, onclick:() => { semSel = k; render(); }}, n)), Years.select(h));
  const v = document.getElementById("view"), my = token;
  ({people:vPeople, grades:vGrades, attendance:vAttendance, schedule:vSchedule})[tab]().then(n => { if (my === token) v.replaceChildren(Timetable.stack(n)); }).catch(e => { oops(e); v.replaceChildren(note("Не удалось загрузить данные.")); });
}

async function vPeople(){
  if (!STU.length) return note("В классе пока нет учеников.");
  const rows = STU.map((s, i) => h("tr", {}, h("td", {}, (i + 1) + ". " + s.name), h("td", {}, s.login), h("td", {}, (GRP.get(s.id) || []).join(", ") || "—"),
    h("td", {}, (PAR.get(s.id) || []).length ? PAR.get(s.id).map(p => h("div", {}, p)) : "—")));
  return h("div", {}, h("div", {class:"tw"}, h("table", {}, h("thead", {}, h("tr", {}, ["Ученик","Логин","Группы","Родители"].map(t => h("th", {}, t)))), h("tbody", {}, rows))),
    h("p", {class:"muted"}, "Учеников: " + STU.length + ". Родители показаны, если администратор привязал их к ученику."));
}

async function averages(d1, d2){ const r = await db.rpc("class_averages", {cid:C.id, d1, d2}); if (r.error) throw r.error; return r.data; }

async function vGrades(){
  if (!STU.length) return note("В классе пока нет учеников.");
  let cells;   // Map "ученик|предмет" -> число, и список предметов
  const subj = new Map();
  if (semSel === 0){
    const [a, b] = await Promise.all([averages(SEMESTERS[0].start, SEMESTERS[0].end), averages(SEMESTERS[1].start, SEMESTERS[1].end)]);
    const f1 = new Map(a.map(x => [x.student_id + "|" + x.subject_id, Math.round(x.avg)]));
    cells = new Map(); a.concat(b).forEach(x => subj.set(x.subject_id, x.subject));
    b.forEach(x => { const k = x.student_id + "|" + x.subject_id; if (f1.has(k)) cells.set(k, Math.round((f1.get(k) + Math.round(x.avg)) / 2)); });
  } else {
    const [d1, d2] = range(); const a = await averages(d1, d2);
    cells = new Map(a.map(x => [x.student_id + "|" + x.subject_id, Number(x.avg)])); a.forEach(x => subj.set(x.subject_id, x.subject));
  }
  const cols = [...subj.entries()].sort((x, y) => x[1].localeCompare(y[1], "ru"));
  if (!cols.length) return note(semSel === 0 ? "За год пока нет оценок в обоих семестрах." : "За этот семестр подписанных оценок пока нет.");
  const rows = STU.map((s, i) => { const vals = cols.map(([id]) => cells.get(s.id + "|" + id)).filter(v => v != null);
    return h("tr", {}, h("td", {}, (i + 1) + ". " + s.name),
      cols.map(([id]) => { const v = cells.get(s.id + "|" + id); return h("td", {class:"g" + (v != null && v < 5 ? " low" : "")}, v != null ? num(v) : "—"); }),
      h("td", {class:"g" + (vals.length && mean(vals) < 5 ? " low" : "")}, vals.length ? num(mean(vals)) : "—")); });
  return h("div", {}, h("div", {class:"tw"}, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Ученик"), cols.map(([, n]) => h("th", {class:"c vert"}, n)), h("th", {class:"c"}, semSel === 0 ? "Средняя годовых" : "Средний балл"))), h("tbody", {}, rows))),
    h("p", {class:"muted"}, semSel === 0 ? "В клетках оценка за год: среднее двух оценок за семестр (каждая — средний балл, округлённый до целого)." : "В клетках средний балл по предмету за семестр. Учитываются только оценки в колонках, подписанных учителями. Красным отмечено ниже 5."));
}

async function vAttendance(){
  if (!STU.length) return note("В классе пока нет учеников.");
  const [d1, d2] = range(), r = await db.rpc("class_attendance", {cid:C.id, d1, d2}); if (r.error) throw r.error;
  const m = new Map(r.data.map(x => [x.student_id, x])), T = {all:0, ex:0, un:0, late:0};
  const rows = STU.map((s, i) => { const x = m.get(s.id) || {absent:0, excused:0, late:0}, all = x.absent + x.excused;
    T.all += all; T.ex += x.excused; T.un += x.absent; T.late += x.late;
    return h("tr", {}, h("td", {}, (i + 1) + ". " + s.name), h("td", {class:"g"}, String(all)), h("td", {class:"g"}, String(x.excused)), h("td", {class:"g" + (x.absent ? " low" : "")}, String(x.absent)), h("td", {class:"g"}, String(x.late))); });
  rows.push(h("tr", {class:"tot"}, h("td", {}, "Всего по классу"), h("td", {class:"c"}, String(T.all)), h("td", {class:"c"}, String(T.ex)), h("td", {class:"c"}, String(T.un)), h("td", {class:"c"}, String(T.late))));
  return h("div", {}, h("div", {class:"tw"}, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Ученик"), ["Пропущено уроков","по уважительной причине","без уважительной","Опозданий"].map(t => h("th", {class:"c"}, t)))), h("tbody", {}, rows))),
    h("p", {class:"muted"}, "Считаются уроки, на которых учитель отметил «отсутствовал», «уважительная причина» или «опоздал»."));
}

async function vSchedule(){
  if (!SLOTS.length) return note("Расписание класса пока не составлено.");
  const dd = SLOTS.some(s => s.weekday === 6) ? [1,2,3,4,5,6] : [1,2,3,4,5], maxNo = Math.max(8, ...SLOTS.map(s => s.lesson_no));
  return Timetable.week({days:dd, maxNo, dayName:d => DAYS_FULL[d],
    cell:(d, n) => SLOTS.filter(s => s.weekday === d && s.lesson_no === n).map(s => { const a = ASG.find(x => x.id === s.assignment_id);
      return {key:a.subjects.name, title:a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : ""), sub:a.profiles?.full_name || "", room:s.room}; })});
}

document.getElementById("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });
init();

addEventListener("popstate", () => { tab = Route.tab("/teacher/homeroom/", TABS.map(t => t[0]), "people"); if (C) { drawTabs(); render(); } });
