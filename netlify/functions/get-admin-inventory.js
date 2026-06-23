const { json } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing admin session." });
  try {
    const inventory = await supabaseFetch("inventory?select=*&order=product_id", { token });
    return json(200, { inventory: inventory || [] });
  } catch (error) {
    console.error(error);
    return json(403, { error: "Could not load inventory." });
  }
};
