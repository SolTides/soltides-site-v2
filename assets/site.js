const OWNER_EMAIL = "info@soltides.co";
const BTC_ADDRESS = "3LTbxKU9GnB34SaREGuxXN2Abh7jGkD6ZY";
const EMAILJS_PUBLIC_KEY = "Pw8XPLxAilF6_DuRg";
const EMAILJS_SERVICE_ID = "service_sh9fwlv";
const EMAILJS_ORDER_TEMPLATE_ID = "template_lq0eiz6";
const GOOGLE_PRODUCTS_CSV = "https://docs.google.com/spreadsheets/d/1nw1K4w5JmxoyzqIms7kaYNFjSen6qkg8-M1iMPGGElQ/gviz/tq?tqx=out:csv&sheet=products";

let PRODUCTS = [];
let cart = [];
let btcUsd = null;
const pathPrefix = document.body.dataset.pathPrefix || "";

if (window.emailjs) emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

function money(n){ return Number(n || 0).toFixed(2).replace(/\.00$/, ""); }
function isUrl(v){ return /^https?:\/\//i.test(String(v || "").trim()); }
function esc(v){ return String(v ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch])); }
function imageSrc(p){ return isUrl(p.product_image_url) ? p.product_image_url : `${pathPrefix}assets/${p.image}`; }
function labSrc(p){ return isUrl(p.lab_image_url) ? p.lab_image_url : `${pathPrefix}assets/labs/${p.lab}`; }
function stockNumber(p){ const n = Number(p.stock); return Number.isFinite(n) ? n : null; }
function normalizeStatus(p){ return String(p.stock_status || "in_stock").trim().toLowerCase().replace(/[\s-]+/g,"_"); }
function truthyToggle(v){ return ["yes","true","on","1","show"].includes(String(v || "").trim().toLowerCase()); }
function showStockCount(p){ return truthyToggle(p.show_stock_count || p.show_stock || p.show_stock_amount || p.display_stock_amount || p.inventory_public); }
function isVisible(p){ return String(p.visible || "yes").toLowerCase() !== "no" && normalizeStatus(p) !== "hidden"; }
function isAvailable(p){
  const status = normalizeStatus(p);
  return isVisible(p) && status !== "out_of_stock" && status !== "out" && stockNumber(p) !== 0;
}
function stockLabel(p){
  const status = normalizeStatus(p);
  const stock = stockNumber(p);
  const showCount = showStockCount(p);
  if(!isVisible(p)) return "Unavailable";
  if(status === "out_of_stock" || status === "out" || stock === 0) return "Out of stock";
  if(status === "low_stock" || status === "low") return showCount && stock !== null ? `Low stock • ${stock} left` : "Low stock";
  if(status === "coming_soon") return "Coming soon";
  if(status === "limited") return showCount && stock !== null ? `Limited • ${stock} available` : "Limited availability";
  return showCount && stock !== null ? `In stock • ${stock} available` : "In stock";
}
function stockClass(p){
  const status = normalizeStatus(p);
  const stock = stockNumber(p);
  if(!isVisible(p) || status === "out_of_stock" || status === "out" || stock === 0) return "out";
  if(status === "low_stock" || status === "low" || status === "limited") return "low";
  return "in";
}

