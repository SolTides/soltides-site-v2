const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { assertAdmin } = require("./lib/admin-auth");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    await assertAdmin(event.headers);
    const orders = await supabaseFetch("orders?select=*,order_items(*)&order=created_at.desc&limit=100", { write: true });
    return json(200, { orders: orders || [] });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 403, { error: error.message || "Could not load orders." });
  }
};
