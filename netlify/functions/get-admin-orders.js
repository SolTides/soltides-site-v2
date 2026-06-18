const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing admin session. Please log in again." });

  try {
    const orders = await supabaseFetch("orders?select=*,order_items(*)&order=created_at.desc&limit=100", { token });
    return json(200, { orders: orders || [] });
  } catch (error) {
    console.error(error);
    return json(403, { error: error.message || "Could not load orders." });
  }
};
