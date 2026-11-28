// Недельное расписание: на компьютере — сетка «урок × день» из цветных карточек, на телефоне — список по дням.
// Нужна глобальная h() со страницы. Цвет карточки зависит от названия предмета, поэтому один предмет всегда одного цвета.
const Timetable = (() => {
  const PALETTE = ["#4c7dff", "#12b5a2", "#ff8a3d", "#8b5cf6", "#e5484d", "#2a9d8f", "#d6a000", "#e85d9f", "#3b82c4", "#6a994e"];
  const colorOf = s => PALETTE[[...String(s || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  const dm = d => d.slice(8, 10) + "." + d.slice(5, 7);

  // запись: {key, title, sub, room, text, badges:[…], dot, dataK, onclick}
  function tile(e){
    const t = h(e.onclick ? "button" : "div", {class:"tt-tile" + (e.dot ? " unread" : ""), style:"--tc:" + colorOf(e.key || e.title), "data-k":e.dataK || null,
      type:e.onclick ? "button" : null, onclick:e.onclick || null},
      h("b", {}, e.title), e.sub ? h("small", {}, e.sub) : "", e.text ? h("span", {class:"tt-text"}, e.text) : "",
      e.room || (e.badges && e.badges.length) ? h("span", {class:"tt-meta"}, e.room ? h("span", {class:"tt-chip"}, "каб. " + e.room) : "", (e.badges || []).map(b => h("span", {class:"tt-chip"}, b))) : "");
    return t;
  }

  // opts: days, maxNo, dayName(d), cell(d, n, k) → массив записей, dates (даты столбцов, необязательно), off(k) → текст нерабочего дня или null,
  //       onCell(d, n) — если задано, ячейки кликабельны (редактор расписания)
  function week({days, maxNo, dayName, cell, dates, off, onCell}){
    const todayIso = new Date().toLocaleDateString("sv"), wd = new Date().getDay();
    const isToday = (d, k) => dates ? dates[k] === todayIso : d === wd;
    const data = days.map((d, k) => { const o = off ? off(k) : null; return o ? {off:o} : {es:Array.from({length:maxNo}, (_, i) => cell(d, i + 1, k))}; });
    let last = 0; data.forEach(c => c.es && c.es.forEach((es, i) => { if (es.length) last = Math.max(last, i + 1); }));
    const rows = onCell ? maxNo : Math.max(last, 1), nums = Array.from({length:rows}, (_, i) => i + 1);
    const label = (d, n) => dayName(d) + ", урок " + n;

    const head = days.map((d, k) => h("th", {class:"tt-th" + (isToday(d, k) ? " today" : ""), scope:"col"}, h("span", {class:"tt-day"}, dayName(d)),
      dates ? h("small", {}, dm(dates[k])) : "", isToday(d, k) ? h("em", {class:"tt-now"}, "сегодня") : ""));
    const body = nums.map(n => h("tr", {}, h("th", {class:"tt-no", scope:"row"}, h("span", {}, String(n))),
      days.map((d, k) => { const c = data[k], td = isToday(d, k) ? " today" : "";
        if (c.off) return n === 1 ? h("td", {class:"tt-off", rowspan:rows}, h("span", {}, c.off)) : "";
        const es = c.es[n - 1];
        if (!onCell) return h("td", {class:"tt-cell" + td + (es.length ? "" : " blank")}, es.map(tile));
        return h("td", {class:"tt-cell" + td}, h("button", {type:"button", class:"tt-btn" + (es.length ? "" : " empty"), "aria-label":label(d, n) + (es.length ? ": изменить" : ": добавить"), onclick:() => onCell(d, n)},
          es.length ? es.map(tile) : h("span", {class:"tt-plus", "aria-hidden":"true"}, "+"))); })));
    const table = h("table", {class:"tt-table"}, h("thead", {}, h("tr", {}, h("th", {class:"tt-corner"}, ""), head)), h("tbody", {}, body));

    const agenda = h("div", {class:"tt-agenda"}, days.map((d, k) => { const c = data[k], t = isToday(d, k);
      let items;
      if (c.off) items = [h("p", {class:"tt-free off"}, c.off)];
      else {
        items = nums.filter(n => onCell || c.es[n - 1].length).map(n => { const es = c.es[n - 1];
          return h("div", {class:"tt-item"}, h("span", {class:"tt-no"}, h("span", {}, String(n))),
            onCell ? h("button", {type:"button", class:"tt-btn" + (es.length ? "" : " empty"), "aria-label":label(d, n) + (es.length ? ": изменить" : ": добавить"), onclick:() => onCell(d, n)},
              es.length ? es.map(tile) : h("span", {class:"tt-plus", "aria-hidden":"true"}, "+")) : h("div", {class:"tt-tiles"}, es.map(tile))); });
        if (!items.length) items = [h("p", {class:"tt-free"}, "Уроков нет")];
      }
      return h("section", {class:"tt-card" + (t ? " today" : "")}, h("header", {}, h("b", {}, dayName(d)), dates ? h("small", {}, dm(dates[k])) : "", t ? h("em", {class:"tt-now"}, "сегодня") : ""), items);
    }));
    return h("div", {class:"tt"}, h("div", {class:"tt-scroll"}, table), agenda);
  }
  // Таблица-список на телефоне превращается в карточки: подписи столбцов берутся из шапки
  function stack(root){
    if (!root || !root.querySelectorAll) return root;
    root.querySelectorAll(".tw").forEach(w => {
      const heads = [...w.querySelectorAll("thead th")].map(t => t.textContent.trim());
      if (!heads.length) return;
      w.classList.add("stack");
      w.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((td, i) => { if (heads[i] && !td.hasAttribute("colspan")) td.setAttribute("data-label", heads[i]); }));
    });
    return root;
  }
  return {week, tile, colorOf, stack};
})();
