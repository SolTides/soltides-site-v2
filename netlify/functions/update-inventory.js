const { json, readJson } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { assertAdmin } = require("./lib/admin-auth");

const STATUSES = new Set(["auto", "out_of_stock", "coming_soon", "limited", "hidden"]);

function isMissingInventoryPriceColumn(error) {
  return /inventory\.price|column\s+price|price does not exist|PGRST/i.test(String(error?.message || error));
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const body = readJson(event);
  const stock = Number(body?.stock);
  const threshold = Number(body?.low_stock_threshold);
  const optionLabel = String(body?.option_label || "").trim();
  const isVariant = Boolean(optionLabel);
  const rawPrice = body?.price;
  const price = rawPrice === "" || rawPrice === null || rawPrice === undefined ? null : Number(rawPrice);
  if (!body?.product_id || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0 || !STATUSES.has(body.availability_status)
      || (price !== null && (!Number.isFinite(price) || price < 0))) {
    return json(400, { error: "Invalid inventory values." });
  }
  try {
    await assertAdmin(event.headers);
    const values = {
      product_id: body.product_id,
      stock,
      price,
      availability_status: body.availability_status,
      enabled: Boolean(body.enabled),
      low_stock_threshold: threshold,
      show_stock_count: Boolean(body.show_stock_count),
      updated_at: new Date().toISOString()
    };

    if (isVariant) {
      values.sort_order = Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : 0;
      await supabaseFetch("product_variants?on_conflict=product_id,option_label", {
        method: "POST",
        write: true,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { ...values, option_label: optionLabel }
      });
    } else {
      try {
        await supabaseFetch("inventory?on_conflict=product_id", {
          method: "POST",
          write: true,
          prefer: "resolution=merge-duplicates,return=minimal",
          body: values
        });
      } catch (error) {
        if (!isMissingInventoryPriceColumn(error)) throw error;
        const { price: _ignoredPrice, ...legacyValues } = values;
        await supabaseFetch("inventory?on_conflict=product_id", {
          method: "POST",
          write: true,
          prefer: "resolution=merge-duplicates,return=minimal",
          body: legacyValues
        });
      }
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(403, { error: "Could not update inventory." });
  }
};
