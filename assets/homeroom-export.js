// Выгрузка данных класса для классного руководителя: сводка, ученики и родители, ведомость, посещаемость, расписание (Excel и PDF).
// Работает поверх homeroom.js (общие переменные и функции).
const rangeOf = sel => sel === 0 ? [SEMESTERS[0].start, SEMESTERS[1].end] : [SEMESTERS[sel - 1].start, SEMESTERS[sel - 1].end];
const periodLabel = sel => sel === 0 ? "весь учебный год" : SEMESTERS[sel - 1].label + " (" + rangeOf(sel).map(d => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4)).join(" — ") + ")";
const TOTF = "EEF3FF", WARN = "FDEBC8", LOWC = {fill:"FBDADB", color:"B3262B"};

async function gradesData(sel){   // как vGrades, но для выбранного периода: {cols:[[id, предмет]], cells:Map}
  const subj = new Map(); let cells;
  if (sel === 0){
    const [a, b] = await Promise.all([averages(SEMESTERS[0].start, SEMESTERS[0].end), averages(SEMESTERS[1].start, SEMESTERS[1].end)]);
    const f1 = new Map(a.map(x => [x.student_id + "|" + x.subject_id, Math.round(x.avg)]));
    cells = new Map(); a.concat(b).forEach(x => subj.set(x.subject_id, x.subject));
    b.forEach(x => { const k = x.student_id + "|" + x.subject_id; if (f1.has(k)) cells.set(k, Math.round((f1.get(k) + Math.round(x.avg)) / 2)); });
  } else {
    const [d1, d2] = rangeOf(sel), a = await averages(d1, d2);
    cells = new Map(a.map(x => [x.student_id + "|" + x.subject_id, Number(x.avg)])); a.forEach(x => subj.set(x.subject_id, x.subject));
  }
  return {cols:[...subj.entries()].sort((x, y) => x[1].localeCompare(y[1], "ru")), cells};
}
async function attendanceData(sel){
  const [d1, d2] = rangeOf(sel), r = await db.rpc("class_attendance", {cid:C.id, d1, d2}); if (r.error) throw r.error;
  return new Map(r.data.map(x => [x.student_id, x]));
}
const r2 = n => n == null ? "" : Math.round(n * 100) / 100;

