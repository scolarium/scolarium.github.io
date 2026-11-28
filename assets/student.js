
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_FULL = ["","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const TABS = [["schedule","Расписание"],["grades","Оценки"]];
let ME, KIDS = [], K = null, ASG = [], SLOTS = [], tab = Route.tab("/student/", TABS.map(t => t[0]), "schedule"), UNREAD = new Map(), month = "", mode = "month", weekStart = "", BREAKS = [], token = 0, msgTimer;
const dlg = document.getElementById("dlg");
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
function oops(e){ const m = document.getElementById("msg"); m.textContent = "Ошибка: " + (e.message || e); m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 6000); }
const fmt = d => d.slice(8,10) + "." + d.slice(5,7);
const wd = d => new Date(d + "T00:00").toLocaleDateString("ru", {weekday:"short"});
const iso = d => d.toLocaleDateString("sv");
const today = () => iso(new Date());
const shiftMonth = (m, n) => { const d = new Date(+m.slice(0,4), +m.slice(5,7) - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const schoolYearStart = () => { const d = new Date(); return (d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1) + "-09-01"; };
const mine = lesson => !lesson.group_id || K.groups.has(lesson.group_id);   // уроки чужой группы не показываем
const tname = id => ASG.find(a => a.teacher_id === id)?.profiles?.full_name || "";
const note = t => h("p", {class:"note"}, t);
const addTo = (d, n) => { const x = new Date(d + "T00:00"); x.setDate(x.getDate() + n); return iso(x); };
const mondayOf = () => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() || 7) - 1)); return iso(x); };
const fmtLong = d => new Date(d + "T00:00").toLocaleDateString("ru", {weekday:"long", day:"numeric", month:"long"});
const sizeKb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
async function download(f){
  const u = await db.storage.from("lesson-materials").createSignedUrl(f.path, 60, {download:f.name}); if (u.error) return oops(u.error);
  const a = document.createElement("a"); a.href = u.data.signedUrl; a.click();
}

async function init(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  await Years.load(db); semSel = today() <= SEMESTERS[0].end ? 1 : 2;
  const { data: me } = await db.from("profiles").select("id, full_name, role").eq("id", session.user.id).single();
  if (!me || !["student","parent"].includes(me.role)) return location.replace("/cabinet/");
  ME = me; document.getElementById("who").textContent = me.full_name;
  document.getElementById("eyebrow").textContent = me.role === "parent" ? "Кабинет родителя" : "Кабинет ученика";
  if (me.role === "student") KIDS = [{id:me.id, name:me.full_name}];
  else {
    const ps = await db.from("parent_students").select("student_id").eq("parent_id", me.id);
    if (ps.error) return oops(ps.error);
    if (ps.data.length){
      const pr = await db.from("profiles").select("id, full_name").in("id", ps.data.map(x => x.student_id));
      if (pr.error) return oops(pr.error);
      KIDS = pr.data.map(p => ({id:p.id, name:p.full_name})).sort((a,b) => a.name.localeCompare(b.name, "ru"));
    }
  }
  const view = document.getElementById("view");
  if (!KIDS.length){ document.getElementById("title").textContent = "Журнал"; return view.append(note("К вашему аккаунту пока не привязан ни один ребёнок. Обратитесь в администрацию школы.")); }
  month = today().slice(0, 7); weekStart = mondayOf();
  const br = await db.from("school_breaks").select("*"); if (!br.error) BREAKS = br.data;
  const t = document.getElementById("tabs"); t.hidden = false;
  drawTabs();
  pickKid(KIDS[0]);
}
function drawTabs(){ document.getElementById("tabs").replaceChildren(...TABS.map(([k,n]) => h("button", {role:"tab", "aria-selected":k === tab, onclick:() => { tab = k; Route.go("/student/", k); drawTabs(); render(); }}, n))); }

