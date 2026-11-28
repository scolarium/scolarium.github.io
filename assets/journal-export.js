// Выгрузка журнала учителя: Excel и PDF. Работает поверх journal.js (общие переменные и функции).
const GRADE_STYLE = v => v <= 4 ? {fill:"FBDADB", color:"B3262B"} : v >= 9 ? {fill:"D5F0E1", color:"117A45"} : v >= 7 ? {fill:"DEE8FF", color:"233F8F"} : {fill:"FDEBC8", color:"8A5200"};
const fmtNum = n => n == null ? "" : n.toLocaleString("ru", {maximumFractionDigits:2});
const avgOf = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const round2 = n => n == null ? "" : Math.round(n * 100) / 100;

function colsFor(a, s, rows){   // как buildCols, но для любого журнала и семестра
  const mine = SLOTS.filter(x => x.assignment_id === a.id), out = [];
  for (let d = new Date(s.start + "T00:00"); d.toLocaleDateString("sv") <= s.end; d.setDate(d.getDate() + 1)){
    const date = d.toLocaleDateString("sv"), dow = d.getDay();
    if (!dow || BREAKS.some(b => date >= b.start_date && date <= b.end_date)) continue;
    mine.filter(x => x.weekday === dow).sort((x, y) => x.lesson_no - y.lesson_no).forEach(x => out.push({date, no:x.lesson_no, lesson:null}));
  }
  for (const l of rows){ const c = out.find(x => x.date === l.lesson_date && x.no === l.lesson_no && !x.lesson); if (c) c.lesson = l; else out.push({date:l.lesson_date, no:l.lesson_no, lesson:l}); }
  return out.filter(c => !Years.archive || c.lesson).sort((x, y) => x.date.localeCompare(y.date) || (x.no ?? 99) - (y.no ?? 99));
}

async function gatherJournal(a, s){
  const [st, gr] = await Promise.all([
    db.from("students").select("profile_id, profiles!students_profile_id_fkey(full_name)").eq("class_id", a.class_id),
    a.group_id ? db.from("student_groups").select("student_id").eq("group_id", a.group_id) : Promise.resolve({data:null})]);
  if (st.error || gr.error) throw st.error || gr.error;
  const ok = gr.data ? new Set(gr.data.map(x => x.student_id)) : null;
  const stu = st.data.filter(x => !ok || ok.has(x.profile_id)).map(x => ({id:x.profile_id, name:x.profiles?.full_name || "—"})).sort((x, y) => x.name.localeCompare(y.name, "ru"));
  const rows = await fetchAll(() => db.from("lessons").select("*").eq("class_id", a.class_id).eq("subject_id", a.subject_id).eq("teacher_id", ME.id)
    .gte("lesson_date", s.start).lte("lesson_date", s.end).order("id"));
  const g = {}, t = {};
  if (rows.length){
    const ids = rows.map(l => l.id);
    const [gg, tt] = await Promise.all([fetchAll(() => db.from("grades").select("lesson_id, student_id, value").in("lesson_id", ids).order("id")),
                                        fetchAll(() => db.from("attendance").select("lesson_id, student_id, status").in("lesson_id", ids).order("id"))]);
    gg.forEach(r => (g[r.lesson_id] ??= {})[r.student_id] = r.value);
    tt.forEach(r => (t[r.lesson_id] ??= {})[r.student_id] = r.status);
  }
  // в выгрузку попадают уроки до сегодняшнего дня и те, где уже есть оценки или отметки
  const td = today(), cols = colsFor(a, s, rows).filter(c => c.date <= td || (c.lesson && (g[c.lesson.id] || t[c.lesson.id])));
  return {a, s, students:stu, cols, grades:g, att:t};
}

const jTitle = d => d.a.classes.name + " · " + d.a.subjects.name + (d.a.class_groups ? " · " + d.a.class_groups.name + " группа" : "");
const jLines = d => ["Учитель: " + ME.full_name, d.s.label + ": " + fmtFull(d.s.start) + " — " + fmtFull(d.s.end) + " (уроки до " + fmtFull(today()) + ")",
  "Сформировано: " + new Date().toLocaleString("ru"), "Обозначения: н — отсутствовал, у — уважительная причина, оп — опоздал. Цвета оценок: 9–10 зелёный, 7–8 синий, 5–6 жёлтый, 1–4 красный."];
