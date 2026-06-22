import { state } from "./state.js";
import { esc, money } from "./utils.js";
import { addToCart } from "./cart.js";
import { currentProduct, imageSrc, labSrc, isVisible, isAvailable, stockClass, stockLabel, stockNumber, showStockCount } from "./products.js";

export function renderHeroProductImage() {
  const img = document.getElementById("heroProductImage");
  if (!img) return;
  const product = state.products.find(p => p.slug === "slp-3") || state.products.find(isVisible);
  if (!product) return;
  img.src = imageSrc(product);
  img.alt = `SolTides ${product.code} vial`;
}

export function renderProductsGrid() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;
  const items = state.products.filter(isVisible);
  grid.innerHTML = items.map(p => `
    <article class="product-card ${!isAvailable(p) ? 'product-unavailable' : ''}">
      <div class="product-image"><img src="${esc(imageSrc(p))}" alt="SolTides ${esc(p.code)} vial"></div>
      <div class="product-info">
        <div class="stock-badge ${stockClass(p)}">${esc(stockLabel(p))}</div>
        <h3>${esc(p.code)}</h3>
        <div class="actual-name">${esc(p.actual)}</div>
        <div class="spec">${esc(p.spec)}</div>
        <p class="card-short">${esc(p.short_description || p.summary || '')}</p>
        <div class="price-row">
          <div class="price">$${money(p.price)}</div>
          <a class="view-btn" href="${esc(productHref(p.slug))}">View Product</a>
        </div>
      </div>
    </article>
  `).join("");
}

export function renderProductPage() {
  const p = currentProduct();
  if (!p) return;
  document.title = `${p.code} | SolTides`;
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ""; };
  setText("productCode", p.code);
  setText("pageProductTitle", p.code);
  setText("productBreadcrumbTitle", p.code);
  setText("productActual", p.actual);
  setText("productSpec", p.spec);
  setText("productSummary", p.summary || p.short_description);
  const mainImg = document.getElementById("productImage");
  if (mainImg) { mainImg.src = imageSrc(p); mainImg.alt = `${p.code} ${p.actual} vial`; }
  const buyBox = document.querySelector(".product-buy");
  if (buyBox && !document.getElementById("productStockBadge")) {
    const badge = document.createElement("div");
    badge.id = "productStockBadge";
    badge.className = `stock-badge ${stockClass(p)} product-page-stock`;
    badge.textContent = stockLabel(p);
    const summary = document.getElementById("productSummary");
    summary?.insertAdjacentElement("afterend", badge);
  }
  const mg = document.getElementById("mgSelect");
  if (mg) {
    mg.innerHTML = p.mg_options.map((o, i) => `<option value="${i}" data-price="${o.price}">${esc(o.label)}</option>`).join("");
    mg.addEventListener("change", updateProductPrice);
  }
  const qty = document.getElementById("qtySelect");
  if (qty) {
    const maxStock = stockNumber(p);
    const maxQty = isAvailable(p) ? Math.max(1, Math.min(10, maxStock || 10)) : 0;
    qty.innerHTML = maxQty > 0 ? Array.from({ length: maxQty }, (_, i) => i + 1).map(n => `<option value="${n}">${n} ${n === 1 ? 'vial' : 'vials'}</option>`).join("") : `<option value="0">Unavailable</option>`;
    qty.disabled = maxQty === 0;
    qty.addEventListener("change", updateProductPrice);
  }
  const addBtn = [...document.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "add to cart");
  if (addBtn && !isAvailable(p)) { addBtn.disabled = true; addBtn.textContent = "Out of Stock"; }
  updateProductPrice();
  const lab = document.getElementById("labImage");
  const ph = document.getElementById("labPlaceholder");
  if (lab) {
    lab.src = labSrc(p);
    lab.alt = `${p.code} lab results`;
    lab.onerror = () => { lab.style.display = "none"; if (ph) ph.style.display = "block"; };
    lab.onload = () => { lab.style.display = "block"; if (ph) ph.style.display = "none"; };
  }
  const acc = document.getElementById("productAccordions");
  if (acc) {
    const items = [
      ["Product Overview", p.overview],
      ["Specifications", p.specs],
      ["Research Use Notice", "This product is offered for laboratory research purposes only. It is not intended for human consumption, medical use, diagnostic use, treatment use, or household use. Purchasers are responsible for proper handling, storage, and use within an appropriate research setting."],
      ["Storage & Handling", p.storage],
      ["Quality / Testing", p.quality]
    ];
    acc.innerHTML = items.map((it, idx) => `<div class="accordion-item ${idx === 0 ? 'open' : ''}"><button class="accordion-btn" type="button" onclick="toggleAccordion(this)"><span>${esc(it[0])}</span><span class="accordion-icon">${idx === 0 ? '−' : '+'}</span></button><div class="accordion-content">${esc(it[1])}</div></div>`).join("");
  }
}

