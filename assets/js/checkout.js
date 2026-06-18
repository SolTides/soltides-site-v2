import { CONFIG } from "./config.js";
import { state, saveCart } from "./state.js";
import { calcTotal, closeCart, getCartLines, updateCart } from "./cart.js";
import { stockNumber } from "./products.js";
import { money } from "./utils.js";
import { fillCheckoutFields, getAccessToken, getCurrentUser, getProfile } from "./auth.js";

export async function fetchBTC() {
  const rate = document.getElementById("btcRate");
  const sources = [
    { name: "Coinbase", url: "https://api.coinbase.com/v2/prices/BTC-USD/spot", parse: d => Number(d?.data?.amount) },
    { name: "Binance US", url: "https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT", parse: d => Number(d?.price) },
    { name: "Kraken", url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD", parse: d => Number(d?.result?.XXBTZUSD?.c?.[0]) }
  ];
  for (const s of sources) {
    try {
      const res = await fetch(s.url, { cache: "no-store" });
      const data = await res.json();
      const price = s.parse(data);
      if (Number.isFinite(price) && price > 0) {
        state.btcUsd = price;
        if (rate) rate.textContent = `Live rate: 1 BTC = $${state.btcUsd.toLocaleString()} USD`;
        updateCart();
        return;
      }
    } catch (e) {
      console.warn("BTC source failed", s.name, e);
    }
  }
  state.btcUsd = null;
  if (rate) rate.textContent = "BTC rate unavailable. Refresh before checkout.";
  updateCart();
}

function fieldValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function shippingAddress() {
  const street = fieldValue("customerAddress");
  const city = fieldValue("customerCity");
  const stateVal = fieldValue("customerState");
  const zip = fieldValue("customerZip");
  return `${street}\n${city}, ${stateVal} ${zip}`.trim();
}

function orderReceivedUrl(orderNumber) {
  const prefix = document.body.dataset.pathPrefix || "";
  return `${prefix}order-received.html?order=${encodeURIComponent(orderNumber || "")}`;
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

async function sendClientOrderEmail({ data, customer, orderNotes, cartLines }) {
  if (!window.emailjs || !CONFIG.emailjsPublicKey || !CONFIG.emailjsServiceId || !CONFIG.emailjsOrderTemplateId) {
    console.warn("EmailJS browser SDK is not available.");
    return false;
  }

  try {
    if (!window.__soltidesEmailJsReady) {
      window.emailjs.init({ publicKey: CONFIG.emailjsPublicKey });
      window.__soltidesEmailJsReady = true;
    }

    const orderNumber = data.order_number || "";
    const totalUsd = Number(data.total_usd || calcTotal() || 0);
    const totalBtc = String(data.total_btc || "");
    const orderDate = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const productDetails = buildProductDetails(cartLines);
    const productDetailsInline = buildProductDetailsInline(cartLines);
    const productHtmlRows = buildProductHtmlRows(cartLines);
    const firstLine = cartLines[0] || { qty: "", lineTotal: totalUsd };

    const params = {
      to_email: customer.email,
      email: customer.email,
      customer_email: customer.email,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_city: customer.city,
      customer_state: customer.state,
      customer_zip: customer.zip,
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
      total_btc: totalBtc,
      bitcoin_address: data.bitcoin_address || CONFIG.btcAddress,
      owner_email: CONFIG.ownerEmail,
      order_notes: orderNotes,
      customer_notes: orderNotes,
      customer_note: orderNotes,
      notes: orderNotes,
      orderNote: orderNotes,
      special_instructions: orderNotes,
      customer_message: orderNotes
    };

    await window.emailjs.send(CONFIG.emailjsServiceId, CONFIG.emailjsOrderTemplateId, params);
    return true;
  } catch (error) {
    console.warn("EmailJS browser fallback failed", error);
    return false;
  }
}


export async function initCheckoutAccount() {
  const form = document.getElementById("checkoutForm");
  if (!form || document.getElementById("checkoutAccountBox")) return;

  const grid = form.querySelector(".checkout-grid");
  const box = document.createElement("div");
  box.id = "checkoutAccountBox";
  box.className = "checkout-account-box";
  grid?.insertAdjacentElement("beforebegin", box);

  try {
    const user = await getCurrentUser();
    if (!user) {
      box.innerHTML = `<strong>Have an account?</strong><span> Sign in to use saved shipping. Guest checkout still works.</span> <a href="${state.pathPrefix}account.html">Account Login</a>`;
      return;
    }
    const profile = await getProfile();
    fillCheckoutFields(profile, user);
    box.innerHTML = `
      <div><strong>Signed in as ${user.email}</strong><br><span class="small-note">Saved shipping will prefill when available. You can still edit it before ordering.</span></div>
      <label class="checkout-save-label"><input id="saveShippingInfo" type="checkbox" checked> Save this shipping info to my account</label>`;
  } catch (error) {
    console.warn("Checkout account load failed", error);
    box.innerHTML = `<strong>Account optional.</strong><span> Guest checkout still works.</span> <a href="${state.pathPrefix}account.html">Account Login</a>`;
  }
}

export async function submitOrder() {
  if (state.cart.length === 0) { alert("Your cart is empty."); return; }
  if (!state.btcUsd) { alert("BTC rate is still loading. Please wait a moment and try again."); return; }

  const customer = {
    name: fieldValue("customerName"),
    email: fieldValue("customerEmail"),
    phone: fieldValue("customerPhone"),
    street: fieldValue("customerAddress"),
    city: fieldValue("customerCity"),
    state: fieldValue("customerState"),
    zip: fieldValue("customerZip"),
    address: shippingAddress()
  };
  const orderNotes = document.getElementById("orderNotes")?.value?.trim() || "";

  if (!customer.name || !customer.email || !customer.street || !customer.city || !customer.state || !customer.zip) {
    alert("Please fill out name, email, and full shipping address.");
    return;
  }

  const overStock = state.cart.find(item => {
    const p = state.products.find(x => x.id === item.id);
    const max = stockNumber(p || {});
    return max !== null && state.cart.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0) > max;
  });
  if (overStock) {
    alert("One or more items in your cart is not currently available at that quantity. Please adjust the quantity.");
    return;
  }

  const orderBtn = document.getElementById("orderButton");
  if (orderBtn) { orderBtn.disabled = true; orderBtn.textContent = "Submitting order..."; }

  try {
    const authToken = await getAccessToken().catch(() => null);
    const saveShipping = Boolean(document.getElementById("saveShippingInfo")?.checked);
    const cartLines = getCartLines();
    const clientPreview = {
      total_usd: Number(calcTotal().toFixed(2)),
      btc_usd_rate: Number(state.btcUsd)
    };
    const payload = {
      customer,
      order_notes: orderNotes,
      cart: cartLines.map(line => ({ id: line.id, mgLabel: line.mgLabel, qty: line.qty })),
      client_preview: clientPreview,
      auth_token: authToken,
      save_shipping: saveShipping
    };

    const res = await fetch(CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Order could not be submitted.");

    let emailSent = Boolean(data.email_sent);
    if (!emailSent) {
      emailSent = await sendClientOrderEmail({ data, customer, orderNotes, cartLines });
    }

    const lastOrder = {
      order_number: data.order_number,
      order_id: data.order_id,
      customer,
      order_notes: orderNotes,
      items: cartLines,
      total_usd: data.total_usd,
      total_btc: data.total_btc,
      bitcoin_address: data.bitcoin_address,
      email_sent: emailSent
    };
    localStorage.setItem("soltides_last_order", JSON.stringify(lastOrder));

    state.cart = [];
    saveCart();
    updateCart();
    closeCart();
    document.getElementById("checkoutForm")?.reset();
    if (!emailSent) {
      alert(`Order was saved, but the confirmation email did not send automatically. Your order number is ${data.order_number}. Please save this page or email info@soltides.co.`);
    }
    window.location.href = orderReceivedUrl(data.order_number);
  } catch (err) {
    console.error(err);
    alert(err.message || "Order did not send. Please email info@soltides.co or try again.");
  } finally {
    if (orderBtn) { orderBtn.disabled = false; orderBtn.textContent = "Order"; }
  }
}
