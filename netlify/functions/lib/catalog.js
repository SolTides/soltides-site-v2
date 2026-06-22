const fs = require("fs");
const path = require("path");

const GOOGLE_PRODUCTS_CSV = process.env.GOOGLE_PRODUCTS_CSV || "https://docs.google.com/spreadsheets/d/1nw1K4w5JmxoyzqIms7kaYNFjSen6qkg8-M1iMPGGElQ/gviz/tq?tqx=out:csv&sheet=products";

function parseCSV(text) {
  const rows = [];
  let row = [], value = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {
      if (inQuotes && n === '"') { value += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { row.push(value); value = ""; }
    else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(value); value = "";
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else value += c;
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
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

function localProducts() {
  const possible = [
    path.join(process.cwd(), "assets", "products.json"),
    path.join(__dirname, "..", "..", "assets", "products.json"),
    path.join(__dirname, "..", "..", "..", "assets", "products.json")
  ];
  for (const file of possible) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (_) {}
  }
  return [];
}

async function sheetProducts(fallbackProducts) {
  const res = await fetch(GOOGLE_PRODUCTS_CSV, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);
  const text = await res.text();
  if (/<html|<!doctype/i.test(text)) throw new Error("Google Sheet returned HTML instead of CSV.");
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Sheet has no product rows.");
  const headers = rows[0].map(h => String(h).trim());
  const bySlug = new Map(fallbackProducts.map(p => [p.slug, p]));
  const products = rows.slice(1).map(cells => {
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
      show_stock_count: r.show_stock_count || base.show_stock_count || "no",
      visible: r.visible || "yes",
      mg_options: parseMgOptions(r.mg_options, r.default_mg, price)
    };
  }).filter(p => p.slug);

  const uniqueBySlug = new Map();
  for (const product of products) {
    const existing = uniqueBySlug.get(product.slug);
    if (!existing || (!isVisible(existing) && isVisible(product))) uniqueBySlug.set(product.slug, product);
  }
  return [...uniqueBySlug.values()];
}

async function loadCatalog() {
  const local = localProducts();
  try { return await sheetProducts(local); }
  catch (e) { console.warn("Using local product catalog fallback:", e.message); return local; }
}

function stockNumber(p) {
  const n = Number(p?.stock);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(p) {
  return String(p?.stock_status || "in_stock").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isVisible(p) {
  return String(p?.visible || "yes").toLowerCase() !== "no" && normalizeStatus(p) !== "hidden";
}

function isAvailable(p) {
  const status = normalizeStatus(p);
  return isVisible(p) && status !== "out_of_stock" && status !== "out" && stockNumber(p) !== 0;
}

function money(n) {
  return Number(n || 0).toFixed(2).replace(/\.00$/, "");
}

module.exports = { loadCatalog, isAvailable, stockNumber, money };
