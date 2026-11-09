# SINGLE PROJECT VERSION

Open `Carmen-Cookie-Jar.code-workspace` in VS Code and read `OPEN-ME-FIRST.md`. This repository now includes a GitHub Actions workflow to publish the `site/` folder while keeping the backend in the same project.

# 🍪 Carmen Cookie Jar — complete website + Square-ready backend

**Two deployable pieces:**

- `site/` — animated, responsive, static HTML/CSS/JavaScript storefront. Publish this directory to **GitHub Pages**. It does **not** require `npm start`.
- `backend/` — secure Cloudflare Worker API, D1 order database, Square-hosted checkout, webhook order confirmation, and real shared inventory. Publish this on **Cloudflare**, not GitHub Pages.

> **Important:** A static site cannot process Square access tokens, store real customer orders, or stop two customers from buying the last cookie. Do not take paid orders until the backend, Square webhook, and owner panel are tested. Live inventory is marked `PREVIEW` until the backend is configured. No actual Square account is included in this ZIP.

## 1. Preview immediately (no npm)

Open `site/index.html` in Chrome, Safari, or VS Code Live Server. Its CSS, JS and all SIX cookie photographs are bundled with RELATIVE paths. You will see **Preview mode**: try the animations, build a cookie box and text an order request. The preview stock values are not shared or authoritative.

Images live in `site/assets/`; replace JPEGs with your own images if desired, keeping the same filename. The new Snickerdoodle Cupcake photos are `snickerdoodle-cupcake.jpeg` and `snickerdoodle-detail.jpeg`.

## 2. Publish to GitHub Pages

1. Create a public repository, e.g. `carmen-cookie-jar`.
2. Upload **the contents of the `site/` folder** to your repository root (NOT the whole `site` parent folder, unless you configure GitHub Pages accordingly). `index.html`, `styles.css`, `app.js`, `config.js`, `admin.html`, `admin.js`, and the entire `assets/` directory must be at root.
3. GitHub repository → **Settings → Pages** → Deploy from branch → **main** → **/(root)** → Save.
4. Your URL will be `https://YOUR-GITHUB-USERNAME.github.io/carmen-cookie-jar/`.
5. Test it using that URL. `https://` is recommended for production checkout.

GitHub Pages hosts only the visible website. It **cannot run** the API in `/backend`.

## 3. What Carmen must supply from Square

You can create the Square account yourself; **never send or commit the secret token in a public chat/repository**. These are the items needed:

| Needed | Where / How used | Public or private? |
|---|---|---|
| Square seller account | Carmen's Square account, verified for accepting payments | Carmen controls |
| Square Location ID | Square Developer Dashboard / Locations; set in `backend/wrangler.toml` as `SQUARE_LOCATION_ID` | Public ID |
| Square access token | Square Developer Dashboard → application → production/sandbox credentials; set using `wrangler secret put SQUARE_ACCESS_TOKEN` | **Secret** |
| Square webhook subscription | Register event types `payment.created` and `payment.updated` to your deployed `/api/webhooks/square` URL | Config |
| Webhook signature key | Square webhook subscription settings; `wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY` | **Secret** |
| Exact webhook URL | `https://YOUR-WORKER.workers.dev/api/webhooks/square`; `wrangler secret put SQUARE_WEBHOOK_URL` | Exact URL required for verifying signatures |
| Admin key | Generate a long unique random secret; `wrangler secret put ADMIN_KEY` | **Secret** |
| Business/fulfillment policy | Pickup location (not publicly shown here), local delivery radius, tax, refund/cancellation terms, privacy policy | Carmen decides |

**Apple Pay:** Square-hosted checkout can offer Apple Pay on supported devices/browsers when enabled for the Square merchant. It is not manually switched on by adding an Apple Pay button to the site. **Zelle** is only offered through contacting Carmen; it is **not** an automated payment method here.

**Payment link permissions:** Square recommends `ORDERS_READ`, `ORDERS_WRITE`, `PAYMENTS_WRITE`; webhooks require `PAYMENTS_READ`. Verify permissions in the Square dashboard for the application.

## 4. Deploy the actual backend (Cloudflare + D1)