const lessonCell = (d, c, st) => {
  const v = d.grades[lid(c)]?.[st.id], x = d.att[lid(c)]?.[st.id];
  if (v) return {v, bold:true, ...GRADE_STYLE(v)};
  return MARK[x] ? {v:MARK[x], fill:"E8ECF3", color:"56637D"} : "";
};
function studentStats(d){
  return d.students.map(st => {
    const vals = d.cols.map(c => d.grades[lid(c)]?.[st.id]).filter(Boolean); let abs = 0, exc = 0, late = 0;
    d.cols.forEach(c => { const x = d.att[lid(c)]?.[st.id]; if (x === "absent") abs++; else if (x === "excused") exc++; else if (x === "late") late++; });
    return {st, vals, avg:avgOf(vals), missed:abs + exc, exc, late};
  });
}
const colHead = c => fmt(c.date) + "\n" + wd(c.date) + (c.no ? ", " + c.no + " ур." : "");
const TOT = "EEF3FF";

function sheetModel(d){
  const S = studentStats(d), n = d.cols.length;
  const head = ["№", "Ученик", ...d.cols.map(colHead), "Средний балл", "Пропусков", "из них по уваж.", "Опозданий"];
  const rows = S.map((x, i) => [{v:i + 1, align:"center"}, x.st.name, ...d.cols.map(c => lessonCell(d, c, x.st)), {v:round2(x.avg), bold:true, fill:"E4ECFF", color:"233F8F"}, x.missed, x.exc, x.late]);
  const colAvg = d.cols.map(c => avgOf(d.students.map(st => d.grades[lid(c)]?.[st.id]).filter(Boolean)));
  const all = avgOf(S.map(x => x.avg).filter(v => v != null));
  rows.push([{v:"", fill:TOT}, {v:"Средний балл", bold:true, fill:TOT, align:"left"}, ...colAvg.map(v => ({v:v == null ? "" : Math.round(v * 10) / 10, bold:true, fill:TOT})),
    {v:round2(all), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.missed, 0), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.exc, 0), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.late, 0), bold:true, fill:TOT}]);
  return {name:d.a.classes.name + " " + d.a.subjects.name + (d.a.class_groups ? " " + d.a.class_groups.name : "") + " " + d.s.n + " сем", title:"Журнал: " + jTitle(d), lines:jLines(d),
    head, rows, widths:[5, 28, ...d.cols.map(() => 7.5), 11, 10, 11, 10], leftCols:2, freezeCols:2, headHeight:44};
}

async function exportJournalXlsx(data, file){
  const sheets = data.map(sheetModel), L = [];
  data.forEach(d => d.cols.forEach(c => { if (c.lesson) L.push([d.a.classes.name, d.a.subjects.name, d.a.class_groups?.name || "", fmtFull(c.date), c.no ?? "", c.lesson.lesson_type || "Урок",
    c.lesson.topic || "", c.lesson.homework || "", c.lesson.signed_at ? "да" : "нет"]); }));
  if (L.length) sheets.push({name:"Темы уроков", title:"Темы уроков и домашние задания", lines:["Сформировано: " + new Date().toLocaleString("ru")],
    head:["Класс", "Предмет", "Группа", "Дата", "№ урока", "Тип", "Тема", "Домашнее задание", "Колонка подписана"], rows:L,
    widths:[9, 20, 14, 12, 9, 22, 40, 40, 12], leftCols:9, freezeCols:0});
  await Exp.xlsx({file, sheets});
}

