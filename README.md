# 🦖 Spendosaurus

A lightweight, mobile-first Progressive Web App (PWA) designed for families to track big-ticket expenses, plan estimates, and incrementally tack on payments with zero friction and intuitive touch gestures.

---

## 🌟 Key Features

* **Incremental Cost Tack-On**: Set an initial estimated budget for a major expense, then quickly log each installment or partial bill as it is paid to monitor variances in real time.
* **10% Budget Tolerance**: Expenses within 10% of estimated budget are considered on-budget with clean green feedback before warning alerts trigger.
* **Swipe & Touch Gestures**:
  * Swipe card right: Advance lifecycle status (`Planned` ➔ `In Progress` ➔ `Completed`).
  * Swipe card left: Open full item breakdown and audit history.
  * Drag modal handle down: Smoothly dismiss sheet.
  * Triple-tap / long-press dinosaur mascot: Instant zero-friction cache wipe and update reload.
* **Mobile-First PWA & Edge Back Navigation**: Integrated with browser History API so Android/iOS edge back gestures unwind modal screens seamlessly.
* **Dual Currency Support**: Switch effortlessly between `RON` (Romanian Leu) and `EUR` (Euro) with customizable big-ticket thresholds.
* **Invite-Based Authentication**: Seamless pairing via the `pwa-invite-console` framework. Admin endpoints require a shared secret in `X-Admin-Token`, supplied from `ADMIN_TOKEN` and injected by the tailnet-only listener; without it they answer 404.
* **Comprehensive Audit Trail**: Every item creation, status transition, cost tack-on, and deletion is recorded with timestamp and actor attribution.

---

## 🛠️ Architecture

* **Backend**: Node.js 22 (Express) with built-in `node:sqlite` (`DatabaseSync`) in WAL mode.
* **Frontend**: Vanilla ES modules, native Web APIs, network-first Service Worker caching with offline shell fallback, dynamic SVG dinosaur mascot generator.
* **Deployment**: Podman Quadlet / Containerfile + Caddy reverse proxy.

---

## 🚀 Quick Start

Use Node.js 24 or newer, npm and `openssl`. The PWA needs a server; an offline
shell is not an offline queue for spending entries. Run in a fresh checkout:

```bash
npm install
npm test
umask 077
printf 'ADMIN_TOKEN=%s\nPUBLIC_BASE_URL=http://127.0.0.1:3090\nPORT=3090\nDATA_DIR=./data\n' \
  "$(openssl rand -hex 32)" > .env
set -a
. ./.env
set +a
npm run dev
```

Do not overwrite an existing `.env`. Open <http://127.0.0.1:3090/>. To create the
first device invitation, load that same private environment in another terminal:

```bash
set -a
. ./.env
set +a
curl --fail http://127.0.0.1:3090/api/admin/invites \
  -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  --data '{"label":"Demo device"}'
```

Open the returned invitation URL. An unset `ADMIN_TOKEN` deliberately denies
admin access. `.env.example` lists the production variables. Use the exact HTTPS
origin for `PUBLIC_BASE_URL` in deployment; keep the backend on a private network
and block `/api/admin/*` on public routes. See `deploy/Caddyfile.snippet` and
`deploy/Containerfile` for the proxy and image examples.

## Data and recovery

`DATA_DIR` contains `spendosaurus.db` and its SQLite journal files. Stop the app
before copying the complete directory to a private backup location, and restore
it with the same private configuration before restarting. Never commit that
directory, invitations, household expenses or exported records.

This repository is the self-hosted PWA. The separate
[Spendosaurus encryption core](https://github.com/zandaulion/spendosaurus-security)
documents the Android app’s encryption and backend contract; those guarantees
must not be assumed to apply to this SQLite PWA.
[Public project overview](https://zandaulion.com/spendosaurus.html).

## 📄 License
GPL-3.0-or-later


## Support and contributions

Use this repository’s Issues for reproducible bugs and focused feature requests. Include the version, relevant runtime/browser, expected behavior and a minimal synthetic example. Remove credentials, personal records, device identifiers and deployment-specific values before sharing logs or screenshots.

Run `npm test` for spending, authentication and API changes; use a temporary data directory for manual trials.

Keep changes focused and update the affected documentation. Security-sensitive reports should follow [SECURITY.md](SECURITY.md).
