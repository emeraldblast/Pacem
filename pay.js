// Kaspi payment: the visitor transfers by hand and sends the receipt for review.
// Approving the payment in Supabase opens the paid mocks (see supabase/payments.sql).
const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"];
const RECEIPT_MAX_MB = 5;

async function setupPayment(signedIn) {
  const tile = document.getElementById("unlock");
  if (typeof PAYMENT === "undefined" || !PAYMENT.kaspiPhone) return;
  const price = `${PAYMENT.price.toLocaleString("ru-RU")} ₸`;
  document.getElementById("unlock-note").textContent = `${price} · Kaspi`;

  if (!signedIn) {
    tile.addEventListener("click", () => location.assign("login.html?mode=register"));
    tile.hidden = false;
    return;
  }

  const { data } = await db.from("payments").select("status").order("created_at", { ascending: false }).limit(1);
  const last = data && data[0] ? data[0].status : null;
  if (last === "approved") return;

  const $ = (id) => document.getElementById(id);
  const sheet = $("pay");
  const receipt = $("receipt");
  let copiedTimer;

  $("pay-amount").textContent = price;
  $("kaspi-phone").textContent = PAYMENT.kaspiPhone;
  $("kaspi-to").textContent = `Kaspi · recipient ${PAYMENT.recipient}`;

  const showError = (text) => {
    $("pay-error").textContent = text;
    $("pay-error").hidden = !text;
  };

  const showSent = () => {
    $("pay-form").hidden = true;
    $("pay-steps").hidden = true;
    $("pay-done").hidden = false;
    $("unlock-note").textContent = "Receipt under review";
  };

  const updateSteps = () => {
    $("step-receipt").classList.toggle("done", receipt.files.length > 0);
    $("step-name").classList.toggle("done", $("sender").value.trim().length >= 2);
  };

  if (last === "pending") showSent();
  if (last === "rejected") showError("We couldn't confirm your last transfer. Check the details and send the receipt again.");

  tile.addEventListener("click", () => sheet.showModal());
  $("pay-close").addEventListener("click", () => sheet.close());
  $("pay-ok").addEventListener("click", () => sheet.close());
  // A click on the dimmed backdrop lands on the dialog itself
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

  $("kaspi-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT.kaspiPhone.replace(/[^\d+]/g, ""));
      $("kaspi-copy").textContent = "Copied";
    } catch (e) {
      $("kaspi-copy").textContent = "Copy failed";
    }
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { $("kaspi-copy").textContent = "Copy"; }, 1600);
  });

  receipt.addEventListener("change", () => {
    const file = receipt.files[0];
    $("receipt-title").textContent = file ? file.name : "Attach receipt";
    $("receipt-note").textContent = file ? "Tap to choose another file" : "Screenshot or PDF from Kaspi";
    $("receipt-box").classList.toggle("chosen", Boolean(file));
    showError("");
    updateSteps();
  });
  $("sender").addEventListener("input", updateSteps);

  $("pay-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = receipt.files[0];
    const sender = $("sender").value.trim();
    if (!file) return showError("Attach the receipt from Kaspi.");
    if (!RECEIPT_TYPES.includes(file.type)) return showError("The receipt must be a screenshot or a PDF.");
    if (file.size > RECEIPT_MAX_MB * 1024 * 1024) return showError(`The receipt must be under ${RECEIPT_MAX_MB} MB.`);
    if (sender.length < 2) return showError("Enter the name your Kaspi account shows.");

    showError("");
    $("pay-submit").disabled = true;
    $("pay-submit").textContent = "Sending…";

    const { data: session } = await db.auth.getSession();
    const extension = (file.name.split(".").pop() || "file").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${session.session.user.id}/${Date.now()}.${extension}`;
    const upload = await db.storage.from("receipts").upload(path, file, { contentType: file.type });
    const insert = upload.error ? null : await db.from("payments").insert({ sender_name: sender, receipt_path: path });

    $("pay-submit").disabled = false;
    $("pay-submit").textContent = "Send for review";
    // 23505: a payment from this account is already waiting for review
    if (insert && (!insert.error || insert.error.code === "23505")) return showSent();
    showError("We couldn't send the receipt. Please try again in a minute.");
  });

  tile.hidden = false;
}
