const $ = (id) => document.getElementById(id);

const MODES = {
  login: { title: "Log in", submit: "Log in", other: "Register", to: "register" },
  register: { title: "Create your account", submit: "Register", other: "Log in", to: "login" },
  forgot: { title: "Reset your password", submit: "Send reset link", other: "Back to log in", to: "login" },
  reset: { title: "Choose a new password", submit: "Save password" },
};

const pageUrl = (name) => new URL(name, location.href).href;
let mode = "login";
let pendingEmail = "";

function say(text) {
  $("message").textContent = text;
  $("message").hidden = !text;
}

function setMode(next) {
  mode = next;
  const m = MODES[mode];
  $("title").textContent = m.title;
  $("submit").textContent = m.submit;
  $("switch").textContent = m.other || "";
  $("switch").hidden = !m.other;
  $("forgot").hidden = mode !== "login";
  $("resend").hidden = true;
  $("email-field").hidden = mode === "reset";
  $("email").required = mode !== "reset";
  $("password-field").hidden = mode === "forgot";
  $("password").required = mode !== "forgot";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  say("");
}

function askToVerify(email, text) {
  pendingEmail = email;
  say(text);
  $("resend").hidden = false;
}

const actions = {
  async login(email, password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (!error) return location.assign("index.html");
    if (/confirm/i.test(error.message)) return askToVerify(email, "Please verify your email first. Check your inbox.");
    say(/invalid login/i.test(error.message) ? "Wrong email or password." : "We couldn't log you in. Please try again in a minute.");
  },
  async register(email, password) {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: pageUrl("index.html") },
    });
    if (error) return say(error.message);
    // Supabase returns no identities when the email already has an account
    if (data.user && data.user.identities.length === 0) return say("This email already has an account. Log in instead.");
    askToVerify(email, `We sent a verification link to ${email}. Open it to finish registering.`);
  },
  async forgot(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: pageUrl("login.html") });
    say(error ? error.message : `If ${email} has an account, a reset link is on its way.`);
  },
  async reset(email, password) {
    const { error } = await db.auth.updateUser({ password });
    if (error) return say(error.message);
    location.assign("index.html");
  },
};

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return say("Accounts aren't available right now. Please try again later.");
  $("submit").disabled = true;
  await actions[mode]($("email").value.trim(), $("password").value);
  $("submit").disabled = false;
});

$("switch").addEventListener("click", () => setMode(MODES[mode].to));
$("forgot").addEventListener("click", () => setMode("forgot"));
$("resend").addEventListener("click", async () => {
  const { error } = await db.auth.resend({
    type: "signup",
    email: pendingEmail,
    options: { emailRedirectTo: pageUrl("index.html") },
  });
  say(error ? error.message : `Sent again to ${pendingEmail}.`);
});

if (db) db.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setMode("reset"); });
setMode(new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login");
