(() => {
  'use strict';
  const api = String(window.CARMEN_CONFIG.apiBase || '').replace(/\/$/, '');
  let key = '';
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  async function request(path, options = {}) {
    if (!api) throw Error('Add the backend URL to config.js first.');
    const response = await fetch(`${api}${path}`, { ...options, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function note(message) { $('#ownerMessage').textContent = message; }
  async function load() {
    const data = await request('/api/admin/orders');
    $('#resetDetails').textContent = `Current week starts: ${data.weekKey}. Last automatic addition: ${data.lastResetAt || 'Not yet since deployment'}. Each flavor gains 12 on Sunday at 11:59 PM Eastern, and unsold stock rolls forward.`;
    $('#ownerProducts').innerHTML = data.inventory.map((row) => `<article class="admin-product"><img src="./assets/${escapeHTML(row.id === 'snickerdoodle' ? 'snickerdoodle-cupcake' : row.id === 'pumpkin' ? 'pumpkin-cheesecake' : row.id)}.jpeg" alt=""><strong>${escapeHTML(row.id)}</strong><label>Available <input type="number" min="0" max="100000" value="${row.available}" id="qty-${escapeHTML(row.id)}"></label><label><input type="checkbox" id="active-${escapeHTML(row.id)}" ${row.active ? 'checked' : ''}> Flavor visible</label><button type="button" data-save="${escapeHTML(row.id)}">Save changes</button></article>`).join('');
    document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', async () => {
      try {
        const id = button.dataset.save;
        const available = Number($(`#qty-${id}`).value);
        if (!Number.isInteger(available) || available < 0) throw Error('Enter a valid stock number.');
        await request('/api/admin/update', { method:'POST', body: JSON.stringify({ action:'stock', id, available }) });
        await request('/api/admin/update', { method:'POST', body: JSON.stringify({ action:'seasonal', id, active: $(`#active-${id}`).checked }) });
        note(`${id} saved.`);
        await load();
      } catch (e) { note(e.message); }
    }));
    $('#ownerOrders').innerHTML = data.orders.length ? data.orders.map((order) => `<article class="order-row"><div><strong>${escapeHTML(order.customer_name)} · $${(order.total_cents/100).toFixed(2)} · ${escapeHTML(order.status.toUpperCase())}</strong><small>${escapeHTML(order.created_at)} · ${escapeHTML(order.customer_phone)}<br>${escapeHTML(order.items.map((x) => `${x.quantity}× ${x.id}`).join(', '))}<br>${escapeHTML(order.fulfillment_type)} ${escapeHTML(order.fulfillment_date)} at ${escapeHTML(order.fulfillment_time)}<br>${escapeHTML(order.address || '')} ${escapeHTML(order.notes || '')}</small></div><div>${order.status === 'pending' ? `<button data-cancel="${escapeHTML(order.id)}">Cancel unpaid order</button>` : ['paid','confirmed','baking','ready'].includes(order.status) ? `<select data-order="${escapeHTML(order.id)}"><option value="${escapeHTML(order.status)}">${escapeHTML(order.status)}</option>${['confirmed','baking','ready','completed'].filter((s) => s !== order.status).map((s) => `<option>${s}</option>`).join('')}</select>` : ''}</div></article>`).join('') : '<p>No orders yet. ♡</p>';
    document.querySelectorAll('[data-order]').forEach((select) => select.addEventListener('change', async () => {
      try { await request('/api/admin/update', { method:'POST', body: JSON.stringify({ action:'order-status', id:select.dataset.order, status:select.value }) }); note('Order updated.'); await load(); }
      catch (e) { note(e.message); }
    }));
    document.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Cancel this unpaid order and attempt to disable its Square checkout link?')) return;
      try { await request('/api/admin/update', { method:'POST', body: JSON.stringify({ action:'cancel-unpaid', id:button.dataset.cancel }) }); note('Unpaid checkout canceled.'); await load(); }
      catch (e) { note(e.message); }
    }));
  }
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    key = $('#ownerKey').value.trim();
    try { await load(); $('#ownerLogin').hidden = true; $('#ownerDashboard').hidden = false; $('#ownerKey').value = ''; }
    catch (error) { $('#loginMessage').textContent = error.message; key = ''; }
  });
  $('#refreshOwner').addEventListener('click', () => load().catch((error) => note(error.message)));
  $('#manualAdd').addEventListener('click', async () => {
    if (!confirm('Permanently add 12 to every flavor, in addition to this week’s stock?')) return;
    try { await request('/api/admin/update', { method:'POST', body: JSON.stringify({ action:'add-week' }) }); note('Added 12 to each flavor.'); await load(); }
    catch (error) { note(error.message); }
  });
  $('#logoutOwner').addEventListener('click', () => { key = ''; $('#ownerLogin').hidden = false; $('#ownerDashboard').hidden = true; });
})();
