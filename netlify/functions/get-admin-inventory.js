const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { assertAdmin } = require("./lib/admin-auth");
const { loadCatalog } = require("./lib/catalog");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    await assertAdmin(event.headers);
    const inventory = await supabaseFetch("inventory?select=*&order=product_id", { write: true });
    const catalog = await loadCatalog();
    let variants = [];
    try {
      variants = await supabaseFetch("product_variants?select=*&order=product_id,sort_order,option_label", { write: true });
    } catch (error) {
      if (!/product_variants|PGRST205|42P01/i.test(String(error?.message || error))) throw error;
    }
    const byId = new Map((inventory || []).map(row => [String(row.product_id), row]));
    for (const product of catalog || []) {
      const productId = String(product.id || product.slug || "").trim();
      if (!productId || byId.has(productId)) continue;
      byId.set(productId, {
        product_id: productId,
        stock: 0,
        price: null,
        availability_status: "auto",
        enabled: true,
        low_stock_threshold: 5,
        show_stock_count: false
      });
    }
    return json(200, { inventory: [...byId.values()].sort((a, b) => String(a.product_id).localeCompare(String(b.product_id))), variants: variants || [] });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 403, { error: error.message || "Could not load inventory." });
  }
};