async function pickKid(k){
  const my = ++token;
  const kb = document.getElementById("kids"); kb.hidden = KIDS.length < 2;
  kb.replaceChildren(...KIDS.map(x => h("button", {type:"button", "aria-pressed":x.id === k.id, onclick:() => pickKid(x)}, x.name)));
  const [st, sg] = await Promise.all([db.from("students").select("class_id, classes(name)").eq("profile_id", k.id).single(),
                                      db.from("student_groups").select("group_id, class_groups(name)").eq("student_id", k.id)]);
  if (st.error || sg.error) return oops(st.error || sg.error);
  const a = await db.from("teacher_assignments").select("id, subject_id, teacher_id, group_id, subjects(name), class_groups(name), profiles!teacher_assignments_teacher_id_fkey(full_name)").eq("class_id", st.data.class_id);
  if (a.error) return oops(a.error);
  if (my !== token) return;
  K = {id:k.id, name:k.name, class_id:st.data.class_id, className:st.data.classes?.name || "", groups:new Set(sg.data.map(x => x.group_id)), groupNames:sg.data.map(x => x.class_groups?.name).filter(Boolean)};
  ASG = a.data.filter(x => !x.group_id || K.groups.has(x.group_id));
  const sl = ASG.length ? await db.from("schedule_slots").select("*").in("assignment_id", ASG.map(x => x.id)) : {data:[]};
  if (sl.error) return oops(sl.error);
  SLOTS = sl.data;
  document.getElementById("title").textContent = ME.role === "parent" ? K.name : "Мой журнал";
  document.getElementById("sub").textContent = K.className ? "Класс " + K.className + (K.groupNames.length ? " · группы: " + K.groupNames.join(", ") : "") : "";
  UNREAD = await Chat.unread(); if (my !== token) return;
  render();
}

function render(){
  const v = document.getElementById("view"); v.replaceChildren(note("Загрузка…"));
  const my = token;
  (tab === "schedule" ? vSchedule() : vGrades()).then(n => { if (my === token) v.replaceChildren(n); }).catch(e => { oops(e); v.replaceChildren(note("Не удалось загрузить данные.")); });
}

async function vSchedule(){
  if (!SLOTS.length) return note("Расписание пока не составлено.");
  const dd = SLOTS.some(s => s.weekday === 6) ? [1,2,3,4,5,6] : [1,2,3,4,5], maxNo = Math.max(8, ...SLOTS.map(s => s.lesson_no));
  const dates = dd.map(d => addTo(weekStart, d - 1));
  const r = await db.from("lessons").select("id, lesson_date, lesson_no, subject_id, teacher_id, group_id, topic, homework, lesson_files(id, name, path, size)")
    .eq("class_id", K.class_id).gte("lesson_date", dates[0]).lte("lesson_date", dates[dates.length - 1]).limit(1000);
  if (r.error) throw r.error;
  const LS = r.data.filter(mine), off = d => BREAKS.find(b => d >= b.start_date && d <= b.end_date);
  const bar = h("div", {class:"bar"},
    h("button", {class:"btn ghost", type:"button", "aria-label":"Предыдущая неделя", onclick:() => { weekStart = addTo(weekStart, -7); render(); }}, "←"),
    h("span", {class:"m"}, fmt(dates[0]) + " — " + fmt(dates[dates.length - 1]) + "." + dates[0].slice(0, 4)),
    h("button", {class:"btn ghost", type:"button", "aria-label":"Следующая неделя", onclick:() => { weekStart = addTo(weekStart, 7); render(); }}, "→"),
    h("button", {class:"btn ghost", type:"button", onclick:() => { weekStart = mondayOf(); render(); }}, "Сегодня"));
  const rows = Array.from({length:maxNo}, (_, i) => i + 1).map(n => h("tr", {}, h("td", {class:"no"}, String(n)),
    dd.map((d, k) => { const date = dates[k], br = off(date);
      if (br) return h("td", {class:"off"}, n === 1 ? (br.note || "нерабочий день") : "");
      return h("td", {}, SLOTS.filter(s => s.weekday === d && s.lesson_no === n).map(s => { const a = ASG.find(x => x.id === s.assignment_id),
        l = LS.find(x => x.lesson_date === date && x.lesson_no === n && x.subject_id === a.subject_id && x.teacher_id === a.teacher_id);
        return h("button", {type:"button", class:"les" + (l && UNREAD.get(l.id + "|" + K.id) ? " unread" : ""), "data-k":l ? l.id + "|" + K.id : null, onclick:() => openLesson(a, s, date, l)}, h("b", {}, a.subjects.name),
          h("small", {}, (a.profiles?.full_name || "") + (s.room ? " · каб. " + s.room : "")),
          l?.topic ? h("span", {class:"tp"}, l.topic.length > 48 ? l.topic.slice(0, 48) + "…" : l.topic) : "",
          h("span", {}, l?.homework ? h("span", {class:"badge"}, "ДЗ") : "", l?.lesson_files?.length ? h("span", {class:"badge"}, "📎 " + l.lesson_files.length) : "")); })); })));
  return h("div", {}, bar, h("div", {class:"tw"}, h("table", {class:"sch"}, h("thead", {}, h("tr", {}, h("th", {class:"no"}, "№"),
    dd.map((d, k) => h("th", {}, DAYS_FULL[d], h("small", {}, fmt(dates[k]) + (dates[k] === today() ? " · сегодня" : "")))))), h("tbody", {}, rows))),
    h("p", {class:"muted", style:"margin-top:10px"}, "Нажмите на урок, чтобы увидеть тему, домашнее задание и материалы. «ДЗ» — есть домашнее задание, 📎 — есть файлы. Красная точка — новое сообщение от учителя в чате урока."));
}