export function updateProductPrice() {
  const p = currentProduct();
  if (!p) return;
  const mg = document.getElementById("mgSelect");
  const qty = document.getElementById("qtySelect");
  const priceEl = document.getElementById("productLivePrice");
  const opt = p.mg_options[Number(mg?.value || 0)] || p.mg_options[0];
  const q = Number(qty?.value || 1);
  const total = opt.price * q;
  if (priceEl) priceEl.textContent = isAvailable(p) ? `$${money(total)}` : "Unavailable";
}

export function addSelectedProduct() {
  const p = currentProduct();
  if (!p) return;
  if (!isAvailable(p)) { alert("This product is currently out of stock."); return; }
  const mg = document.getElementById("mgSelect");
  const qty = document.getElementById("qtySelect");
  const opt = p.mg_options[Number(mg?.value || 0)] || p.mg_options[0];
  const q = Number(qty?.value || 1);
  addToCart(p.id, q, opt.label, opt.price);
}

export function toggleAccordion(btn) {
  const item = btn.closest(".accordion-item");
  item.classList.toggle("open");
  btn.querySelector(".accordion-icon").textContent = item.classList.contains("open") ? "−" : "+";
}

function productHref(slug) { return `${state.pathPrefix}product.html?slug=${encodeURIComponent(slug)}`; }

export function renderSiteMenu() {
  if (document.getElementById("siteMenu")) return;
  const menuProducts = state.products.filter(isVisible);
  const backdrop = document.createElement("div");
  backdrop.id = "siteMenu";
  backdrop.className = "site-menu-backdrop";
  backdrop.innerHTML = `
    <aside class="site-menu-drawer" aria-label="Site menu">
      <div class="site-menu-head">
        <div class="site-menu-title">SolTides</div>
        <button class="site-menu-close" type="button" onclick="closeSiteMenu()">×</button>
      </div>
      <div class="site-menu-section">
        <a class="site-menu-link" href="${state.pathPrefix}index.html" onclick="closeSiteMenu()"><span>Home</span><span>›</span></a>
      </div>
      <div class="site-menu-section open" id="siteMenuProductsSection">
        <button class="site-menu-section-title" type="button" onclick="toggleSiteProductsMenu()"><span>Products</span><span id="siteMenuProductsIcon">−</span></button>
        <div class="site-menu-products">
          ${menuProducts.map(p => `
            <a class="site-menu-product" href="${productHref(p.slug)}" onclick="closeSiteMenu()">
              <img src="${esc(imageSrc(p))}" alt="${esc(p.code)}">
              <div><strong>${esc(p.code)}</strong><span>${esc(p.actual)} • ${esc(p.spec)}</span><span class="menu-stock ${stockClass(p)}">${esc(stockLabel(p))}</span></div>
            </a>`).join("")}
        </div>
      </div>
      <div class="site-menu-section">
        <a class="site-menu-link" href="${state.pathPrefix}account.html" onclick="closeSiteMenu()"><span>Account</span><span>›</span></a>
      </div>
      <div class="site-menu-section">
        <a class="site-menu-link" href="${state.pathPrefix}index.html#contact" onclick="closeSiteMenu()"><span>Contact</span><span>›</span></a>
      </div>
    </aside>`;
  backdrop.addEventListener("click", e => { if (e.target === backdrop) closeSiteMenu(); });
  document.body.appendChild(backdrop);
}

export function openSiteMenu() {
  renderSiteMenu();
  document.getElementById("siteMenu")?.classList.add("open");
}

export function closeSiteMenu() {
  document.getElementById("siteMenu")?.classList.remove("open");
}

export function toggleSiteProductsMenu() {
  const sec = document.getElementById("siteMenuProductsSection");
  const icon = document.getElementById("siteMenuProductsIcon");
  if (!sec) return;
  sec.classList.toggle("open");
  if (icon) icon.textContent = sec.classList.contains("open") ? "−" : "+";
}
