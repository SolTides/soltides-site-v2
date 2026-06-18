import { CONFIG } from "./config.js";
import { state, saveCart } from "./state.js";
import { calcTotal, closeCart, getCartLines, updateCart } from "./cart.js";
import { stockNumber } from "./products.js";

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
  if (orderBtn) { orderBtn.disabled = true; orderBtn.textContent = "Sending order..."; }

  try {
    const clientPreview = {
      total_usd: Number(calcTotal().toFixed(2)),
      btc_usd_rate: Number(state.btcUsd)
    };
    const payload = {
      customer,
      order_notes: orderNotes,
      cart: getCartLines().map(line => ({ id: line.id, mgLabel: line.mgLabel, qty: line.qty })),
      client_preview: clientPreview
    };

    const res = await fetch(CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Order could not be submitted.");

    alert(`Order received. Your order number is ${data.order_number}. Please check your email for payment instructions.${data.email_sent ? "" : " Note: the order was saved, but the email did not confirm."}`);
    state.cart = [];
    saveCart();
    updateCart();
    closeCart();
    document.getElementById("checkoutForm")?.reset();
  } catch (err) {
    console.error(err);
    alert(err.message || "Order did not send. Please email info@soltides.co or try again.");
  } finally {
    if (orderBtn) { orderBtn.disabled = false; orderBtn.textContent = "Order"; }
  }
}
