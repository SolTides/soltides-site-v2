import { CONFIG } from "./config.js";
import { state, saveCart } from "./state.js";
import { isUrl, parseCSV } from "./utils.js";

export function imageSrc(p) {
  return isUrl(p.product_image_url) ? p.product_image_url : `${state.pathPrefix}assets/${p.image}`;
}

export function labSrc(p) {
  return isUrl(p.lab_image_url) ? p.lab_image_url : `${state.pathPrefix}assets/labs/${p.lab}`;
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
  if (status === "out_of_stock" || status === "out" || stock === 0) return "Out of stock";
  if (status === "low_stock" || status === "low") return showCount && stock !== null ? `Low stock • ${stock} left` : "Low stock";
  if (status === "coming_soon") return "Coming soon";
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
  return rows.slice(1).map(cells => {
    const r = {};
    headers.forEach((h, i) => r[h] = String(cells[i] ?? "").trim());
    const base = bySlug.get(r.slug) || {};
    const price = Number(r.price || base.price || 0);
    return {
      ...base,
      id: r.slug || base.id || base.slug,
      slug: r.slug || base.slug,
      code: r.product_code || base.code || r.slug,
      actual: r.peptide_name || base.actual || "",
      spec: r.default_mg || r.mg_options || base.spec || "",
      price,
      stock: r.stock !== "" ? Number(r.stock) : (base.stock ?? null),
      stock_status: r.stock_status || base.stock_status || "in_stock",
      show_stock_count: r.show_stock_count || r.show_stock || r.show_stock_amount || r.display_stock_amount || base.show_stock_count || "no",
      short_description: r.short_description || base.short_description || base.summary || "",
      product_image_url: r.product_image_url || "",
      lab_image_url: r.lab_image_url || "",
      visible: r.visible || "yes",
      image: base.image || `${r.slug}.png`,
      lab: base.lab || `${r.slug}-labs.png`,
      summary: r.short_description || base.summary || "",
      mg_options: parseMgOptions(r.mg_options, r.default_mg, price),
      overview: base.overview || r.short_description || "Research product supplied for laboratory use only.",
      specs: base.specs || `Catalog name: ${r.product_code || base.code}. Peptide name: ${r.peptide_name || base.actual}. Listed amount: ${r.default_mg || r.mg_options || base.spec}. Form: lyophilized research material. Intended setting: controlled laboratory research only.`,
      storage: base.storage || "Store sealed in a cool, dry, light-protected environment. Avoid excessive heat, direct sunlight, repeated temperature changes, and unnecessary moisture exposure.",
      quality: base.quality || "Testing documentation supports product identity, purity, lot quality, and traceability. Lot-specific documentation will be displayed when available."
    };
  }).filter(p => p.slug);
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
  state.cart = state.cart.filter(item => state.products.some(p => p.id === item.id));
  saveCart();
}

export function currentProduct() {
  const slug = document.body.dataset.productSlug;
  return state.products.find(p => p.slug === slug);
}
