const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing admin session." });
  try {
    const inventory = await supabaseFetch("inventory?select=*&order=product_id", { token });
    let variants = [];
    try {
      variants = await supabaseFetch("product_variants?select=*&order=product_id,sort_order,option_label", { token });
    } catch (error) {
      if (!/product_variants|PGRST205|42P01/i.test(String(error?.message || error))) throw error;
    }
    return json(200, { inventory: inventory || [], variants: variants || [] });
  } catch (error) {
    console.error(error);
    return json(403, { error: "Could not load inventory." });
  }
};
