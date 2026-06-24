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
  const optionLabel = String(body?.option_label || "").trim();
  const isVariant = Boolean(optionLabel);
  const rawPrice = body?.price;
  const price = rawPrice === "" || rawPrice === null || rawPrice === undefined ? null : Number(rawPrice);
  if (!body?.product_id || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0 || !STATUSES.has(body.availability_status)
      || (isVariant && price !== null && (!Number.isFinite(price) || price < 0))) {
    return json(400, { error: "Invalid inventory values." });
  }
  try {
    const values = {
      stock,
      availability_status: body.availability_status,
      enabled: Boolean(body.enabled),
      low_stock_threshold: threshold,
      show_stock_count: Boolean(body.show_stock_count),
      updated_at: new Date().toISOString()
    };

    if (isVariant) {
      values.price = price;
      values.sort_order = Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : 0;
      if (body.create) {
        await supabaseFetch("product_variants?on_conflict=product_id,option_label", {
          method: "POST", token, prefer: "resolution=merge-duplicates,return=minimal",
          body: { product_id: body.product_id, option_label: optionLabel, ...values }
        });
      } else {
        await supabaseFetch(`product_variants?product_id=eq.${encodeURIComponent(body.product_id)}&option_label=eq.${encodeURIComponent(optionLabel)}`, {
          method: "PATCH", token, prefer: "return=minimal", body: values
        });
      }
    } else {
      await supabaseFetch(`inventory?product_id=eq.${encodeURIComponent(body.product_id)}`, {
        method: "PATCH", token, prefer: "return=minimal", body: values
      });
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(403, { error: "Could not update inventory." });
  }
};
