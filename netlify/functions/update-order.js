const { json, readJson } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { assertAdmin } = require("./lib/admin-auth");

const PAYMENT_STATUSES = new Set(["pending", "paid", "cancelled", "refunded"]);
const SHIPPING_STATUSES = new Set(["not_shipped", "processing", "shipped", "delivered", "returned"]);

function groupItems(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const productId = String(row.product_id || "").trim();
    if (!productId) continue;
    const optionLabel = String(row.option_label || "").trim();
    const key = `${productId}::${optionLabel}`;
    const current = grouped.get(key) || { product_id: productId, option_label: optionLabel, quantity: 0 };
    current.quantity += Number(row.quantity || 0);
    grouped.set(key, current);
  }
  return [...grouped.values()].filter(row => Number.isInteger(row.quantity) && row.quantity > 0);
}

async function restoreInventoryForOrder(orderId) {
  const orderItems = await supabaseFetch(`order_items?select=product_id,option_label,quantity&order_id=eq.${encodeURIComponent(orderId)}`, {
    write: true
  });
  const groupedItems = groupItems(orderItems);

  for (const item of groupedItems) {
    if (item.option_label) {
      const variants = await supabaseFetch(
        `product_variants?select=id,stock&product_id=eq.${encodeURIComponent(item.product_id)}&option_label=eq.${encodeURIComponent(item.option_label)}&limit=1`,
        { write: true }
      );
      if (Array.isArray(variants) && variants.length) {
        const variant = variants[0];
        await supabaseFetch(`product_variants?id=eq.${encodeURIComponent(variant.id)}`, {
          method: "PATCH",
          write: true,
          prefer: "return=minimal",
          body: {
            stock: Number(variant.stock || 0) + item.quantity,
            updated_at: new Date().toISOString()
          }
        });
        continue;
      }
    }

    const inventoryRows = await supabaseFetch(`inventory?select=product_id,stock&product_id=eq.${encodeURIComponent(item.product_id)}&limit=1`, {
      write: true
    });
    if (Array.isArray(inventoryRows) && inventoryRows.length) {
      const inventory = inventoryRows[0];
      await supabaseFetch(`inventory?product_id=eq.${encodeURIComponent(inventory.product_id)}`, {
        method: "PATCH",
        write: true,
        prefer: "return=minimal",
        body: {
          stock: Number(inventory.stock || 0) + item.quantity,
          updated_at: new Date().toISOString()
        }
      });
    }
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const body = readJson(event);
  if (!body?.id) return json(400, { error: "Missing order ID." });

  const update = {};
  if (body.payment_status) {
    if (!PAYMENT_STATUSES.has(body.payment_status)) return json(400, { error: "Invalid payment status." });
    update.payment_status = body.payment_status;
  }
  if (body.shipping_status) {
    if (!SHIPPING_STATUSES.has(body.shipping_status)) return json(400, { error: "Invalid shipping status." });
    update.shipping_status = body.shipping_status;
  }
  if (Object.prototype.hasOwnProperty.call(body, "tracking_number")) {
    if (String(body.tracking_number || "").length > 120) return json(400, { error: "Tracking number is too long." });
    update.tracking_number = body.tracking_number || null;
  }
  if (!Object.keys(update).length) return json(400, { error: "No valid order updates were supplied." });

  try {
    await assertAdmin(event.headers);

    const orders = await supabaseFetch(`orders?select=id,payment_status,shipping_status,tracking_number,inventory_expires_at,inventory_released_at&id=eq.${encodeURIComponent(body.id)}&limit=1`, {
      write: true
    });
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order?.id) return json(404, { error: "Order not found." });

    const nextPaymentStatus = update.payment_status || order.payment_status;
    const nextShippingStatus = update.shipping_status || order.shipping_status;
    const nextTrackingNumber = Object.prototype.hasOwnProperty.call(update, "tracking_number")
      ? update.tracking_number
      : order.tracking_number;

    const isNewCancellation = nextPaymentStatus === "cancelled"
      && order.payment_status !== "cancelled"
      && order.inventory_expires_at
      && !order.inventory_released_at;

    if (isNewCancellation) {
      await restoreInventoryForOrder(order.id);
    }

    const patch = {
      payment_status: nextPaymentStatus,
      shipping_status: nextShippingStatus,
      tracking_number: nextTrackingNumber || null,
      updated_at: new Date().toISOString()
    };

    if (isNewCancellation) {
      patch.inventory_released_at = new Date().toISOString();
      patch.inventory_release_reason = "cancelled";
    }

    await supabaseFetch(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: "PATCH",
      write: true,
      prefer: "return=minimal",
      body: patch
    });

    return json(200, {
      ok: true,
      order: {
        id: order.id,
        payment_status: patch.payment_status,
        shipping_status: patch.shipping_status,
        tracking_number: patch.tracking_number
      }
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 403, { error: error.message || "Could not update order." });
  }
};
