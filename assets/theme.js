// Тема оформления: "auto" (как в системе), "light" или "dark". Хранится в браузере.
(function(){
  const KEY = "scolarium-theme";
  const get = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const apply = v => {
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
    else document.documentElement.removeAttribute("data-theme");
  };
  window.Theme = {
    get,
    set(v){ try { v === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch (e) {} apply(v); }
  };
  apply(get());   // сразу, до отрисовки страницы, чтобы не мигало

  // Имя пользователя в шапке становится ссылкой на «Мой профиль».
  addEventListener("DOMContentLoaded", () => {
    const who = document.getElementById("who");
    if (!who || who.closest("a") || location.pathname.startsWith("/profile")) return;
    const a = document.createElement("a");
    a.href = "/profile/"; a.title = "Мой профиль"; a.className = "who-link";
    who.replaceWith(a); a.append(who);
    const st = document.createElement("style");
    st.textContent = ".who-link{text-decoration:none;color:inherit}.who-link:hover .who,.who-link:focus-visible .who{text-decoration:underline}";
    document.head.append(st);
  });
})();
