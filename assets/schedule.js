
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const DAYS = ["","Пн","Вт","Ср","Чт","Пт","Сб"], DAYS_FULL = ["","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const TABS = [["classes","По классам"],["teachers","По учителям"],["breaks","Каникулы и нерабочие дни"]];
let ME, classes = [], A = [], slots = [], breaks = [], tab = Route.tab("/schedule/", TABS.map(t => t[0]), "classes"), curClass = null, curTeacher = null, sat = false, msgTimer;
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
function say(t, ok = true){ const m = document.getElementById("msg"); m.textContent = t; m.className = ok ? "ok" : "bad"; m.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 5000); }
const fail = e => say("Ошибка: " + (e.message || e), false);
const label = (t, el) => h("label", {}, t, el);
const fmtD = d => d.slice(8,10) + "." + d.slice(5,7) + "." + d.slice(0,4);
const cname = id => classes.find(c => c.id === id)?.name || "—";
const asg = id => A.find(a => a.id === id);
const sub = a => a.subjects.name + (a.class_groups ? " (" + a.class_groups.name + ")" : "");
const surname = a => a?.profiles?.full_name || "—";   // полностью: фамилия и имя

async function load(){
  const [c, a, s, b] = await Promise.all([
    db.from("classes").select("*"),
    db.from("teacher_assignments").select("id, class_id, subject_id, teacher_id, group_id, subjects(name), class_groups(name, division), profiles!teacher_assignments_teacher_id_fkey(full_name)"),
    db.from("schedule_slots").select("*"),
    db.from("school_breaks").select("*").order("start_date")]);
  const bad = [c,a,s,b].find(r => r.error); if (bad) return fail(bad.error);
  classes = c.data.sort((x,y) => x.name.localeCompare(y.name, "ru", {numeric:true})); A = a.data; slots = s.data; breaks = b.data;
  curClass ??= classes[0]?.id; curTeacher ??= [...new Set(A.map(x => x.teacher_id))][0];
  render();
}

function render(){
  document.getElementById("tabs").replaceChildren(...TABS.map(([k,t]) => h("button", {role:"tab", "aria-selected":k === tab, onclick:() => { tab = k; Route.go("/schedule/", k); render(); }}, t)));
  document.getElementById("view").replaceChildren(({classes:vClasses, teachers:vTeachers, breaks:vBreaks})[tab]());
}

// сетка «урок × день»; cellFor(day, no) -> массив строк-записей; onClick необязателен
function grid(cellFor, onClick){
  const days = sat ? [1,2,3,4,5,6] : [1,2,3,4,5];
  const maxNo = Math.max(8, ...slots.map(s => s.lesson_no));
  const rows = Array.from({length:maxNo}, (_, i) => i + 1).map(n => h("tr", {}, h("td", {class:"no"}, String(n)),
    days.map(d => { const es = cellFor(d, n);
      const body = es.length ? es.map(e => h("div", {class:"e"}, h("b", {}, e[0]), h("small", {}, e[1]))) : [h("span", {class:"empty"}, onClick ? "+" : "")];
      return h("td", {}, h("button", {type:"button", class:"cell" + (es.length ? "" : " empty"), disabled:!onClick, onclick:() => onClick(d, n)}, body)); })));
  const satBox = h("input", {type:"checkbox", checked:sat, onchange:e => { sat = e.target.checked; render(); }}); satBox.style.width = "auto";
  return h("div", {}, h("div", {class:"chips"}, h("label", {style:"flex-direction:row;gap:8px;align-items:center;flex:0 0 auto"}, satBox, "Показать субботу")),
    h("div", {class:"tw" + (onClick ? "" : " static")}, h("table", {}, h("thead", {}, h("tr", {}, h("th", {class:"no"}, "№"), days.map(d => h("th", {}, DAYS_FULL[d])))), h("tbody", {}, rows))));
}

function vClasses(){
  if (!classes.length) return h("p", {class:"note"}, "Сначала создайте классы в «Администрировании».");
  const chips = h("div", {class:"chips"}, classes.map(c => h("button", {type:"button", "aria-pressed":c.id === curClass, onclick:() => { curClass = c.id; render(); }}, c.name)));
  const g = grid((d, n) => slots.filter(s => s.weekday === d && s.lesson_no === n && asg(s.assignment_id)?.class_id === curClass)
      .map(s => { const a = asg(s.assignment_id); return [sub(a), surname(a) + (s.room ? " · каб. " + s.room : "")]; }),
    (d, n) => openCell(d, n));
  return h("div", {}, chips, g);
}

function vTeachers(){
  const ids = [...new Set(A.map(x => x.teacher_id))];
  if (!ids.length) return h("p", {class:"note"}, "Назначений учителей пока нет. Сделайте их в «Администрировании» → «Назначения».");
  const name = id => A.find(x => x.teacher_id === id)?.profiles?.full_name || "—";
  const sel = h("select", {onchange:e => { curTeacher = e.target.value; render(); }}, ids.sort((a,b) => name(a).localeCompare(name(b), "ru")).map(id => h("option", {value:id, selected:id === curTeacher}, name(id))));
  const g = grid((d, n) => slots.filter(s => s.weekday === d && s.lesson_no === n && asg(s.assignment_id)?.teacher_id === curTeacher)
      .map(s => { const a = asg(s.assignment_id); return [cname(a.class_id) + " · " + sub(a), s.room ? "каб. " + s.room : ""]; }));
  return h("div", {}, h("div", {class:"chips"}, sel), g);
}

