// Kaspi payment for an exclusive mock: the buyer transfers by hand and sends the receipt.
// Unlocking the mock with the Telegram bot approves the payment (see supabase/payments.sql).
const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"];
const RECEIPT_MAX_MB = 5;
const PRICE = `${PAYMENT.price.toLocaleString("ru-RU")} ₸`;

// The latest payment status for each mock this account has paid for
const paymentStatus = new Map();
let payUser = null;
let paying = null;

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
}

function payChooseReceipt() {
  const file = payEl("receipt").files[0];
  payEl("receipt-title").textContent = file ? file.name : "Attach receipt";
  payEl("receipt-note").textContent = file ? "Tap to choose another file" : "Screenshot or PDF from Kaspi";
  payEl("receipt-box").classList.toggle("chosen", Boolean(file));
  payShowError("");
}

// What a locked mock says under its name
function lockedNote(mockId) {
  return paymentStatus.get(mockId) === "pending" ? "Receipt under review" : `Exclusive · ${PRICE}`;
}

// note is the locked row's note, updated once the receipt is sent
function openPayment(mockId, title, note) {
  paying = { mockId, note };
  payEl("pay-for").textContent = title;
  payEl("receipt").value = "";
  payChooseReceipt();
  const status = paymentStatus.get(mockId);
  payShowView(!payUser ? "signin" : status === "pending" ? "done" : "form");
  if (status === "rejected") payShowError("We couldn't confirm your last transfer for this mock. Check the details and send the receipt again.");
  payEl("pay").showModal();
}

async function sendPayment(e) {
  e.preventDefault();
  const file = payEl("receipt").files[0];
  const sender = payEl("sender").value.trim();
  if (!file) return payShowError("Attach the receipt from Kaspi.");
  if (!RECEIPT_TYPES.includes(file.type)) return payShowError("The receipt must be a screenshot or a PDF.");
  if (file.size > RECEIPT_MAX_MB * 1024 * 1024) return payShowError(`The receipt must be under ${RECEIPT_MAX_MB} MB.`);
  if (sender.length < 2) return payShowError("Enter the name your Kaspi account shows.");

  const submit = payEl("pay-submit");
  payShowError("");
  submit.disabled = true;
  submit.textContent = "Sending…";

  const extension = (file.name.split(".").pop() || "file").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${payUser.id}/${paying.mockId}-${Date.now()}.${extension}`;
  const upload = await db.storage.from("receipts").upload(path, file, { contentType: file.type });
  const insert = upload.error
    ? null
    : await db.from("payments").insert({ mock_id: paying.mockId, sender_name: sender, receipt_path: path });

  submit.disabled = false;
  submit.textContent = "Send for review";
  // 23505: a payment for this mock is already waiting for review
  if (!insert || (insert.error && insert.error.code !== "23505")) {
    return payShowError("We couldn't send the receipt. Please try again in a minute.");
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
  // A click on the dimmed backdrop lands on the dialog itself
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  payEl("receipt").addEventListener("change", payChooseReceipt);
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
