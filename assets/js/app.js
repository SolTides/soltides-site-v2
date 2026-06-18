import { initState } from "./state.js";
import { loadProducts } from "./products.js";
import { addToCart, changeQty, closeCart, openCart, removeFromCart, updateCart } from "./cart.js";
import { fetchBTC, initCheckoutAccount, submitOrder } from "./checkout.js";
import { addSelectedProduct, handleContact, openSiteMenu, closeSiteMenu, renderHeroProductImage, renderProductPage, renderProductsGrid, renderSiteMenu, toggleAccordion, toggleSiteProductsMenu } from "./ui.js";

function exposeGlobals() {
  Object.assign(window, {
    addSelectedProduct,
    addToCart,
    changeQty,
    closeCart,
    closeSiteMenu,
    handleContact,
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
}

document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSiteMenu(); });
