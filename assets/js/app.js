import { initState } from "./state.js";
import { loadProducts } from "./products.js";
import { addToCart, changeQty, closeCart, openCart, removeFromCart, updateCart } from "./cart.js";
import { fetchBTC, initCheckoutAccount, initCheckoutProtection, submitOrder } from "./checkout.js?v=secure-checkout-1";
import { addSelectedProduct, openSiteMenu, closeSiteMenu, renderHeroProductImage, renderProductPage, renderProductsGrid, renderSiteMenu, toggleAccordion, toggleSiteProductsMenu } from "./ui.js";

function exposeGlobals() {
  Object.assign(window, {
    addSelectedProduct,
    addToCart,
    changeQty,
    closeCart,
    closeSiteMenu,
    openCart,
    openSiteMenu,
    removeFromCart,
    submitOrder,
    toggleAccordion,
    toggleSiteProductsMenu
  });
}

async function boot() {
  initState();
  exposeGlobals();
  await loadProducts();
  renderHeroProductImage();
  renderProductsGrid();
  renderSiteMenu();
  renderProductPage();
  updateCart();
  fetchBTC();
  initCheckoutAccount();
  initCheckoutProtection();
  document.getElementById("checkoutForm")?.addEventListener("submit", submitOrder);
}

document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSiteMenu(); });