function vBreaks(){
  const f = h("input", {type:"date", required:true}), t = h("input", {type:"date", required:true}), n = h("input", {maxlength:100, placeholder:"Например: Осенние каникулы"});
  const form = h("form", {class:"panel", onsubmit:async e => { e.preventDefault();
    const r = await db.from("school_breaks").insert({start_date:f.value, end_date:t.value || f.value, note:n.value.trim()}); if (r.error) return fail(r.error);
    say("Добавлено"); load(); }}, label("С даты", f), label("По дату (включительно)", t), label("Название", n), h("button", {class:"btn"}, "Добавить"));
  t.required = false;
  const rows = breaks.map(b => h("div", {class:"r"}, h("span", {class:"t"}, fmtD(b.start_date) + (b.end_date !== b.start_date ? " — " + fmtD(b.end_date) : "") + (b.note ? " · " + b.note : "")),
    h("button", {class:"mini", type:"button", onclick:async () => { if (!confirm("Удалить запись?")) return;
      const r = await db.from("school_breaks").delete().eq("id", b.id); if (r.error) return fail(r.error); load(); }}, "Удалить")));
  return h("div", {}, h("p", {class:"sub"}, "В эти даты уроки не появляются в журналах учителей. Один выходной день: укажите только первую дату."), form,
    rows.length ? h("div", {class:"list"}, rows) : h("p", {class:"note"}, "Каникул и выходных пока нет."));
}

function openCell(d, n){
  const here = () => slots.filter(s => s.weekday === d && s.lesson_no === n && asg(s.assignment_id)?.class_id === curClass);
  const draw = () => {
    const mine = A.filter(a => a.class_id === curClass)
      .sort((x, y) => sub(x).localeCompare(sub(y), "ru") || (x.profiles?.full_name || "").localeCompare(y.profiles?.full_name || "", "ru"));   // по алфавиту
    const sel = h("select", {}, h("option", {value:""}, "Выберите предмет и учителя"), mine.map(a => h("option", {value:a.id}, sub(a) + " — " + (a.profiles?.full_name || "—"))));
    const room = h("input", {maxlength:10, placeholder:"№ кабинета (необязательно)"});
    const err = h("p", {class:"note", role:"alert", hidden:true, style:"color:var(--pen);border-color:var(--pen);margin-top:12px"});
    const bad = m => { err.textContent = m; err.hidden = false; };
    const add = h("button", {class:"btn", type:"button", onclick:async () => {
      err.hidden = true;
      if (!sel.value) return bad("Выберите предмет и учителя");
      const a = asg(+sel.value), clash = slots.find(s => s.weekday === d && s.lesson_no === n && asg(s.assignment_id)?.teacher_id === a.teacher_id);
      const own = slots.find(s => { const o = asg(s.assignment_id); return s.weekday === d && s.lesson_no === n && o?.class_id === a.class_id && (!o.group_id || !a.group_id || o.group_id === a.group_id || o.class_groups?.division !== a.class_groups?.division); });
      if (own) return bad("Пересечение: у класса " + cname(a.class_id) + " в это время уже есть урок (" + sub(asg(own.assignment_id)) + "). Одновременно можно ставить только разные группы одного деления (вкладки «Группы» и «Назначения»).");
      if (clash) return bad("Пересечение: у учителя " + (a.profiles?.full_name || "—") + " в это время уже есть урок в классе " + cname(asg(clash.assignment_id).class_id));
      const r = await db.from("schedule_slots").insert({assignment_id:a.id, weekday:d, lesson_no:n, room:room.value.trim()});
      if (r.error) return bad(r.error.code === "23505" ? "Этот урок уже стоит в этой клетке" : (r.error.message || "Ошибка"));
      const s = await db.from("schedule_slots").select("*"); if (!s.error) slots = s.data; render(); draw(); say("Добавлено"); }}, "Добавить");
    const cur = here().map(s => { const a = asg(s.assignment_id); return h("div", {class:"r", style:"display:flex;gap:10px;align-items:center;padding:6px 0"},
      h("span", {style:"flex:1"}, sub(a) + " — " + (a.profiles?.full_name || "—") + (s.room ? " (каб. " + s.room + ")" : "")),
      h("button", {class:"mini", type:"button", onclick:async () => { const r = await db.from("schedule_slots").delete().eq("id", s.id); if (r.error) return bad(r.error.message);
        slots = slots.filter(x => x.id !== s.id); render(); draw(); }}, "Убрать")); });
    dlg.replaceChildren(...[h("h2", {}, DAYS_FULL[d] + ", " + n + " урок · " + cname(curClass)),
      h("h3", {}, "Сейчас в этой клетке"), cur.length ? cur : h("p", {class:"sub"}, "Пока пусто."),
      mine.length ? [h("h3", {}, "Добавить урок (группы одного класса можно ставить одновременно)"), label("Предмет и учитель", sel), label("Кабинет", room), err] : h("p", {class:"note"}, "Для этого класса нет назначений учителей: «Администрирование» → «Назначения»."),
      h("div", {class:"acts"}, mine.length ? add : "", h("button", {class:"btn ghost", type:"button", onclick:() => dlg.close()}, "Готово"))].flat());
  };
  draw(); if (!dlg.open) dlg.showModal();
}

document.getElementById("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  const { data: me } = await db.from("profiles").select("id, full_name, role, can_schedule").eq("id", session.user.id).single();
  if (!me || !(me.role === "admin" || me.can_schedule)) return location.replace("/cabinet/");
  ME = me; document.getElementById("who").textContent = me.full_name;
  if (me.role !== "admin") document.getElementById("back").hidden = true;
  load();
})();

addEventListener("popstate", () => { tab = Route.tab("/schedule/", TABS.map(t => t[0]), "classes"); if (ME) render(); });
