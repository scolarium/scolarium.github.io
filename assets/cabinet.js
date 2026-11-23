
const SUPABASE_URL = "https://hqjctkusvriltgxosrlf.supabase.co";
const SUPABASE_KEY = "sb_publishable_1jZ3GuZtNljcclg3zzyzoQ_qksUFylO";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ROLES = { admin: "Администратор", teacher: "Учитель", student: "Ученик", parent: "Родитель" };
const INFO = {
  admin: "Здесь появится управление классами, предметами и аккаунтами.",
  teacher: "Здесь появятся ваши классы, уроки и выставление оценок.",
  student: "Здесь появятся ваши оценки, посещаемость и домашние задания.",
  parent: "Здесь появятся оценки и посещаемость ваших детей."
};

document.getElementById("logout").addEventListener("click", async () => {
  await db.auth.signOut();
  location.replace("/login/");
});

(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace("/login/");

  const { data: profile, error } = await db
    .from("profiles").select("full_name, role").eq("id", session.user.id).single();

  const hello = document.getElementById("hello");
  if (error || !profile) {
    hello.textContent = "Не удалось загрузить профиль";
    document.getElementById("info").textContent = "Обновите страницу или обратитесь в администрацию школы.";
    return;
  }
  if (profile.role === "admin") return location.replace("/admin/");
  if (profile.role === "teacher") return location.replace("/teacher/");
  if (profile.role === "student" || profile.role === "parent") return location.replace("/student/");
  hello.textContent = "Здравствуйте" + (profile.full_name ? ", " + profile.full_name : "") + "!";
  const role = document.getElementById("role");
  role.textContent = ROLES[profile.role] || profile.role;
  role.hidden = false;
  document.getElementById("info").textContent = INFO[profile.role] || "";
})();
