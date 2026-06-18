import { fetchMyOrders, getCurrentUser, getProfile, saveProfile, signIn, signOut, signUp } from "./auth.js";
import { esc, money } from "./utils.js";

const $ = id => document.getElementById(id);
const fmtDate = value => value ? new Date(value).toLocaleString() : "";

function showMessage(id, text, tone = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = `account-message ${tone}`.trim();
}

function setView(isLoggedIn) {
  const signedOut = $("signedOutPanel");
  const signedIn = $("signedInPanel");
  if (signedOut) signedOut.style.display = isLoggedIn ? "none" : "grid";
  if (signedIn) signedIn.style.display = isLoggedIn ? "block" : "none";
}

function profileFromForm() {
  return {
    full_name: $("profileName")?.value.trim() || "",
    phone: $("profilePhone")?.value.trim() || "",
    default_shipping_name: $("shippingName")?.value.trim() || $("profileName")?.value.trim() || "",
    default_shipping_address: $("shippingAddress")?.value.trim() || "",
    default_shipping_city: $("shippingCity")?.value.trim() || "",
    default_shipping_state: $("shippingState")?.value.trim().toUpperCase() || "",
    default_shipping_zip: $("shippingZip")?.value.trim() || ""
  };
}

function fillProfileForm(profile, user) {
  $("accountEmail").textContent = user?.email || "";
  $("profileName").value = profile?.full_name || profile?.default_shipping_name || "";
  $("profilePhone").value = profile?.phone || "";
  $("shippingName").value = profile?.default_shipping_name || profile?.full_name || "";
  $("shippingAddress").value = profile?.default_shipping_address || "";
  $("shippingCity").value = profile?.default_shipping_city || "";
  $("shippingState").value = profile?.default_shipping_state || "";
  $("shippingZip").value = profile?.default_shipping_zip || "";
}

function orderCard(order) {
  const items = (order.order_items || []).length
    ? order.order_items.map(i => `${i.quantity} × ${i.product_name} — $${money(i.line_total)}`).join("\n")
    : (order.product_details || "No item rows saved.");
  return `
    <article class="account-order-card">
      <div class="account-order-head">
        <div>
          <strong>${esc(order.order_number)}</strong>
          <div class="muted">${esc(fmtDate(order.created_at))}</div>
        </div>
        <div class="account-pills">
          <span>${esc(order.payment_status || "pending")}</span>
          <span>${esc(String(order.shipping_status || "not_shipped").replaceAll("_", " "))}</span>
        </div>
      </div>
      <div class="account-order-grid">
        <div><strong>Total</strong><div>$${money(order.total_usd)}</div><div class="muted">${esc(order.total_btc)} BTC</div></div>
        <div><strong>Tracking</strong><div class="muted">${esc(order.tracking_number || "Not added yet")}</div></div>
      </div>
      <div class="account-order-items">${esc(items)}</div>
    </article>`;
}

async function loadOrders() {
  const box = $("orderHistory");
  if (!box) return;
  box.innerHTML = "<p class='muted'>Loading orders...</p>";
  try {
    const orders = await fetchMyOrders();
    if (!orders.length) {
      box.innerHTML = "<p class='muted'>No account orders yet.</p>";
      return;
    }
    box.innerHTML = orders.map(orderCard).join("");
  } catch (error) {
    box.innerHTML = `<p class='muted'>${esc(error.message || "Could not load orders.")}</p>`;
  }
}

async function refreshAccount() {
  const user = await getCurrentUser();
  setView(Boolean(user));
  if (!user) return;
  try {
    const profile = await getProfile();
    fillProfileForm(profile, user);
    await loadOrders();
  } catch (error) {
    showMessage("profileMessage", error.message || "Could not load profile.", "error");
  }
}

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("loginMessage", "Signing in...");
  try {
    await signIn($("loginEmail").value.trim(), $("loginPassword").value);
    showMessage("loginMessage", "");
    await refreshAccount();
  } catch (error) {
    showMessage("loginMessage", error.message || "Login failed.", "error");
  }
});

$("signupForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("signupMessage", "Creating account...");
  try {
    const password = $("signupPassword").value;
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    await signUp($("signupEmail").value.trim(), password);
    showMessage("signupMessage", "Account created. Check your email if confirmation is required before logging in.", "success");
  } catch (error) {
    showMessage("signupMessage", error.message || "Could not create account.", "error");
  }
});

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("profileMessage", "Saving...");
  try {
    await saveProfile(profileFromForm());
    showMessage("profileMessage", "Shipping information saved.", "success");
  } catch (error) {
    showMessage("profileMessage", error.message || "Could not save profile.", "error");
  }
});

$("signOutButton")?.addEventListener("click", async () => {
  await signOut();
  await refreshAccount();
});

$("refreshOrdersButton")?.addEventListener("click", loadOrders);

refreshAccount();
