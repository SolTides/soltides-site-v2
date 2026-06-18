const SUPABASE_URL = process.env.SUPABASE_URL || "https://lcofklilvaatcorvfucz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_ccOyDWazc9VM8cLRosW9mg_g-uDqu26";
const SUPABASE_WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;

function restUrl(pathAndQuery) {
  return `${SUPABASE_URL}/rest/v1/${pathAndQuery}`;
}

async function supabaseFetch(pathAndQuery, { method = "GET", body = undefined, token = null, write = false, prefer = null } = {}) {
  const key = write ? SUPABASE_WRITE_KEY : SUPABASE_PUBLISHABLE_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(restUrl(pathAndQuery), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const detail = typeof data === "string" ? data : (data?.message || data?.hint || JSON.stringify(data));
    throw new Error(`Supabase ${method} ${pathAndQuery} failed: ${res.status} ${detail}`);
  }
  return data;
}

module.exports = { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_WRITE_KEY, supabaseFetch };
