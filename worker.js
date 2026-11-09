/**
 * Carmen Cookie Jar · Cloudflare Worker + D1 + Square Hosted Checkout
 *
 * Responsibilities:
 *  1. Own authoritative menu prices and inventory.
 *  2. Reserve inventory BEFORE creating a Square payment link.
 *  3. Reconcile Square webhooks without trusting browser payment claims.
 *  4. Expire unpaid checkouts by disabling their Square payment links FIRST.
 *  5. Add 12 cookies per flavor at each Sunday 11:59 PM America/Indiana/Indianapolis.
 *  6. Expose owner operations only behind the ADMIN_KEY secret.
 *
 * Square token / webhook signature keys are stored as Cloudflare secrets.
 * They must never be included in the browser's files or repository.
 */
const ZONE = 'America/Indiana/Indianapolis';
const SQUARE_VERSION = '2026-09-16';
const CURRENCY = 'USD';
const DELIVERY_CENTS = 400;
const BASE_WEEKLY_ADD = 12;
const HOLD_MINUTES = 30;
const BUNDLES = { 4: 1500, 6: 2200, 12: 3400 };
const CATALOG = [
  { id: 'chocolate-chip', name: 'Brown Butter Chocolate Chip', image: 'chocolate-chip.jpeg', priceCents: 400, popular: true, seasonal: false, description: 'Gooey chocolate pools, warm golden edges, brown-butter goodness.', ingredients: 'Flour, sugar, brown sugar, vanilla, chocolate chips; other ingredients must be confirmed.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
  { id: 'smores', name: "S'mores", image: 'smores.jpeg', priceCents: 475, popular: true, seasonal: false, description: 'Toasted marshmallow, melty chocolate and crunchy graham cracker magic.', ingredients: 'Flour, sugar, brown sugar, vanilla, chocolate chips, marshmallows, graham crackers; other ingredients must be confirmed.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
  { id: 'oreo', name: 'Oreo', image: 'oreo.jpeg', priceCents: 425, popular: true, seasonal: false, description: 'Rich chocolate cookie, dreamy vanilla frosting, Oreo crumble.', ingredients: 'Flour, sugar, brown sugar, vanilla, Oreo cookies; other ingredients must be confirmed.', allergens: 'Likely wheat, dairy, egg, soy. Confirm full recipe.' },
  { id: 'biscoff', name: 'Biscoff Cookie Butter', image: 'biscoff.jpeg', priceCents: 475, popular: false, seasonal: false, description: 'Spiced cookie butter, soft cookie center and crunchy Biscoff.', ingredients: 'Flour, sugar, brown sugar, vanilla, Biscoff cookies/spread; other ingredients must be confirmed.', allergens: 'Likely wheat, soy, dairy, egg. Confirm full recipe.' },
  { id: 'pumpkin', name: 'Pumpkin Caramel Cheesecake', image: 'pumpkin-cheesecake.jpeg', priceCents: 500, popular: false, seasonal: true, description: 'Cozy pumpkin spice, cheesecake frosting and a caramel kiss.', ingredients: 'Flour, sugar, brown sugar, vanilla; typically pumpkin, spice, cream cheese and caramel; verify recipe.', allergens: 'Likely wheat, dairy, egg. Confirm full recipe.' },
  { id: 'snickerdoodle', name: 'Snickerdoodle Cupcake', image: 'snickerdoodle-cupcake.jpeg', priceCents: 475, popular: false, seasonal: true, description: 'Soft cinnamon sugar cookie with a fluffy vanilla frosting swirl.', ingredients: 'Flour, sugar, brown sugar, vanilla; typically butter, egg, cinnamon, and frosting; verify recipe.', allergens: 'Likely wheat, dairy, egg. Confirm full recipe.' }
];
const mapById = Object.fromEntries(CATALOG.map(product => [product.id, product]));
const timeSlots = {
  Thursday: ['4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM'],
  Friday: ['4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM'],
  Saturday: ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']
};
function localParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  });
  return Object.fromEntries(fmt.formatToParts(date).map(({ type, value }) => [type, value]));
}
function dateString(parts) { return `${parts.year}-${parts.month}-${parts.day}`; }
function minutes(time) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  return m ? (Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : -1;
}
function weeklyKey(now = new Date()) {
  // The new week begins at Sunday 23:59 ET rather than midnight.
  const p = localParts(now);
  const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(p.weekday);
  const localCalendar = new Date(`${dateString(p)}T12:00:00Z`);
  const sundayCutoffReached = day === 0 && Number(p.hour) * 60 + Number(p.minute) >= 23 * 60 + 59;
  const offsetToMonday = (day + 6) % 7;
  localCalendar.setUTCDate(localCalendar.getUTCDate() - offsetToMonday + (sundayCutoffReached ? 7 : 0));
  return localCalendar.toISOString().slice(0, 10);
}
function weekGap(oldKey, newKey) {
  const oldTime = Date.parse(`${oldKey}T00:00:00Z`);
  const newTime = Date.parse(`${newKey}T00:00:00Z`);
  return Math.max(0, Math.floor((newTime - oldTime) / (7 * 86400000)));
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
  });
}
function cors(origin, env) {
  const allowed = (env.SITE_ORIGIN || '').replace(/\/$/, '');
  return origin === allowed ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Vary': 'Origin'
  } : {};
}
function failed(message, status = 400) { return json({ error: message }, status); }
function adminAllowed(request, env) {
  const value = request.headers.get('Authorization') || '';
  // Use a high-entropy secret supplied with wrangler secret put ADMIN_KEY.
  return Boolean(env.ADMIN_KEY && env.ADMIN_KEY.length >= 24 && value === `Bearer ${env.ADMIN_KEY}`);
}
async function initializeAndRollover(env) {
  const now = weeklyKey();
  // Atomic, idempotent rollover: INSERTing a new weekly ledger key runs
  // the SQLite trigger in the same transaction, adding the stock once.
  const last = await env.DB.prepare("SELECT value FROM meta WHERE key='week_key'").first();
  if (!last) {
    await env.DB.prepare("INSERT OR IGNORE INTO meta (key,value) VALUES ('week_key',?)").bind(now).run();
    return;
  }
  if (last.value >= now) return;
  const gap = weekGap(last.value, now);
  if (!gap) return;
  const added = await env.DB.prepare(
    'INSERT OR IGNORE INTO weekly_rollovers (week_key,increment,created_at) VALUES (?,?,?)'
  ).bind(now, BASE_WEEKLY_ADD * gap, new Date().toISOString()).run();
  // Meta update is idempotent, so a retry after a transient failure is safe.
  await env.DB.prepare("UPDATE meta SET value=? WHERE key='week_key' AND value < ?").bind(now, now).run();
  if (added.meta.changes === 1) {
    await env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('last_reset_at', ?)").bind(new Date().toISOString()).run();
  }
}
async function menu(env) {
  await initializeAndRollover(env);
  const rows = await env.DB.prepare('SELECT id,available,active FROM inventory').all();
  const lookup = Object.fromEntries(rows.results.map((r) => [r.id, r]));
  return json({
    products: CATALOG.map((p) => ({ ...p, available: lookup[p.id]?.available ?? 0, active: lookup[p.id]?.active === 1 })),
    checkoutEnabled: Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID && !env.SQUARE_LOCATION_ID.startsWith('REPLACE')),
    weekKey: weeklyKey(), timezone: ZONE, weeklyAddPerFlavor: BASE_WEEKLY_ADD
  });
}
function normalizeOrder(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw Error('Choose at least one flavor.');
  const items = new Map();
  for (const row of data.items) {
    if (!row || typeof row.id !== 'string' || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 100 || !mapById[row.id]) throw Error('Invalid cookie or quantity.');
    items.set(row.id, (items.get(row.id) || 0) + row.quantity);
  }
  if (!items.size || [...items.values()].reduce((a, b) => a + b, 0) > 100) throw Error('Invalid order size.');
  const c = data.customer || {};
  const f = data.fulfillment || {};
  const name = String(c.name || '').trim().slice(0, 100);
  const phone = String(c.phone || '').trim().slice(0, 32);
  const email = String(c.email || '').trim().slice(0, 160);
  const address = String(f.address || '').trim().slice(0, 240);
  const notes = String(data.notes || '').trim().slice(0, 500);
  if (name.length < 2 || !/^[+\d().\s-]{7,32}$/.test(phone)) throw Error('Enter your name and a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter a valid email.');
  if (!['pickup','delivery'].includes(f.type)) throw Error('Choose pickup or delivery.');
  if (f.type === 'delivery' && address.length < 12) throw Error('Enter a full delivery address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) throw Error('Choose a date.');
  const dayDate = new Date(`${f.date}T12:00:00Z`);
  if (Number.isNaN(dayDate.getTime()) || dayDate.toISOString().slice(0, 10) !== f.date) throw Error('Invalid date.');
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(dayDate);
  if (!timeSlots[weekday]?.includes(f.time)) throw Error('That time is unavailable.');
  const today = localParts();
  const todayISO = dateString(today);
  const daysAhead = Math.round((Date.parse(`${f.date}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86400000);
  if (daysAhead < 0 || daysAhead > 20) throw Error('Choose an available date in the next three weeks.');
  if (daysAhead === 0 && minutes(f.time) <= Number(today.hour) * 60 + Number(today.minute) + 60) throw Error('Please choose a time at least one hour ahead.');
  const list = [...items].map(([id, quantity]) => ({ id, quantity, product: mapById[id] }));
  const quantity = list.reduce((n, row) => n + row.quantity, 0);
  const regular = list.reduce((n, row) => n + row.quantity * row.product.priceCents, 0);
  const subtotal = BUNDLES[quantity] ?? regular;
  const total = subtotal + (f.type === 'delivery' ? DELIVERY_CENTS : 0);
  return { list, quantity, subtotal, total, name, phone, email, address, notes, type: f.type, date: f.date, time: f.time };
}
async function squareRequest(env, method, path, body) {
  const host = env.SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  const response = await fetch(`${host}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) throw Error(`Square request failed (${response.status}): ${data.errors?.[0]?.detail || 'Check credentials and permissions.'}`);
  return data;
}
async function putBack(env, list) {
  for (const row of list) await env.DB.prepare('UPDATE inventory SET available = available + ? WHERE id=?').bind(row.quantity, row.id).run();
}
async function reserveStock(env, list) {
  const reserved = [];
  for (const row of list) {
    const result = await env.DB.prepare('UPDATE inventory SET available=available-? WHERE id=? AND active=1 AND available>=?').bind(row.quantity, row.id, row.quantity).run();
    if (result.meta.changes !== 1) {
      await putBack(env, reserved);
      throw Error(`${row.product.name} doesn't have enough left. Refresh to see the latest inventory.`);
    }
    reserved.push(row);
  }
}
async function createCheckout(request, env) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID || env.SQUARE_LOCATION_ID.startsWith('REPLACE')) return failed('Square is not configured yet. Contact Carmen to order.', 503);
  const bodyText = await request.text();
  if (bodyText.length > 12000) return failed('Order request too large.');
  let order;
  try { order = normalizeOrder(JSON.parse(bodyText)); } catch (error) { return failed(error.message); }
  await initializeAndRollover(env);
  try { await reserveStock(env, order.list); }
  catch (error) { return failed(error.message, 409); }
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + HOLD_MINUTES * 60000).toISOString();
  const itemsData = order.list.map(({ id, quantity }) => ({ id, quantity }));
  try {
    await env.DB.prepare(`INSERT INTO orders
      (id, created_at, expires_at, status, customer_name, customer_phone, customer_email, fulfillment_type, fulfillment_date, fulfillment_time, address, notes, total_cents, items_json)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, new Date().toISOString(), expires, order.name, order.phone, order.email, order.type, order.date, order.time, order.address, order.notes, order.total, JSON.stringify(itemsData)).run();
  } catch (error) {
    await putBack(env, order.list);
    return failed('Unable to save this checkout. Please try again.', 503);
  }
  try {
    const summary = order.list.map(({ quantity, product }) => `${quantity}x ${product.name}`).join(', ');
    const note = `Carmen Cookie Jar #${id.slice(0,8)} | ${summary} | ${order.type} ${order.date} ${order.time} | ${order.phone}`.slice(0, 500);
    const body = {
      idempotency_key: id,
      description: `Carmen Cookie Jar order ${id.slice(0, 8)}`,
      quick_pay: { name: `Carmen Cookie Jar ${order.quantity}-cookie order${order.type === 'delivery' ? ' + delivery' : ''}`, price_money: { amount: order.total, currency: CURRENCY }, location_id: env.SQUARE_LOCATION_ID },
      checkout_options: { redirect_url: env.STOREFRONT_URL || undefined, allow_tipping: false, ask_for_shipping_address: false },
      pre_populated_data: order.email ? { buyer_email: order.email } : undefined,
      payment_note: note
    };
    const square = await squareRequest(env, 'POST', '/v2/online-checkout/payment-links', body);
    if (!square.payment_link?.url || !square.payment_link?.order_id) throw Error('Square returned an incomplete checkout link.');
    await env.DB.prepare('UPDATE orders SET square_order_id=?,payment_link_id=?,payment_url=? WHERE id=?')
      .bind(square.payment_link.order_id, square.payment_link.id, square.payment_link.url, id).run();
    return json({ checkoutUrl: square.payment_link.url, orderId: id, expiresAt: expires });
  } catch (error) {
    // Cancel reservations if Square link creation fails. If Square link did
    // create but the database update failed, inspect Square dashboard manually.
    await env.DB.prepare("UPDATE orders SET status='failed' WHERE id=? AND status='pending'").bind(id).run();
    await putBack(env, order.list);
    return failed(`Could not create Square checkout. ${error.message}`, 502);
  }
}
async function verifySignature(body, header, env) {
  if (!header || !env.SQUARE_WEBHOOK_SIGNATURE_KEY || !env.SQUARE_WEBHOOK_URL) return false;
  const data = new TextEncoder().encode(env.SQUARE_WEBHOOK_URL + body);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SQUARE_WEBHOOK_SIGNATURE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const expected = Uint8Array.from(atob(header), c => c.charCodeAt(0));
  if (signed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signed.length; i++) diff |= signed[i] ^ expected[i];
  return diff === 0;
}
async function squareWebhook(request, env) {
  const raw = await request.text();
  const verified = await verifySignature(raw, request.headers.get('x-square-hmacsha256-signature'), env).catch(() => false);
  if (!verified) return failed('Invalid Square webhook signature.', 401);
  let event; try { event = JSON.parse(raw); } catch { return failed('Invalid webhook JSON.'); }
  if (!['payment.updated', 'payment.created'].includes(event.type)) return json({ accepted: true });
  const payment = event.data?.object?.payment;
  if (!payment?.order_id) return json({ accepted: true });
  const row = await env.DB.prepare('SELECT id,status,total_cents FROM orders WHERE square_order_id=?').bind(payment.order_id).first();
  if (!row) return json({ accepted: true });
  if (payment.status === 'COMPLETED' && Number(payment.amount_money?.amount) === row.total_cents) {
    // Important: this is idempotent. Paid cookies were reserved at checkout.
    await env.DB.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending'").bind(row.id).run();
  }
  // Failed/canceled payment release is handled by expired-link cleanup.
  return json({ accepted: true });
}
async function releasePending(env, row, status = 'expired') {
  // Do not release stock until the link is deactivated at Square.
  // A customer must not be able to pay after their stock was returned.
  if (row.payment_link_id) {
    try { await squareRequest(env, 'DELETE', `/v2/online-checkout/payment-links/${encodeURIComponent(row.payment_link_id)}`); }
    catch { return false; }
  } else {
    // Could be in-flight checkout creation. Leave it untouched until resolved.
    return false;
  }
  const changed = await env.DB.prepare('UPDATE orders SET status=? WHERE id=? AND status=\'pending\'').bind(status, row.id).run();
  if (changed.meta.changes === 1) {
    const list = JSON.parse(row.items_json).map(({ id, quantity }) => ({ id, quantity }));
    await putBack(env, list);
    return true;
  }
  return false;
}
async function cleanup(env) {
  const expired = await env.DB.prepare("SELECT id,payment_link_id,items_json FROM orders WHERE status='pending' AND expires_at < ? LIMIT 40").bind(new Date().toISOString()).all();
  for (const row of expired.results) await releasePending(env, row);
}
async function ownerOrders(env) {
  await initializeAndRollover(env);
  const rows = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 150').all();
  const inv = await env.DB.prepare('SELECT * FROM inventory ORDER BY id').all();
  const last = await env.DB.prepare("SELECT value FROM meta WHERE key='last_reset_at'").first();
  return json({ orders: rows.results.map((r) => ({ ...r, items: JSON.parse(r.items_json), items_json: undefined })), inventory: inv.results, lastResetAt: last?.value || null, weekKey: weeklyKey() });
}
async function ownerUpdate(request, env) {
  let body; try { body = await request.json(); } catch { return failed('Invalid JSON.'); }
  if (body.action === 'stock') {
    if (!mapById[body.id] || !Number.isInteger(body.available) || body.available < 0 || body.available > 100000) return failed('Invalid stock quantity.');
    await env.DB.prepare('UPDATE inventory SET available=? WHERE id=?').bind(body.available, body.id).run();
    return json({ ok: true });
  }
  if (body.action === 'seasonal') {
    if (!mapById[body.id] || typeof body.active !== 'boolean') return failed('Invalid flavor setting.');
    await env.DB.prepare('UPDATE inventory SET active=? WHERE id=?').bind(body.active ? 1 : 0, body.id).run();
    return json({ ok: true });
  }
  if (body.action === 'add-week') {
    await env.DB.prepare('UPDATE inventory SET available=available+?').bind(BASE_WEEKLY_ADD).run();
    return json({ ok: true, message: 'Added 12 to each flavor manually.' });
  }
  if (body.action === 'order-status') {
    const allowed = ['paid','confirmed','baking','ready','completed'];
    if (!allowed.includes(body.status) || typeof body.id !== 'string') return failed('Invalid order status.');
    const row = await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(body.id).first();
    if (!row || !['paid','confirmed','baking','ready'].includes(row.status)) return failed('Only paid or accepted orders can be updated.');
    await env.DB.prepare('UPDATE orders SET status=? WHERE id=?').bind(body.status, body.id).run();
    return json({ ok: true });
  }
  if (body.action === 'cancel-unpaid') {
    const row = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND status='pending'").bind(String(body.id || '')).first();
    if (!row) return failed('Only pending unpaid orders may be released.');
    const released = await releasePending(env, row, 'canceled');
    return released ? json({ ok: true }) : failed('Square link could not be disabled. Inventory was not released.', 503);
  }
  return failed('Unknown action.');
}
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const origin = request.headers.get('Origin') || '';
    const allowed = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: allowed });
    let result;
    try {
      if (pathname === '/api/health' && request.method === 'GET') result = json({ ok: true });
      else if (pathname === '/api/menu' && request.method === 'GET') result = await menu(env);
      else if (pathname === '/api/checkout' && request.method === 'POST') result = await createCheckout(request, env);
      else if (pathname === '/api/webhooks/square' && request.method === 'POST') result = await squareWebhook(request, env);
      else if (pathname === '/api/admin/orders' && request.method === 'GET') result = adminAllowed(request, env) ? await ownerOrders(env) : failed('Unauthorized.', 401);
      else if (pathname === '/api/admin/update' && request.method === 'POST') result = adminAllowed(request, env) ? await ownerUpdate(request, env) : failed('Unauthorized.', 401);
      else result = failed('Not found.', 404);
    } catch (error) {
      console.error('Worker request error', pathname, error);
      result = failed('Server issue. Please try again or contact Carmen.', 500);
    }
    const headers = new Headers(result.headers);
    Object.entries(allowed).forEach(([name, value]) => headers.set(name, value));
    return new Response(result.body, { status: result.status, headers });
  },
  async scheduled(_controller, env) {
    await initializeAndRollover(env);
    await cleanup(env);
  }
};
