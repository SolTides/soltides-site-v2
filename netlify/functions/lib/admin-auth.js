const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseFetch } = require("./supabase-rest");

function cleanBearerToken(headers = {}) {
  return String(headers.authorization || headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
}

async function userFromToken(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

async function assertAdmin(headers = {}) {
  const token = cleanBearerToken(headers);
  if (!token) {
    const error = new Error("Missing admin session.");
    error.statusCode = 401;
    throw error;
  }

  const user = await userFromToken(token);
  if (!user?.id) {
    const error = new Error("Invalid admin session.");
    error.statusCode = 401;
    throw error;
  }

  const adminRows = await supabaseFetch(`admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    write: true
  });

  if (!Array.isArray(adminRows) || !adminRows.length) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }

  return { token, user };
}

module.exports = { assertAdmin, cleanBearerToken, userFromToken };
