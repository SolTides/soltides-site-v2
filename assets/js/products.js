import { CONFIG } from "./config.js";
import { state, saveCart } from "./state.js";
import { isUrl, parseCSV } from "./utils.js";

function firstUrl(...values) {
  return values.map(v => String(v || "").trim()).find(isUrl) || "";
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function productImageUrl(p) {
  return firstUrl(
    p?.product_image_url,
    p?.cloudinary_url,
    p?.cloudinary_image_url,
    p?.image_url,
    p?.product_image,
    p?.product_photo,
    p?.photo_url,
    p?.image
  );
}

export function imageSrc(p) {
  const cloudUrl = productImageUrl(p);
  if (cloudUrl) return cloudUrl;
  return `${state.pathPrefix}assets/${p.image}`;
}

export function labSrc(p) {
  const url = firstUrl(p?.lab_image_url, p?.lab_url, p?.coa_url, p?.testing_url);
  if (url) return url;
  return `${state.pathPrefix}assets/labs/${p.lab}`;
}

export function stockNumber(p) {
  const n = Number(p?.stock);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStatus(p) {
  return String(p?.stock_status || "in_stock").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function truthyToggle(v) {
  return ["yes", "true", "on", "1", "show"].includes(String(v || "").trim().toLowerCase());
}

export function showStockCount(p) {
  return truthyToggle(p?.show_stock_count || p?.show_stock || p?.show_stock_amount || p?.display_stock_amount || p?.inventory_public);
}

export function isVisible(p) {
  return String(p?.visible || "yes").toLowerCase() !== "no" && normalizeStatus(p) !== "hidden";
}

export function isAvailable(p) {
  const status = normalizeStatus(p);
  return isVisible(p) && status !== "out_of_stock" && status !== "out" && stockNumber(p) !== 0;
}

export function stockLabel(p) {
  const status = normalizeStatus(p);
  const stock = stockNumber(p);
  const showCount = showStockCount(p);
  if (!isVisible(p)) return "Unavailable";
  if (status === "coming_soon") return "Coming soon";
  if (status === "out_of_stock" || status === "out" || stock === 0) return "Out of stock";
  if (status === "low_stock" || status === "low") return showCount && stock !== null ? `Low stock • ${stock} left` : "Low stock";
  if (status === "limited") return showCount && stock !== null ? `Limited • ${stock} available` : "Limited availability";
  return showCount && stock !== null ? `In stock • ${stock} available` : "In stock";
}

export function stockClass(p) {
  const status = normalizeStatus(p);
  const stock = stockNumber(p);
  if (!isVisible(p) || status === "out_of_stock" || status === "out" || stock === 0) return "out";
  if (status === "low_stock" || status === "low" || status === "limited") return "low";
  return "in";
}

function parseMgOptions(mgOptions, defaultMg, price) {
  const raw = String(mgOptions || defaultMg || "").trim();
  const basePrice = Number(price || 0);
  if (!raw) return [{ label: String(defaultMg || "Standard"), price: basePrice }];
  return raw.split(/[;|]/).map(part => part.trim()).filter(Boolean).map(part => {
    const pieces = part.split(":").map(x => x.trim());
    if (pieces.length >= 2 && Number.isFinite(Number(pieces[1]))) {
      return { label: pieces[0], price: Number(pieces[1]) };
    }
    return { label: part, price: basePrice };
  });
}

async function loadLocalProducts() {
  const res = await fetch(`${state.pathPrefix}assets/products.json`, { cache: "no-store" });
  return await res.json();
}

async function loadSheetProducts(fallbackProducts) {
  const res = await fetch(CONFIG.googleProductsCsv, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);
  const text = await res.text();
  if (/<html|<!doctype/i.test(text)) throw new Error("Google Sheet returned HTML instead of CSV. Check public sharing.");
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Sheet has no product rows.");
  const headers = rows[0].map(h => String(h).trim());
  const bySlug = new Map(fallbackProducts.map(p => [p.slug, p]));
  const products = rows.slice(1).map(cells => {
    const r = {};
    headers.forEach((h, i) => {
      const value = String(cells[i] ?? "").trim();
      r[h] = value;
      r[normalizeKey(h)] = value;
    });
    const slug = r.slug || r.product_slug || r.id;
    const base = bySlug.get(slug) || {};
    const productImage = firstUrl(
      r.product_image_url,
      r.cloudinary_url,
      r.cloudinary_image_url,
      r.image_url,
      r.product_image,
      r.product_photo,
      r.photo_url,
      r.image
    );
    const labImage = firstUrl(r.lab_image_url, r.lab_url, r.coa_url, r.testing_url);
    const price = Number(r.price || base.price || 0);
    return {
      ...base,
      id: slug || base.id || base.slug,
      slug: slug || base.slug,
      code: r.product_code || base.code || slug,
      actual: r.peptide_name || base.actual || "",
      spec: r.default_mg || r.mg_options || base.spec || "",
      price,
      stock: r.stock !== "" ? Number(r.stock) : (base.stock ?? null),
      stock_status: r.stock_status || base.stock_status || "in_stock",
      show_stock_count: r.show_stock_count || r.show_stock || r.show_stock_amount || r.display_stock_amount || base.show_stock_count || "no",
      short_description: r.short_description || base.short_description || base.summary || "",
      product_image_url: productImage || base.product_image_url || "",
      lab_image_url: labImage || base.lab_image_url || "",
      visible: r.visible || "yes",
      image: base.image || `${slug}.png`,
      lab: base.lab || `${slug}-labs.png`,
      summary: r.short_description || base.summary || "",
      mg_options: parseMgOptions(r.mg_options, r.default_mg, price),
      overview: base.overview || r.short_description || "Research product supplied for laboratory use only.",
      specs: base.specs || `Catalog name: ${r.product_code || base.code}. Peptide name: ${r.peptide_name || base.actual}. Listed amount: ${r.default_mg || r.mg_options || base.spec}. Form: lyophilized research material. Intended setting: controlled laboratory research only.`,
      storage: base.storage || "Store sealed in a cool, dry, light-protected environment. Avoid excessive heat, direct sunlight, repeated temperature changes, and unnecessary moisture exposure.",
      quality: base.quality || "Testing documentation supports product identity, purity, lot quality, and traceability. Lot-specific documentation will be displayed when available."
    };
  }).filter(p => p.slug);

  const uniqueBySlug = new Map();
  for (const product of products) {
    const existing = uniqueBySlug.get(product.slug);
    if (!existing || (!isVisible(existing) && isVisible(product))) uniqueBySlug.set(product.slug, product);
  }
  return [...uniqueBySlug.values()];
}

async function overlayInventory(products) {
  const res = await fetch(CONFIG.inventoryEndpoint, { cache: "no-store" });
  if (!res.ok) throw new Error(`Inventory fetch failed ${res.status}`);
  const payload = await res.json();
  const byId = new Map((payload.inventory || []).map(row => [row.product_id, row]));
  return products.map(product => {
    const inventory = byId.get(product.id || product.slug);
    if (!inventory) return { ...product, stock: 0, stock_status: "out_of_stock" };
    return {
      ...product,
      stock: inventory.stock,
      stock_status: inventory.stock_status,
      show_stock_count: inventory.show_stock_count ? "yes" : "no",
      visible: inventory.stock_status === "hidden" ? "no" : product.visible
    };
  });
}

export async function loadProducts() {
  let localProducts = [];
  try { localProducts = await loadLocalProducts(); } catch (e) { console.warn("Local product fallback failed", e); }
  try {
    state.products = await loadSheetProducts(localProducts);
    console.info("SolTides products loaded from Google Sheet.");
  } catch (e) {
    console.warn("Google Sheet product load failed. Using local fallback.", e);
    state.products = localProducts;
  }
  try {
    state.products = await overlayInventory(state.products);
  } catch (error) {
    console.error("Live inventory unavailable; checkout has been disabled to prevent overselling.", error);
    state.products = state.products.map(product => ({ ...product, stock: 0, stock_status: "out_of_stock" }));
  }
  state.cart = state.cart.filter(item => state.products.some(p => p.id === item.id && isAvailable(p)));
  saveCart();
}

export function currentProduct() {
  const params = new URLSearchParams(window.location.search);
  let slug = params.get("slug") || document.body.dataset.productSlug || "";
  if (!slug) {
    const pathMatch = window.location.pathname.match(/\/products\/([^\/]+)\.html$/);
    if (pathMatch) slug = decodeURIComponent(pathMatch[1]);
  }
  return state.products.find(p => p.slug === slug);
}
