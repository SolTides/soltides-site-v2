const { json, readJson } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

const PAYMENT_STATUSES = new Set(["pending", "paid", "cancelled", "refunded"]);
const SHIPPING_STATUSES = new Set(["not_shipped", "processing", "shipped", "delivered", "returned"]);

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing admin session. Please log in again." });
  const body = readJson(event);
  if (!body?.id) return json(400, { error: "Missing order ID." });

  const update = {};
  if (body.payment_status) {
    if (!PAYMENT_STATUSES.has(body.payment_status)) return json(400, { error: "Invalid payment status." });
    update.payment_status = body.payment_status;
  }
  if (body.shipping_status) {
    if (!SHIPPING_STATUSES.has(body.shipping_status)) return json(400, { error: "Invalid shipping status." });
    update.shipping_status = body.shipping_status;
  }
  if (Object.prototype.hasOwnProperty.call(body, "tracking_number")) {
    if (String(body.tracking_number || "").length > 120) return json(400, { error: "Tracking number is too long." });
    update.tracking_number = body.tracking_number || null;
  }
  if (!Object.keys(update).length) return json(400, { error: "No valid order updates were supplied." });

  try {
    await supabaseFetch(`orders?id=eq.${encodeURIComponent(body.id)}`, {
      method: "PATCH",
      token,
      prefer: "return=minimal",
      body: update
    });
    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(403, { error: error.message || "Could not update order." });
  }
};
