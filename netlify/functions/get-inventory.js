const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { loadCatalog } = require("./lib/catalog");

function isMissingInventoryPriceColumn(error) {
  return /inventory\.price|column\s+price|price does not exist|PGRST/i.test(String(error?.message || error));
}

async function readInventoryRows() {
  try {
    return await supabaseFetch("inventory?select=product_id,price,stock,availability_status,enabled,low_stock_threshold,show_stock_count&order=product_id", { write: true });
  } catch (error) {
    if (!isMissingInventoryPriceColumn(error)) throw error;
    return await supabaseFetch("inventory?select=product_id,stock,availability_status,enabled,low_stock_threshold,show_stock_count&order=product_id", { write: true });
  }
}

function withStockStatus(row) {
  return {
    ...row,
    stock_status: !row.enabled ? "out_of_stock"
      : row.availability_status !== "auto" ? row.availability_status
      : row.stock === 0 ? "coming_soon"
      : row.stock <= row.low_stock_threshold ? "low_stock"
      : "in_stock"
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const rows = await readInventoryRows();
    const catalog = await loadCatalog();
    let variants = [];
    try {
      variants = await supabaseFetch("product_variants?select=product_id,option_label,price,stock,availability_status,enabled,low_stock_threshold,show_stock_count,sort_order&order=product_id,sort_order,option_label", { write: true });
    } catch (error) {
      if (!/product_variants|PGRST205|42P01/i.test(String(error?.message || error))) throw error;
    }
    const byId = new Map((rows || []).map(row => [String(row.product_id), row]));
    for (const product of catalog || []) {
      const productId = String(product.id || product.slug || "").trim();
      if (!productId || byId.has(productId)) continue;
      byId.set(productId, {
        product_id: productId,
        price: Number(product.price || 0),
        stock: 0,
        availability_status: "coming_soon",
        enabled: true,
        low_stock_threshold: 5,
        show_stock_count: false
      });
    }
    return json(200, {
      inventory: [...byId.values()].map(withStockStatus),
      variants: (variants || []).map(withStockStatus)
    });
  } catch (error) {
    console.error(error);
    return json(503, { error: "Inventory is temporarily unavailable." });
  }
};
