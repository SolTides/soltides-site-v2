const { json, readJson } = require("./lib/http");
const { supabaseFetch } = require("./lib/supabase-rest");
const { loadCatalog, isAvailable, stockNumber, money } = require("./lib/catalog");
const { fetchBtcUsd } = require("./lib/btc");

const OWNER_EMAIL = process.env.OWNER_EMAIL || "info@soltides.co";
const BTC_ADDRESS = process.env.BITCOIN_ADDRESS || "3LTbxKU9GnB34SaREGuxXN2Abh7jGkD6ZY";
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || "Pw8XPLxAilF6_DuRg";
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || "service_sh9fwlv";
const EMAILJS_ORDER_TEMPLATE_ID = process.env.EMAILJS_ORDER_TEMPLATE_ID || "template_lq0eiz6";

function required(value) { return String(value || "").trim(); }

function buildProductDetails(lines) {
  return lines.map(line => `${line.name}\nQuantity: ${line.qty} ${line.qty === 1 ? "vial" : "vials"}\nUnit Price: $${money(line.unitPrice)}\nLine Total: $${money(line.lineTotal)}`).join("\n\n");
}

function buildProductDetailsInline(lines) {
  return lines.map(line => `${line.name} × ${line.qty} = $${money(line.lineTotal)}`).join(" | ");
}

function buildProductHtmlRows(lines) {
  return lines.map(line => `<tr><td style="padding:8px 0;border-bottom:1px solid #555;">${line.name}<br><span style="color:#999;">Qty: ${line.qty} • $${money(line.unitPrice)} each</span></td><td style="padding:8px 0;border-bottom:1px solid #555;text-align:right;">$${money(line.lineTotal)}</td></tr>`).join("");
}

async function sendEmail(params) {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_ORDER_TEMPLATE_ID) return false;
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_ORDER_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: params
    })
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("EmailJS send failed:", res.status, text);
    return false;
  }
  return true;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const body = readJson(event);
  if (!body) return json(400, { error: "Invalid JSON body" });

  try {
    const customer = body.customer || {};
    const name = required(customer.name);
    const email = required(customer.email).toLowerCase();
    const phone = required(customer.phone);
    const street = required(customer.street);
    const city = required(customer.city);
    const state = required(customer.state).toUpperCase();
    const zip = required(customer.zip);
    const address = `${street}\n${city}, ${state} ${zip}`.trim();
    const orderNotes = required(body.order_notes);

    if (!name || !email || !street || !city || !state || !zip) {
      return json(400, { error: "Please fill out name, email, and full shipping address." });
    }
    if (!Array.isArray(body.cart) || !body.cart.length) {
      return json(400, { error: "Your cart is empty." });
    }

    const catalog = await loadCatalog();
    const byId = new Map(catalog.map(p => [p.id || p.slug, p]));
    const totalQtyByProduct = new Map();
    const lines = [];

    for (const item of body.cart) {
      const id = required(item.id);
      const qty = Number(item.qty || 0);
      const mgLabel = required(item.mgLabel);
      if (!id || !Number.isInteger(qty) || qty <= 0 || qty > 50) {
        return json(400, { error: "Invalid cart quantity." });
      }
      const product = byId.get(id);
      if (!product || !isAvailable(product)) {
        return json(400, { error: "One or more products is unavailable." });
      }
      const option = (product.mg_options || []).find(o => String(o.label) === mgLabel) || (product.mg_options || [])[0];
      if (!option) return json(400, { error: "Invalid product option." });
      const prevQty = totalQtyByProduct.get(id) || 0;
      totalQtyByProduct.set(id, prevQty + qty);
      const unitPrice = Number(option.price || product.price || 0);
      const lineTotal = unitPrice * qty;
      const actual = product.actual ? ` — ${product.actual}` : "";
      lines.push({
        id,
        name: `${product.code || id}${actual}${option.label ? " " + option.label : ""}`.trim(),
        qty,
        unitPrice,
        lineTotal
      });
    }

    for (const [id, qty] of totalQtyByProduct.entries()) {
      const product = byId.get(id);
      const max = stockNumber(product);
      if (max !== null && qty > max) {
        return json(400, { error: "One or more items is not currently available at that quantity." });
      }
    }

    const totalUsd = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
    const btcUsd = await fetchBtcUsd();
    const totalBtc = Number((totalUsd / btcUsd).toFixed(8));
    const orderNumber = `ST-${Date.now().toString().slice(-8)}`;
    const orderDate = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const productDetails = buildProductDetails(lines);
    const productDetailsInline = buildProductDetailsInline(lines);
    const productHtmlRows = buildProductHtmlRows(lines);

    const savedOrders = await supabaseFetch("orders", {
      method: "POST",
      write: true,
      prefer: "return=representation",
      body: {
        order_number: orderNumber,
        customer_email: email,
        customer_name: name,
        customer_phone: phone,
        customer_address: address,
        order_notes: orderNotes,
        product_details: productDetails,
        total_usd: totalUsd,
        total_btc: totalBtc,
        bitcoin_address: BTC_ADDRESS,
        payment_status: "pending",
        shipping_status: "not_shipped"
      }
    });
    const savedOrder = savedOrders?.[0];
    if (!savedOrder?.id) throw new Error("Order saved but no order ID was returned.");

    if (lines.length) {
      await supabaseFetch("order_items", {
        method: "POST",
        write: true,
        prefer: "return=minimal",
        body: lines.map(line => ({
          order_id: savedOrder.id,
          product_name: line.name,
          quantity: line.qty,
          unit_price: Number(line.unitPrice.toFixed(2)),
          line_total: Number(line.lineTotal.toFixed(2))
        }))
      });
    }

    const firstLine = lines[0] || { name: "", qty: "", unitPrice: 0, lineTotal: 0 };
    const emailParams = {
      to_email: email,
      email,
      customer_email: email,
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      customer_city: city,
      customer_state: state,
      customer_zip: zip,
      order_number: orderNumber,
      order_id: orderNumber,
      order_date: orderDate,
      product_details: productDetails,
      ordered_items: productDetails,
      items_ordered: productDetails,
      order_items: productDetails,
      cart_items: productDetails,
      items: productDetailsInline,
      item_summary: productDetailsInline,
      product_summary: productDetailsInline,
      product_rows: productHtmlRows,
      items_html: productHtmlRows,
      order_items_html: productHtmlRows,
      cart_items_html: productHtmlRows,
      product_name: productDetailsInline,
      item_name: productDetailsInline,
      item_description: productDetailsInline,
      quantity: firstLine.qty,
      item_quantity: firstLine.qty,
      item_price: money(firstLine.lineTotal || totalUsd),
      price: money(firstLine.lineTotal || totalUsd),
      item_total: money(firstLine.lineTotal || totalUsd),
      line_total: money(firstLine.lineTotal || totalUsd),
      total_usd: money(totalUsd),
      total_btc: totalBtc.toFixed(8),
      bitcoin_address: BTC_ADDRESS,
      owner_email: OWNER_EMAIL,
      order_notes: orderNotes,
      customer_notes: orderNotes,
      customer_note: orderNotes,
      notes: orderNotes,
      orderNote: orderNotes,
      special_instructions: orderNotes,
      customer_message: orderNotes
    };

    const emailSent = await sendEmail(emailParams);

    return json(200, {
      ok: true,
      order_number: orderNumber,
      order_id: savedOrder.id,
      total_usd: totalUsd,
      total_btc: totalBtc.toFixed(8),
      bitcoin_address: BTC_ADDRESS,
      email_sent: emailSent
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Order could not be submitted." });
  }
};
