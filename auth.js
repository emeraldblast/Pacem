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

// Swaps the top bar's Log in link for a profile circle once someone is signed in.
// The circle opens the statistics page. Gives back the signed-in user, or null.
async function setupAccount() {
  if (!db) return null;
  const { data } = await db.auth.getSession();
  if (!data.session) return null;

  const user = data.session.user;
  const avatar = document.getElementById("avatar");
  document.getElementById("account").hidden = true;
  document.getElementById("profile").hidden = false;
  avatar.textContent = user.email[0].toUpperCase();
  avatar.title = user.email;
  document.getElementById("logout")?.addEventListener("click", async () => {
    await db.auth.signOut();
    clearSavedTests();
    location.href = "index.html";
  });
  return user;
}
