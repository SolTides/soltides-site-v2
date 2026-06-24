import { state, saveCart } from "./state.js";
import { esc, money } from "./utils.js";
import { imageSrc, isAvailable, isOptionAvailable, optionStockNumber, productOption, stockNumber } from "./products.js";

export function openCart() {
  document.getElementById("cartPanel")?.classList.add("open");
}

export function closeCart() {
  document.getElementById("cartPanel")?.classList.remove("open");
}

export function addToCart(id, qty = 1, mgLabel = null, unitPrice = null) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  const label = mgLabel || p.mg_options[0].label;
  const option = productOption(p, label);
  if (!isAvailable(p) || (p.inventory_variants && !isOptionAvailable(option))) { alert("This vial size is currently unavailable."); return; }
  const price = unitPrice ?? option?.price ?? p.mg_options[0].price;
  const key = `${id}|${label}`;
  const maxStock = p.inventory_variants ? optionStockNumber(option) : stockNumber(p);
  const currentQty = state.cart.filter(i => p.inventory_variants ? i.key === key : i.id === id).reduce((s, i) => s + i.qty, 0);
  if (maxStock !== null && currentQty + qty > maxStock) {
    alert("That quantity is not currently available. Please lower the quantity or contact SolTides.");
    return;
  }
  const found = state.cart.find(i => i.key === key);
  if (found) found.qty += qty;
  else state.cart.push({ key, id, qty, mgLabel: label, unitPrice: price });
  saveCart(); updateCart(); openCart();
}

export function removeFromCart(key) {
  state.cart = state.cart.filter(i => i.key !== key);
  saveCart(); updateCart();
}

export function changeQty(key, amount) {
  const item = state.cart.find(i => i.key === key);
  if (!item) return;
  const p = state.products.find(x => x.id === item.id);
  const option = productOption(p, item.mgLabel);
  const maxStock = p?.inventory_variants ? optionStockNumber(option) : stockNumber(p || {});
  if (amount > 0 && maxStock !== null) {
    const currentQty = state.cart.filter(i => p?.inventory_variants ? i.key === item.key : i.id === item.id).reduce((s, i) => s + i.qty, 0);
    if (currentQty + amount > maxStock) {
      alert("That quantity is not currently available. Please lower the quantity or contact SolTides.");
      return;
    }
  }
  item.qty += amount;
  if (item.qty <= 0) removeFromCart(key);
  else { saveCart(); updateCart(); }
}

export function calcTotal() {
  return state.cart.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
}

export function getCartLines() {
  return state.cart.map(item => {
    const p = state.products.find(x => x.id === item.id) || {};
    const code = p.code || item.id || "Product";
    const actual = p.actual ? ` — ${p.actual}` : "";
    const mg = item.mgLabel || "";
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const lineTotal = unitPrice * qty;
    return {
      id: item.id,
      key: item.key,
      code,
      actual: p.actual || "",
      mgLabel: mg,
      qty,
      unitPrice,
      lineTotal,
      name: `${code}${actual}${mg ? " " + mg : ""}`.trim()
    };
  });
}

export function updateCart() {
  const count = document.getElementById("cartCount");
  if (count) count.textContent = state.cart.reduce((s, i) => s + i.qty, 0);
  const items = document.getElementById("cartItems");
  if (!items) return;
  if (state.cart.length === 0) {
    items.innerHTML = '<p class="muted">Your cart is empty.</p>';
  } else {
    items.innerHTML = state.cart.map(item => {
      const p = state.products.find(x => x.id === item.id);
      if (!p) return "";
      return `<div class="cart-item"><img src="${esc(imageSrc(p))}" alt="${esc(p.code)}"><div><strong>${esc(p.code)} — ${esc(p.actual)}</strong><div class="muted">${esc(item.mgLabel)} • $${money(item.unitPrice)} each</div><div class="qty"><button onclick="changeQty('${esc(item.key)}',-1)">−</button><span>${item.qty}</span><button onclick="changeQty('${esc(item.key)}',1)">+</button></div></div><button class="close-btn" onclick="removeFromCart('${esc(item.key)}')">×</button></div>`;
    }).join("");
  }
  const total = calcTotal();
  const usd = document.getElementById("usdTotal");
  if (usd) usd.textContent = `$${money(total)}`;
  const btc = document.getElementById("btcTotal");
  if (btc) btc.textContent = (state.btcUsd && total > 0) ? `${(total / state.btcUsd).toFixed(8)} BTC` : "BTC rate loading...";
}