Create a Cloudflare account, install current Node.js (18+; current LTS recommended) on the development computer, and open a terminal in `backend/`.

```bash
npm install
npx wrangler login
npx wrangler d1 create carmen-cookie-jar-db
```

Cloudflare will show a generated database UUID. Paste it into `backend/wrangler.toml` at:

```toml
database_id = "REPLACE_WITH_YOUR_CLOUDFLARE_D1_DATABASE_ID"
```

Edit the following **public variables** in `backend/wrangler.toml`:

```toml
SITE_ORIGIN = "https://YOUR-GITHUB-USERNAME.github.io"
STOREFRONT_URL = "https://YOUR-GITHUB-USERNAME.github.io/carmen-cookie-jar/"
SQUARE_LOCATION_ID = "YOUR_SQUARE_LOCATION_ID"
SQUARE_ENVIRONMENT = "sandbox"
```

Use **sandbox** while testing. Your sandbox token and sandbox Location ID must match. The actual storefront URL should match your GitHub Pages project name.

Apply the database migration and deploy:

```bash
npx wrangler d1 migrations apply carmen-cookie-jar-db --remote
npx wrangler deploy
```

The terminal gives you a Worker URL, such as:

```text
https://carmen-cookie-jar-api.YOUR-SUBDOMAIN.workers.dev
```

Add the exact Worker URL to **`site/config.js`**:

```js
apiBase: "https://carmen-cookie-jar-api.YOUR-SUBDOMAIN.workers.dev",
```

Commit/push the updated `config.js` to GitHub.

**Add your secrets to Cloudflare** from the `backend/` folder:

```bash
npx wrangler secret put SQUARE_ACCESS_TOKEN
npx wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY
npx wrangler secret put SQUARE_WEBHOOK_URL
npx wrangler secret put ADMIN_KEY
```

Each command prompts you locally for the secret. It will NOT be in your public GitHub files. The webhook URL must be exactly `https://...workers.dev/api/webhooks/square` and match Square's subscription setting. Generate the `ADMIN_KEY` with a password manager (at least 24 random characters; preferably 40+). **Don't use an easy password.**

Create a Square webhook subscription to that URL, selecting both `payment.created` and `payment.updated`. Square signs webhook event notifications; the Worker verifies the signature against the exact URL and raw request body.

Test Square sandbox orders before switching to real money. When ready to accept real payments, replace the token and Location ID with their **production** equivalents and set `SQUARE_ENVIRONMENT="production"`. Never mix sandbox and production credentials.

## 5. Owner dashboard

Open `https://YOUR-GITHUB-USERNAME.github.io/carmen-cookie-jar/admin.html`.

Sign in with the private `ADMIN_KEY` entered into the browser form. The key is held **in memory only** (not in localStorage) and sent to the Worker via HTTPS. Do not share it. For larger businesses, replace this simple key with proper identity authentication and audit logs.

From the dashboard, Carmen can:

- View the current available stock for every flavor.
- Manually change a flavor's quantity (e.g. an unexpected batch adjustment).
- Hide / show a seasonal cookie without deleting its existing stock.
- View recent orders (up to 150; D1 stores more, pagination could be added).
- Mark Square-paid orders as confirmed, baking, ready, completed.
- Disable an unpaid checkout link and return its reserved stock.
- Manually add +12 to all flavors (only as a special override; it is **additional** to normal weekly additions).

**No checkout data is stored in the browser**. Orders are private in the D1 database and accessible through the owner dashboard only.

## 6. The weekly inventory policy

Every flavor is initially seeded with **12 available cookies**, including seasonal flavors.

The exact requested rule is **Sunday at 11:59 PM Eastern** (America/Indiana/Indianapolis):

```text
New available quantity = previous unsold available quantity + 12
```

Examples:

- Chocolate Chip starts with 12, sells 9 → 3 remain → next drop starts with 15.
- Oreo starts with 12, sells all 12 → 0 remain → next drop starts with 12.
- Biscoff starts with 12, sells 0 → 12 remain → next drop starts with 24.

The backend performs the week check before menu reads and new checkouts and on Cloudflare UTC Cron triggers that cover both Eastern daylight-saving offsets. This provides automatic resets even if the site is not viewed at 11:59 PM; on a trigger or the next API request, the same week is applied once.

