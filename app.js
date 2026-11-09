/* Carmen Cookie Jar — storefront client.
 * All images, prices, and fallback stock are for PREVIEW only.
 * The Cloudflare backend is authoritative for LIVE prices and inventory.
 * Square private access tokens must never be placed in this file.
 */
(() => {
  'use strict';
  const cfg = window.CARMEN_CONFIG;
  const API = String(cfg.apiBase || '').replace(/\/$/, '');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const cents = (value) => `$${(value / 100).toFixed(2)}`;
  const fallback = [
    { id: 'chocolate-chip', name: 'Brown Butter Chocolate Chip', priceCents: 400, image: 'chocolate-chip.jpeg', popular: true, seasonal: false, active: true, available: 12, description: 'Gooey chocolate pools, warm golden edges, brown-butter goodness.', ingredients: 'Flour, sugar, brown sugar, vanilla, chocolate chips; recipe may contain butter and eggs.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
    { id: 'smores', name: "S'mores", priceCents: 475, image: 'smores.jpeg', popular: true, seasonal: false, active: true, available: 12, description: 'Toasted marshmallow, melty chocolate and crunchy graham cracker magic.', ingredients: 'Flour, sugar, brown sugar, vanilla, chocolate chips, marshmallows, graham crackers; other ingredients possible.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
    { id: 'oreo', name: 'Oreo', priceCents: 425, image: 'oreo.jpeg', popular: true, seasonal: false, active: true, available: 12, description: 'Rich chocolate cookie, dreamy vanilla frosting, Oreo crumble.', ingredients: 'Flour, sugar, brown sugar, vanilla, Oreo cookies; cocoa and frosting ingredients vary.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
    { id: 'biscoff', name: 'Biscoff Cookie Butter', priceCents: 475, image: 'biscoff.jpeg', popular: false, seasonal: false, active: true, available: 12, description: 'Spiced cookie butter, soft cookie center and crunchy Biscoff.', ingredients: 'Flour, sugar, brown sugar, vanilla, Biscoff cookies/spread; other ingredients possible.', allergens: 'Likely wheat, soy, dairy, egg. Confirm full recipe.' },
    { id: 'pumpkin', name: 'Pumpkin Caramel Cheesecake', priceCents: 500, image: 'pumpkin-cheesecake.jpeg', popular: false, seasonal: true, active: true, available: 12, description: 'Cozy pumpkin spice, cheesecake frosting and a caramel kiss.', ingredients: 'Flour, sugar, brown sugar, vanilla; typically pumpkin, spices, cream cheese, caramel.', allergens: 'Likely wheat, dairy, egg. Confirm full recipe.' },
    { id: 'snickerdoodle', name: 'Snickerdoodle Cupcake', priceCents: 475, image: 'snickerdoodle-cupcake.jpeg', popular: false, seasonal: true, active: true, available: 12, description: 'Soft cinnamon sugar cookie with a fluffy vanilla frosting swirl.', ingredients: 'Flour, sugar, brown sugar, vanilla; typically butter, egg, cinnamon and frosting.', allergens: 'Likely wheat, dairy, egg. Confirm full recipe.' }
  ];
  const bundlePrices = { 4: 1500, 6: 2200, 12: 3400 };
  let products = fallback;
  let live = false;
  let inventoryConnected = false;
  let cart = readCart();
  let toastTimer;
  let ordering = false;
  const item = (id) => products.find((product) => product.id === id);
  const totalCount = () => Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  function readCart() {
    try {
      const stored = JSON.parse(localStorage.getItem('ccj-cart-v4') || '{}');
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch { return {}; }
  }
  function saveCart() {
    localStorage.setItem('ccj-cart-v4', JSON.stringify(cart));
    renderCart();
    updateCartBadge();
  }
  function showToast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3400);
  }
  function safe(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function imagePath(name) {
    const allowed = /^[a-z0-9-]+\.jpeg$/;
    return allowed.test(name) ? `./assets/${name}` : './assets/chocolate-chip.jpeg';
  }
  function remaining(product) {
    return Math.max(0, Number(product.available) - Number(cart[product.id] || 0));
  }
  function renderProduct(product) {
    const low = product.available <= 3;
    const soldOut = !product.active || product.available === 0;
    const stockLabel = !product.active ? 'Taking a little break' : soldOut ? 'Sold out for now' : inventoryConnected ? `${product.available} left in the jar` : '12 at start · preview';
    const label = product.popular ? '★ MOST LOVED' : product.seasonal ? '✳ LIMITED DROP' : 'BAKED WITH LOVE';
    return `<article class="product-card" data-reveal>
      <div class="product-image"><img src="${imagePath(product.image)}" alt="${safe(product.name)} cookie" loading="lazy"><span class="product-stamp ${product.popular ? 'popular' : product.seasonal ? 'seasonal' : ''}">${label}</span></div>
      <div class="product-copy">
        <div class="product-name"><h3>${safe(product.name)}</h3><strong>${cents(product.priceCents)}</strong></div>
        <p>${safe(product.description)}</p>
        <div class="stock-row ${low ? 'low' : ''}"><span class="stock-circle"></span><span>${stockLabel}</span></div>
        <div class="product-actions"><button class="add-button" type="button" data-add="${safe(product.id)}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : '+ Add to my jar'}</button><button class="ingredients-button" type="button" data-info="${safe(product.id)}" aria-expanded="false">Ingredients ⌄</button></div>
        <div class="ingredient-panel" id="info-${safe(product.id)}" hidden><b>Ingredients (partial; verify with baker)</b><br>${safe(product.ingredients)}<br><br><b>Possible allergens</b><br>${safe(product.allergens)}<br><br>Homemade in a shared kitchen. Cross-contact possible.</div>
      </div>
    </article>`;
  }
  function renderCatalog() {
    $('#cookieGrid').innerHTML = products.filter((product) => !product.seasonal && product.active).map(renderProduct).join('');
    $('#seasonalGrid').innerHTML = products.filter((product) => product.seasonal && product.active).map(renderProduct).join('') || '<p>Fresh seasonal flavors are coming soon. ♡</p>';
    $$('[data-add]').forEach((button) => button.addEventListener('click', () => addItem(button.dataset.add)));
    $$('[data-info]').forEach((button) => button.addEventListener('click', () => {
      const panel = document.getElementById(`info-${button.dataset.info}`);
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    }));
    observeReveals();
  }
  function addItem(id) {
    const product = item(id);
    if (!product || !product.active) return;
    if (remaining(product) <= 0) return showToast('That flavor has reached its current limit.');
    if (totalCount() >= 100) return showToast('Please contact Carmen about orders this large.');
    cart[id] = (cart[id] || 0) + 1;
    saveCart();
    showToast(`${product.name} added! ♡`);
  }
  function removeItem(id) {
    cart[id] = Math.max(0, (cart[id] || 0) - 1);
    if (!cart[id]) delete cart[id];
    saveCart();
  }
  function updateCartBadge() { $('#cartCount').textContent = totalCount(); }
  function pricing() {
    const qty = totalCount();
    const normal = products.reduce((sum, product) => sum + Number(cart[product.id] || 0) * product.priceCents, 0);
    // Matching exact bundle sizes receive the fixed box price.
    return { qty, normal, subtotal: bundlePrices[qty] ?? normal, saved: Math.max(0, normal - (bundlePrices[qty] ?? normal)) };
  }
  function renderCart() {
    const chosen = products.filter((product) => cart[product.id] > 0);
    $('#cartItems').innerHTML = chosen.length ? chosen.map((product) => `<div class="cart-item">
      <img src="${imagePath(product.image)}" alt="" loading="lazy">
      <div><strong>${safe(product.name)}</strong><small>${cents(product.priceCents)} each · ${product.available} ${inventoryConnected ? 'available' : 'preview'}</small><div class="quantity"><button type="button" data-minus="${product.id}" aria-label="Remove one ${safe(product.name)}">−</button><span>${cart[product.id]}</span><button type="button" data-plus="${product.id}" aria-label="Add one ${safe(product.name)}">+</button></div></div>
      <b>${cents(product.priceCents * cart[product.id])}</b>
    </div>`).join('') : '<div style="padding:40px 0;color:#78716d">Your jar is waiting for something sweet. ♡</div>';
    const p = pricing();
    $('#cartSummary').innerHTML = `<span>${p.qty} cookie${p.qty === 1 ? '' : 's'} ${p.saved ? `· saved ${cents(p.saved)}` : ''}</span><strong>${cents(p.subtotal)}</strong>`;
    $('#checkoutButton').disabled = !p.qty;
    $$('[data-minus]').forEach((button) => button.addEventListener('click', () => removeItem(button.dataset.minus)));
    $$('[data-plus]').forEach((button) => button.addEventListener('click', () => addItem(button.dataset.plus)));
  }
  function openCart() {
    $('#cartDrawer').classList.add('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'false');
    $('#overlay').hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeCart() {
    $('#cartDrawer').classList.remove('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'true');
    $('#overlay').hidden = true;
    document.body.classList.remove('no-scroll');
  }
  function openCheckout() {
    if (!totalCount()) return;
    closeCart();
    $('#checkoutModal').hidden = false;
    document.body.classList.add('no-scroll');
    updateOrderTotal();
  }
  function closeCheckout() {
    $('#checkoutModal').hidden = true;
    document.body.classList.remove('no-scroll');
  }
  function zonedDate(date) {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
    const p = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
    return { day: p.weekday, iso: `${p.year}-${p.month}-${p.day}` };
  }
  const dates = [];
  function setDates() {
    const today = Date.now();
    const seen = new Set();
    for (let i = 0; i < 21; i++) {
      const date = new Date(today + i * 86400000);
      const local = zonedDate(date);
      if (!cfg.slots[local.day] || seen.has(local.iso)) continue;
      seen.add(local.iso);
      dates.push({ ...local, label: new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, month: 'short', day: 'numeric', weekday: 'short' }).format(date) });
    }
    $('#pickupDay').innerHTML = dates.map((date) => `<option value="${date.iso}">${date.label}</option>`).join('');
    updateTimes();
  }
  function timeValue(label) {
    const match = /^(\d+):(\d+) (AM|PM)$/.exec(label);
    if (!match) return 0;
    return (Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
  }
  function easternMinutes(date) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    const bits = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return Number(bits.hour) * 60 + Number(bits.minute);
  }
  function updateTimes() {
    const selected = dates.find((entry) => entry.iso === $('#pickupDay').value);
    if (!selected) return;
    const isToday = selected.iso === zonedDate(new Date()).iso;
    const slots = cfg.slots[selected.day].filter((slot) => !isToday || timeValue(slot) > easternMinutes(new Date()) + 60);
    $('#pickupTime').innerHTML = slots.length ? slots.map((slot) => `<option value="${slot}">${slot}</option>`).join('') : '<option value="">No remaining slots</option>';
  }
  function isDelivery() { return $('input[name="type"]:checked').value === 'delivery'; }
  function updateOrderTotal() {
    $('#addressWrap').hidden = !isDelivery();
    $('#addressWrap input').required = isDelivery();
    const p = pricing();
    $('#checkoutTotal').innerHTML = `<span>${p.qty} cookies${isDelivery() ? ' + local delivery' : ''}</span><span>${cents(p.subtotal + (isDelivery() ? cfg.deliveryFeeCents : 0))}</span>`;
    $('#checkoutIntro').textContent = live ? 'Your cookies will be reserved briefly while you complete secure Square payment.' : 'Preview only. Connect the live backend for secure checkout and real stock.';
    $('#submitOrder').disabled = !live;
    $('#submitOrder').textContent = live ? 'Continue to secure Square checkout ↗' : 'Connect backend to enable Square checkout';
    $('#paymentHelper').textContent = live ? 'Your card information is handled by Square, not this website.' : 'You can still prepare a text order request below. Stock is not reserved.';
  }
  function orderPayload() {
    const data = new FormData($('#orderForm'));
    return {
      items: Object.entries(cart).filter(([_, q]) => q > 0).map(([id, quantity]) => ({ id, quantity })),
      customer: { name: String(data.get('name') || '').trim(), phone: String(data.get('phone') || '').trim(), email: String(data.get('email') || '').trim() },
      fulfillment: { type: data.get('type'), date: data.get('day'), time: data.get('time'), address: String(data.get('address') || '').trim() },
      notes: String(data.get('notes') || '').trim()
    };
  }
  function textMessage() {
    const payload = orderPayload();
    const lines = payload.items.map(({ id, quantity }) => `${quantity} × ${item(id)?.name || id}`).join('\n');
    return `Hi Carmen! I'd like to REQUEST a Carmen Cookie Jar order 🍪\n\n${lines}\nTotal estimate: ${cents(pricing().subtotal + (isDelivery() ? cfg.deliveryFeeCents : 0))}\nName: ${payload.customer.name}\nPhone: ${payload.customer.phone}\nFulfillment: ${payload.fulfillment.type}\nWhen: ${payload.fulfillment.date} at ${payload.fulfillment.time}\n${isDelivery() ? `Address: ${payload.fulfillment.address}\n` : ''}Notes: ${payload.notes || 'None'}\n\nPlease confirm availability, price, ingredients/allergens and payment details. I understand this request does not reserve stock.`;
  }
  function textOrder() {
    if (!totalCount()) return showToast('Add a cookie to your jar first.');
    const message = textMessage();
    const url = `sms:${cfg.phone}?body=${encodeURIComponent(message)}`;
    navigator.clipboard?.writeText(message).catch(() => {});
    window.location.href = url;
    showToast('Order request copied when supported. Send the text to Carmen to request confirmation.');
  }
  async function sendOrder(event) {
    event.preventDefault();
    if (!live) return showToast('Connect the backend to accept secure payments. Text Carmen to request an order.');
    if (ordering || !totalCount()) return;
    const payload = orderPayload();
    ordering = true;
    const button = $('#submitOrder');
    button.disabled = true;
    button.textContent = 'Preparing secure checkout…';
    try {
      const response = await fetch(`${API}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.checkoutUrl) throw Error(result.error || 'Checkout could not be created.');
      cart = {};
      saveCart();
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      showToast(error.message || 'Something went wrong. Please try again.');
      await loadInventory();
      ordering = false;
      updateOrderTotal();
    }
  }
  async function loadInventory() {
    if (!API) {
      live = false;
      inventoryConnected = false;
      updateMode();
      renderCatalog();
      renderCart();
      return;
    }
    try {
      const response = await fetch(`${API}/api/menu`, { cache: 'no-store' });
      if (!response.ok) throw Error('Backend unavailable');
      const data = await response.json();
      if (!Array.isArray(data.products)) throw Error('Invalid backend response');
      products = data.products;
      live = data.checkoutEnabled === true;
      inventoryConnected = true;
      // A configured inventory endpoint can be live even before payments are enabled.
      $('#modeTitle').textContent = live ? 'The cookie jar is open ✳' : 'Live inventory connected · checkout not yet enabled';
      $('#modeDescription').textContent = live ? 'Real-time availability · secure Square checkout · 12 fresh cookies per flavor each week.' : 'Connect Square credentials to turn on online payments.';
      updateMode();
    } catch {
      live = false;
      inventoryConnected = false;
      products = fallback;
      $('#modeTitle').textContent = 'Preview mode · live ordering is offline';
      $('#modeDescription').textContent = 'You can browse and build your box, but no stock is reserved or paid for here.';
      updateMode();
    }
    Object.keys(cart).forEach((id) => {
      if (!item(id) || !item(id).active) delete cart[id];
      else cart[id] = Math.min(cart[id], item(id).available);
      if (!cart[id]) delete cart[id];
    });
    saveCart();
    renderCatalog();
    updateOrderTotal();
  }
  function updateMode() {
    $('#dropPill').textContent = live ? 'LIVE DROP' : 'PREVIEW';
    if (!live && !API) {
      $('#modeTitle').textContent = 'Preview mode · design ready';
      $('#modeDescription').textContent = 'Add your Worker URL in config.js to activate shared stock and Square checkout.';
    }
  }
  let observer;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) return $$('[data-reveal]').forEach((node) => node.classList.add('visible'));
    if (!observer) observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    $$('[data-reveal]:not(.visible)').forEach((node) => observer.observe(node));
  }
  function rotateOnScroll() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const section = $('.magic-section').getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (window.innerHeight - section.top) / (window.innerHeight + section.height)));
    $('#scrollCookie').style.transform = `rotate(${progress * 400 - 160}deg) translateY(${Math.sin(progress * Math.PI) * -18}px)`;
  }
  function bind() {
    $('#cartButton').addEventListener('click', openCart);
    $('#closeCart').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', closeCart);
    $('#checkoutButton').addEventListener('click', openCheckout);
    $('#closeCheckout').addEventListener('click', closeCheckout);
    $('#checkoutModal').addEventListener('click', (event) => { if (event.target.id === 'checkoutModal') closeCheckout(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeCart(); closeCheckout(); } });
    $('#pickupDay').addEventListener('change', updateTimes);
    $$('input[name="type"]').forEach((input) => input.addEventListener('change', updateOrderTotal));
    $('#orderForm').addEventListener('submit', sendOrder);
    $('#textOrder').addEventListener('click', textOrder);
    $$('[data-bundle]').forEach((button) => button.addEventListener('click', () => {
      openCart();
      showToast(`Choose exactly ${button.dataset.bundle} cookies to unlock ${cents(bundlePrices[button.dataset.bundle])} pricing.`);
    }));
    let scheduled = false;
    window.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { rotateOnScroll(); scheduled = false; });
    }, { passive: true });
    window.addEventListener('focus', () => { if (API) loadInventory(); });
  }
  $('#year').textContent = new Date().getFullYear();
  setDates();
  bind();
  updateOrderTotal();
  renderCatalog();
  renderCart();
  observeReveals();
  loadInventory();
  if (API) {
    // Refresh the publicly visible stock counts once per minute.
    setInterval(() => { if (!document.hidden) loadInventory(); }, 60000);
  }
  if (new URLSearchParams(window.location.search).has('orderId')) {
    setTimeout(() => showToast('Thanks! Square checkout returned you to the shop. Payment confirmation is verified separately.'), 1000);
  }
})();
