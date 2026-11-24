// Тема оформления: "auto" (как в системе), "light" или "dark". Хранится в браузере.
// Плюс: в шапке рядом с кнопкой «Выйти» — круглое фото (или инициалы) и Фамилия Имя, ведёт в «Мой профиль».
// Надёжный выход: даже если сервер не ответил, сессия в этом браузере всё равно стирается.
window.signOutAll = async function(db){
  try { await db.auth.signOut(); } catch (e) {}
  try { await db.auth.signOut({scope:"local"}); } catch (e) {}
  try { Object.keys(localStorage).filter(k => k.startsWith("sb-") || k === "scolarium-me").forEach(k => localStorage.removeItem(k)); } catch (e) {}
};
(function(){
  const KEY = "scolarium-theme", ME = "scolarium-me";
  const get = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const apply = v => {
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
    else document.documentElement.removeAttribute("data-theme");
  };
  const cacheGet = () => { try { return JSON.parse(localStorage.getItem(ME)) || null; } catch (e) { return null; } };
  const cacheSet = v => { try { v ? localStorage.setItem(ME, JSON.stringify(v)) : localStorage.removeItem(ME); } catch (e) {} };

  const shortName = n => (n || "").trim().split(/\s+/).slice(0, 2).join(" ");           // Фамилия Имя
  const initials = n => (n || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";

  window.Theme = {
    get,
    set(v){ try { v === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch (e) {} apply(v); }
  };
  // профиль вызывает это после смены фото, чтобы шапка обновилась сразу
  window.Me = { shortName, initials, cacheGet, cacheSet,
    fill(el, name, avatar){
      el.textContent = "";
      if (avatar){ const i = document.createElement("img"); i.src = avatar; i.alt = ""; el.append(i); }
      else el.textContent = initials(name);
    }
  };
  apply(get());   // сразу, до отрисовки страницы, чтобы не мигало

  addEventListener("DOMContentLoaded", () => {
    const who = document.getElementById("who");
    if (!who || location.pathname.startsWith("/profile")) return;

    const st = document.createElement("style");
    st.textContent = ".me-chip{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);font-weight:500;font-size:.95rem;border-radius:999px;padding:2px 10px 2px 2px}" +
      ".me-chip:hover .me-name{text-decoration:underline}" +
      ".me-ava{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;overflow:hidden;background:var(--accent);color:var(--on-accent);font-weight:600;font-size:.85rem;border:2px solid var(--line)}" +
      ".me-ava img{width:100%;height:100%;object-fit:cover;display:block}";
    document.head.append(st);

    const chip = document.createElement("a");
    chip.className = "me-chip"; chip.href = "/profile/"; chip.title = "Мой профиль";
    const ava = document.createElement("span"); ava.className = "me-ava"; ava.setAttribute("aria-hidden", "true");
    const nm = document.createElement("span"); nm.className = "me-name";
    chip.append(ava, nm);
    who.before(chip); who.style.display = "none";   // старую подпись с полным ФИО скрываем

    const draw = m => { window.Me.fill(ava, m && m.name, m && m.avatar); nm.textContent = m ? shortName(m.name) : ""; chip.style.visibility = m ? "" : "hidden"; };
    draw(cacheGet());

    const out = document.getElementById("out");
    if (out) out.addEventListener("click", () => cacheSet(null));

    (async () => {
      if (typeof db === "undefined") return;
      const { data: { session } } = await db.auth.getSession();
      if (!session){ cacheSet(null); return; }
      const uid = session.user.id;
      const [p, d] = await Promise.all([
        db.from("profiles").select("full_name").eq("id", uid).single(),
        db.from("profile_details").select("avatar").eq("id", uid).maybeSingle()]);
      if (p.error || !p.data) return;
      const m = { id: uid, name: p.data.full_name || "", avatar: (d.data && d.data.avatar) || null };
      cacheSet(m); draw(m);
    })();
  });
})();
