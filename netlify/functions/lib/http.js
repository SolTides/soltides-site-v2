function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function readJson(event) {
  try { return JSON.parse(event.body || "{}"); }
  catch (_) { return null; }
}

module.exports = { json, readJson };
