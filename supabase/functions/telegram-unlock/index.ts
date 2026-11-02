// Telegram bot that gives accounts the exclusive mocks. Only admins can use it.
//
//   /unlock person@example.com   gives both Mock 2s
//   /lock person@example.com     takes both away
//   /check person@example.com    shows what the account has
//
// Secrets to set in Supabase: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ADMIN_IDS.
// TELEGRAM_ADMIN_IDS is a list of Telegram user IDs split by commas: 111111,222222
// "Enforce JWT verification" must be off, because Telegram sends no Supabase token.
// The webhook secret is what keeps everyone else out.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MOCKS = ["math2", "crit2"];
const HELP = "Commands:\n/unlock email\n/lock email\n/check email";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function reply(chat: number, text: string) {
  await fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
}

async function findAccount(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
}

async function run(command: string, email: string) {
  const account = await findAccount(email);
  if (!account) return `No account with ${email}. They need to register first.`;
  if (!account.email_confirmed_at) return `${email} hasn't verified their email yet.`;

  if (command === "/unlock") {
    const rows = MOCKS.map((mock_id) => ({ user_id: account.id, mock_id }));
    const { error } = await db.from("mock_access").upsert(rows, { ignoreDuplicates: true });
    if (error) throw error;
    return `Unlocked ${MOCKS.join(", ")} for ${email}.`;
  }

  if (command === "/lock") {
    const { error } = await db.from("mock_access").delete().eq("user_id", account.id).in("mock_id", MOCKS);
    if (error) throw error;
    return `Locked ${MOCKS.join(", ")} for ${email}.`;
  }

  const { data, error } = await db.from("mock_access").select("mock_id").eq("user_id", account.id);
  if (error) throw error;
  return data.length ? `${email} has: ${data.map((row) => row.mock_id).join(", ")}` : `${email} has no exclusive mocks.`;
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const { message } = await request.json();
  // Anyone else who writes to the bot gets no answer
  const admins = (Deno.env.get("TELEGRAM_ADMIN_IDS") ?? "").split(",").map((id) => id.trim());
  if (!message?.text || !message.from?.id || !admins.includes(String(message.from.id))) {
    return new Response("ok");
  }

  const [command, email] = message.text.trim().split(/\s+/);
  try {
    const known = ["/unlock", "/lock", "/check"].includes(command);
    await reply(message.chat.id, known && email?.includes("@") ? await run(command, email.toLowerCase()) : HELP);
  } catch (error) {
    await reply(message.chat.id, `Something went wrong: ${error.message}`);
  }
  return new Response("ok");
});
