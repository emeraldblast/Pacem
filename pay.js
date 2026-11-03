// Kaspi payment for an exclusive mock: the buyer transfers by hand and sends their Kaspi name.
// Unlocking the mock in the admin panel or with the bot approves the payment (see supabase/payments.sql).
// Minutes the window gives the buyer to pay. Running out only changes the label: the form still works,
// so someone who has already transferred can always send their name.
const PAY_MINUTES = 5;
const PRICE = `${PAYMENT.price.toLocaleString("ru-RU")} ₸`;

// The latest payment status for each mock this account has paid for
const paymentStatus = new Map();
let payUser = null;
let paying = null;
let payTimer;

const payEl = (id) => document.getElementById(id);

function payShowError(text) {
  payEl("pay-error").textContent = text;
  payEl("pay-error").hidden = !text;
}

function payShowView(view) {
  payEl("pay-form").hidden = view !== "form";
  payEl("pay-done").hidden = view !== "done";
  payEl("pay-signin").hidden = view !== "signin";
  payEl("kaspi").hidden = view === "signin";
  payEl("pay-timer").hidden = view !== "form";
  if (view === "form") startPayTimer();
  else clearInterval(payTimer);
}

function startPayTimer() {
  clearInterval(payTimer);
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

// What a locked mock says under its name
function lockedNote(mockId) {
  return paymentStatus.get(mockId) === "pending" ? "Payment under review" : `Exclusive · ${PRICE}`;
}

// note is the locked row's note, updated once the payment is sent
function openPayment(mockId, title, note) {
  paying = { mockId, note };
  payEl("pay-for").textContent = title;
  payShowError("");
  const status = paymentStatus.get(mockId);
  payShowView(!payUser ? "signin" : status === "pending" ? "done" : "form");
  if (status === "rejected") payShowError("We couldn't find your last transfer for this mock. Check the name and send it again.");
  payEl("pay").showModal();
}

async function sendPayment(e) {
  e.preventDefault();
  const sender = payEl("sender").value.trim();
  if (sender.length < 2) return payShowError("Enter the name your Kaspi account shows.");

  const submit = payEl("pay-submit");
  payShowError("");
  submit.disabled = true;
  submit.textContent = "Sending…";

  // The table still asks for a receipt path in the account's folder; no-receipt marks that none was sent
  const insert = await db.from("payments").insert({ mock_id: paying.mockId, sender_name: sender, receipt_path: `${payUser.id}/no-receipt` });

  submit.disabled = false;
  submit.textContent = "Send for review";
  // 23505: a payment for this mock is already waiting for review
  if (insert.error && insert.error.code !== "23505") {
    return payShowError("We couldn't send your payment. Please try again in a minute.");
  }
  paymentStatus.set(paying.mockId, "pending");
  paying.note.textContent = lockedNote(paying.mockId);
  payShowView("done");
}

async function setupPayment(user) {
  const sheet = payEl("pay");
  let copiedTimer;
  payUser = user;

  payEl("pay-amount").textContent = PRICE;
  payEl("kaspi-phone").textContent = PAYMENT.kaspiPhone;
  payEl("kaspi-to").textContent = `Kaspi · recipient ${PAYMENT.recipient}`;

  payEl("pay-close").addEventListener("click", () => sheet.close());
  payEl("pay-ok").addEventListener("click", () => sheet.close());
  sheet.addEventListener("close", () => clearInterval(payTimer));
  // A click on the dimmed backdrop lands on the dialog itself
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  payEl("pay-form").addEventListener("submit", sendPayment);

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
