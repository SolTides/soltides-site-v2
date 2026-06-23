import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";
import { esc, money } from "./utils.js";

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);
const fmtDate = v => v ? new Date(v).toLocaleString() : "";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please log in again.");
  return { Authorization: `Bearer ${token}` };
}

window.login = async function login(e) {
  e.preventDefault();
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const msg = document.getElementById("loginMessage");
  msg.textContent = "Logging in...";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "";
  await showAdmin();
};

window.signOut = async function signOut() {
  await supabase.auth.signOut();
  document.getElementById("loginBox").style.display = "block";
  document.getElementById("ordersBox").style.display = "none";
  document.getElementById("inventoryBox").style.display = "none";
  document.getElementById("topActions").style.display = "none";
};

async function showAdmin() {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("ordersBox").style.display = "block";
  document.getElementById("inventoryBox").style.display = "block";
  document.getElementById("topActions").style.display = "flex";
  await refreshAdmin();
}

window.refreshAdmin = async function refreshAdmin() {
  await Promise.all([loadInventory(), loadOrders()]);
};

window.loadInventory = async function loadInventory() {
  const grid = document.getElementById("inventoryGrid");
  const msg = document.getElementById("inventoryMessage");
  msg.textContent = "Loading inventory...";
  try {
    const res = await fetch(CONFIG.adminInventoryEndpoint, { headers: await authHeaders() });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not load inventory.");
    const rows = payload.inventory || [];
    msg.textContent = `${rows.length} products. Changes take effect on the store immediately.`;
    grid.innerHTML = rows.map(inventoryRow).join("");
  } catch (error) {
    msg.textContent = error.message;
  }
};

function inventoryRow(row) {
  return `<article class="inventory-row" data-product-id="${esc(row.product_id)}">
    <strong>${esc(row.product_id)}</strong>
    <label>On hand<input data-inventory="stock" type="number" min="0" step="1" value="${esc(row.stock)}"></label>
    <label>Availability<select data-inventory="availability_status">
      ${["auto", "out_of_stock", "coming_soon", "limited", "hidden"].map(v => `<option value="${v}" ${row.availability_status === v ? "selected" : ""}>${v.replaceAll("_", " ")}</option>`).join("")}
    </select></label>
    <label>Low at<input data-inventory="low_stock_threshold" type="number" min="0" step="1" value="${esc(row.low_stock_threshold)}"></label>
    <label class="inventory-check"><input data-inventory="enabled" type="checkbox" ${row.enabled ? "checked" : ""}> Store enabled</label>
    <label class="inventory-check"><input data-inventory="show_stock_count" type="checkbox" ${row.show_stock_count ? "checked" : ""}> Show count</label>
    <button class="admin-small-btn" type="button" onclick="saveInventory('${esc(row.product_id)}')">Save stock</button>
  </article>`;
}

window.saveInventory = async function saveInventory(productId) {
  const row = document.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
  if (!row) return;
  const body = {
    product_id: productId,
    stock: Number(row.querySelector('[data-inventory="stock"]').value),
    availability_status: row.querySelector('[data-inventory="availability_status"]').value,
    low_stock_threshold: Number(row.querySelector('[data-inventory="low_stock_threshold"]').value),
    enabled: row.querySelector('[data-inventory="enabled"]').checked,
    show_stock_count: row.querySelector('[data-inventory="show_stock_count"]').checked
  };
  try {
    const res = await fetch(CONFIG.updateInventoryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not update inventory.");
    await loadInventory();
  } catch (error) { alert(error.message); }
};

window.loadOrders = async function loadOrders() {
  const grid = document.getElementById("ordersGrid");
  const msg = document.getElementById("ordersMessage");
  msg.textContent = "Loading orders...";
  grid.innerHTML = "";

  try {
    const res = await fetch(CONFIG.adminOrdersEndpoint, { headers: await authHeaders() });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not load orders.");
    const data = payload.orders || [];
    if (!data.length) { msg.textContent = "No orders yet."; return; }
    msg.textContent = `${data.length} recent order${data.length === 1 ? "" : "s"}.`;
    grid.innerHTML = data.map(orderCard).join("");
  } catch (error) {
    msg.textContent = `${error.message} Make sure your logged-in user is in public.admin_users.`;
  }
};

function orderCard(o) {
  const items = (o.order_items || []).length
    ? (o.order_items || []).map(i => `${i.quantity} × ${i.product_name} — $${money(i.line_total)}`).join("\n")
    : (o.product_details || "No item rows saved.");

  return `
    <article class="admin-row" data-id="${esc(o.id)}">
      <div class="admin-row-head">
        <div>
          <div class="admin-order-num">${esc(o.order_number)}</div>
          <div class="admin-muted">${esc(fmtDate(o.created_at))}</div>
        </div>
        <div style="text-align:right;">
          <div class="admin-pill">${esc(o.payment_status || "pending")}</div>
          <div style="height:6px"></div>
          <div class="admin-pill">${esc((o.shipping_status || "not_shipped").replaceAll("_", " "))}</div>
        </div>
      </div>

      <div class="admin-columns">
        <div class="admin-box">
          <strong>Customer</strong>
          <div>${esc(o.customer_name)}</div>
          <div class="admin-muted">${esc(o.customer_email)}</div>
          <div class="admin-muted">${esc(o.customer_phone || "")}</div>
        </div>
        <div class="admin-box">
          <strong>Ship To</strong>
          <div class="admin-muted" style="white-space:pre-wrap;">${esc(o.customer_address)}</div>
        </div>
        <div class="admin-box">
          <strong>Total</strong>
          <div>$${esc(money(o.total_usd))}</div>
          <div class="admin-muted">${esc(o.total_btc)} BTC</div>
          <div class="admin-muted">Tracking: ${esc(o.tracking_number || "None")}</div>
        </div>
      </div>

      <div class="admin-columns" style="grid-template-columns: 1.2fr .8fr;">
        <div class="admin-box">
          <strong>Items</strong>
          <div class="admin-muted items-list">${esc(items)}</div>
        </div>
        <div class="admin-box">
          <strong>Customer Notes</strong>
          <div class="admin-muted" style="white-space:pre-wrap;">${esc(o.order_notes || "No notes.")}</div>
        </div>
      </div>

      <div class="status-controls">
        <select data-field="payment_status">
          ${["pending", "paid", "cancelled", "refunded"].map(v => `<option value="${v}" ${o.payment_status === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <select data-field="shipping_status">
          ${["not_shipped", "processing", "shipped", "delivered", "returned"].map(v => `<option value="${v}" ${o.shipping_status === v ? "selected" : ""}>${v.replaceAll("_", " ")}</option>`).join("")}
        </select>
        <input data-field="tracking_number" placeholder="Tracking number" value="${esc(o.tracking_number || "")}">
        <button class="admin-small-btn" type="button" onclick="saveOrderUpdate('${esc(o.id)}')">Save</button>
      </div>
    </article>`;
}

window.saveOrderUpdate = async function saveOrderUpdate(id) {
  const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const body = {
    id,
    payment_status: row.querySelector('[data-field="payment_status"]').value,
    shipping_status: row.querySelector('[data-field="shipping_status"]').value,
    tracking_number: row.querySelector('[data-field="tracking_number"]').value.trim() || null
  };

  try {
    const res = await fetch(CONFIG.updateOrderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not update order.");
    await loadOrders();
  } catch (error) {
    alert(error.message);
  }
};

supabase.auth.getSession().then(({ data }) => {
  if (data?.session) showAdmin();
});
