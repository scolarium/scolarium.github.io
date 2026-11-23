const db = supabase.createClient("https://hqjctkusvriltgxosrlf.supabase.co", "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO");
const ROLES = {admin:"Администратор", teacher:"Учитель", student:"Ученик", parent:"Родитель"};
const THEMES = [["auto","Как в системе"],["light","Светлая"],["dark","Тёмная"]];
const $ = id => document.getElementById(id);
let msgTimer;

function say(text, ok = true){
  const m = $("msg"); m.textContent = text; m.className = ok ? "ok" : "bad"; m.hidden = false;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.hidden = true, 4000);
}

function drawThemes(){
  const cur = Theme.get();
  $("themes").replaceChildren(...THEMES.map(([k, t]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.setAttribute("aria-pressed", String(k === cur));
    b.onclick = () => { Theme.set(k); drawThemes(); };
    return b;
  }));
}

$("out").addEventListener("click", async () => { await db.auth.signOut(); location.replace("/login/"); });

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const bd = $("bd").value, ph = $("ph").value.trim();
  if (bd && bd > new Date().toISOString().slice(0, 10)) return say("Дата рождения не может быть в будущем", false);
  if (!/^[0-9+()\- ]*$/.test(ph)) return say("В телефоне можно использовать только цифры, +, -, пробелы и скобки", false);
  $("save").disabled = true;
  const { error } = await db.from("profile_details").upsert({id:me.id, birth_date:bd || null, phone:ph || null, updated_at:new Date().toISOString()});
  $("save").disabled = false;
  if (error) return say("Не удалось сохранить: " + error.message, false);
  say("Сохранено");
});

let me;
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  const [p, d] = await Promise.all([
    db.from("profiles").select("id, full_name, role, username").eq("id", session.user.id).single(),
    db.from("profile_details").select("birth_date, phone").eq("id", session.user.id).maybeSingle()]);
  if (p.error || !p.data){ $("sub").textContent = "Не удалось загрузить профиль. Обновите страницу."; return; }
  me = p.data;
  $("sub").textContent = ROLES[me.role] || me.role;
  $("fn").value = me.full_name || ""; $("un").value = me.username || "";
  $("bd").max = new Date().toISOString().slice(0, 10);
  if (d.data){ $("bd").value = d.data.birth_date || ""; $("ph").value = d.data.phone || ""; }
  $("form").hidden = false; $("themeBox").hidden = false; drawThemes();
})();