function parseCSV(text){
  const rows = [];
  let row = [], value = "", inQuotes = false;
  for(let i=0; i<text.length; i++){
    const c = text[i], n = text[i+1];
    if(c === '"'){
      if(inQuotes && n === '"'){ value += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if(c === ',' && !inQuotes){ row.push(value); value = ""; }
    else if((c === '\n' || c === '\r') && !inQuotes){
      if(c === '\r' && n === '\n') i++;
      row.push(value); value = "";
      if(row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else value += c;
  }
  row.push(value);
  if(row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function parseMgOptions(mgOptions, defaultMg, price){
  const raw = String(mgOptions || defaultMg || "").trim();
  const basePrice = Number(price || 0);
  if(!raw) return [{label: String(defaultMg || "Standard"), price: basePrice}];
  return raw.split(/[;|]/).map(part => part.trim()).filter(Boolean).map(part => {
    const pieces = part.split(":").map(x => x.trim());
    if(pieces.length >= 2 && Number.isFinite(Number(pieces[1]))) return {label: pieces[0], price: Number(pieces[1])};
    return {label: part, price: basePrice};
  });
}

async function loadLocalProducts(){
  const res = await fetch(`${pathPrefix}assets/products.json`, {cache:"no-store"});
  return await res.json();
}

async function loadSheetProducts(fallbackProducts){
  const res = await fetch(GOOGLE_PRODUCTS_CSV, {cache:"no-store"});
  if(!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);
  const text = await res.text();
  if(/<html|<!doctype/i.test(text)) throw new Error("Google Sheet returned HTML instead of CSV. Check public sharing.");
  const rows = parseCSV(text);
  if(rows.length < 2) throw new Error("Sheet has no product rows.");
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

async function loadProducts(){
  cart = JSON.parse(localStorage.getItem("soltides_cart") || "[]");
  let localProducts = [];
  try{ localProducts = await loadLocalProducts(); }catch(e){ console.warn("Local product fallback failed", e); }
  try{
    PRODUCTS = await loadSheetProducts(localProducts);
    console.info("SolTides products loaded from Google Sheet.");
  }catch(e){
    console.warn("Google Sheet product load failed. Using local fallback.", e);
    PRODUCTS = localProducts;
  }
  cart = cart.filter(item => PRODUCTS.some(p => p.id === item.id));
  saveCart();
  renderProductsGrid();
  renderSiteMenu();
  renderProductPage();
  updateCart();
  fetchBTC();
}

function saveCart(){ localStorage.setItem("soltides_cart", JSON.stringify(cart)); }

function renderProductsGrid(){
  const grid = document.getElementById("productsGrid");
  if(!grid) return;
  const items = PRODUCTS.filter(isVisible);
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
function pageSlug(){
  const fromDataset = document.body.dataset.productSlug;
  const fromQuery = new URLSearchParams(window.location.search).get('slug');
  const fromHash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
  return String(fromDataset || fromQuery || fromHash || '').trim();
}
function currentProduct(){
  const slug = pageSlug();
  if(!slug) return null;
  return PRODUCTS.find(p => p.slug === slug || p.id === slug) || null;
}
function isProductPage(){ return !!document.getElementById('productCode'); }
function renderProductNotFound(){
  if(!isProductPage()) return;
  document.title = 'Product Not Found | SolTides';
  const setText=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val || ''; };
  setText('pageProductTitle','Product Not Found');
  setText('productBreadcrumbTitle','Product Not Found');
  setText('productCode','Product Not Found');
  setText('productActual','');
  setText('productSpec','');
  setText('productSummary','This product is not currently listed. Return to the product catalog or check that the product slug in Google Sheets is correct.');
  const img=document.getElementById('productImage'); if(img){ img.style.display='none'; }
  const lab=document.getElementById('labImage'); if(lab){ lab.style.display='none'; }
  const ph=document.getElementById('labPlaceholder'); if(ph){ ph.style.display='block'; ph.innerHTML='No lab result available for this product.'; }
  const mg=document.getElementById('mgSelect'); if(mg){ mg.innerHTML='<option>Unavailable</option>'; mg.disabled=true; }
  const qty=document.getElementById('qtySelect'); if(qty){ qty.innerHTML='<option>Unavailable</option>'; qty.disabled=true; }
  const price=document.getElementById('productLivePrice'); if(price) price.textContent='Unavailable';
  const addBtn=[...document.querySelectorAll('button')].find(b => b.textContent.trim().toLowerCase()==='add to cart');
  if(addBtn){ addBtn.disabled=true; addBtn.textContent='Unavailable'; }
  const acc=document.getElementById('productAccordions'); if(acc) acc.innerHTML='';
}

function renderProductPage(){
  const p = currentProduct();
  if(!p){ renderProductNotFound(); return; }
  document.title = `${p.code} | SolTides`;
  const setText=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val || ""; };
  setText('pageProductTitle', p.code);
  setText('productBreadcrumbTitle', p.code);
  setText('productCode', p.code); setText('productActual', p.actual); setText('productSpec', p.spec); setText('productSummary', p.summary || p.short_description);
  const mainImg=document.getElementById('productImage'); if(mainImg){ mainImg.src=imageSrc(p); mainImg.alt=`${p.code} ${p.actual} vial`; }
  const buyBox=document.querySelector('.product-buy');
  let badge=document.getElementById('productStockBadge');
  if(buyBox && !badge){
    badge=document.createElement('div'); badge.id='productStockBadge';
    const summary=document.getElementById('productSummary'); summary?.insertAdjacentElement('afterend', badge);
  }
  if(badge){ badge.className=`stock-badge ${stockClass(p)} product-page-stock`; badge.textContent=stockLabel(p); }
  const mg=document.getElementById('mgSelect'); if(mg){ mg.innerHTML=p.mg_options.map((o,i)=>`<option value="${i}" data-price="${o.price}">${esc(o.label)}</option>`).join(''); mg.addEventListener('change', updateProductPrice); }
  const qty=document.getElementById('qtySelect'); if(qty){
    const maxStock = stockNumber(p);
    const maxQty = isAvailable(p) ? (showStockCount(p) ? Math.max(1, Math.min(10, maxStock || 10)) : 10) : 0;
    qty.innerHTML = maxQty > 0 ? Array.from({length:maxQty},(_,i)=>i+1).map(n=>`<option value="${n}">${n} ${n===1?'vial':'vials'}</option>`).join('') : `<option value="0">Unavailable</option>`;
    qty.disabled = maxQty === 0;
    qty.addEventListener('change', updateProductPrice);
  }
  const addBtn=[...document.querySelectorAll('button')].find(b => b.textContent.trim().toLowerCase()==='add to cart');
  if(addBtn && !isAvailable(p)){ addBtn.disabled = true; addBtn.textContent = 'Out of Stock'; }
  updateProductPrice();
  const lab=document.getElementById('labImage'); const ph=document.getElementById('labPlaceholder');
  if(lab){ lab.src=labSrc(p); lab.alt=`${p.code} lab results`; lab.onerror=()=>{ lab.style.display='none'; if(ph) ph.style.display='block'; }; lab.onload=()=>{ lab.style.display='block'; if(ph) ph.style.display='none'; }; }
  const acc=document.getElementById('productAccordions');
  if(acc){
    const items=[
      ['Product Overview', p.overview],
      ['Specifications', p.specs],
      ['Research Use Notice', 'This product is offered for laboratory research purposes only. It is not intended for human consumption, medical use, diagnostic use, treatment use, or household use. Purchasers are responsible for proper handling, storage, and use within an appropriate research setting.'],
      ['Storage & Handling', p.storage],
      ['Quality / Testing', p.quality]
    ];
    acc.innerHTML=items.map((it,idx)=>`<div class="accordion-item ${idx===0?'open':''}"><button class="accordion-btn" type="button" onclick="toggleAccordion(this)"><span>${esc(it[0])}</span><span class="accordion-icon">${idx===0?'−':'+'}</span></button><div class="accordion-content">${esc(it[1])}</div></div>`).join('');
  }
}
function updateProductPrice(){
  const p=currentProduct(); if(!p) return;
  const mg=document.getElementById('mgSelect'); const qty=document.getElementById('qtySelect'); const priceEl=document.getElementById('productLivePrice');
  const opt=p.mg_options[Number(mg?.value||0)] || p.mg_options[0]; const q=Number(qty?.value||1); const total=opt.price*q;
  if(priceEl) priceEl.textContent=isAvailable(p) ? `$${money(total)}` : 'Unavailable';
}
function addSelectedProduct(){
  const p=currentProduct(); if(!p) return;
  if(!isAvailable(p)){ alert('This product is currently out of stock.'); return; }
  const mg=document.getElementById('mgSelect'); const qty=document.getElementById('qtySelect'); const opt=p.mg_options[Number(mg?.value||0)] || p.mg_options[0]; const q=Number(qty?.value||1);
  addToCart(p.id, q, opt.label, opt.price);
}
function addToCart(id, qty=1, mgLabel=null, unitPrice=null){
  const p=PRODUCTS.find(x=>x.id===id); if(!p) return;
  if(!isAvailable(p)){ alert('This product is currently out of stock.'); return; }
  const label=mgLabel || p.mg_options[0].label; const price=unitPrice || p.mg_options[0].price; const key=`${id}|${label}`;
  const maxStock=stockNumber(p);
  const currentQty=cart.filter(i=>i.id===id).reduce((s,i)=>s+i.qty,0);
  if(maxStock !== null && currentQty + qty > maxStock){ alert('That quantity is not currently available. Please lower the quantity or contact SolTides.'); return; }
  const found=cart.find(i=>i.key===key);
  if(found) found.qty += qty; else cart.push({key,id,qty,mgLabel:label,unitPrice:price});
  saveCart(); updateCart(); openCart();
}
function removeFromCart(key){ cart=cart.filter(i=>i.key!==key); saveCart(); updateCart(); }
function changeQty(key, amount){
  const item=cart.find(i=>i.key===key); if(!item) return;
  const p=PRODUCTS.find(x=>x.id===item.id); const maxStock=stockNumber(p || {});
  if(amount > 0 && maxStock !== null){
    const currentQty=cart.filter(i=>i.id===item.id).reduce((s,i)=>s+i.qty,0);
    if(currentQty + amount > maxStock){ alert('That quantity is not currently available. Please lower the quantity or contact SolTides.'); return; }
  }
  item.qty += amount; if(item.qty<=0) removeFromCart(key); else { saveCart(); updateCart(); }
}
function calcTotal(){ return cart.reduce((sum,item)=>sum+(item.unitPrice*item.qty),0); }
function updateCart(){
  const count=document.getElementById('cartCount'); if(count) count.textContent=cart.reduce((s,i)=>s+i.qty,0);
  const items=document.getElementById('cartItems'); if(!items) return;
  if(cart.length===0){ items.innerHTML='<p class="muted">Your cart is empty.</p>'; }
  else items.innerHTML=cart.map(item=>{ const p=PRODUCTS.find(x=>x.id===item.id); if(!p) return ''; return `<div class="cart-item"><img src="${esc(imageSrc(p))}" alt="${esc(p.code)}"><div><strong>${esc(p.code)} — ${esc(p.actual)}</strong><div class="muted">${esc(item.mgLabel)} • $${money(item.unitPrice)} each</div><div class="qty"><button onclick="changeQty('${esc(item.key)}',-1)">−</button><span>${item.qty}</span><button onclick="changeQty('${esc(item.key)}',1)">+</button></div></div><button class="close-btn" onclick="removeFromCart('${esc(item.key)}')">×</button></div>`; }).join('');
  const total=calcTotal(); const usd=document.getElementById('usdTotal'); if(usd) usd.textContent=`$${money(total)}`;
  const btc=document.getElementById('btcTotal'); if(btc) btc.textContent=(btcUsd&&total>0)?`${(total/btcUsd).toFixed(8)} BTC`:'BTC rate loading...';
}
async function fetchBTC(){
  const rate=document.getElementById('btcRate');
  const sources=[{name:'Coinbase',url:'https://api.coinbase.com/v2/prices/BTC-USD/spot',parse:d=>Number(d?.data?.amount)},{name:'Binance US',url:'https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT',parse:d=>Number(d?.price)},{name:'Kraken',url:'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',parse:d=>Number(d?.result?.XXBTZUSD?.c?.[0])}];
  for(const s of sources){ try{ const res=await fetch(s.url,{cache:'no-store'}); const data=await res.json(); const price=s.parse(data); if(Number.isFinite(price)&&price>0){ btcUsd=price; if(rate) rate.textContent=`Live rate: 1 BTC = $${btcUsd.toLocaleString()} USD`; updateCart(); return; }}catch(e){ console.warn('BTC source failed',s.name,e); }}
  btcUsd=null; if(rate) rate.textContent='BTC rate unavailable. Refresh before checkout.'; updateCart();
}
function openCart(){ document.getElementById('cartPanel')?.classList.add('open'); }
function closeCart(){ document.getElementById('cartPanel')?.classList.remove('open'); }
function toggleAccordion(btn){ const item=btn.closest('.accordion-item'); item.classList.toggle('open'); btn.querySelector('.accordion-icon').textContent=item.classList.contains('open')?'−':'+'; }
function buildProductDetails(){
  return cart.map(item=>{ const p=PRODUCTS.find(x=>x.id===item.id); return `${p.code} — ${p.actual} ${item.mgLabel}\nQuantity: ${item.qty} ${item.qty===1?'vial':'vials'}\nLine Total: $${money(item.unitPrice*item.qty)}`; }).join('\n\n');
}
function shippingAddress(){
  const street=document.getElementById('customerAddress')?.value.trim() || '';
  const city=document.getElementById('customerCity')?.value.trim() || '';
  const state=document.getElementById('customerState')?.value.trim() || '';
  const zip=document.getElementById('customerZip')?.value.trim() || '';
  return `${street}\n${city}, ${state} ${zip}`.trim();
}
async function submitOrder(){
  if(cart.length===0){ alert('Your cart is empty.'); return; }
  if(!btcUsd){ alert('BTC rate is still loading. Please wait a moment and try again.'); return; }
  const name=document.getElementById('customerName')?.value.trim(); const email=document.getElementById('customerEmail')?.value.trim(); const phone=document.getElementById('customerPhone')?.value.trim() || '';
  const street=document.getElementById('customerAddress')?.value.trim(); const city=document.getElementById('customerCity')?.value.trim(); const state=document.getElementById('customerState')?.value.trim(); const zip=document.getElementById('customerZip')?.value.trim();
  if(!name||!email||!street||!city||!state||!zip){ alert('Please fill out name, email, and full shipping address.'); return; }
  const overStock=cart.find(item=>{ const p=PRODUCTS.find(x=>x.id===item.id); const max=stockNumber(p || {}); return max !== null && cart.filter(i=>i.id===item.id).reduce((s,i)=>s+i.qty,0) > max; });
  if(overStock){ alert('One or more items in your cart is not currently available at that quantity. Please adjust the quantity.'); return; }
  const orderBtn=document.getElementById('orderButton'); if(orderBtn){ orderBtn.disabled=true; orderBtn.textContent='Sending order...'; }
  const total=calcTotal(); const btc=(total/btcUsd).toFixed(8); const orderNumber=`ST-${Date.now().toString().slice(-8)}`; const orderDate=new Date().toLocaleString();
  const params={
    to_email:email, email, customer_email:email, customer_name:name, customer_phone:phone, customer_address:shippingAddress(), customer_city:city, customer_state:state, customer_zip:zip,
    order_number:orderNumber, order_id:orderNumber, order_date:orderDate, product_details:buildProductDetails(), total_usd:money(total), total_btc:btc, bitcoin_address:BTC_ADDRESS, owner_email:OWNER_EMAIL, order_notes:document.getElementById('orderNotes')?.value.trim() || ''
  };
  try{
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_ORDER_TEMPLATE_ID, params);
    alert(`Order received. Your order number is ${orderNumber}. Please check your email for payment instructions.`);
    cart=[]; saveCart(); updateCart(); closeCart(); document.getElementById('checkoutForm')?.reset();
  }catch(err){ console.error(err); alert('Order email did not send. Please email info@soltides.co or try again.'); }
  finally{ if(orderBtn){ orderBtn.disabled=false; orderBtn.textContent='Order'; }}
}
function handleContact(e){ e.preventDefault(); alert('Thanks. Please email info@soltides.co for now.'); }
document.addEventListener('DOMContentLoaded', loadProducts);

function productHref(slug){ return `${pathPrefix}product.html?slug=${encodeURIComponent(slug)}`; }
function renderSiteMenu(){
  if(document.getElementById('siteMenu')) return;
  const menuProducts = PRODUCTS.filter(isVisible);
  const backdrop=document.createElement('div');
  backdrop.id='siteMenu';
  backdrop.className='site-menu-backdrop';
  backdrop.innerHTML=`
    <aside class="site-menu-drawer" aria-label="Site menu">
      <div class="site-menu-head">
        <div class="site-menu-title">SolTides</div>
        <button class="site-menu-close" type="button" onclick="closeSiteMenu()">×</button>
      </div>
      <div class="site-menu-section">
        <a class="site-menu-link" href="${pathPrefix}index.html" onclick="closeSiteMenu()"><span>Home</span><span>›</span></a>
      </div>
      <div class="site-menu-section open" id="siteMenuProductsSection">
        <button class="site-menu-section-title" type="button" onclick="toggleSiteProductsMenu()"><span>Products</span><span id="siteMenuProductsIcon">−</span></button>
        <div class="site-menu-products">
          ${menuProducts.map(p=>`
            <a class="site-menu-product" href="${productHref(p.slug)}" onclick="closeSiteMenu()">
              <img src="${esc(imageSrc(p))}" alt="${esc(p.code)}">
              <div><strong>${esc(p.code)}</strong><span>${esc(p.actual)} • ${esc(p.spec)}</span><span class="menu-stock ${stockClass(p)}">${esc(stockLabel(p))}</span></div>
            </a>`).join('')}
        </div>
      </div>
      <div class="site-menu-section">
        <a class="site-menu-link" href="${pathPrefix}index.html#contact" onclick="closeSiteMenu()"><span>Contact</span><span>›</span></a>
      </div>
    </aside>`;
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) closeSiteMenu(); });
  document.body.appendChild(backdrop);
}
function openSiteMenu(){ renderSiteMenu(); document.getElementById('siteMenu')?.classList.add('open'); }
function closeSiteMenu(){ document.getElementById('siteMenu')?.classList.remove('open'); }
function toggleSiteProductsMenu(){
  const sec=document.getElementById('siteMenuProductsSection');
  const icon=document.getElementById('siteMenuProductsIcon');
  if(!sec) return;
  sec.classList.toggle('open');
  if(icon) icon.textContent=sec.classList.contains('open')?'−':'+';
}
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeSiteMenu(); });
