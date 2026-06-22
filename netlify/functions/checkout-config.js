const { json } = require("./lib/http");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  return json(200, { turnstile_site_key: siteKey });
};
