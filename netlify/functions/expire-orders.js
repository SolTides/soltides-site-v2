const { supabaseFetch } = require("./lib/supabase-rest");

exports.handler = async function handler() {
  try {
    const expired = await supabaseFetch("rpc/expire_pending_orders", { method: "POST", write: true, body: {} });
    console.log(`Expired ${Number(expired || 0)} pending order reservation(s).`);
    return { statusCode: 200 };
  } catch (error) {
    console.error("Could not expire pending orders", error);
    return { statusCode: 500 };
  }
};
