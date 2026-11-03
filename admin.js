// The admin panel: every account, with a switch for each paid bundle.
// Paid mocks are sold by number: the Mock 2 bundle is math2 and crit2 together.
// The database checks that the signed-in account is an admin (supabase/admin.sql),
// so this page is only a view: for anyone else the calls are refused.

const $ = (id) => document.getElementById(id);
let mocks = [];
let bundles = [];
let users = [];
let canManage = false;

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
    ["Paid bundles", bundles.length, bundles.map((b) => `${b.name}: ${b.ids.join(" + ")}`).join(", ") || "none yet"],
    ["Mocks unlocked", unlocks, `${users.filter((u) => u.unlocked.length).length} accounts with a paid mock`],
    ["Mocks finished", finished, "by all accounts"],
  ];
  $("tiles").replaceChildren(...list.map(([label, value, note]) => {
    const tile = element("div", "tile");
    tile.append(element("p", "tile-label", label), element("p", "tile-value", String(value)), element("p", "tile-note", note));
    return tile;
  }));
}

// Groups paid mocks by the number at the end of their id
function bundlesOf(list) {
  const groups = new Map();
  for (const mock of list) {
    const name = `Mock ${mock.id.match(/\d+$/)?.[0] ?? mock.id}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(mock.id);
  }
  return [...groups].map(([name, ids]) => ({ name, ids }));
}

async function setBundle(user, bundle, box) {
  box.disabled = true;
  for (const mock of bundle.ids) {
    const { error } = await db.rpc("admin_set_access", { target: user.id, mock, allow: box.checked });
    if (error) {
      $("saved").textContent = `Couldn't save: ${error.message}`;
      box.disabled = false;
      return;
    }
    user.unlocked = box.checked ? [...new Set([...user.unlocked, mock])] : user.unlocked.filter((id) => id !== mock);
  }
  box.disabled = false;
  box.indeterminate = false;
  $("saved").textContent = `${bundle.name} (${bundle.ids.join(" + ")}) ${box.checked ? "unlocked for" : "locked for"} ${user.email}.`;
  tiles();
}

// Admins can see every account and unlock anything, so making one is confirmed first
async function setAdmin(user, box) {
  if (box.checked && !confirm(`Make ${user.email} an admin? They will see every account and can unlock mocks.`)) {
    box.checked = false;
    return;
  }
  box.disabled = true;
  const { error } = await db.rpc("admin_set_admin", { target: user.id, make: box.checked });
  box.disabled = false;
  if (error) {
    box.checked = !box.checked;
    $("saved").textContent = `Couldn't save: ${error.message}`;
    return;
  }
  user.admin = box.checked;
  $("saved").textContent = `${user.email} is ${box.checked ? "now an admin" : "no longer an admin"}.`;
}

function toggle(checked, disabled, label, onChange) {
  const cell = element("td", "admin-switch");
  const wrap = element("label", "switch");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.disabled = disabled;
  box.setAttribute("aria-label", label);
  box.addEventListener("change", () => onChange(box));
  wrap.append(box, element("span", "switch-track"));
  cell.append(wrap);
  return cell;
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
    for (const bundle of bundles) {
      const has = bundle.ids.filter((id) => user.unlocked.includes(id)).length;
      const cell = toggle(has === bundle.ids.length, !user.verified, `${bundle.name} for ${user.email}`, (box) => setBundle(user, bundle, box));
      // Only part of the bundle unlocked: shown half on, and switching it on unlocks the rest
      cell.querySelector("input").indeterminate = has > 0 && has < bundle.ids.length;
      row.append(cell);
    }
    // Only the owner can change admins, and the owner's own switch stays on
    row.append(toggle(user.admin, !canManage || !user.verified || user.owner, `${user.email} is an admin`, (box) => setAdmin(user, box)));
    return row;
  }));
  if (!shown.length) {
    const row = document.createElement("tr");
    const cell = element("td", "", "No accounts match.");
    cell.colSpan = 3 + bundles.length;
    row.append(cell);
    $("admin-rows").replaceChildren(row);
  }
}

(async () => {
  if (!(await setupAccount())) {
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
  bundles = bundlesOf(mocks);
  users = data.users;
  canManage = data.can_manage;
  if (!canManage) $("saved").textContent = "Newest accounts first. Only the owner can add or remove admins.";
  $("message").hidden = true;
  $("admin-body").hidden = false;
  const head = document.createElement("tr");
  head.append(element("th", "", "Account"), element("th", "", "Mocks done"), ...bundles.map((b) => {
    const th = element("th", "", b.name);
    th.append(element("span", "admin-bundle", b.ids.join(" + ")));
    return th;
  }), element("th", "", "Admin"));
  $("admin-head").replaceChildren(head);
  tiles();
  rows();
  $("search").addEventListener("input", rows);
})();