async function exportJournalPdf(data, file){
  const content = [], PAGE_W = 786;
  data.forEach((d, idx) => {
    const t = Exp.h1("Журнал: " + jTitle(d)); if (idx) t.pageBreak = "before"; content.push(t);
    jLines(d).slice(0, 3).forEach(l => content.push(Exp.p(l)));
    if (!d.cols.length || !d.students.length){ content.push(Exp.p(d.students.length ? "В этом периоде уроков ещё не было." : "В журнале нет учеников.", {margin:[0, 10, 0, 0]})); return; }
    const byMonth = []; d.cols.forEach(c => { const m = c.date.slice(0, 7), last = byMonth[byMonth.length - 1]; if (last && last.m === m) last.cols.push(c); else byMonth.push({m, cols:[c]}); });
    byMonth.forEach(({m, cols}) => {
      const n = cols.length, cw = Math.max(15, Math.min(30, Math.floor((PAGE_W - 150 - 34) / n)));
      content.push(Exp.h2(MONTHS[+m.slice(5) - 1] + " " + m.slice(0, 4)));
      content.push(Exp.table({head:["Ученик", ...cols.map(c => c.date.slice(8, 10) + "\n" + wd(c.date) + (c.no ? "\n" + c.no + " ур." : "")), "Ср."],
        rows:d.students.map((st, i) => [(i + 1) + ". " + st.name, ...cols.map(c => lessonCell(d, c, st)),
          {v:fmtNum(avgOf(cols.map(c => d.grades[lid(c)]?.[st.id]).filter(Boolean))), bold:true}]),
        widths:[150, ...cols.map(() => cw), 30], fontSize:8, headSize:6.5}));
    });
    const S = studentStats(d), all = avgOf(S.map(x => x.avg).filter(v => v != null));
    content.push(Exp.h2("Итоги за период", {pageBreak:"before"}));
    content.push(Exp.table({head:["№", "Ученик", "Средний балл", "Оценок", "Пропусков", "из них по уваж.", "Опозданий"],
      rows:[...S.map((x, i) => [i + 1, x.st.name, {v:fmtNum(x.avg), bold:true}, x.vals.length, x.missed, x.exc, x.late]),
        [{v:"", fill:TOT}, {v:"По журналу", bold:true, fill:TOT}, {v:fmtNum(all), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.vals.length, 0), bold:true, fill:TOT},
         {v:S.reduce((a, x) => a + x.missed, 0), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.exc, 0), bold:true, fill:TOT}, {v:S.reduce((a, x) => a + x.late, 0), bold:true, fill:TOT}]],
      widths:[26, "*", 80, 55, 65, 80, 65], leftCols:2, fontSize:9}));
    content.push(Exp.p("н — отсутствовал, у — уважительная причина, оп — опоздал. Цвета оценок: 9–10 зелёный, 7–8 синий, 5–6 жёлтый, 1–4 красный.", {margin:[0, 8, 0, 0]}));
  });
  await Exp.pdf({file, landscape:true, content});
}

function openExport(){
  let scope = "one", semSel = sem.n;
  const sc = [], sm = [], fm = [], status = h("p", {class:"sub", role:"status"});
  const paint = () => { sc.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === scope))); sm.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === semSel))); };
  [["one", aName(A)], ["all", "Все мои классы и предметы (" + ASSIGN.length + ")"]].forEach(([k, t]) => sc.push([k, h("button", {type:"button", class:"opt", onclick:() => { scope = k; paint(); }}, t)]));
  [[1, SEMESTERS[0].label], [2, SEMESTERS[1].label], [0, "Весь год"]].forEach(([k, t]) => sm.push([k, h("button", {type:"button", class:"opt", onclick:() => { semSel = k; paint(); }}, t)]));
  const run = async kind => {
    fm.forEach(b => b.disabled = true);
    try {
      const list = scope === "one" ? [A] : ASSIGN, sems = semSel === 0 ? SEMESTERS : [SEMESTERS.find(x => x.n === semSel)], data = [], total = list.length * sems.length;
      for (const a of list) for (const s of sems){ status.textContent = "Собираю данные: " + (data.length + 1) + " из " + total + "…"; data.push(await gatherJournal(a, s)); }
      status.textContent = kind === "xlsx" ? "Формирую файл Excel…" : "Формирую PDF… При первой выгрузке это занимает чуть больше времени.";
      const per = semSel === 0 ? "весь_год" : SEMESTERS.find(x => x.n === semSel).label.replace(" ", "_");
      const file = "Журнал_" + (scope === "one" ? A.classes.name + "_" + A.subjects.name + (A.class_groups ? "_" + A.class_groups.name : "") : "все_классы") + "_" + per + "_" + today();
      await (kind === "xlsx" ? exportJournalXlsx(data, file) : exportJournalPdf(data, file));
      dlg.close(); say("Файл сформирован и скачивается");
    } catch (e) { status.textContent = ""; fail(e); }
    finally { fm.forEach(b => b.disabled = false); }
  };
  fm.push(h("button", {class:"btn", type:"button", onclick:() => run("xlsx")}, "Скачать Excel"), h("button", {class:"btn", type:"button", onclick:() => run("pdf")}, "Скачать PDF"));
  paint();
  show(...[h("h2", {}, "Выгрузка журнала"), h("p", {class:"sub"}, "Оценки и посещаемость в виде таблицы: колонки — уроки, строки — ученики."),
    ASSIGN.length > 1 ? [h("h3", {}, "Что выгрузить"), h("div", {class:"seg"}, sc.map(x => x[1]))] : "",
    h("h3", {}, "Период"), h("div", {class:"seg"}, sm.map(x => x[1])),
    h("p", {class:"sub", style:"margin-top:14px"}, "В Excel каждый журнал на отдельном листе, плюс лист с темами уроков. В PDF таблицы разбиты по месяцам. Файл содержит персональные данные учеников — храните его осторожно."),
    status, h("div", {class:"acts"}, fm, closeBtn())].flat());
}
document.getElementById("exportBtn").addEventListener("click", () => { if (ME && A) openExport(); });