async function openLesson(a, s, date, l){
  const chatBox = h("div", {class:"chat-wrap"});
  if (l) chatBox.append(Chat.mount({lessonId:l.id, studentId:K.id, meId:ME.id, onError:oops, alive:() => dlg.open && chatBox.isConnected,
    hint:"Один общий чат по этому уроку: его видят " + (a.profiles?.full_name || "учитель") + ", " + K.name + (ME.role === "parent" ? " и родители ученика" : " и его родители") + ". Для каждого урока чат отдельный.",
    onRead:() => { const k = l.id + "|" + K.id; if (UNREAD.delete(k)) document.querySelectorAll('.les[data-k="' + k + '"]').forEach(b => b.classList.remove("unread")); }}));
  const filled = l && (l.topic || l.homework || l.lesson_files.length), extra = h("div");
  dlg.replaceChildren(...[h("h2", {}, a.subjects.name),
    h("p", {class:"muted"}, fmtLong(date) + " · " + s.lesson_no + " урок" + (a.profiles?.full_name ? " · " + a.profiles.full_name : "") + (s.room ? " · каб. " + s.room : "")),
    filled ? [l.topic ? [h("h3", {}, "Тема урока"), h("p", {}, l.topic)] : "",
              l.homework ? [h("h3", {}, "Домашнее задание"), h("p", {class:"hw"}, l.homework)] : "",
              l.lesson_files.length ? [h("h3", {}, "Материалы"), h("div", {class:"files"}, l.lesson_files.map(f => h("button", {class:"file", type:"button", onclick:() => download(f)}, "⬇ " + f.name + " (" + sizeKb(f.size) + ")")))] : ""].flat()
           : h("p", {class:"note", style:"margin-top:14px"}, date > today() ? "Урок ещё не прошёл. Тема и задание появятся, когда учитель их заполнит." : "Учитель пока не заполнил этот урок."),
    extra, l ? [h("h3", {}, "Чат с учителем"), chatBox] : "", h("div", {style:"margin-top:18px"}, h("button", {class:"btn ghost", type:"button", onclick:() => dlg.close()}, "Закрыть"))].flat());
  if (!dlg.open) dlg.showModal();
  if (l){   // оценка и отметка видны только после подписи колонки учителем (это решает база данных)
    const [g, t] = await Promise.all([db.from("grades").select("value").eq("lesson_id", l.id).eq("student_id", K.id),
                                      db.from("attendance").select("status").eq("lesson_id", l.id).eq("student_id", K.id)]);
    const st = {present:"присутствовал", absent:"отсутствовал", excused:"отсутствовал по уважительной причине", late:"опоздал"}[t.data?.[0]?.status];
    if (g.data?.[0]) extra.append(h("h3", {}, "Оценка"), h("p", {class:"avg"}, String(g.data[0].value)));
    if (st && t.data[0].status !== "present") extra.append(h("h3", {}, "Посещаемость"), h("p", {}, st));
  }
}

// Даты семестров лежат в базе (таблица school_years): см. years.js
const SEMESTERS = Years.SEMESTERS;
let semSel = today() <= SEMESTERS[0].end ? 1 : 2;   // 1, 2 или 0 = весь год
const semOf = d => d < SEMESTERS[1].start ? 0 : 1;
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const num = n => n.toLocaleString("ru", {maximumFractionDigits:2});

