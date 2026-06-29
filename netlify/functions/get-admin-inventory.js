const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { assertAdmin } = require("./lib/admin-auth");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    await assertAdmin(event.headers);
    const inventory = await supabaseFetch("inventory?select=*&order=product_id", { write: true });
    let variants = [];
    try {
      variants = await supabaseFetch("product_variants?select=*&order=product_id,sort_order,option_label", { write: true });
    } catch (error) {
      if (!/product_variants|PGRST205|42P01/i.test(String(error?.message || error))) throw error;
    }
    return json(200, { inventory: inventory || [], variants: variants || [] });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 403, { error: error.message || "Could not load inventory." });
  }
};
