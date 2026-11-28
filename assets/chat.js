// Чат по уроку: один чат на пару «урок + ученик». Участвуют учитель этого урока, ученик и его родители (один общий чат).
// Нужны глобальные db и h() со страницы. Доступ и права решает база (см. lesson_chat.sql).
const Chat = (() => {
  const ROLE = {teacher:"учитель", student:"ученик", parent:"родитель", admin:"администрация"};
  const dayKey = iso => new Date(iso).toLocaleDateString("sv");
  const hm = iso => new Date(iso).toLocaleTimeString("ru", {hour:"2-digit", minute:"2-digit"});
  const dayLbl = iso => { const t = new Date(), k = dayKey(iso); if (k === t.toLocaleDateString("sv")) return "Сегодня"; t.setDate(t.getDate() - 1);
    return k === t.toLocaleDateString("sv") ? "Вчера" : new Date(iso).toLocaleDateString("ru", {day:"numeric", month:"long"}); };
  const missing = e => /PGRST205|42P01|schema cache|does not exist/i.test((e && (e.code + " " + e.message)) || "");

  // непрочитанные сообщения для текущего пользователя: Map «урок|ученик» → число
  async function unread(){
    try { const r = await db.from("chat_unread_v").select("lesson_id, student_id, unread"); return r.error ? new Map() : new Map(r.data.map(x => [x.lesson_id + "|" + x.student_id, x.unread])); }
    catch { return new Map(); }
  }

  // opts: lessonId, studentId, meId, hint, alive() — пока вернёт true, чат опрашивает базу; onError(e); onRead() — сообщения отмечены прочитанными
  function mount({lessonId, studentId, meId, hint, alive, onError, onRead}){
    let last = 0, lastDay = "", first = true, sending = false, marked = 0, chain = Promise.resolve();
    const list = h("div", {class:"chat-list", role:"log", "aria-live":"polite", "aria-label":"Сообщения"}), empty = h("p", {class:"chat-empty"}, "Загрузка…");
    list.append(empty);
    const ta = h("textarea", {maxlength:2000, rows:1, placeholder:"Напишите сообщение…", "aria-label":"Сообщение"}), btn = h("button", {class:"btn", type:"button"}, "Отправить");
    const box = h("div", {class:"chat"}, hint ? h("p", {class:"chat-hint"}, hint) : "", list, h("div", {class:"chat-form"}, ta, btn),
      h("p", {class:"chat-hint"}, "Enter — отправить, Shift+Enter — новая строка. Переписка сохраняется, её видят только участники чата."));
    const isAlive = () => alive ? alive() : box.isConnected;
    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    const add = rows => {
      const stick = first || nearBottom() || rows.some(r => r.author_id === meId);
      for (const r of rows){
        if (empty.isConnected) empty.remove();
        const dk = dayKey(r.created_at); if (dk !== lastDay){ lastDay = dk; list.append(h("div", {class:"chat-day"}, dayLbl(r.created_at))); }
        const me = r.author_id === meId;
        list.append(h("div", {class:"msg-b" + (me ? " me" : "")}, me ? "" : h("span", {class:"who"}, (r.author_name || "—") + (ROLE[r.author_role] ? " · " + ROLE[r.author_role] : "")), h("span", {translate:"no"}, r.body), h("time", {datetime:r.created_at}, hm(r.created_at))));
        last = Math.max(last, r.id);
      }
      if (stick) list.scrollTop = list.scrollHeight;
    };
    const markRead = async () => {
      if (!last || last === marked) return; marked = last;
      const r = await db.from("lesson_message_reads").upsert({user_id:meId, lesson_id:lessonId, student_id:studentId, last_read_id:last}, {onConflict:"user_id,lesson_id,student_id"});
      if (!r.error && onRead) onRead();
    };
    const doPull = async () => {
      try {
        const r = await db.from("lesson_messages").select("id, author_id, author_name, author_role, body, created_at").eq("lesson_id", lessonId).eq("student_id", studentId).gt("id", last).order("id").limit(200);
        if (r.error) throw r.error;
        if (r.data.length) add(r.data); else if (first) empty.textContent = "Сообщений пока нет. Напишите первым.";
        if (r.data.length || first) markRead();
        first = false;
      } catch (e) {
        if (first){ first = false; empty.textContent = missing(e) ? "Чат ещё не подключён: администратору нужно выполнить SQL-скрипт lesson_chat.sql в Supabase." : "Не удалось загрузить чат: " + (e.message || e); ta.disabled = btn.disabled = true; }
      }
    };
    const pull = () => chain = chain.then(doPull);
    const loop = async () => { if (!isAlive()) return; if (!document.hidden) await pull(); setTimeout(loop, 5000); };
    const fit = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; };
    const send = async () => {
      const body = ta.value.trim(); if (!body || sending || ta.disabled) return; sending = true; btn.disabled = true;
      try {
        const r = await db.from("lesson_messages").insert({lesson_id:lessonId, student_id:studentId, author_id:meId, body}); if (r.error) throw r.error;
        ta.value = ""; fit(); await pull();
      } catch (e) { onError ? onError(e) : alert(e.message || e); }
      finally { sending = false; if (!ta.disabled) btn.disabled = false; ta.focus(); }
    };
    btn.addEventListener("click", send);
    ta.addEventListener("input", fit);
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); send(); } });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && isAlive()) pull(); });
    setTimeout(loop, 0);   // после того как окно вставит чат в страницу
    return box;
  }
  return {mount, unread};
})();