async function vGrades(){
  const whole = semSel === 0, a0 = whole ? SEMESTERS[0].start : SEMESTERS[semSel - 1].start, a1 = whole ? SEMESTERS[1].end : SEMESTERS[semSel - 1].end;
  const L = "lessons!inner(lesson_date, lesson_no, topic, group_id, subject_id, subjects(name))";
  const [g, t] = await Promise.all([
    db.from("grades").select("lesson_id, value, " + L).eq("student_id", K.id).gte("lessons.lesson_date", a0).lte("lessons.lesson_date", a1).limit(1000),
    db.from("attendance").select("lesson_id, status, " + L).eq("student_id", K.id).neq("status", "present").gte("lessons.lesson_date", a0).lte("lessons.lesson_date", a1).limit(1000)]);
  if (g.error || t.error) throw g.error || t.error;
  const by = new Map(), ev = (r, lesson) => { if (!mine(lesson)) return null; const sid = lesson.subject_id;
    if (!by.has(sid)) by.set(sid, {name:lesson.subjects?.name || "—", items:new Map()});
    const items = by.get(sid).items; if (!items.has(r.lesson_id)) items.set(r.lesson_id, {date:lesson.lesson_date, no:lesson.lesson_no, topic:lesson.topic});
    return items.get(r.lesson_id); };
  g.data.forEach(r => { const e = ev(r, r.lessons); if (e) e.value = r.value; });
  const cnt = {absent:0, excused:0, late:0};
  t.data.forEach(r => { const e = ev(r, r.lessons); if (e){ e.status = r.status; cnt[r.status]++; } });
  const subjects = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const bar = h("div", {class:"chips"}, [[1, SEMESTERS[0].label], [2, SEMESTERS[1].label], [0, "Весь год"]].map(([k, n]) =>
    h("button", {type:"button", "aria-pressed":semSel === k, onclick:() => { semSel = k; render(); }}, n)));
  const stats = h("div", {class:"stats"}, [["absent","Пропусков"],["excused","из них по уважительной"],["late","Опозданий"]].map(([k,n]) => h("div", {class:"stat"}, h("b", {}, String(k === "absent" ? cnt.absent + cnt.excused : cnt[k])), n)));
  const foot = h("p", {class:"muted", style:"margin-top:10px"}, "Средний балл — среднее всех оценок за период. Оценка за семестр получается из среднего балла, округлённого до целого. н — отсутствовал, у — по уважительной причине, оп — опоздал. Оценки и отметки появляются после того, как учитель подпишет колонку.");

  if (whole){
    const rows = subjects.map(s => { const items = [...s.items.values()].filter(x => x.value);
      const per = [0, 1].map(i => { const v = items.filter(x => semOf(x.date) === i).map(x => x.value); return v.length ? {avg:mean(v), fin:Math.round(mean(v))} : null; });
      const year = per[0] && per[1] ? Math.round((per[0].fin + per[1].fin) / 2) : null;
      const cell = p => h("td", {}, p ? [h("div", {}, h("b", {style:"font-family:var(--serif);font-size:1.1rem"}, num(p.avg))), h("small", {}, "оценка за семестр: " + p.fin)] : "—");
      return items.length ? h("tr", {}, h("td", {}, s.name), cell(per[0]), cell(per[1]), h("td", {}, year ? [h("div", {}, h("b", {style:"font-family:var(--serif);font-size:1.1rem"}, String(year))), h("small", {}, "из " + num((per[0].fin + per[1].fin) / 2))] : "—")) : null; }).filter(Boolean);
    return h("div", {}, bar, stats,
      rows.length ? h("div", {class:"tw"}, h("table", {class:"yr", style:"min-width:520px"}, h("thead", {}, h("tr", {}, h("th", {}, "Предмет"), h("th", {}, "I семестр: средний балл"), h("th", {}, "II семестр: средний балл"), h("th", {}, "Оценка за год"))), h("tbody", {}, rows)))
                  : note("Оценок за учебный год пока нет."),
      h("p", {class:"muted", style:"margin-top:10px"}, "Оценка за год — среднее двух оценок за семестр, округлённое до целого. Появляется, когда есть оценки в обоих семестрах."), foot);
  }
  const cards = subjects.map(s => {
    const items = [...s.items.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.no ?? 0) - (b.no ?? 0)), vals = items.map(i => i.value).filter(Boolean);
    return h("div", {class:"card"}, h("div", {class:"row"}, h("b", {}, s.name),
      vals.length ? h("span", {style:"text-align:right"}, h("span", {class:"avg"}, "Средний балл: " + num(mean(vals))), h("div", {class:"muted"}, "Оценка за семестр: " + Math.round(mean(vals)))) : h("span", {class:"muted"}, "оценок нет")),
      h("div", {class:"marks"}, items.map(i => { const txt = i.value ? String(i.value) : ({absent:"н", excused:"у", late:"оп"}[i.status] || "");
        return h("span", {class:"chip" + (i.value ? (i.value <= 4 ? " low" : i.value >= 9 ? " hi" : i.value >= 7 ? "" : " mid") : "") + (!i.value ? " mk" : ""), title:fmt(i.date) + (i.topic ? " · " + i.topic : "") + (i.status ? " · " + ({absent:"отсутствовал", excused:"уважительная причина", late:"опоздал"}[i.status]) : "")}, txt); })));
  });
  return h("div", {}, bar, h("p", {class:"muted", style:"margin:0 0 10px"}, fmt(a0) + "." + a0.slice(0, 4) + " — " + fmt(a1) + "." + a1.slice(0, 4)), stats, cards.length ? cards : note("За этот семестр оценок и отметок пока нет."), foot);
}

document.getElementById("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });
init();

addEventListener("popstate", () => { tab = Route.tab("/student/", TABS.map(t => t[0]), "schedule"); if (K) { drawTabs(); render(); } });
