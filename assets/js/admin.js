import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";
import { esc, money } from "./utils.js";

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);
const fmtDate = v => v ? new Date(v).toLocaleString() : "";
const ADMIN_VERSION = "v6";
let currentAdminPage = "products";
let currentOrderFilter = "new";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please log in again.");
  return { Authorization: `Bearer ${token}` };
}

function withBust(url) {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${encodeURIComponent(ADMIN_VERSION)}&ts=${Date.now()}`;
}

async function fetchAdminJson(url, init = {}) {
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...(init.headers || {})
  };
  const res = await fetch(withBust(url), { ...init, cache: "no-store", headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Request failed.");
  return payload;
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
  document.getElementById("topActions").style.display = "flex";
  showAdminPage(currentAdminPage);
  await refreshAdmin();
}

window.refreshAdmin = async function refreshAdmin() {
  await Promise.all([loadInventory(), loadOrders()]);
};

window.showAdminPage = function showAdminPage(page) {
  currentAdminPage = page;
  document.getElementById("inventoryBox").style.display = page === "products" ? "block" : "none";
  document.getElementById("ordersBox").style.display = page === "orders" ? "block" : "none";
  document.querySelectorAll("[data-admin-page]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.adminPage === page);
  });
};

window.setOrderFilter = async function setOrderFilter(filter) {
  currentOrderFilter = filter;
  document.querySelectorAll("[data-order-filter]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.orderFilter === filter);
  });
  await loadOrders();
};

window.loadInventory = async function loadInventory() {
  const grid = document.getElementById("inventoryGrid");
  const msg = document.getElementById("inventoryMessage");
  msg.textContent = "Loading inventory...";
  grid.innerHTML = "";
  try {
    const payload = await fetchAdminJson(CONFIG.adminInventoryEndpoint, { headers: await authHeaders() });
    const rows = payload.inventory || [];
    const variants = payload.variants || [];
    const variantsByProduct = new Map();
    for (const variant of variants) {
      const list = variantsByProduct.get(variant.product_id) || [];
      list.push(variant);
      variantsByProduct.set(variant.product_id, list);
    }
    msg.textContent = `${rows.length} products and ${variants.length} vial sizes. Changes take effect on the store immediately.`;
    grid.innerHTML = `${variantCreator(rows)}${rows.map(row => `
      <section class="inventory-product">
        <div class="inventory-product-head"><h3>${esc(row.product_id)}</h3><span>${(variantsByProduct.get(row.product_id) || []).length} vial size${(variantsByProduct.get(row.product_id) || []).length === 1 ? "" : "s"}</span></div>
        ${inventoryRow(row)}
        ${(variantsByProduct.get(row.product_id) || []).map(variantRow).join("") || '<p class="admin-muted inventory-empty">No separate vial-size stock yet. This product uses fallback stock.</p>'}
      </section>`).join("")}`;
    grid.querySelectorAll('[data-action="save-inventory"]').forEach(button => button.addEventListener("click", () => saveInventoryRow(button)));
    document.getElementById("addVariantForm")?.addEventListener("submit", addVariant);
  } catch (error) {
    msg.textContent = `${error.message} Admin ${ADMIN_VERSION}.`;
  }
};

function inventoryRow(row) {
  return `<article class="inventory-row inventory-base" data-kind="base" data-product-id="${esc(row.product_id)}" data-option-label="">
    <strong>Product settings</strong>
    <label>Fallback stock<input data-inventory="stock" type="number" min="0" step="1" value="${esc(row.stock)}"></label>
    <label>Availability<select data-inventory="availability_status">
      ${["auto", "out_of_stock", "coming_soon", "limited", "hidden"].map(v => `<option value="${v}" ${row.availability_status === v ? "selected" : ""}>${v.replaceAll("_", " ")}</option>`).join("")}
    </select></label>
    <label>Low at<input data-inventory="low_stock_threshold" type="number" min="0" step="1" value="${esc(row.low_stock_threshold)}"></label>
    <label class="inventory-check"><input data-inventory="enabled" type="checkbox" ${row.enabled ? "checked" : ""}> Store enabled</label>
    <label class="inventory-check"><input data-inventory="show_stock_count" type="checkbox" ${row.show_stock_count ? "checked" : ""}> Show count</label>
    <button class="admin-small-btn" data-action="save-inventory" type="button">Save product</button>
  </article>`;
}

function variantRow(row) {
  return `<article class="inventory-row inventory-variant" data-kind="variant" data-product-id="${esc(row.product_id)}" data-option-label="${esc(row.option_label)}">
    <strong>${esc(row.option_label)}</strong>
    <label>On hand<input data-inventory="stock" type="number" min="0" step="1" value="${esc(row.stock)}"></label>
    <label>Price ($)<input data-inventory="price" type="number" min="0" step="0.01" value="${row.price === null ? "" : esc(row.price)}" placeholder="Required to sell"></label>
    <label>Availability<select data-inventory="availability_status">
      ${["auto", "out_of_stock", "coming_soon", "limited", "hidden"].map(v => `<option value="${v}" ${row.availability_status === v ? "selected" : ""}>${v.replaceAll("_", " ")}</option>`).join("")}
    </select></label>
    <label>Low at<input data-inventory="low_stock_threshold" type="number" min="0" step="1" value="${esc(row.low_stock_threshold)}"></label>
    <label class="inventory-check"><input data-inventory="enabled" type="checkbox" ${row.enabled ? "checked" : ""}> Vial enabled</label>
    <label class="inventory-check"><input data-inventory="show_stock_count" type="checkbox" ${row.show_stock_count ? "checked" : ""}> Show count</label>
    <label>Order<input data-inventory="sort_order" type="number" step="1" value="${esc(row.sort_order || 0)}"></label>
    <button class="admin-small-btn" data-action="save-inventory" type="button">Save vial</button>
  </article>`;
}

function variantCreator(products) {
  return `<form class="inventory-add" id="addVariantForm">
    <div><strong>Add a vial size</strong><p class="admin-muted">Add another mg option without changing website code.</p></div>
    <label>Product<select name="product_id" required>${products.map(row => `<option value="${esc(row.product_id)}">${esc(row.product_id)}</option>`).join("")}</select></label>
    <label>Vial size<input name="option_label" required maxlength="80" placeholder="Example: 20mg"></label>
    <label>Price ($)<input name="price" type="number" min="0" step="0.01" required></label>
    <label>Starting stock<input name="stock" type="number" min="0" step="1" value="0" required></label>
    <label>Display order<input name="sort_order" type="number" step="1" value="0"></label>
    <button class="admin-small-btn" type="submit">Add vial size</button>
  </form>`;
}

async function saveInventoryRow(button) {
  const row = button.closest(".inventory-row");
  if (!row) return;
  const isVariant = row.dataset.kind === "variant";
  const body = {
    product_id: row.dataset.productId,
    option_label: row.dataset.optionLabel || "",
    stock: Number(row.querySelector('[data-inventory="stock"]').value),
    price: isVariant ? row.querySelector('[data-inventory="price"]').value : undefined,
    availability_status: row.querySelector('[data-inventory="availability_status"]').value,
    low_stock_threshold: Number(row.querySelector('[data-inventory="low_stock_threshold"]').value),
    enabled: row.querySelector('[data-inventory="enabled"]').checked,
    show_stock_count: row.querySelector('[data-inventory="show_stock_count"]').checked,
    sort_order: isVariant ? Number(row.querySelector('[data-inventory="sort_order"]').value) : 0
  };
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const res = await fetch(CONFIG.updateInventoryEndpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not update inventory.");
    await loadInventory();
  } catch (error) {
    button.disabled = false;
    button.textContent = isVariant ? "Save vial" : "Save product";
    alert(error.message);
  }
}

async function addVariant(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const body = {
    create: true,
    product_id: String(data.get("product_id") || "").trim(),
    option_label: String(data.get("option_label") || "").trim(),
    price: data.get("price"),
    stock: Number(data.get("stock")),
    sort_order: Number(data.get("sort_order") || 0),
    availability_status: "auto",
    low_stock_threshold: 5,
    enabled: true,
    show_stock_count: false
  };
  button.disabled = true;
  button.textContent = "Adding...";
  try {
    const res = await fetch(CONFIG.updateInventoryEndpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Could not add vial size.");
    await loadInventory();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Add vial size";
    alert(error.message);
  }
}

window.loadOrders = async function loadOrders() {
  const grid = document.getElementById("ordersGrid");
  const msg = document.getElementById("ordersMessage");
  msg.textContent = "Loading orders...";
  grid.innerHTML = "";

  try {
    const payload = await fetchAdminJson(CONFIG.adminOrdersEndpoint, { headers: await authHeaders() });
    const data = payload.orders || [];
    const newOrders = data.filter(order => order.payment_status !== "paid");
    const paidOrders = data.filter(order => order.payment_status === "paid");
    const visible = currentOrderFilter === "paid" ? paidOrders : currentOrderFilter === "new" ? newOrders : data;
    if (!visible.length) {
      msg.textContent = currentOrderFilter === "paid"
        ? "No paid orders yet."
        : currentOrderFilter === "new"
          ? "No new orders right now."
          : "No orders yet.";
      return;
    }
    const label = currentOrderFilter === "paid" ? "paid" : currentOrderFilter === "new" ? "new" : "recent";
    msg.textContent = `${visible.length} ${label} order${visible.length === 1 ? "" : "s"}.`;
    grid.innerHTML = visible.map(orderCard).join("");
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
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...(await authHeaders()) },
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
