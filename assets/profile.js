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
    b.type = "button"; b.textContent = t; b.dataset.k = k; b.setAttribute("aria-pressed", String(k === cur));
    b.onclick = () => { Theme.set(k); drawThemes(); };
    return b;
  }));
}

$("out").addEventListener("click", async () => { await signOutAll(db); location.replace("/login/"); });

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

// фото: обрезаем до квадрата 256×256 и сохраняем как JPEG прямо в профиле
const fileToAvatar = file => new Promise((ok, no) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 256, 256);
    x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); no(new Error("Не удалось прочитать картинку")); };
  img.src = url;
});
let avatar = null;
function drawAva(){
  Me.fill($("ava"), me.full_name, avatar); $("rmPhoto").hidden = !avatar;
  Me.cacheSet({id:me.id, name:me.full_name || "", avatar});
}
async function saveAva(v){
  const { error } = await db.from("profile_details").upsert({id:me.id, avatar:v, updated_at:new Date().toISOString()});
  if (error) return say("Не удалось сохранить фото: " + error.message, false);
  avatar = v; drawAva(); say(v ? "Фото сохранено" : "Фото удалено");
}
$("file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (!f.type.startsWith("image/")) return say("Выберите файл-картинку", false);
  try { await saveAva(await fileToAvatar(f)); } catch (err) { say(err.message, false); }
});
$("rmPhoto").addEventListener("click", () => saveAva(null));

let me;
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");
  const [p, d] = await Promise.all([
    db.from("profiles").select("id, full_name, role, username").eq("id", session.user.id).single(),
    db.from("profile_details").select("birth_date, phone, avatar").eq("id", session.user.id).maybeSingle()]);
  if (p.error || !p.data){ $("name").textContent = "Не удалось загрузить профиль. Обновите страницу."; return; }
  me = p.data;
  $("name").textContent = me.full_name || "Мой профиль"; $("sub").textContent = ROLES[me.role] || me.role;
  if (me.username){ $("uname").textContent = "Логин: " + me.username; $("uname").hidden = false; }
  $("fn").value = me.full_name || ""; $("un").value = me.username || "";
  $("bd").max = new Date().toISOString().slice(0, 10);
  if (d.data){ $("bd").value = d.data.birth_date || ""; $("ph").value = d.data.phone || ""; avatar = d.data.avatar || null; }
  drawAva(); $("photoBox").hidden = false; $("form").hidden = false; $("themeBox").hidden = false; drawThemes();
})();
