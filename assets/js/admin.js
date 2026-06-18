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
  document.getElementById("topActions").style.display = "none";
};

async function showAdmin() {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("ordersBox").style.display = "block";
  document.getElementById("topActions").style.display = "flex";
  await loadOrders();
}

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
    msg.textContent = `${error.message} Admin access required.`;
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
