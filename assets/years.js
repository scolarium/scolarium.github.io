// Учебные годы: даты семестров берутся из таблицы school_years (директор меняет их при переходе на новый год).
// SEMESTERS — общий массив: объекты в нём обновляются на месте, поэтому все страницы видят актуальные даты.
const Years = (() => {
  const SEMESTERS = [{n:1, label:"I семестр", start:"2026-09-01", end:"2026-12-24"}, {n:2, label:"II семестр", start:"2027-01-11", end:"2027-05-31"}];   // запасные значения до загрузки
  let list = [], current = null, picked = null;
  const apply = y => { picked = y; SEMESTERS[0].start = y.sem1_start; SEMESTERS[0].end = y.sem1_end; SEMESTERS[1].start = y.sem2_start; SEMESTERS[1].end = y.sem2_end; };
  // want — название года из адреса (?y=2026-2027); без него берётся текущий
  async function load(db, want){
    try {
      const r = await db.from("school_years").select("*").order("sem1_start");
      if (!r.error && r.data.length){ list = r.data; current = list.find(x => x.is_current) || list[list.length - 1]; apply(list.find(x => x.name === want) || current); }
    } catch {}
    return picked;
  }
  // выбор года в архиве: перезагружает страницу с ?y=
  function pick(name){
    const u = new URL(location.href); ["sem", "lesson"].forEach(k => u.searchParams.delete(k));
    if (current && name === current.name) u.searchParams.delete("y"); else u.searchParams.set("y", name);
    location.href = u.toString();
  }
  function select(h){
    if (list.length < 2) return "";
    return h("select", {class:"yearsel", "aria-label":"Учебный год", onchange:e => pick(e.target.value)},
      list.slice().reverse().map(y => h("option", {value:y.name, selected:picked && y.name === picked.name}, y.name + (y.is_current ? " (текущий)" : ""))));
  }
  return {SEMESTERS, load, select, get list(){ return list; }, get current(){ return current; }, get picked(){ return picked; }, get archive(){ return !!(picked && current && picked.name !== current.name); }};
})();
