const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Names the saved test after the account. Reads the stored session directly, because
// getSession can hold the test page back for seconds. This is only a label, not a security check.
function savedAccountId() {
  try {
    const project = new URL(SUPABASE_URL).hostname.split(".")[0];
    return JSON.parse(localStorage.getItem(`sb-${project}-auth-token`)).user.id;
  } catch (e) {
    return null;
  }
}

// Tests and results are saved in this browser, so they go when the account logs out
function clearSavedTests() {
  try {
    Object.keys(localStorage).filter((key) => key.startsWith("pacemock-")).forEach((key) => localStorage.removeItem(key));
  } catch (e) {}
}

// Swaps the top bar's Log in link for a profile circle once someone is signed in
async function setupAccount() {
  if (!db) return false;
  const { data } = await db.auth.getSession();
  if (!data.session) return false;

  const email = data.session.user.email;
  const avatar = document.getElementById("avatar");
  const menu = document.getElementById("profile-menu");
  const toggleMenu = (open) => {
    menu.hidden = !open;
    avatar.setAttribute("aria-expanded", open);
  };

  document.getElementById("account").hidden = true;
  document.getElementById("profile").hidden = false;
  document.getElementById("profile-email").textContent = email;
  avatar.textContent = email[0].toUpperCase();
  avatar.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menu.hidden);
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => toggleMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleMenu(false); });
  document.getElementById("logout").addEventListener("click", async () => {
    await db.auth.signOut();
    clearSavedTests();
    location.reload();
  });
  return true;
}
