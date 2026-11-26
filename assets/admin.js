
const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const ROLES = {admin:"Администратор", teacher:"Учитель", student:"Ученик", parent:"Родитель"};
const TABS = [["classes","Классы"],["subjects","Предметы"],["users","Пользователи"],["groups","Группы"],["assign","Назначения"],["unlocks","Открытие колонок"]];
let S = {classes:[],subjects:[],profiles:[],students:[],ta:[],ps:[],groups:[],sg:[],un:[]}, gClass = null, tab = Route.tab("/admin/", TABS.map(t => t[0]), "classes"), userRole = "teacher", msgTimer;

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
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 6000);
}
const label = (t, el) => h("label", {}, t, el);
const opts = (rows, text, ph) => [h("option", {value:""}, ph), ...rows.map(r => h("option", {value:r.id}, text(r)))];
const className = id => (S.classes.find(c => c.id === id) || {}).name || "—";
const person = id => (S.profiles.find(p => p.id === id) || {}).full_name || "—";

async function load(){
  const [c,s,p,st,ta,ps,gr,sg,un] = await Promise.all([
    db.from("classes").select("*").order("name"),
    db.from("subjects").select("*").order("name"),
    db.from("profiles").select("*").order("full_name"),
    db.from("students").select("*"),
    db.from("teacher_assignments").select("*"),
    db.from("parent_students").select("*"),
    db.from("class_groups").select("*").order("name"),
    db.from("student_groups").select("*"),
    db.from("grade_unlocks").select("*").order("created_at", {ascending:false})]);
  const bad = [c,s,p,st,ta,ps,gr,sg,un].find(r => r.error);
  if (bad) return say("Не удалось загрузить данные: " + bad.error.message, false);
  S = {classes:c.data, subjects:s.data, profiles:p.data, students:st.data, ta:ta.data, ps:ps.data, groups:gr.data, sg:sg.data, un:un.data};
  render();
}
async function run(q, okText){
  const { error } = await q;
  if (error) return say(error.code === "23503" ? "Нельзя удалить: на эту запись есть ссылки (ученики, уроки или оценки)." :
                        error.code === "23505" ? "Такая запись уже есть." : "Ошибка: " + error.message, false);
  say(okText); await load(); return true;
}
function table(head, rows, empty){
  return h("div", {class:"tw"}, h("table", {},
    h("thead", {}, h("tr", {}, head.map(t => h("th", {}, t)))),
    h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", {class:"empty", colspan:head.length}, empty)))));
}
const delBtn = (fn) => h("button", {class:"btn del", type:"button", onclick:() => { if (confirm("Удалить запись?")) fn(); }}, "Удалить");

const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICONS = {
  classes:SVG('<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>'),
  subjects:SVG('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M9 8h6"/>'),
  users:SVG('<circle cx="9" cy="8" r="4"/><path d="M2 21c.7-4 3.2-6 7-6s6.3 2 7 6"/><path d="M16 4.5a4 4 0 010 7M18 15c2.2.6 3.5 2.4 4 5"/>'),
  groups:SVG('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M1.5 20c.5-3 2.4-5 5.5-5s5 2 5.5 5M11.5 20c.5-3 2.4-5 5.5-5s5 2 5.5 5"/>'),
  assign:SVG('<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/>'),
  unlocks:SVG('<rect x="4.5" y="10.5" width="15" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 017.5-2"/>')};
function stats(){
  const n = r => S.profiles.filter(p => p.role === r).length;
  const items = [["Классов", S.classes.length, ICONS.classes], ["Предметов", S.subjects.length, ICONS.subjects],
    ["Учителей", n("teacher"), ICONS.users], ["Учеников", n("student"), ICONS.groups], ["Родителей", n("parent"), ICONS.assign]];
  document.getElementById("stats").replaceChildren(...items.map(([t, v, ic]) => {
    const i = h("span", {class:"ico"}); i.innerHTML = ic;
    return h("div", {class:"stat"}, i, h("div", {}, h("b", {}, String(v)), h("small", {}, t)));
  }));
}
function render(){
  stats();
  const tabs = document.getElementById("tabs"); tabs.replaceChildren(...TABS.map(([k,t]) => {
    const b = h("button", {role:"tab", "aria-selected":k === tab, onclick:() => { tab = k; Route.go("/admin/", k); render(); }});
    b.innerHTML = ICONS[k]; b.append(t); return b; }));
  const v = document.getElementById("view"); v.replaceChildren(({classes:vClasses, subjects:vSubjects, users:vUsers, groups:vGroups, assign:vAssign, unlocks:vUnlocks})[tab]());
}

function vClasses(){
  const n = h("input", {required:true, maxlength:20, placeholder:"7B"}), y = h("input", {required:true, value:"2026-2027"});
  const f = h("form", {class:"row", onsubmit:e => { e.preventDefault();
    run(db.from("classes").insert({name:n.value.trim(), school_year:y.value.trim()}), "Класс добавлен"); }},
    label("Класс", n), label("Учебный год", y), h("button", {class:"btn"}, "Добавить класс"));
  const staff = S.profiles.filter(p => ["teacher","admin"].includes(p.role)).sort((x, y) => (x.full_name || "").localeCompare(y.full_name || "", "ru"));
  const rows = S.classes.map(c => h("tr", {}, h("td", {}, c.name), h("td", {}, c.school_year),
    h("td", {}, String(S.students.filter(s => s.class_id === c.id).length)),
    h("td", {}, (() => { const sel = h("select", {style:"width:auto;min-width:210px", "aria-label":"Классный руководитель: " + c.name,
        onchange:() => run(db.from("classes").update({homeroom_teacher_id:sel.value || null}).eq("id", c.id), sel.value ? "Классный руководитель назначен" : "Классный руководитель снят")},
        h("option", {value:""}, "— не назначен —"), staff.map(p => h("option", {value:p.id, selected:p.id === c.homeroom_teacher_id}, p.full_name))); return sel; })()),
    h("td", {}, delBtn(() => run(db.from("classes").delete().eq("id", c.id), "Класс удалён")))));
  return h("div", {}, h("h1", {}, "Классы"), h("p", {class:"sub"}, "Создайте классы нового учебного года и назначьте классных руководителей. Классный руководитель видит страницу «Мой класс»."), f,
    table(["Класс","Год","Учеников","Классный руководитель",""], rows, "Классов пока нет."));
}
function vSubjects(){
  const n = h("input", {required:true, maxlength:60, placeholder:"Математика"});
  const f = h("form", {class:"row", onsubmit:e => { e.preventDefault();
    run(db.from("subjects").insert({name:n.value.trim()}), "Предмет добавлен"); }},
    label("Название предмета", n), h("button", {class:"btn"}, "Добавить предмет"));
  const rows = S.subjects.map(s => h("tr", {}, h("td", {}, s.name),
    h("td", {}, delBtn(() => run(db.from("subjects").delete().eq("id", s.id), "Предмет удалён")))));
  return h("div", {}, h("h1", {}, "Предметы"), h("p", {class:"sub"}, "Список предметов школы."), f, table(["Предмет",""], rows, "Предметов пока нет."));
}
const genPw = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

function vUsers(){
  const fio = h("input", {required:true, maxlength:100}), em = h("input", {required:true, maxlength:30, autocapitalize:"none", spellcheck:"false", placeholder:"KURDOGLO.ELENA", class:"up"}),
        pw = h("input", {class:"pw", required:true, minlength:8, value:genPw()}),
        role = h("select", {}, ["student","teacher","parent","admin"].map(r => h("option", {value:r}, ROLES[r]))),
        cls = h("select", {}, opts(S.classes, c => c.name + " (" + c.school_year + ")", "Выберите класс")),
        kids = h("select", {multiple:true}, S.students.map(s => h("option", {value:s.profile_id}, person(s.profile_id) + " — " + className(s.class_id)))),
        clsL = label("Класс", cls), kidsL = label("Дети (можно выбрать несколько)", kids), btn = h("button", {class:"btn"}, "Создать аккаунт");
  const TR = {а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"};
  let touched = false;
  em.addEventListener("input", () => { touched = true; const p = em.selectionStart; em.value = em.value.toUpperCase(); em.setSelectionRange(p, p); });
  fio.addEventListener("input", () => { if (touched) return;
    em.value = fio.value.trim().toLowerCase().split(/\s+/).slice(0, 2).map(w => [...w].map(ch => TR[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "")).join("")).filter(Boolean).join(".").slice(0, 30).toUpperCase(); });
  const sync = () => { clsL.hidden = role.value !== "student"; kidsL.hidden = role.value !== "parent"; }; role.onchange = sync; sync();
  const f = h("form", {class:"row", onsubmit:async e => { e.preventDefault(); btn.disabled = true;
    const body = {full_name:fio.value.trim(), username:em.value.trim().toUpperCase(), password:pw.value, role:role.value,
      class_id:cls.value || null, child_ids:[...kids.selectedOptions].map(o => o.value)};
    const { data, error } = await db.functions.invoke("admin-create-user", {body});
    btn.disabled = false;
    if (error){ let m = error.message; try { m = (await error.context.json()).error || m; } catch {} return say(m, false); }
    say("Аккаунт создан. Логин: " + data.username + " · Пароль: " + body.password + " — передайте их пользователю."); await load(); },},
    label("ФИО", fio), label("Логин (ЗАГЛАВНЫМИ латиницей)", em), label("Пароль (можно изменить)", pw), label("Роль", role), clsL, kidsL, btn);
  const subjName = id => (S.subjects.find(x => x.id === id) || {}).name || "—";
  const teaching = id => S.ta.filter(a => a.teacher_id === id).map(a => className(a.class_id) + " — " + subjName(a.subject_id)).join("; ");
  const children = id => S.ps.filter(x => x.parent_id === id).map(x => person(x.student_id)).join(", ");
  const VIEWS = {
    teacher:["Учителя", ["ФИО","Логин","Классы и предметы","Завуч"], p => [p.full_name, p.username, teaching(p.id),
      h("input", {type:"checkbox", style:"width:auto", checked:!!p.can_schedule, "aria-label":"Завуч: " + p.full_name,
        onchange:e => run(db.from("profiles").update({can_schedule:e.target.checked}).eq("id", p.id), e.target.checked ? "Права завуча выданы" : "Права завуча сняты")})], "Учителей пока нет."],
    student:["Ученики", ["ФИО","Логин","Класс","Группа"], p => [p.full_name, p.username, className((S.students.find(x => x.profile_id === p.id) || {}).class_id), groupOf(p.id)], "Учеников пока нет."],
    parent:["Родители", ["ФИО","Логин","Дети"], p => [p.full_name, p.username, children(p.id)], "Родителей пока нет."],
    admin:["Администраторы", ["ФИО","Логин","Ведёт уроки"], p => [p.full_name, p.username, teaching(p.id)], "Администраторов нет."]};
  const box = h("div"), pills = h("div", {class:"pills"});
  const draw = () => {
    pills.replaceChildren(...Object.entries(VIEWS).map(([k,v]) => h("button", {type:"button", "aria-pressed":userRole === k,
      onclick:() => { userRole = k; draw(); }}, v[0] + " (" + S.profiles.filter(p => p.role === k).length + ")")));
    const v = VIEWS[userRole];
    box.replaceChildren(table(v[1], S.profiles.filter(p => p.role === userRole).map(p => h("tr", {}, v[2](p).map(c => h("td", {}, c || "—")))), v[3]));
  };
  draw();
  return h("div", {}, h("h1", {}, "Пользователи"),
    h("p", {class:"sub"}, "Укажите ФИО, логин и роль. Почта не нужна. Пароль виден только один раз, в сообщении после создания. Чтобы учитель мог составлять расписание, отметьте его галочкой «Завуч» в таблице учителей."), f,
    pills, box);
}
const groupOf = sid => S.sg.filter(x => x.student_id === sid).map(x => S.groups.find(g => g.id === x.group_id)?.name).filter(Boolean).join(", ");
const GROUP_HINTS = ["Гагаузская","Болгарская","Русская","Румынская (алолингви)"];
const DIV_HINTS = ["Язык обучения","Румынский язык"];
const divNames = () => [...new Set([...S.groups.map(g => g.division), ...DIV_HINTS])];
const groupNames = () => [...new Set([...S.groups.map(g => g.name), ...GROUP_HINTS])];

function vGroups(){
  if (!S.classes.length) return h("p", {class:"note"}, "Сначала создайте классы.");
  gClass ??= S.classes[0].id;
  const chips = h("div", {class:"pills"}, S.classes.map(c => h("button", {type:"button", "aria-pressed":c.id === gClass, onclick:() => { gClass = c.id; render(); }}, c.name)));
  const groups = S.groups.filter(g => g.class_id === gClass), divs = [...new Set(groups.map(g => g.division))];
  const dv = h("input", {required:true, maxlength:40, value:divs[0] || "Язык обучения", list:"dnames"}), n = h("input", {required:true, maxlength:40, placeholder:"Например: Гагаузская", list:"gnames"});
  const form = h("form", {class:"row", onsubmit:e => { e.preventDefault(); run(db.from("class_groups").insert({class_id:gClass, name:n.value.trim(), division:dv.value.trim()}), "Группа создана"); }},
    label("Деление", dv), label("Новая группа", n), h("datalist", {id:"dnames"}, divNames().map(x => h("option", {value:x}))),
    h("datalist", {id:"gnames"}, groupNames().map(x => h("option", {value:x}))), h("button", {class:"btn"}, "Создать группу"));
  const lists = divs.map(d => h("div", {style:"margin-bottom:16px"}, h("h3", {style:"margin:0 0 6px;font-size:1rem"}, "Деление: " + d),
    h("div", {class:"list"}, groups.filter(g => g.division === d).map(g => h("div", {class:"r"},
      h("span", {class:"t"}, g.name + " · учеников: " + S.sg.filter(x => x.group_id === g.id).length),
      delBtn(() => run(db.from("class_groups").delete().eq("id", g.id), "Группа удалена")))))));
  const rows = S.students.filter(s => s.class_id === gClass).map(s => h("tr", {}, h("td", {}, person(s.profile_id)), divs.map(d => {
    const cur = S.sg.find(x => x.student_id === s.profile_id && x.division === d)?.group_id ?? "";
    const sel = h("select", {style:"width:auto;min-width:180px", "aria-label":d + ": " + person(s.profile_id), onchange:() => setGroup(s.profile_id, sel.value, d)},
      h("option", {value:""}, "— без группы —"), groups.filter(g => g.division === d).map(g => h("option", {value:g.id, selected:g.id === cur}, g.name)));
    return h("td", {}, sel); })));
  return h("div", {}, h("h1", {}, "Группы"),
    h("p", {class:"sub"}, "Деление — независимое разбиение класса. Например, «Язык обучения»: гагаузская и болгарская группы; «Румынский язык»: подгруппа 1 и подгруппа 2. Ученик состоит максимум в одной группе каждого деления. Одновременно в расписании можно ставить только разные группы одного деления."),
    chips, form, lists.length ? lists : h("p", {class:"note", style:"margin-bottom:16px"}, "В этом классе групп пока нет."),
    divs.length ? table(["Ученик", ...divs], rows, "В этом классе нет учеников.") : "");
}
async function setGroup(sid, gid, div){
  await run(gid ? db.from("student_groups").upsert({student_id:sid, group_id:Number(gid), division:div}, {onConflict:"student_id,division"})
                : db.from("student_groups").delete().eq("student_id", sid).eq("division", div), "Группа сохранена");
}

function vAssign(){
  const t = h("select", {required:true}, opts(S.profiles.filter(p => ["teacher","admin"].includes(p.role)), p => p.full_name, "Учитель")),
        s = h("select", {required:true}, opts(S.subjects, s => s.name, "Предмет")),
        gn = h("input", {maxlength:40, list:"gnames2", placeholder:"Пусто — весь класс"}), dv2 = h("input", {maxlength:40, list:"dnames2", value:"Язык обучения"});
  const flat = {style:"flex-direction:row;gap:6px;align-items:center;flex:0 0 auto"};
  const boxes = S.classes.map(c => [c, h("input", {type:"checkbox", value:c.id, style:"width:auto"})]);
  const all = h("input", {type:"checkbox", style:"width:auto"});
  all.onchange = () => boxes.forEach(([, i]) => i.checked = all.checked);
  const grp = h("fieldset", {style:"border:1px solid var(--line);border-radius:8px;padding:10px 12px;flex:1 1 100%;margin:0"},
    h("legend", {style:"font-weight:500;font-size:.92rem;padding:0 6px"}, "Классы: отметьте один или несколько"),
    h("div", {style:"display:flex;flex-wrap:wrap;gap:8px 18px"},
      h("label", {style:"flex-direction:row;gap:6px;align-items:center;flex:0 0 auto;font-weight:600"}, all, "Все классы"),
      boxes.map(([c, i]) => h("label", flat, i, c.name))));
  const f = h("form", {class:"row", onsubmit:async e => { e.preventDefault();
    const ids = boxes.filter(([, i]) => i.checked).map(([c]) => c.id);
    if (!ids.length) return say("Отметьте хотя бы один класс", false);
    const name = gn.value.trim(), gmap = {};
    if (name){   // если такой группы в классе нет, она создаётся (деление берётся из поля ниже)
      const ins = await db.from("class_groups").upsert(ids.map(cid => ({class_id:cid, name, division:dv2.value.trim() || "Основное"})), {onConflict:"class_id,name", ignoreDuplicates:true});
      if (ins.error) return say("Ошибка: " + ins.error.message, false);
      const gr = await db.from("class_groups").select("id, class_id").eq("name", name).in("class_id", ids);
      if (gr.error) return say("Ошибка: " + gr.error.message, false);
      gr.data.forEach(g => gmap[g.class_id] = g.id);
    }
    run(db.from("teacher_assignments").upsert(ids.map(cid => ({teacher_id:t.value, class_id:cid, subject_id:Number(s.value), group_id:gmap[cid] ?? null})),
      {onConflict:"teacher_id,class_id,subject_id"}), "Назначено классов: " + ids.length); }},
    label("Учитель (администратор тоже может вести уроки)", t), label("Предмет", s),
    label("Группа (если предмет ведётся не для всего класса)", gn), label("Деление (только если группа новая)", dv2),
    h("datalist", {id:"gnames2"}, groupNames().map(x => h("option", {value:x}))), h("datalist", {id:"dnames2"}, divNames().map(x => h("option", {value:x}))),
    grp, h("button", {class:"btn"}, "Назначить"));
  const sorted = S.ta.slice().sort((a, b) => person(a.teacher_id).localeCompare(person(b.teacher_id), "ru") || className(a.class_id).localeCompare(className(b.class_id), "ru", {numeric:true}));
  const rows = sorted.map(a => h("tr", {}, h("td", {}, person(a.teacher_id)), h("td", {}, className(a.class_id)),
    h("td", {}, (S.subjects.find(x => x.id === a.subject_id) || {}).name || "—"), h("td", {}, S.groups.find(g => g.id === a.group_id)?.name || ""),
    h("td", {}, delBtn(() => run(db.from("teacher_assignments").delete().eq("id", a.id), "Назначение удалено")))));
  return h("div", {}, h("h1", {}, "Назначения"),
    h("p", {class:"sub"}, "Учитель сможет ставить оценки только в назначенных ему классах и по его предметам. Если указать группу, учитель увидит в журнале только учеников этой группы. Повторное назначение той же пары обновляет группу."), f,
    table(["Учитель","Класс","Предмет","Группа",""], rows, "Назначений пока нет."));
}

function vUnlocks(){
  const day = () => new Date().toLocaleDateString("sv", {timeZone:"Europe/Chisinau"});
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const now = new Date(day() + "T00:00"), first = new Date(now.getFullYear(), now.getMonth() - 1, 1), last = new Date(now.getFullYear(), now.getMonth(), 0), until = new Date(now.getTime() + 7 * 864e5);
  const fd = d => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
  const asg = S.ta.slice().sort((a, b) => person(a.teacher_id).localeCompare(person(b.teacher_id), "ru") || className(a.class_id).localeCompare(className(b.class_id), "ru", {numeric:true}));
  const subj = id => (S.subjects.find(x => x.id === id) || {}).name || "—", grp = id => S.groups.find(g => g.id === id)?.name;
  const a = h("select", {required:true}, h("option", {value:""}, "Учитель — класс — предмет"),
        asg.map(x => h("option", {value:x.id}, person(x.teacher_id) + " — " + className(x.class_id) + " — " + subj(x.subject_id) + (grp(x.group_id) ? " (" + grp(x.group_id) + ")" : "")))),
        f1 = h("input", {type:"date", required:true, value:iso(first)}), f2 = h("input", {type:"date", required:true, value:iso(last)}),
        u = h("input", {type:"date", required:true, value:iso(until)}), nt = h("input", {maxlength:200, placeholder:"Например: исправление после контрольной"});
  const f = h("form", {class:"row", onsubmit:e => { e.preventDefault();
    const x = S.ta.find(t => t.id === Number(a.value));
    if (!x) return say("Выберите учителя, класс и предмет", false);
    if (f1.value > f2.value) return say("Дата «с» не может быть позже даты «по»", false);
    if (u.value < day()) return say("Срок открытия уже прошёл", false);
    run(db.from("grade_unlocks").insert({teacher_id:x.teacher_id, class_id:x.class_id, subject_id:x.subject_id, group_id:x.group_id, from_date:f1.value, to_date:f2.value, open_until:u.value, note:nt.value.trim()}),
        "Колонки открыты до " + fd(u.value)); }},
    label("Журнал", a), label("Колонки с даты", f1), label("по дату", f2), label("Открыть до (включительно)", u), label("Примечание", nt),
    h("button", {class:"btn"}, "Открыть колонки"));
  const rows = S.un.map(x => { const live = x.open_until >= day(); return h("tr", {}, h("td", {}, person(x.teacher_id)), h("td", {}, className(x.class_id)), h("td", {}, subj(x.subject_id) + (grp(x.group_id) ? " (" + grp(x.group_id) + ")" : "")),
    h("td", {}, fd(x.from_date) + " — " + fd(x.to_date)), h("td", {}, fd(x.open_until)), h("td", {style:"color:var(" + (live ? "--ok" : "--muted") + ")"}, live ? "Действует" : "Истекло"),
    h("td", {}, x.note), h("td", {}, delBtn(() => run(db.from("grade_unlocks").delete().eq("id", x.id), live ? "Колонки закрыты снова" : "Запись удалена")))); });
  return h("div", {}, h("h1", {}, "Открытие колонок"),
    h("p", {class:"sub"}, "Оценки за прошедший месяц закрываются автоматически в 00:00 первого числа, для всех, включая администраторов. Здесь директор может открыть колонки с нужными датами для конкретного журнала до выбранного числа: в эти дни учитель сможет ставить и менять оценки. После срока колонки закроются сами. Кнопка «Удалить» закрывает колонки раньше срока."), f,
    table(["Учитель","Класс","Предмет","Даты уроков","Открыто до","Статус","Примечание",""], rows, "Открытых колонок пока нет."));
}

document.getElementById("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });

(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  const { data: me } = await db.from("profiles").select("full_name, role").eq("id", session.user.id).single();
  if (!me || me.role !== "admin") return location.replace("/cabinet/");
  document.getElementById("who").textContent = me.full_name;
  const nm = (me.full_name || "").trim().split(/\s+/); // «Фамилия Имя» → обращаемся по имени
  document.getElementById("hello").textContent = "Здравствуйте" + (nm[0] ? ", " + (nm[1] || nm[0]) : "") + "!";
  load();
})();

addEventListener("popstate", () => { tab = Route.tab("/admin/", TABS.map(t => t[0]), "classes"); render(); });
