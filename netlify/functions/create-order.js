const crypto = require("crypto");
const { json, readJson } = require("./lib/http");
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseFetch } = require("./lib/supabase-rest");
const { loadCatalog, money } = require("./lib/catalog");
const { fetchBtcUsd } = require("./lib/btc");

const OWNER_EMAIL = process.env.OWNER_EMAIL || "info@soltides.co";
const BTC_ADDRESS = process.env.BITCOIN_ADDRESS || "3LTbxKU9GnB34SaREGuxXN2Abh7jGkD6ZY";
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || "";
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || "";
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || "";
const EMAILJS_ORDER_TEMPLATE_ID = process.env.EMAILJS_ORDER_TEMPLATE_ID || "";

function required(value) { return String(value || "").trim(); }

async function verifyTurnstile(token, remoteIp) {
  const secret = required(process.env.TURNSTILE_SECRET_KEY);
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured.");
  const form = new URLSearchParams({ secret, response: required(token) });
  if (remoteIp) form.set("remoteip", remoteIp);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const result = await res.json().catch(() => ({}));
  return Boolean(res.ok && result.success);
}


async function userFromToken(token) {
  const clean = required(token);
  if (!clean) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${clean}`
    }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function saveProfileForUser(user, customer) {
  if (!user?.id) return;
  await supabaseFetch("profiles", {
    method: "POST",
    write: true,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      user_id: user.id,
      email: user.email,
      full_name: customer.name,
      phone: customer.phone,
      default_shipping_name: customer.name,
      default_shipping_address: customer.street,
      default_shipping_city: customer.city,
      default_shipping_state: customer.state,
      default_shipping_zip: customer.zip
    }
  });
}

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
  const requestBody = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_ORDER_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: params
  };
  if (EMAILJS_PRIVATE_KEY) requestBody.accessToken = EMAILJS_PRIVATE_KEY;
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
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
  if (Buffer.byteLength(event.body || "", "utf8") > 25000) return json(413, { error: "Request is too large." });
  const body = readJson(event);
  if (!body) return json(400, { error: "Invalid JSON body" });

  try {
    const remoteIp = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (!await verifyTurnstile(body.turnstile_token, remoteIp)) return json(400, { error: "Security check failed. Please try again." });
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Please enter a valid email address." });
    if (name.length > 120 || email.length > 254 || phone.length > 40 || street.length > 200 || city.length > 100 || state.length > 32 || zip.length > 20 || orderNotes.length > 1000) {
      return json(400, { error: "One or more checkout fields is too long." });
    }
    if (!Array.isArray(body.cart) || !body.cart.length) {
      return json(400, { error: "Your cart is empty." });
    }
    if (body.cart.length > 50) return json(400, { error: "Your cart contains too many line items." });

    const authToken = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
    const authUser = await userFromToken(authToken);

    const catalog = await loadCatalog();
    const byId = new Map(catalog.map(p => [p.id || p.slug, p]));
    const lines = [];

    for (const item of body.cart) {
      const id = required(item.id);
      const qty = Number(item.qty || 0);
      const mgLabel = required(item.mgLabel);
      if (!id || !Number.isInteger(qty) || qty <= 0 || qty > 50) {
        return json(400, { error: "Invalid cart quantity." });
      }
      const product = byId.get(id);
      if (!product || String(product.visible || "yes").toLowerCase() === "no") {
        return json(400, { error: "One or more products is unavailable." });
      }
      const option = (product.mg_options || []).find(o => String(o.label) === mgLabel) || (product.mg_options || [])[0];
      if (!option) return json(400, { error: "Invalid product option." });
      const unitPrice = Number(option.price || product.price || 0);
      const lineTotal = unitPrice * qty;
      const actual = product.actual ? ` — ${product.actual}` : "";
      lines.push({
        id,
        optionLabel: option.label || "",
        name: `${product.code || id}${actual}${option.label ? " " + option.label : ""}`.trim(),
        qty,
        unitPrice,
        lineTotal
      });
    }

    const totalUsd = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
    const btcUsd = await fetchBtcUsd();
    const totalBtc = Number((totalUsd / btcUsd).toFixed(8));
    const orderNumber = `ST-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const orderDate = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const productDetails = buildProductDetails(lines);
    const productDetailsInline = buildProductDetailsInline(lines);
    const productHtmlRows = buildProductHtmlRows(lines);

    const savedOrder = await supabaseFetch("rpc/create_order_with_inventory", {
      method: "POST",
      write: true,
      body: {
        p_order: {
          order_number: orderNumber,
          user_id: authUser?.id || null,
          customer_email: email,
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          order_notes: orderNotes,
          product_details: productDetails,
          total_usd: totalUsd,
          total_btc: totalBtc,
          bitcoin_address: BTC_ADDRESS
        },
        p_items: lines.map(line => ({
          product_id: line.id,
          option_label: line.optionLabel,
          product_name: line.name,
          quantity: line.qty,
          unit_price: Number(line.unitPrice.toFixed(2)),
          line_total: Number(line.lineTotal.toFixed(2))
        }))
      }
    });
    if (!savedOrder?.id) throw new Error("Order saved but no order ID was returned.");

    if (authUser?.id && body.save_shipping) {
      await saveProfileForUser(authUser, { name, email, phone, street, city, state, zip });
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
      payment_deadline: new Date(savedOrder.inventory_expires_at).toLocaleString("en-US", { timeZone: "America/Chicago" }),
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
      inventory_expires_at: savedOrder.inventory_expires_at,
      email_sent: emailSent
    });
  } catch (error) {
    console.error(error);
    if (String(error?.message || "").includes("inventory_unavailable:")) {
      return json(409, { error: "One or more items is no longer available at that quantity. Your card has been refreshed." });
    }
    return json(500, { error: "Order could not be submitted. Please try again." });
  }
};