// Каждая секция: {key, name (лист Excel), title, head, rows, widths, leftCols, pdfWidths}
function peopleSection(){
  const rows = STU.map((s, i) => { const par = PARD.get(s.id) || [];
    return [{v:i + 1, align:"center"}, s.name, s.login || "", C.name, (GRP.get(s.id) || []).join(", ") || "—",
      par.length ? par.map(x => x.name).join("\n") : {v:"не привязан", fill:WARN},
      par.length ? par.map(x => x.login || "—").join("\n") : "", par.length]; });
  return {key:"people", name:"Ученики", title:"Ученики и родители", head:["№", "Ученик", "Логин", "Класс", "Группы", "Родители", "Логины родителей", "Родителей привязано"],
    rows, widths:[5, 30, 16, 9, 22, 34, 22, 12], leftCols:6, pdfWidths:[22, "*", 70, 34, 90, "*", 80, 50], freezeCols:2, headHeight:36};
}
async function gradesSection(sel){
  const {cols, cells} = await gradesData(sel);
  if (!cols.length) return {key:"grades", name:"Ведомость", title:"Ведомость: " + periodLabel(sel), empty:"За этот период подписанных оценок пока нет."};
  const cellOf = v => v == null ? "" : {v:r2(v), bold:true, ...(v < 5 ? LOWC : {})};
  const rows = STU.map((s, i) => { const vals = cols.map(([id]) => cells.get(s.id + "|" + id)).filter(v => v != null), m = vals.length ? mean(vals) : null;
    return [{v:i + 1, align:"center"}, s.name, ...cols.map(([id]) => cellOf(cells.get(s.id + "|" + id))), m == null ? "" : {v:r2(m), bold:true, fill:"E4ECFF", color:"233F8F", ...(m < 5 ? LOWC : {})}]; });
  const colM = cols.map(([id]) => { const v = STU.map(s => cells.get(s.id + "|" + id)).filter(x => x != null); return v.length ? mean(v) : null; });
  const all = (() => { const v = rows.map((_, i) => STU[i]).map(s => { const x = cols.map(([id]) => cells.get(s.id + "|" + id)).filter(q => q != null); return x.length ? mean(x) : null; }).filter(q => q != null); return v.length ? mean(v) : null; })();
  rows.push([{v:"", fill:TOTF}, {v:"Средний балл по классу", bold:true, fill:TOTF, align:"left"}, ...colM.map(v => ({v:r2(v), bold:true, fill:TOTF})), {v:r2(all), bold:true, fill:TOTF}]);
  return {key:"grades", name:"Ведомость", title:"Ведомость: " + periodLabel(sel), head:["№", "Ученик", ...cols.map(([, n]) => n), sel === 0 ? "Средняя годовых" : "Средний балл"],
    rows, widths:[5, 30, ...cols.map(() => 13), 13], leftCols:2, pdfWidths:[22, 130, ...cols.map(() => "*"), 55], freezeCols:2, headHeight:48, avgAll:all,
    note:sel === 0 ? "В клетках оценка за год: среднее двух оценок за семестр (каждая — средний балл, округлённый до целого)." : "В клетках средний балл по предмету. Учитываются только оценки в колонках, подписанных учителями. Красным отмечено ниже 5."};
}
async function attendanceSection(sel){
  const m = await attendanceData(sel), T = {all:0, ex:0, un:0, late:0};
  const rows = STU.map((s, i) => { const x = m.get(s.id) || {absent:0, excused:0, late:0}, all = x.absent + x.excused; T.all += all; T.ex += x.excused; T.un += x.absent; T.late += x.late;
    return [{v:i + 1, align:"center"}, s.name, all, x.excused, x.absent ? {v:x.absent, bold:true, ...LOWC} : x.absent, x.late]; });
  rows.push([{v:"", fill:TOTF}, {v:"Всего по классу", bold:true, fill:TOTF, align:"left"}, ...[T.all, T.ex, T.un, T.late].map(v => ({v, bold:true, fill:TOTF}))]);
  return {key:"attendance", name:"Посещаемость", title:"Посещаемость: " + periodLabel(sel), head:["№", "Ученик", "Пропущено уроков", "по уважительной причине", "без уважительной", "Опозданий"],
    rows, widths:[5, 30, 14, 16, 14, 12], leftCols:2, pdfWidths:[22, "*", 80, 90, 80, 70], freezeCols:2, headHeight:36, totals:T,
    note:"Считаются уроки, на которых учитель отметил «отсутствовал», «уважительная причина» или «опоздал»."};
}
function scheduleSection(){
  if (!SLOTS.length) return {key:"schedule", name:"Расписание", title:"Расписание класса", empty:"Расписание класса пока не составлено."};
  const dd = SLOTS.some(s => s.weekday === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5], maxNo = Math.max(...SLOTS.map(s => s.lesson_no));
  const rows = Array.from({length:maxNo}, (_, i) => i + 1).map(n => [{v:n, align:"center", bold:true}, ...dd.map(d => SLOTS.filter(s => s.weekday === d && s.lesson_no === n).map(s => { const a = ASG.find(x => x.id === s.assignment_id);
    return a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : "") + "\n" + (a.profiles?.full_name || "") + (s.room ? " · каб. " + s.room : ""); }).join("\n\n"))]);
  return {key:"schedule", name:"Расписание", title:"Расписание класса", head:["№", ...dd.map(d => DAYS_FULL[d])], rows, widths:[5, ...dd.map(() => 26)], leftCols:1, pdfWidths:[22, ...dd.map(() => "*")], headHeight:24};
}
function summarySection(extra){
  const withPar = STU.filter(s => (PARD.get(s.id) || []).length).length, parents = new Set();
  STU.forEach(s => (PARD.get(s.id) || []).forEach(x => parents.add(x.login || x.name)));
  const inGrp = STU.filter(s => (GRP.get(s.id) || []).length).length, byGrp = new Map();
  STU.forEach(s => (GRP.get(s.id) || []).forEach(g => byGrp.set(g, (byGrp.get(g) || 0) + 1)));
  const kv = [["Класс", C.name], ["Учебный год", C.school_year], ["Учеников в классе", STU.length], ["Учеников с привязанным родителем", withPar],
    ["Учеников без привязанного родителя", STU.length - withPar], ["Родительских аккаунтов привязано", parents.size], ["Учеников, распределённых по группам", inGrp], ["Учеников без групп", STU.length - inGrp]];
  [...byGrp.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")).forEach(([g, n]) => kv.push(["Группа «" + g + "»", n + " уч."]));
  (extra || []).forEach(x => kv.push(x));
  const noPar = STU.filter(s => !(PARD.get(s.id) || []).length).map(s => s.name);
  if (noPar.length) kv.push(["Без привязанного родителя", noPar.join("\n")]);
  return {key:"summary", name:"Сводка", title:"Сводка по классу", head:["Показатель", "Значение"], rows:kv.map(([k, v]) => [{v:k, align:"left"}, {v, align:"left", bold:!String(k).startsWith("Без привязанного родителя")}]),
    widths:[44, 50], leftCols:2, pdfWidths:[250, "*"], headHeight:22};
}

async function buildReport(opts){
  const sections = [], sel = opts.sel, extra = [];
  const g = opts.grades ? await gradesSection(sel) : null, a = opts.attendance ? await attendanceSection(sel) : null;
  if (g && g.avgAll != null) extra.push(["Средний балл класса (" + periodLabel(sel) + ")", r2(g.avgAll)]);
  if (a) extra.push(["Пропущено уроков (" + periodLabel(sel) + ")", a.totals.all + " (из них по уважительной: " + a.totals.ex + ")"], ["Опозданий (" + periodLabel(sel) + ")", a.totals.late]);
  sections.push(summarySection(extra));
  if (opts.people) sections.push(peopleSection());
  if (g) sections.push(g);
  if (a) sections.push(a);
  if (opts.schedule) sections.push(scheduleSection());
  return sections;
}
const reportLines = () => ["Класс " + C.name + ", учебный год " + C.school_year, "Выгрузил: " + ME.full_name, "Сформировано: " + new Date().toLocaleString("ru")];

async function reportXlsx(sections, file){
  await Exp.xlsx({file, sheets:sections.map(s => s.empty
    ? {name:s.name, title:s.title, lines:[...reportLines(), s.empty], head:["Нет данных"], rows:[], widths:[40]}
    : {name:s.name, title:s.title + " — класс " + C.name, lines:[...reportLines(), ...(s.note ? [s.note] : [])], head:s.head, rows:s.rows, widths:s.widths, leftCols:s.leftCols, freezeCols:s.freezeCols || 0, headHeight:s.headHeight})});
}
async function reportPdf(sections, file){
  const content = [Exp.h1("Класс " + C.name + ": отчёт"), ...reportLines().map(l => Exp.p(l))];
  sections.forEach((s, i) => {
    content.push(Exp.h2(s.title, i ? {pageBreak:"before"} : {}));
    if (s.empty) return content.push(Exp.p(s.empty));
    content.push(Exp.table({head:s.head, rows:s.rows, widths:s.pdfWidths, leftCols:s.leftCols, fontSize:s.key === "grades" ? 8 : 9, headSize:s.key === "grades" ? 7 : 8.5}));
    if (s.note) content.push(Exp.p(s.note, {margin:[0, 8, 0, 0]}));
  });
  await Exp.pdf({file, landscape:true, content});
}

const dlg = document.getElementById("dlg");
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
function openExport(){
  const opts = {people:true, grades:true, attendance:true, schedule:false, sel:semSel}, secs = [], sm = [], fm = [], status = h("p", {class:"sub", role:"status"});
  const paint = () => { secs.forEach(([k, b]) => b.setAttribute("aria-pressed", String(!!opts[k]))); sm.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === opts.sel))); };
  [["people", "Ученики и родители"], ["grades", "Ведомость"], ["attendance", "Посещаемость"], ["schedule", "Расписание"]].forEach(([k, t]) => secs.push([k, h("button", {type:"button", class:"opt", onclick:() => { opts[k] = !opts[k]; paint(); }}, t)]));
  [[1, SEMESTERS[0].label], [2, SEMESTERS[1].label], [0, "Весь год"]].forEach(([k, t]) => sm.push([k, h("button", {type:"button", class:"opt", onclick:() => { opts.sel = k; paint(); }}, t)]));
  const run = async kind => {
    fm.forEach(b => b.disabled = true);
    try {
      status.textContent = "Собираю данные…";
      const sections = await buildReport(opts);
      status.textContent = kind === "xlsx" ? "Формирую файл Excel…" : "Формирую PDF… При первой выгрузке это занимает чуть больше времени.";
      const file = "Класс_" + C.name + "_" + (opts.sel === 0 ? "весь_год" : SEMESTERS[opts.sel - 1].label.replace(" ", "_")) + "_" + today();
      await (kind === "xlsx" ? reportXlsx(sections, file) : reportPdf(sections, file));
      dlg.close();
    } catch (e) { status.textContent = ""; oops(e); }
    finally { fm.forEach(b => b.disabled = false); }
  };
  fm.push(h("button", {class:"btn", type:"button", onclick:() => run("xlsx")}, "Скачать Excel"), h("button", {class:"btn", type:"button", onclick:() => run("pdf")}, "Скачать PDF"));
  paint();
  dlg.replaceChildren(h("h2", {}, "Выгрузка по классу " + C.name), h("p", {class:"sub"}, "Первым листом (разделом) всегда идёт сводка: сколько учеников, у кого привязаны родители, распределение по группам."),
    h("h3", {}, "Что включить"), h("div", {class:"seg"}, secs.map(x => x[1])),
    h("h3", {}, "Период для ведомости и посещаемости"), h("div", {class:"seg"}, sm.map(x => x[1])),
    h("p", {class:"sub", style:"margin-top:14px"}, "Файл содержит персональные данные учеников и родителей — храните и передавайте его осторожно."),
    status, h("div", {class:"acts"}, fm, h("button", {class:"btn ghost", type:"button", onclick:() => dlg.close()}, "Закрыть")));
  if (!dlg.open) dlg.showModal();
}
document.getElementById("exportBtn").addEventListener("click", () => { if (C) openExport(); });
