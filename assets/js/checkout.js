import { CONFIG } from "./config.js";
import { state, saveCart } from "./state.js";
import { calcTotal, closeCart, getCartLines, updateCart } from "./cart.js";
import { stockNumber } from "./products.js";
import { money } from "./utils.js";
import { fillCheckoutFields, getAccessToken, getCurrentUser, getProfile } from "./auth.js";

let turnstileRequired = false;
let checkoutReady = false;
let turnstileWidgetId = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.addEventListener("load", resolve, { once: true }); return; }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function initCheckoutProtection() {
  const form = document.getElementById("checkoutForm");
  const orderBtn = document.getElementById("orderButton");
  if (!form || !orderBtn) return;
  orderBtn.disabled = true;
  orderBtn.textContent = "Loading secure checkout...";
  try {
    const res = await fetch(CONFIG.checkoutConfigEndpoint, { cache: "no-store" });
    const data = await res.json();
    const siteKey = String(data.turnstile_site_key || "").trim();
    if (!siteKey) throw new Error("Checkout protection is not configured.");
    turnstileRequired = true;
    const box = document.createElement("div");
    box.id = "checkoutTurnstile";
    box.className = "checkout-turnstile";
    orderBtn.insertAdjacentElement("beforebegin", box);
    await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    turnstileWidgetId = window.turnstile.render(box, { sitekey: siteKey, theme: "dark" });
    checkoutReady = true;
    orderBtn.disabled = false;
    orderBtn.textContent = "Order";
  } catch (error) {
    console.error(error);
    orderBtn.disabled = true;
    orderBtn.textContent = "Checkout temporarily unavailable";
    const note = document.createElement("p");
    note.className = "small-note";
    note.textContent = "Secure checkout is not configured. Please contact info@soltides.co.";
    orderBtn.insertAdjacentElement("beforebegin", note);
  }
}

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

export async function submitOrder(event) {
  event?.preventDefault();
  if (!checkoutReady) { alert("Secure checkout is not ready yet."); return; }
  if (state.cart.length === 0) { alert("Your cart is empty."); return; }
  if (!state.btcUsd) { alert("BTC rate is still loading. Please wait a moment and try again."); return; }
  const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || "";
  if (turnstileRequired && !turnstileToken) { alert("Please complete the security check."); return; }

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
    const payload = {
      customer,
      order_notes: orderNotes,
      cart: cartLines.map(line => ({ id: line.id, mgLabel: line.mgLabel, qty: line.qty })),
      turnstile_token: turnstileToken,
      save_shipping: saveShipping
    };

    const res = await fetch(CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Order could not be submitted.");

    const emailSent = Boolean(data.email_sent);

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
    if (turnstileWidgetId !== null) window.turnstile?.reset?.(turnstileWidgetId);
    alert(err.message || "Order did not send. Please email info@soltides.co or try again.");
  } finally {
    if (orderBtn) {
      orderBtn.disabled = !checkoutReady;
      orderBtn.textContent = checkoutReady ? "Order" : "Checkout temporarily unavailable";
    }
  }
}
