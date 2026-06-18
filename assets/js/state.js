export const state = {
  products: [],
  cart: [],
  btcUsd: null,
  pathPrefix: ""
};

export function initState() {
  state.pathPrefix = document.body.dataset.pathPrefix || "";
  try {
    state.cart = JSON.parse(localStorage.getItem("soltides_cart") || "[]");
  } catch (_) {
    state.cart = [];
  }
}

export function saveCart() {
  localStorage.setItem("soltides_cart", JSON.stringify(state.cart));
}
