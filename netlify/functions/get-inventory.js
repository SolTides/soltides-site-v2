const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

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
    const rows = await supabaseFetch("inventory?select=product_id,stock,availability_status,enabled,low_stock_threshold,show_stock_count&order=product_id", { write: true });
    let variants = [];
    try {
      variants = await supabaseFetch("product_variants?select=product_id,option_label,price,stock,availability_status,enabled,low_stock_threshold,show_stock_count,sort_order&order=product_id,sort_order,option_label", { write: true });
    } catch (error) {
      if (!/product_variants|PGRST205|42P01/i.test(String(error?.message || error))) throw error;
    }
    return json(200, {
      inventory: (rows || []).map(withStockStatus),
      variants: (variants || []).map(withStockStatus)
    });
  } catch (error) {
    console.error(error);
    return json(503, { error: "Inventory is temporarily unavailable." });
  }
};
