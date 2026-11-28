// Приложение Școlarium: регистрация service worker, предложение установить на экран телефона, цвет строки состояния.
(() => {
  const $ = s => document.querySelector(s);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent, IOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const MOBILE = IOS || /android|mobile/i.test(ua);
  let deferred = null;

  if (standalone()) document.documentElement.classList.add("pwa");

  // 1. service worker (нужен https или localhost)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js", {scope:"/", updateViaCache:"none"}).catch(() => {}));

  // 2. строка состояния телефона в цвет страницы (учитывает тёмную тему и выбор в профиле)
  const syncColor = () => {
    let m = $('meta[name="theme-color"]'); if (!m){ m = document.createElement("meta"); m.name = "theme-color"; document.head.append(m); }
    const c = getComputedStyle(document.body || document.documentElement).backgroundColor;
    if (c && c !== "rgba(0, 0, 0, 0)") m.content = c;
  };
  addEventListener("DOMContentLoaded", syncColor);
  new MutationObserver(syncColor).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(syncColor, 50));

  // 3. установка
  const KEY = "pwa-hide-until", hidden = () => +localStorage.getItem(KEY) > Date.now();
  const hideFor = days => { try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch {} };
  async function install(){
    if (!deferred) return false;
    deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === "accepted";
  }
  const STEPS_IOS = "Нажмите «Поделиться» (квадрат со стрелкой внизу экрана), затем «На экран «Домой»».";

  function banner(){
    if (standalone() || hidden() || !MOBILE || $("#pwa-bar") || location.pathname.startsWith("/login")) return;   // на странице входа баннер закрывал бы кнопку «Войти»
    if (!deferred && !IOS) return;
    const st = document.createElement("style");
    st.textContent = "#pwa-bar{position:fixed;z-index:80;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:520px;margin:0 auto;display:flex;gap:12px;align-items:center;padding:12px 14px;background:var(--sheet,#fff);color:var(--ink,#16213d);border:1px solid var(--line,#dbe4f2);border-radius:20px;box-shadow:0 20px 40px -14px rgba(22,33,61,.45);font:400 .92rem/1.4 var(--sans,system-ui,sans-serif)}"
      + "#pwa-bar img{width:44px;height:44px;border-radius:12px;flex:none}#pwa-bar b{display:block;font-size:.98rem}#pwa-bar span{color:var(--muted,#5a6784)}#pwa-bar div{flex:1;min-width:0}"
      + "#pwa-bar button{font:inherit;cursor:pointer;border:0;border-radius:999px}#pwa-go{padding:9px 16px;font-weight:600;color:#fff;background:linear-gradient(135deg,#4c7dff,#233f8f)}#pwa-x{width:32px;height:32px;background:transparent;color:var(--muted,#5a6784);font-size:1.3rem;line-height:1}";
    const bar = document.createElement("aside"); bar.id = "pwa-bar"; bar.setAttribute("aria-label", "Установка приложения");
    bar.innerHTML = '<img src="/icon-192.png" alt="" width="44" height="44"><div><b>Приложение Școlarium</b><span></span></div>';
    bar.querySelector("span").textContent = IOS ? STEPS_IOS : "Установите на телефон: быстрый вход с экрана, без адресной строки.";
    const go = document.createElement("button"); go.id = "pwa-go"; go.type = "button"; go.textContent = IOS ? "Понятно" : "Установить";
    const x = document.createElement("button"); x.id = "pwa-x"; x.type = "button"; x.setAttribute("aria-label", "Закрыть"); x.textContent = "×";
    const close = days => { hideFor(days); bar.remove(); st.remove(); };
    go.onclick = async () => { if (IOS) return close(30); const ok = await install(); close(ok ? 3650 : 14); };
    x.onclick = () => close(14);
    bar.append(go, x); document.head.append(st); document.body.append(bar);
  }

  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; setTimeout(() => { banner(); card(); }, 2500); });
  addEventListener("appinstalled", () => { hideFor(3650); $("#pwa-bar")?.remove(); deferred = null; card(); });
  addEventListener("load", () => { if (IOS) setTimeout(banner, 3000); card(); });

  // 4. карточка «Приложение на телефоне» на странице профиля
  function card(){
    const box = $("#appBox"); if (!box) return;
    box.hidden = false;
    const txt = $("#appText"), btn = $("#appBtn"); btn.hidden = true;
    if (standalone()) txt.textContent = "Вы уже пользуетесь приложением: оно открыто с экрана устройства.";
    else if (deferred){ txt.textContent = "Установите Școlarium на телефон: иконка на экране, вход в один касание, без адресной строки."; btn.hidden = false; btn.onclick = async () => { await install(); card(); }; }
    else if (IOS) txt.textContent = "На iPhone и iPad: " + STEPS_IOS;
    else txt.textContent = "Откройте сайт в Chrome (Android) или Safari (iPhone) и выберите «Установить приложение» или «На экран «Домой»» в меню браузера.";
  }
  window.PWA = {install, standalone};
})();
