// The admin panel: every account, with a switch for each paid mock.
// The database checks that the signed-in account is an admin (supabase/admin.sql),
// so this page is only a view: for anyone else the calls are refused.

const $ = (id) => document.getElementById(id);
let mocks = [];
let users = [];
let canManage = false;
let payments = [];
let promos = [];
let receiptUrls = {};

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

const STATUS = { approved: "Approved", rejected: "Rejected" };
const dateTime = (when) => new Date(when).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Receipts are private, so each one gets a link that works for an hour
async function loadReceiptUrls() {
  const paths = payments.map((p) => p.receipt_path).filter((path) => !path.endsWith("/no-receipt"));
  if (!paths.length) return {};
  const { data } = await db.storage.from("receipts").createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

function receipt(payment) {
  const url = receiptUrls[payment.receipt_path];
  if (!url) return element("span", "payment-receipt", "No file");
  const link = element("a", "payment-receipt");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  if (/\.(png|jpe?g|webp)$/i.test(payment.receipt_path)) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Receipt from ${payment.email}`;
    image.loading = "lazy";
    link.append(image);
  } else {
    link.textContent = /\.pdf$/i.test(payment.receipt_path) ? "PDF" : "File";
    link.setAttribute("aria-label", `Receipt from ${payment.email}`);
  }
  return link;
}

async function review(payment, approve, buttons) {
  if (!approve && !confirm(`Reject the receipt from ${payment.email}? They'll be asked to send a new one.`)) return;
  buttons.forEach((button) => { button.disabled = true; });
  const { error } = await db.rpc("admin_review_payment", { payment: payment.id, approve });
  if (error) {
    buttons.forEach((button) => { button.disabled = false; });
    $("payments-note").textContent = `Couldn't save: ${error.message}`;
    return;
  }
  payment.status = approve ? "approved" : "rejected";
  const user = users.find((u) => u.id === payment.user_id);
  if (approve && user) {
    // Approving opens every part of the mock: math2 and crit2 for Mock 2
    const parts = partsOf(payment.mock_id).filter((id) => !user.unlocked.includes(id));
    user.unlocked = [...user.unlocked, ...parts];
    rows();
    tiles();
  }
  $("payments-note").textContent = `${payment.mock_title || payment.mock_id} ${approve ? "unlocked for" : "rejected for"} ${payment.email}.`;
  paymentRows();
}

const tenge = (amount) => `${amount.toLocaleString("ru-RU")} ₸`;
const numberOf = (id) => (id.match(/\d+$/) || [""])[0];
const partsOf = (mockId) => mocks.map((m) => m.id).filter((id) => numberOf(id) === numberOf(mockId));

// What the buyer should have sent, with any promo code
function amountNote(payment) {
  if (!payment.promo_code) return `${tenge(PAYMENT.price)}`;
  if (payment.discount === 100) return `Free with ${payment.promo_code}`;
  return `${tenge(Math.round((PAYMENT.price * (100 - payment.discount)) / 100))} with ${payment.promo_code} (−${payment.discount}%)`;
}

function paymentRows() {
  const waiting = payments.filter((p) => p.status === "pending").length;
  $("payments-count").textContent = waiting ? `${waiting} waiting` : "";
  if (!payments.length) {
    $("payments").replaceChildren(element("p", "panel-empty", "No payments in the last 30 days."));
    return;
  }
  $("payments").replaceChildren(...payments.map((payment) => {
    // Payments sent with just a Kaspi name have no receipt to show
    const hasFile = !payment.receipt_path.endsWith("/no-receipt");
    const item = element("article", `payment ${payment.status}${hasFile ? "" : " no-file"}`);
    const info = element("div", "payment-info");
    info.append(
      element("strong", "", payment.email),
      element("span", "", `${payment.mock_title || payment.mock_id} · ${amountNote(payment)}`),
      element("span", "", payment.discount === 100 ? "No transfer needed" : `Kaspi name: ${payment.sender_name}`),
      element("span", "", dateTime(payment.created_at)),
    );
    const actions = element("div", "payment-actions");
    if (payment.status === "pending") {
      const approve = element("button", "payment-approve", "Approve");
      const reject = element("button", "payment-reject", "Reject");
      approve.type = "button";
      reject.type = "button";
      approve.addEventListener("click", () => review(payment, true, [approve, reject]));
      reject.addEventListener("click", () => review(payment, false, [approve, reject]));
      actions.append(approve, reject);
    } else {
      actions.append(element("span", `payment-status ${payment.status}`, STATUS[payment.status]));
    }
    item.append(...(hasFile ? [receipt(payment)] : []), info, actions);
    return item;
  }));
}

async function loadPayments() {
  const { data, error } = await db.rpc("admin_payments");
  if (error) {
    $("payments").replaceChildren(element("p", "panel-empty", `Payments couldn't load: ${error.message}`));
    return;
  }
  payments = data;
  receiptUrls = await loadReceiptUrls();
  paymentRows();
}

function promoRows() {
  if (!promos.length) {
    const row = document.createElement("tr");
    const cell = element("td", "", "No promo codes yet.");
    cell.colSpan = 5;
    row.append(cell);
    $("promo-rows").replaceChildren(row);
    return;
  }
  $("promo-rows").replaceChildren(...promos.map((promo) => {
    const row = document.createElement("tr");
    const remove = element("button", "payment-reject", "Delete");
    remove.type = "button";
    remove.addEventListener("click", () => deletePromo(promo, remove));
    const actions = element("td");
    actions.append(remove);
    row.append(
      element("td", "promo-code-cell", promo.code),
      element("td", "", promo.percent === 100 ? "100% · free" : `${promo.percent}%`),
      element("td", "", promo.max_uses ? `${promo.uses} of ${promo.max_uses}` : `${promo.uses}`),
      toggle(promo.active, false, `${promo.code} is on`, (box) => setPromoActive(promo, box)),
      actions,
    );
    return row;
  }));
}

async function savePromo(promo) {
  return db.rpc("admin_save_promo", { promo: promo.code, pct: promo.percent, use_limit: promo.max_uses, is_active: promo.active });
}

async function addPromo(e) {
  e.preventDefault();
  const code = $("promo-new-code").value.trim().toUpperCase();
  const percent = Number($("promo-new-percent").value);
  const limit = $("promo-new-limit").value ? Number($("promo-new-limit").value) : null;
  const existing = promos.find((p) => p.code === code);
  if (existing && !confirm(`${code} already exists. Replace its discount and limit?`)) return;
  const promo = { code, percent, max_uses: limit, active: true, uses: existing ? existing.uses : 0 };
  const { error } = await savePromo(promo);
  if (error) {
    $("promos-note").textContent = `Couldn't save: ${error.message}`;
    return;
  }
  promos = [promo, ...promos.filter((p) => p.code !== code)];
  $("promos-note").textContent = `${code} saved: ${percent}% off${limit ? `, ${limit} uses` : ""}.`;
  $("promo-form").reset();
  promoRows();
}

async function setPromoActive(promo, box) {
  box.disabled = true;
  const { error } = await savePromo({ ...promo, active: box.checked });
  box.disabled = false;
  if (error) {
    box.checked = !box.checked;
    $("promos-note").textContent = `Couldn't save: ${error.message}`;
    return;
  }
  promo.active = box.checked;
  $("promos-note").textContent = `${promo.code} is ${box.checked ? "on" : "off"}.`;
}

async function deletePromo(promo, button) {
  if (!confirm(`Delete ${promo.code}? Payments that used it keep their discount.`)) return;
  button.disabled = true;
  const { error } = await db.rpc("admin_delete_promo", { promo: promo.code });
  if (error) {
    button.disabled = false;
    $("promos-note").textContent = `Couldn't delete: ${error.message}`;
    return;
  }
  promos = promos.filter((p) => p !== promo);
  $("promos-note").textContent = `${promo.code} deleted.`;
  promoRows();
}

async function loadPromos() {
  const { data, error } = await db.rpc("admin_promo_codes");
  if (error) {
    const row = document.createElement("tr");
    const cell = element("td", "", `Promo codes couldn't load: ${error.message}`);
    cell.colSpan = 5;
    row.append(cell);
    $("promo-rows").replaceChildren(row);
    return;
  }
  promos = data;
  promoRows();
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
      row.append(toggle(user.unlocked.includes(mock.id), !user.verified, `${mock.title} for ${user.email}`, (box) => setAccess(user, mock, box)));
    }
    // Only the owner can change admins, and the owner's own switch stays on
    row.append(toggle(user.admin, !canManage || !user.verified || user.owner, `${user.email} is an admin`, (box) => setAdmin(user, box)));
    return row;
  }));
  if (!shown.length) {
    const row = document.createElement("tr");
    const cell = element("td", "", "No accounts match.");
    cell.colSpan = 3 + mocks.length;
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
  users = data.users;
  canManage = data.can_manage;
  if (!canManage) $("saved").textContent = "Newest accounts first. Only the owner can add or remove admins.";
  $("message").hidden = true;
  $("admin-body").hidden = false;
  const head = document.createElement("tr");
  head.append(element("th", "", "Account"), element("th", "", "Mocks done"), ...mocks.map((m) => element("th", "", m.title)), element("th", "", "Admin"));
  $("admin-head").replaceChildren(head);
  tiles();
  rows();
  $("search").addEventListener("input", rows);
  loadPayments();
  loadPromos();
  $("promo-form").addEventListener("submit", addPromo);
})();
