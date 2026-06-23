const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const rows = await supabaseFetch("inventory?select=product_id,stock,availability_status,enabled,low_stock_threshold,show_stock_count&order=product_id", { write: true });
    const inventory = (rows || []).map(row => ({
      ...row,
      stock_status: !row.enabled ? "out_of_stock"
        : row.availability_status !== "auto" ? row.availability_status
        : row.stock === 0 ? "coming_soon"
        : row.stock <= row.low_stock_threshold ? "low_stock"
        : "in_stock"
    }));
    return json(200, { inventory });
  } catch (error) {
    console.error(error);
    return json(503, { error: "Inventory is temporarily unavailable." });
  }
};
