// Kaspi payment for an exclusive mock: the buyer transfers by hand and sends their Kaspi name.
// Unlocking the mock in the admin panel or with the bot approves the payment (see supabase/payments.sql).
// A promo code takes a percentage off; the database works out the discount (supabase/promo-codes.sql),
// and a 100% code unlocks the mock straight away.
// Minutes the window gives the buyer to pay. Running out only changes the label: the form still works,
// so someone who has already transferred can always send their name.
const PAY_MINUTES = 5;
const tenge = (amount) => `${amount.toLocaleString("ru-RU")} ₸`;
const PRICE = tenge(PAYMENT.price);

// The latest payment status for each mock this account has paid for
const paymentStatus = new Map();
let payUser = null;
let paying = null;
let payTimer;
// The applied promo code, as { code, percent }
let promo = null;

const payEl = (id) => document.getElementById(id);
const isFree = () => promo?.percent === 100;

function payShowError(text) {
  payEl("pay-error").textContent = text;
  payEl("pay-error").hidden = !text;
}

function payShowView(view) {
  payEl("pay-form").hidden = view !== "form";
  payEl("pay-done").hidden = view !== "done";
  payEl("pay-signin").hidden = view !== "signin";
  payPrice(view);
  if (view === "form" && !isFree()) startPayTimer();
  else stopPayTimer();
}

// The price with any discount. A free mock needs no transfer, so the Kaspi parts go away.
function payPrice(view = payEl("pay-form").hidden ? "" : "form") {
  const percent = promo ? promo.percent : 0;
  payEl("pay-amount").textContent = isFree() ? "Free" : tenge(Math.round((PAYMENT.price * (100 - percent)) / 100));
  payEl("pay-old").textContent = PRICE;
  payEl("pay-old").hidden = !percent;
  const transfer = view === "form" && !isFree();
  payEl("kaspi").hidden = !transfer;
  payEl("pay-timer").hidden = !transfer;
  payEl("pay-hint").hidden = !transfer;
  payEl("sender-field").hidden = !transfer;
  payEl("pay-submit").textContent = isFree() ? "Unlock for free" : "Send for review";
  if (!transfer) stopPayTimer();
}

function stopPayTimer() {
  clearInterval(payTimer);
  payTimer = undefined;
}

function startPayTimer() {
  stopPayTimer();
  const ends = Date.now() + PAY_MINUTES * 60 * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
    payEl("pay-time").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    payEl("pay-timer-label").textContent = left ? "Pay within" : "Time's up";
    payEl("pay-timer").classList.toggle("over", !left);
    if (!left) clearInterval(payTimer);
  };
  tick();
  payTimer = setInterval(tick, 1000);
}

function promoNote(text, bad) {
  payEl("promo-note").textContent = text;
  payEl("promo-note").hidden = !text;
  payEl("promo-note").classList.toggle("bad", Boolean(bad));
}

async function applyPromo() {
  const code = payEl("promo-code").value.trim().toUpperCase();
  if (!code) return promoNote("Enter a promo code.", true);
  const apply = payEl("promo-apply");
  apply.disabled = true;
  const { data, error } = await db.rpc("promo_percent", { promo: code });
  apply.disabled = false;
  promo = !error && data ? { code, percent: data } : null;
  promoNote(promo ? `${code} · ${promo.percent}% off` : "This code isn't valid.", !promo);
  payPrice();
  // Going from free back to paid shows the Kaspi parts again, so the timer starts then
  if (!isFree() && !payTimer) startPayTimer();
}

// What a locked mock says under its name
function lockedNote(mockId) {
  return paymentStatus.get(mockId) === "pending" ? "Payment under review" : `Exclusive · ${PRICE}`;
}

function payShowDone(unlocked) {
  payEl("pay-done-title").textContent = unlocked ? "Unlocked" : "Sent for review";
  payEl("pay-done-text").textContent = unlocked
    ? "Your promo code covers the whole price. The mock is open on this account."
    : "We'll find your transfer by your Kaspi name and unlock the mock on this account. It opens here once it's approved.";
  payEl("pay-ok").textContent = unlocked ? "Open my mocks" : "Done";
  payEl("pay-ok").dataset.reload = unlocked ? "yes" : "";
  payShowView("done");
}

// note is the locked row's note, updated once the payment is sent
function openPayment(mockId, title, note) {
  paying = { mockId, note };
  promo = null;
  payEl("promo-code").value = "";
  payEl("promo-row").hidden = true;
  payEl("promo-toggle").hidden = false;
  promoNote("");
  payEl("pay-for").textContent = title;
  payShowError("");
  const status = paymentStatus.get(mockId);
  if (payUser && status === "pending") payShowDone(false);
  else payShowView(payUser ? "form" : "signin");
  if (status === "rejected") payShowError("We couldn't find your last transfer for this mock. Check the name and send it again.");
  payEl("pay").showModal();
}

async function sendPayment(e) {
  e.preventDefault();
  const sender = payEl("sender").value.trim();
  if (!isFree() && sender.length < 2) return payShowError("Enter the name your Kaspi account shows.");

  const submit = payEl("pay-submit");
  const label = submit.textContent;
  payShowError("");
  submit.disabled = true;
  submit.textContent = "Sending…";
  const { data, error } = await db.rpc("send_payment", { mock: paying.mockId, sender: isFree() ? null : sender, promo: promo?.code || null });
  submit.disabled = false;
  submit.textContent = label;

  // 23505: a payment for this mock is already waiting for review
  if (error && error.code !== "23505") {
    if (/promo code/i.test(error.message)) {
      promo = null;
      promoNote("This code can no longer be used.", true);
      payPrice();
      return;
    }
    return payShowError("We couldn't send your payment. Please try again in a minute.");
  }
  const unlocked = data === "approved";
  paymentStatus.set(paying.mockId, unlocked ? "approved" : "pending");
  if (!unlocked) paying.note.textContent = lockedNote(paying.mockId);
  payShowDone(unlocked);
}

async function setupPayment(user) {
  const sheet = payEl("pay");
  let copiedTimer;
  payUser = user;

  payEl("kaspi-phone").textContent = PAYMENT.kaspiPhone;
  payEl("kaspi-to").textContent = `Kaspi · recipient ${PAYMENT.recipient}`;

  payEl("pay-close").addEventListener("click", () => sheet.close());
  // After a free unlock the page reloads, so the mock shows as open
  payEl("pay-ok").addEventListener("click", (e) => (e.currentTarget.dataset.reload ? location.reload() : sheet.close()));
  sheet.addEventListener("close", stopPayTimer);
  // A click on the dimmed backdrop lands on the dialog itself
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  payEl("pay-form").addEventListener("submit", sendPayment);

  payEl("promo-toggle").addEventListener("click", () => {
    payEl("promo-toggle").hidden = true;
    payEl("promo-row").hidden = false;
    payEl("promo-code").focus();
  });
  payEl("promo-apply").addEventListener("click", applyPromo);
  // Enter in the code field applies it instead of sending the form
  payEl("promo-code").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    applyPromo();
  });

  payEl("kaspi-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT.kaspiPhone.replace(/[^\d+]/g, ""));
      payEl("kaspi-copy").textContent = "Copied";
    } catch (e) {
      payEl("kaspi-copy").textContent = "Copy failed";
    }
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { payEl("kaspi-copy").textContent = "Copy"; }, 1600);
  });

  if (!user) return;
  const { data } = await db.from("payments").select("mock_id, status").order("created_at");
  for (const payment of data || []) paymentStatus.set(payment.mock_id, payment.status);
}