**Inventory holds:** when a customer starts Square checkout, the selected cookie count is reserved immediately. A 30-minute unpaid session is eligible for expiration; the backend attempts to disable its Square link before returning that stock. This requires Cloudflare's scheduled trigger to run, and Square's API to accept the link deletion. If Square is unavailable, stock remains held until Carmen resolves it, which favors avoiding overselling. Webhook confirmation marks the order paid and leaves the reserved stock deducted.

**Important production limitations:** A real payment system still needs end-to-end testing for webhook delivery, refunds, cancellations, Square link/stock races, taxes, and operating policies before public launch. Square may enforce merchant tax settings or additional conditions not represented in the simple subtotal shown here. Paid refunds should be processed in Square; the admin site deliberately does not silently return sold stock.

## 7. Customize your site

| Change | File |
|---|---|
| Site's colors, typography, layout and animations | `site/styles.css` |
| Hero texts, page sections and brand name | `site/index.html` |
| Public Worker API URL and displayed pickup/delivery slots | `site/config.js` |
| Cookie photos | `site/assets/` |
| Live menu ingredients, names, prices, active flavor types | `backend/src/worker.js` (`CATALOG`) |
| Live pickup/delivery time validation | `backend/src/worker.js` (`timeSlots`) |
| Stock addition amount | `backend/src/worker.js` (`BASE_WEEKLY_ADD`) |
| Box prices and delivery fee | `backend/src/worker.js` (`BUNDLES`, `DELIVERY_CENTS`) |
| Owner dashboard | `site/admin.html` and `site/admin.js` |
| Database structure | `backend/migrations/0001_init.sql` |

**Keep frontend fallback menu and backend authoritative catalog aligned**. Changing price only in the frontend does NOT change Square checkout (by design). The backend computes all prices.

### Ingredient warning

The ingredient notes are **incomplete placeholders**, based on the user's shared list and typical cookies. They are **not full recipes**. Carmen must verify every flavor's ingredients and allergen list before accepting real orders (including egg, dairy, wheat, soy and shared-equipment cross-contact). No cookie should be marketed as safe for a specific allergy without verification.

### Food business rules

Before public launch, check applicable Indiana home-based food-business rules and Square requirements for the seller, product labeling, taxes and delivery. This project does not provide legal or food-safety certification.

## 8. Testing checklist

- [ ] All six cookie images load on GitHub Pages.
- [ ] No missing CSS or JavaScript in DevTools network panel.
- [ ] Mobile layout and scroll animation work without horizontal overflow.
- [ ] `GET /api/health` returns `{ "ok": true }` on Worker URL.
- [ ] `GET /api/menu` returns six flavors with actual D1 stock.
- [ ] Owner page refuses unauthorized access; correct key can sign in.
- [ ] Make a sandbox Square order; stock decreases at checkout.
- [ ] Use Square sandbox to pay; signed webhook marks it `paid`.
- [ ] Cancel an unpaid Square checkout and verify stock returns.
- [ ] Attempt to buy the last cookie twice; second checkout is rejected.
- [ ] Check daylight-saving timing and rollover in an isolated test database.
- [ ] Replace ingredient placeholders, define delivery area and policies.
- [ ] Do not send production secrets over chat or commit to GitHub.

## File tree

```text
carmen-cookie-jar-pro/
├── README.md
├── site/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js
│   ├── admin.html
│   ├── admin.js
│   ├── .nojekyll
│   └── assets/
│       ├── chocolate-chip.jpeg
│       ├── smores.jpeg
│       ├── oreo.jpeg
│       ├── biscoff.jpeg
│       ├── pumpkin-cheesecake.jpeg
│       ├── snickerdoodle-cupcake.jpeg
│       ├── snickerdoodle-detail.jpeg
│       └── favicon.svg
└── backend/
    ├── package.json
    ├── wrangler.toml
    ├── src/worker.js
    └── migrations/0001_init.sql
```

### References
- Square Checkout API: https://developer.squareup.com/reference/square/checkout/create-payment-link
- Square webhooks and signature validation: https://developer.squareup.com/docs/webhooks/step3validate
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- GitHub Pages: https://docs.github.com/en/pages
