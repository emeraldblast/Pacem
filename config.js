// From Supabase: Project Settings > API. The publishable (anon) key is safe in
// public code, because the rules in supabase/schema.sql protect the data.
// Never put the secret (service_role) key here.
const SUPABASE_URL = "https://tjwihtzuqxwjcgsfmxfe.supabase.co";
const SUPABASE_KEY = "sb_publishable_bTPHBoMF8R1JfDIA4BnanQ_34vVpGHx";

// Price of one exclusive mock and the Kaspi account that receives the transfer
const PAYMENT = {
  price: 1290,
  kaspiPhone: "+7 778 200 20 57",
  recipient: "Асқар М.",
};
