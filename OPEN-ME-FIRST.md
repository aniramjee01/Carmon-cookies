# 🍪 Carmen Cookie Jar — ONE VS Code project

Everything is in this one folder. Open **Carmen-Cookie-Jar.code-workspace** in VS Code, or choose **File → Open Folder** and select this extracted folder.

## Folder guide

- **site/** — all storefront HTML, CSS, JavaScript, cookie photos, checkout UI and admin dashboard. The CSS and photo paths are relative to the HTML and stay connected.
- **backend/** — Cloudflare Worker API, Square hosted checkout support, shared inventory logic and D1 database migration.
- **.github/workflows/deploy-pages.yml** — automatically publishes the `site/` folder to GitHub Pages whenever you push changes to `main`.
- **START-PREVIEW.command** — Mac local static preview (requires Python 3; **no npm**).
- **README.md** — complete Square / database / live order setup instructions.

## Preview on Mac

Double-click `START-PREVIEW.command` or run `python3 -m http.server 5500 --directory site` at this folder's root, then visit http://localhost:5500. You can also open `site/index.html` directly, but the local preview is nicer. The static preview does not place real paid orders.

## Upload the ENTIRE folder to GitHub as one project

Create a GitHub repository, upload all contents of this folder (including the hidden `.github` directory), and push to `main`.

In your repository select **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included workflow will publish **only `site/`**. This keeps `backend/` in the same VS Code / GitHub project without trying to run backend code on GitHub Pages.

If you upload using GitHub's browser UI, hidden `.github` folder must also be included; using VS Code Source Control or `git add .` is more reliable.

## Activate real checkout and shared stock

GitHub Pages alone cannot securely run Square or shared stock. Follow `README.md` to deploy `backend/` to Cloudflare Workers + D1, configure the Square account in Cloudflare **secrets**, and update `site/config.js` with the public API URL. Do not add Square secret tokens to source files or commit them to GitHub.

**Until that backend and Square are configured and tested, the site is a preview / text-order-request experience, not an automated checkout.**
