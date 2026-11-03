// The admin panel: every account, with a switch for each paid mock.
// The database checks that the signed-in account is an admin (supabase/admin.sql),
// so this page is only a view: for anyone else the calls are refused.

const $ = (id) => document.getElementById(id);
let mocks = [];
let users = [];

setupThemeButton($("theme"));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const shortDate = (when) => (when ? new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never");

function tiles() {
  const unlocks = users.reduce((all, u) => all + u.unlocked.length, 0);
  const finished = users.reduce((all, u) => all + u.finished, 0);
  const list = [
    ["Accounts", users.length, `${users.filter((u) => u.verified).length} verified`],
    ["Paid mocks", mocks.length, mocks.map((m) => m.id).join(", ") || "none yet"],
    ["Unlocks", unlocks, `${users.filter((u) => u.unlocked.length).length} accounts with a paid mock`],
    ["Mocks finished", finished, "by all accounts"],
  ];
  $("tiles").replaceChildren(...list.map(([label, value, note]) => {
    const tile = element("div", "tile");
    tile.append(element("p", "tile-label", label), element("p", "tile-value", String(value)), element("p", "tile-note", note));
    return tile;
  }));
}

async function setAccess(user, mock, box) {
  box.disabled = true;
  const { error } = await db.rpc("admin_set_access", { target: user.id, mock: mock.id, allow: box.checked });
  box.disabled = false;
  if (error) {
    box.checked = !box.checked;
    $("saved").textContent = `Couldn't save: ${error.message}`;
    return;
  }
  user.unlocked = box.checked ? [...user.unlocked, mock.id] : user.unlocked.filter((id) => id !== mock.id);
  $("saved").textContent = `${mock.title} ${box.checked ? "unlocked for" : "locked for"} ${user.email}.`;
  tiles();
}

function rows() {
  const search = $("search").value.trim().toLowerCase();
  const shown = users.filter((u) => u.email.toLowerCase().includes(search));
  $("admin-rows").replaceChildren(...shown.map((user) => {
    const row = document.createElement("tr");
    const who = element("td", "admin-who");
    who.append(element("strong", "", user.email));
    who.append(element("span", "", `${user.verified ? "Verified" : "Not verified"} · joined ${shortDate(user.created_at)} · last login ${shortDate(user.last_sign_in_at)}`));
    row.append(who, element("td", "", user.finished ? `${user.finished} · avg ${user.average}` : "–"));
    for (const mock of mocks) {
      const cell = element("td", "admin-switch");
      const label = element("label", "switch");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = user.unlocked.includes(mock.id);
      box.disabled = !user.verified;
      box.setAttribute("aria-label", `${mock.title} for ${user.email}`);
      box.addEventListener("change", () => setAccess(user, mock, box));
      label.append(box, element("span", "switch-track"));
      cell.append(label);
      row.append(cell);
    }
    return row;
  }));
  if (!shown.length) {
    const row = document.createElement("tr");
    const cell = element("td", "", "No accounts match.");
    cell.colSpan = 2 + mocks.length;
    row.append(cell);
    $("admin-rows").replaceChildren(row);
  }
}

(async () => {
  const user = await setupAccount();
  if (!user) {
    location.replace("login.html");
    return;
  }
  const { data, error } = await db.rpc("admin_overview");
  if (error) {
    $("message").textContent = /admin/i.test(error.message)
      ? "This account isn't an admin."
      : `The panel couldn't load: ${error.message}`;
    return;
  }
  mocks = data.mocks;
  users = data.users;
  $("message").hidden = true;
  $("admin-body").hidden = false;
  const head = document.createElement("tr");
  head.append(element("th", "", "Account"), element("th", "", "Mocks done"), ...mocks.map((m) => element("th", "", m.title)));
  $("admin-head").replaceChildren(head);
  tiles();
  rows();
  $("search").addEventListener("input", rows);
})();
