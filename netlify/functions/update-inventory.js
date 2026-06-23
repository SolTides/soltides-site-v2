const { json, readJson } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

const STATUSES = new Set(["auto", "out_of_stock", "coming_soon", "limited", "hidden"]);

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing admin session." });
  const body = readJson(event);
  const stock = Number(body?.stock);
  const threshold = Number(body?.low_stock_threshold);
  if (!body?.product_id || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0 || !STATUSES.has(body.availability_status)) {
    return json(400, { error: "Invalid inventory values." });
  }
  try {
    await supabaseFetch(`inventory?product_id=eq.${encodeURIComponent(body.product_id)}`, {
      method: "PATCH", token, prefer: "return=minimal",
      body: {
        stock,
        availability_status: body.availability_status,
        enabled: Boolean(body.enabled),
        low_stock_threshold: threshold,
        show_stock_count: Boolean(body.show_stock_count),
        updated_at: new Date().toISOString()
      }
    });
    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(403, { error: "Could not update inventory." });
  }
};
