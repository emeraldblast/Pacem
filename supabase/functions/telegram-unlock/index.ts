// Telegram bot that gives accounts the exclusive mocks. Only admins can use it.
//
//   /mocks                               lists the exclusive mocks
//   /unlock person@example.com math2     gives those mocks, several can be listed, or all
//   /lock person@example.com math2       takes those mocks away, several can be listed, or all
//   /check person@example.com            shows what the account has
//
// A new mock works here as soon as it is in the mocks table with is_public = false.
//
// Secrets to set in Supabase: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ADMIN_IDS.
// TELEGRAM_ADMIN_IDS is a list of Telegram user IDs split by commas: 111111,222222
// "Enforce JWT verification" must be off, because Telegram sends no Supabase token.
// The webhook secret is what keeps everyone else out.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const HELP = "Commands:\n/mocks\n/unlock email math2 crit2\n/unlock email all\n/lock email math2\n/lock email all\n/check email";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function reply(chat: number, text: string) {
  await fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
}

async function exclusiveMocks() {
  const { data, error } = await db.from("mocks").select("id, title").eq("is_public", false).order("id");
  if (error) throw error;
  return data;
}

const listOf = (mocks: { id: string; title: string }[]) =>
  mocks.length ? mocks.map((mock) => `${mock.id}: ${mock.title}`).join("\n") : "There are no exclusive mocks yet.";

async function findAccount(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
}

async function run(command: string, email: string, names: string[]) {
  const mocks = await exclusiveMocks();
  const ids = mocks.map((mock) => mock.id);
  const wanted = names.includes("all") ? ids : names;

  if (command !== "/check") {
    if (!names.length) return `Which mocks?\n${listOf(mocks)}\n\nExample: ${command} ${email} ${ids[0] ?? "math2"}\nOr: ${command} ${email} all`;
    const unknown = wanted.filter((name) => !ids.includes(name));
    if (unknown.length) return `Unknown mock: ${unknown.join(", ")}\n\n${listOf(mocks)}`;
  }

  const account = await findAccount(email);
  if (!account) return `No account with ${email}. They need to register first.`;
  if (!account.email_confirmed_at) return `${email} hasn't verified their email yet.`;

  const titles = mocks.filter((mock) => wanted.includes(mock.id)).map((mock) => mock.title).join(", ");

  if (command === "/unlock") {
    const rows = wanted.map((mock_id) => ({ user_id: account.id, mock_id }));
    const { error } = await db.from("mock_access").upsert(rows, { ignoreDuplicates: true });
    if (error) throw error;
    return `${titles} unlocked for ${email}.`;
  }

  if (command === "/lock") {
    const { error } = await db.from("mock_access").delete().eq("user_id", account.id).in("mock_id", wanted);
    if (error) throw error;
    return `${titles} locked for ${email}.`;
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

  const [command, email, ...names] = message.text.trim().toLowerCase().split(/\s+/);
  try {
    let answer = HELP;
    if (command === "/mocks") answer = listOf(await exclusiveMocks());
    else if (["/unlock", "/lock", "/check"].includes(command) && email?.includes("@")) answer = await run(command, email, names);
    await reply(message.chat.id, answer);
  } catch (error) {
    await reply(message.chat.id, `Something went wrong: ${error.message}`);
  }
  return new Response("ok");
});
