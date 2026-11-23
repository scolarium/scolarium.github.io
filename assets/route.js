// Мини-роутер для статического хостинга: адрес = папка с index.html.
(function(){
  const clean = p => p.replace(/index\.html$/, "");
  window.Route = {
    // какая вкладка открыта по адресу, например /admin/users/ -> "users"
    tab(base, keys, def){
      const p = clean(location.pathname);
      if (!p.startsWith(base)) return def;
      const k = p.slice(base.length).split("/")[0];
      return keys.includes(k) ? k : def;
    },
    // перейти на адрес вкладки без перезагрузки страницы
    go(base, key){
      const u = base + key + "/" + location.search;
      if (clean(location.pathname) + location.search !== u) history.pushState(null, "", u);
    },
    param(n){ return new URLSearchParams(location.search).get(n); },
    // поменять параметры адреса (?a=..&sem=..&lesson=..), не добавляя шаг в историю
    q(obj){
      const sp = new URLSearchParams(location.search);
      for (const [k, v] of Object.entries(obj)) v == null ? sp.delete(k) : sp.set(k, v);
      const s = sp.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
    },
    push(path){
      const sp = new URLSearchParams(location.search); sp.delete("lesson");
      const s = sp.toString();
      history.pushState(null, "", path + (s ? "?" + s : ""));
    }
  };
})();
