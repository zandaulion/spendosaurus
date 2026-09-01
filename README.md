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
* **Invite-Based Authentication**: Seamless pairing via the `pwa-invite-console` framework (`X-Admin` authorization + token-based device management).
* **Comprehensive Audit Trail**: Every item creation, status transition, cost tack-on, and deletion is recorded with timestamp and actor attribution.

---

## 🛠️ Architecture

* **Backend**: Node.js 22 (Express) with built-in `node:sqlite` (`DatabaseSync`) in WAL mode.
* **Frontend**: Vanilla ES modules, native Web APIs, Service Worker offline caching (`stale-while-revalidate`), dynamic SVG dinosaur mascot generator.
* **Deployment**: Podman Quadlet / Containerfile + Caddy reverse proxy.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
```bash
npm test
```

### 3. Start Development Server
```bash
npm run dev
```

---

## 📄 License
GPL-3.0-or-later
