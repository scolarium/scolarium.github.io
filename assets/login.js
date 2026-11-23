
const SUPABASE_URL = "https://hqjctkusvriltgxosrlf.supabase.co";
const SUPABASE_KEY = "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO"; // публичный ключ, его можно показывать
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// логин всегда вводится ЗАГЛАВНЫМИ буквами
const loginInput = document.getElementById("login");
loginInput.addEventListener("input", () => {
  const p = loginInput.selectionStart;
  loginInput.value = loginInput.value.toUpperCase();
  loginInput.setSelectionRange(p, p);
});

const f = document.getElementById("f"), err = document.getElementById("err"), btn = document.getElementById("btn");
function showError(t){ err.textContent = t; err.hidden = false; }

// уже вошли — сразу в кабинет
db.auth.getSession().then(({data}) => { if (data.session) location.replace("/cabinet/"); });

f.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.hidden = true;
  const login = document.getElementById("login").value.trim().toUpperCase();
  // логин превращается во внутренний адрес для Supabase (пользователь его не видит)
  const email = login.toLowerCase() + "@scolarium.invalid";
  const password = document.getElementById("password").value;
  if (!login || !password) return showError("Введите логин и пароль.");
  btn.disabled = true; btn.textContent = "Входим…";
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    btn.disabled = false; btn.textContent = "Войти";
    return showError(error.status === 400
      ? "Неверный логин или пароль."
      : "Не удалось войти. Проверьте интернет и попробуйте ещё раз.");
  }
  location.replace("/cabinet/");
});
