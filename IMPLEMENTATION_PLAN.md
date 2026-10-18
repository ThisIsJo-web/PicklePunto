# 🏓 PicklePunto — Pickleball Booking System
## Implementation Plan (MVP)

> **Version:** 1.1 · **Date:** October 2026  
> **Scope:** Four core modules covering Court Booking, POS, Player Portal, and Admin Back Office.
> **Status:** ✅ All design decisions finalized — ready for development.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Schema](#4-database-schema)
5. [Module Breakdown](#5-module-breakdown)
6. [Roles & Permissions](#6-roles--permissions)
7. [API Surface](#7-api-surface)
8. [Phased Rollout](#8-phased-rollout)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Open Questions & Decisions](#10-open-questions--decisions)

---

## 1. Project Overview

**PicklePunto** is a full-stack web application that manages pickleball court reservations,
point-of-sale transactions, player-facing bookings, and administrative back-office operations
for a pickleball facility.

### Goals
- Eliminate double-bookings through a real-time scheduling engine
- Streamline counter operations with a fast POS and open-tab system
- Empower players to self-serve reservations and receive automated confirmations
- Give facility admins actionable daily insights without complex BI tooling

### Core Users

| Role | Primary Capabilities |
|---|---|
| **Player / Customer** | Book courts, join open play, buy equipment/gear, pay online |
| **Court Admin / Facility Staff** | Manage bookings, operate POS, view schedules, manage inventory |

---

## 2. Tech Stack

### Frontend
| Concern | Technology |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Language | **TypeScript** |
| Styling | **Vanilla CSS** + CSS Modules |
| State Management | **Zustand** (client state) + React Server Components |
| Real-time UI | **WebSockets** via Supabase Realtime |
| Calendar/Grid | **FullCalendar.io** (Resource Timeline view) |
| Forms | **React Hook Form** + **Zod** validation |

### Backend
| Concern | Technology |
|---|---|
| Runtime | **Node.js** via Next.js API Routes / Route Handlers |
| Database | **PostgreSQL** (via **Supabase**) |
| ORM | **Prisma** |
| Auth | **Supabase Auth** (email/password + magic link) |
| File Storage | **Supabase Storage** (receipts) |
| Email | **TBD** — email provider not yet selected; skeleton integration in MVP |
| Payments | **MVP Skeleton** — personal e-wallet QR / mobile number display; no payment gateway integration in MVP |
| Background Jobs | **Inngest** (reminders, low-stock alerts) |

### Infrastructure
| Concern | Technology |
|---|---|
| Hosting | **Vercel** (frontend + serverless functions) |
| Database Hosting | **Supabase** (managed Postgres) |
| CI/CD | **GitHub Actions** |
| Error Tracking | **Sentry** |

> **⚠️ Payment Note:** MVP uses a skeleton payment flow — the system records the amount due and displays the facility's personal e-wallet QR code / mobile number for manual transfer. Staff confirms payment manually. A real payment gateway will be integrated post-MVP once the provider is selected.

> **⚠️ Email Note:** Email confirmation and reminder flows are architected but will use a placeholder/log-only implementation until the email provider is finalized.

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                         CLIENT                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Player Portal  │  │  POS Screen  │  │ Admin Back │  │
│  │  (Next.js)      │  │  (Next.js)   │  │ Office     │  │
│  └────────┬────────┘  └──────┬───────┘  └─────┬──────┘  │
└───────────┼──────────────────┼─────────────────┼─────────┘
            │                  │                 │
            ▼                  ▼                 ▼
┌───────────────────────────────────────────────────────────┐
│                    Next.js API Layer                       │
│  /api/bookings  /api/pos  /api/inventory  /api/users      │
│  /api/payments  /api/reports  /api/notifications          │
└─────────────────────────┬─────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
  ┌──────────────────┐       ┌──────────────────────┐
  │   Supabase DB    │       │   Third-Party APIs    │
  │  (PostgreSQL)    │       │  Email TBD /          │
  │  + Realtime      │       │  Inngest / Sentry     │
  └──────────────────┘       └──────────────────────┘
```

### Key Patterns
- **Optimistic UI updates** for booking grid interactions
- **Row-Level Security (RLS)** in Supabase for data isolation by role
- **Manual payment confirmation** — staff marks bookings as paid after verifying e-wallet transfer
- **Event-sourced** booking state transitions: `PENDING → AWAITING_PAYMENT → CONFIRMED → CANCELLED`

---

## 4. Database Schema

### Core Tables

```sql
-- Users & Roles
users (id, email, full_name, phone, role: PLAYER|STAFF|ADMIN, created_at)
-- Note: liability_waivers table NOT required (waiver flow removed from scope)

-- Facility
courts (
  id, name, surface_type, is_active, hourly_rate,
  opening_time TIME,   -- per-court operating hours
  closing_time TIME,   -- per-court operating hours
  created_at
)
court_blocks (id, court_id, blocked_from, blocked_to, reason, created_by)

-- Bookings
bookings (
  id, court_id, lead_booker_id,
  start_time, end_time, duration_minutes,
  status: PENDING|AWAITING_PAYMENT|CONFIRMED|CANCELLED|NO_SHOW,
  total_amount, payment_confirmed_by,  -- staff user_id who confirmed e-wallet payment
  payment_confirmed_at, is_walk_in, walk_in_guest_name, walk_in_guest_phone, walk_in_guest_email,
  notes, created_at
)
booking_participants (id, booking_id, user_id, share_amount, payment_status)
-- Note: no stripe_payment_intent_id; payment tracked manually

-- Equipment & Inventory
products (id, name, category: RENTAL|RETAIL|FOOD_DRINK, price, stock_qty, low_stock_threshold, sku)
booking_addons (id, booking_id, product_id, quantity, unit_price)

-- POS / Tabs
pos_tabs (id, court_id, player_id, opened_at, closed_at, status: OPEN|CLOSED)
pos_tab_items (id, tab_id, product_id, quantity, unit_price, added_at)
transactions (
  id, tab_id, booking_id, amount,
  payment_method: CASH|EWALLET|SPLIT,  -- EWALLET = QR/mobile number transfer
  payment_reference,                   -- e-wallet reference number (manual entry)
  receipt_url, created_at
)

-- Notifications (schema ready; provider TBD)
notification_log (id, user_id, type: EMAIL, template, sent_at, status)

-- Facility Settings
facility_settings (id, key, value, updated_at)
-- Seed values: cancellation_grace_hours=12, court_count=4, location_mode=SINGLE
```

### Key Relationships

```
courts ──< bookings ──< booking_participants
                   ──< booking_addons ──> products
courts ──< pos_tabs ──< pos_tab_items ──> products
                   ──< transactions
users ──< bookings (lead_booker)
users ──< booking_participants
```

---

## 5. Module Breakdown

---

### Module A — Court Booking & Schedule Engine

**Goal:** Provide a real-time, conflict-free reservation system for courts,
visible to both staff and players.

#### A.1 · Interactive Schedule Grid

| Feature | Detail |
|---|---|
| View | FullCalendar Resource Timeline — courts on Y-axis, time on X-axis |
| Real-time sync | Supabase Realtime subscription on `bookings` table |
| Slot states | `Available` (green) · `Booked` (blue) · `Blocked` (grey/red) · `In Progress` (amber) |
| Interaction | Staff click a slot to open a quick-booking panel; players see read-only |
| Court blocking | Admins can drag to block time ranges (maintenance, events) |

**Implementation Steps:**
1. Install and configure `@fullcalendar/react`, `@fullcalendar/resource-timeline`
2. Build `CourtScheduleGrid` server component fetching initial slot data
3. Layer a `useRealtimeBookings()` hook (Supabase channel subscribe) for live diffs
4. Implement `BookingDrawer` side panel (form: date, duration, player lookup)
5. Write `POST /api/bookings` with **advisory locking** in Postgres to prevent double-books
6. Add `court_blocks` CRUD in admin panel

#### A.2 · Flexible Slot Durations

Supported blocks: **30 min · 60 min · 90 min**

- Duration selector rendered as pill buttons in booking form
- Price auto-calculates: `court.hourly_rate * (duration / 60)`
- Grid snaps to 30-minute increments

#### A.3 · Split Payment / Individual Shares

**Flow (MVP — Manual E-Wallet):**
```
Lead Booker creates booking
  → Selects number of players
  → System calculates per-person share
  → Booking status = AWAITING_PAYMENT
  → System displays facility e-wallet QR code / mobile number + amount due
  → Lead booker or each player transfers their share manually
  → Staff verifies transfer → marks booking as CONFIRMED in system
  → Partial payment status visible on staff dashboard per participant
```

- `booking_participants` table tracks each player's share amount and `payment_status: PENDING|PAID`
- No payment gateway in MVP — staff enters reference number to confirm payment
- Lead booker can pay the full amount (staff marks all participants as PAID)
- Unpaid shares do not auto-block courts; staff manages manually

> **Post-MVP:** When a payment gateway is selected, this flow upgrades to automated links per participant.

#### A.4 · Equipment Rental Add-ons

| Item | Handled As |
|---|---|
| Paddle rental | `products` (category: RENTAL) with stock tracking |
| Ball can | `products` (category: RETAIL) with stock tracking |

- Add-on selector appears on step 2 of booking form
- Deducts from `products.stock_qty` on `CONFIRMED` booking; restores on cancellation
- Rental items flagged for return tracking

---

### Module B — POS & Counter Sales

**Goal:** Give facility staff a fast, tablet-friendly checkout interface for walk-in
and in-session customers.

#### B.1 · Quick Checkout Screen

**Layout:** Split-pane — left: product catalog grid; right: current cart/tab

| Feature | Detail |
|---|---|
| Customer lookup | Search by name, phone, or court number |
| Walk-in mode | Require account — look up registered player by phone/email |
| Product grid | Filterable by category (Food/Drink, Rental, Retail) |
| Numpad | Quantity adjustment via on-screen numpad (tablet-optimized) |
| Payment | Cash with change calculator · E-wallet QR display with reference # entry |

**Implementation Steps:**
1. Build `POSLayout` with two-column CSS Grid
2. `ProductCatalogGrid` — pulls products from `/api/products`, filtered by category tabs
3. `CartPanel` — local state via Zustand, synced to `pos_tabs` on checkout
4. Payment modal: toggle Cash / E-Wallet; e-wallet shows QR image + amount; staff enters reference #
5. Cash payment flow with change calculator

#### B.2 · Open Tab Management

- Each active court session can have one open `pos_tab`
- Staff attach items during play; tab is closed at end of session or checkout
- Tab items visible on the court schedule grid (tooltip/popover on court block)
- `GET /api/pos/tabs?status=OPEN` — live list for staff dashboard

**Tab Lifecycle:**
```
Court Booking CONFIRMED → Auto-create pos_tab (optional)
Staff adds items → pos_tab_items grow
Session ends → Staff closes tab → Transaction created → Receipt issued
```

#### B.3 · Digital Receipts

| Type | Implementation |
|---|---|
| Email receipt | **TBD** — email provider not yet selected; receipt template ready, delivery skeleton only |
| Printable receipt | Browser `window.print()` with `@media print` CSS — **available in MVP** |
| Receipt URL | PDF stored in Supabase Storage, URL in `transactions.receipt_url` |

---

### Module C — Player Portal & Reservations

**Goal:** Self-service booking experience for players with automated communication.

#### C.1 · Real-time Court Availability

**Search UI:**
- Date picker → Time range filter → Court filter (optional)
- Available slots returned from `GET /api/courts/availability?date=&duration=`
- Results displayed as a simplified timeline or list-card view

**Availability Algorithm:**
```
For each court:
  Read court.opening_time and court.closing_time (per-court hours)
  Generate all 30-min slots within that court's operating hours
  Remove slots overlapping active bookings (PENDING, AWAITING_PAYMENT, or CONFIRMED)
  Remove slots overlapping court_blocks
  Return remaining slots grouped by court
```

#### C.2 · Booking Confirmations & Reminders

| Event | Action | MVP Status |
|---|---|---|
| Booking AWAITING_PAYMENT | On-screen payment instructions shown | ✅ MVP |
| Booking CONFIRMED (staff-verified) | Email confirmation + `.ics` calendar invite | ⏳ Email skeleton (provider TBD) |
| T-24 hours | Reminder email with booking details + cancellation link | ⏳ Email skeleton |
| T-1 hour | SMS/push reminder | 🔜 Post-MVP |
| Booking CANCELLED | Cancellation notice on-screen | ✅ MVP |
| Rescheduling | Updated booking detail page | ✅ MVP |

**Calendar Invite (`.ics`):**
- Generated server-side using `ical-generator` npm package
- Attached to confirmation email (active once email provider is finalized)

**Cancellation Policy — Finalized:**
- **12-hour grace window**: Free cancellation if cancelled > 12 hours before session start
- Late cancellations (< 12 hours): No automatic refund in MVP — staff handles case-by-case
- Policy terms displayed at booking confirmation step and in portal booking detail

**Player Portal Pages:**
```
/portal                   → Dashboard: upcoming bookings, past history
/portal/book              → Court search + booking flow (3-step wizard)
/portal/bookings/[id]     → Booking detail: status, participants, add-ons, cancel/reschedule
/portal/profile           → Contact info, account settings
```

---

### Module D — Admin Back Office & Analytics

**Goal:** Give facility managers a birds-eye view of operations without complex reporting setup.

#### D.1 · Dashboard Overview

**Metrics (Daily / Weekly toggle):**

| KPI | Source |
|---|---|
| Total Sales | `SUM(transactions.amount)` grouped by day |
| Court Occupancy Rate | `booked_slots / total_available_slots * 100` per court |
| Peak Usage Hours | Histogram of booking start times |
| Revenue by Category | Court rentals vs. retail vs. food/drink |
| Active Tabs | Count of open `pos_tabs` right now |

**Charts:**
- Revenue bar chart (daily)
- Occupancy heatmap (courts × hours)
- Peak hours line chart

**Implementation:** Server-rendered data with `recharts` for visualization.

#### D.2 · Basic Inventory Management

| Feature | Detail |
|---|---|
| Product list | Table: SKU, name, category, price, stock, threshold |
| Stock adjustment | Manual +/- with reason log |
| Low-stock alert | Inngest job: daily check → email admin if `stock_qty <= low_stock_threshold` |
| Rental tracking | Flag rental items; link to active booking for return status |

**Pages:**
```
/admin/inventory          → Product list + inline edit
/admin/inventory/new      → Add product form
/admin/inventory/[id]     → Edit product, view stock history
```

#### D.3 · Customer Database

| Feature | Detail |
|---|---|
| Player directory | Searchable table: name, email, phone, join date |
| Purchase history | All transactions linked to a player |
| Notes | Staff-only notes field on player profile |
| Export | CSV export of player list |

> **Note:** Liability waiver tracking removed from scope.

**Pages:**
```
/admin/customers          → Player directory with search/filter
/admin/customers/[id]     → Player profile: contact, purchase history, notes
```

---

## 6. Roles & Permissions

| Permission | Player | Staff | Admin |
|---|---|---|---|
| View court availability | ✅ | ✅ | ✅ |
| Create own booking | ✅ | ✅ | ✅ |
| Create booking for others | ❌ | ✅ | ✅ |
| Cancel / reschedule any booking | ❌ | ✅ | ✅ |
| Block court time | ❌ | ✅ | ✅ |
| Operate POS | ❌ | ✅ | ✅ |
| View all transactions | ❌ | ✅ | ✅ |
| View analytics dashboard | ❌ | Read-only | ✅ |
| Manage inventory | ❌ | ❌ | ✅ |
| Manage users / roles | ❌ | ❌ | ✅ |
| Configure system settings | ❌ | ❌ | ✅ |

> Enforced via **Supabase Row Level Security (RLS)** policies + **Next.js middleware** route guards.

---

## 7. API Surface

### Bookings
```
GET    /api/courts                          → List all active courts
GET    /api/courts/availability             → ?date=&duration=&court_id=
POST   /api/bookings                        → Create booking (with advisory lock)
GET    /api/bookings/:id                    → Booking details
PATCH  /api/bookings/:id                    → Update status / reschedule
DELETE /api/bookings/:id                    → Cancel booking + trigger refund
POST   /api/bookings/:id/participants       → Add split-payment participant
```

### POS
```
GET    /api/pos/tabs                        → List tabs (?status=OPEN)
POST   /api/pos/tabs                        → Open new tab
POST   /api/pos/tabs/:id/items              → Add item to tab
DELETE /api/pos/tabs/:id/items/:itemId      → Remove item from tab
POST   /api/pos/tabs/:id/checkout           → Close tab + create transaction + receipt
```

### Inventory
```
GET    /api/products                        → List products (?category=)
POST   /api/products                        → Create product
PATCH  /api/products/:id                    → Update product / stock adjustment
```

### Users & Auth
```
POST   /api/auth/signup                     → Player registration (account required)
POST   /api/auth/signin                     → Sign in
GET    /api/users/:id                       → Player profile
PATCH  /api/users/:id                       → Update profile
```

### Payments (MVP — Manual)
```
GET    /api/payments/ewallet-info           → Returns QR image URL + mobile number for display
POST   /api/bookings/:id/confirm-payment    → Staff marks booking as CONFIRMED + logs reference #
POST   /api/pos/tabs/:id/confirm-payment    → Staff marks tab payment as received
```

### Reports
```
GET    /api/reports/daily-summary           → ?date=
GET    /api/reports/occupancy               → ?from=&to=
GET    /api/reports/revenue                 → ?from=&to=&group_by=day|week
```

### Webhooks
```
POST   /api/webhooks/inngest               → Background job callbacks (reminders, alerts)
```

---

## 8. Phased Rollout

### Phase 1 — Foundation (Weeks 1–3)
- [x] Project scaffolding: Next.js, Supabase, Prisma setup
- [x] Auth: signup, login, role-based middleware
- [x] Database schema migrations
- [x] Courts CRUD (admin)
- [x] Basic booking creation (no payments)
- [x] Admin court schedule grid (read-only)

### Phase 2 — Booking Engine (Weeks 4–6)
- [x] Interactive schedule grid with real-time updates
- [x] Full booking flow with duration selection (30/60/90 min)
- [x] Per-court operating hours configuration in admin
- [x] Court blocking (admin drag-to-block / modal block)
- [x] E-wallet payment skeleton: QR display + staff manual confirmation flow
- [x] Split payment participant tracking (manual confirmation per share)
- [x] Equipment rental add-ons
- [x] Seed: 4 courts with individual operating hours

### Phase 3 — Player Portal & Scheduling Grid Fixes (Completed & Verified)
- [x] Player self-service booking wizard (account required)
- [x] Real-time booking reflection on Admin Schedule grid for all actions (booking, reservation, rescheduling, cancellation)
- [x] 30-minute on-site physical arrival grace period: Reservations are NOT voided after creation; if players do not show up on-site within 30 minutes of their scheduled reservation start time, the court is voided to NO_SHOW and reopened as an available slot
- [x] Calendar `.ics` generation and buttons completely removed from player portal and backend
- [x] Past date/time constraints strictly enforced on both player portal and admin panels (zero past bookings allowed)
- [x] Rescheduling bug fixed: future date rescheduling (5 days ahead, etc.) accurately syncs with Admin Schedule timeline grid
- [x] Cancellation flow with 12-hour grace window check
- [x] Player dashboard: upcoming / past bookings with live 30-min on-site check-in reminders

### Phase 4 — POS & Tabs (Completed & Verified)
- [x] POS quick checkout screen (registered player lookup, walk-in customer support)
- [x] Open tab management (court tabs, attach items mid-session, load to POS, void with stock restore)
- [x] Payment modal: Cash (with quick tender buttons + live change calc) + E-wallet QR (with reference # entry)
- [x] Printable paper receipts (`@media print` thermal slip styling)
- [x] Email receipt skeleton (queued in notification_log table)

### Phase 5 — Admin Back Office (Completed & Verified)
- [x] Analytics dashboard (live daily summary, multi-day revenue trend bar charts, court occupancy heatmap & capacity progress, peak playing hours histogram)
- [x] Inventory management with stock alerts (inline +/- quick adjust with reason audit, category pills, search, add/edit/delete product modals)
- [x] Customer database (searchable directory, lifetime spend calculation, detailed slide-out profile drawer, staff notes editor with live save)
- [x] CSV player export (RFC 4180 compliant download via `GET /api/customers/export`)
- [x] Low-stock alert jobs / audit endpoint (`POST /api/cron/low-stock-check` queuing to `notification_log`)
- [x] Facility settings panel (12-hour cancellation grace window, 30-minute on-site physical arrival voiding rule, court operating hours, e-wallet GCash/Maya coordinates)

### Phase 6 — Polish & Launch (Completed & Verified)
- [x] End-to-end QA across all roles (Player self-booking/dashboard, Staff schedule/POS/walk-ins, Admin analytics/inventory/customers/settings)
- [x] Mobile responsiveness pass (slide-out mobile drawer, touch scrolling, responsive cards, 10" tablet POS layout, and compact forms)
- [x] Performance audit & database indexing (compound indexes on `bookings`, `court_blocks`, `products`, `pos_tabs`, `transactions`, sub-second loads)
- [x] Sentry & production error monitoring bridge (`lib/sentry.ts`, `app/error.tsx`, `app/global-error.tsx`)
- [x] Production build validation (`npm run build` succeeds cleanly with 18 static/dynamic routes generated)
- [x] Staff training documentation (`STAFF_TRAINING_MANUAL.md` with opening/closing SOPs, 30-min arrival grace voiding rule, POS, tabs, and inventory adjustments)

### Post-MVP — Payment & Email Integration
- [ ] Select and integrate email provider (replace skeleton with live sends)
- [ ] Evaluate and integrate payment gateway for online bookings
- [ ] Upgrade split payment flow to automated participant payment links
- [ ] SMS / push notification reminders

---

## 9. Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Booking conflict prevention** | Advisory locks + DB unique constraints on overlapping time ranges |
| **Real-time latency** | < 500ms for schedule grid updates via Supabase Realtime |
| **Uptime** | 99.9% (Vercel + Supabase managed infra) |
| **Mobile responsiveness** | Player portal fully responsive; POS optimized for 10" tablet |
| **Security** | RLS policies, HTTPS only, input sanitization (no PCI scope in MVP — no card processing) |
| **Accessibility** | WCAG 2.1 AA for player-facing pages |
| **Scalability** | Stateless API routes; horizontal scaling via Vercel |
| **Data backup** | Supabase daily automated backups + point-in-time recovery |
| **Single location** | No multi-tenant or multi-location architecture in MVP |

---

## 10. Finalized Design Decisions

> All design decisions have been resolved. This section serves as a permanent decision log.

| # | Decision | Resolution | Impact |
|---|---|---|---|
| 1 | **Operating hours** | ✅ **Per-court** — each court has its own `opening_time` and `closing_time` | `courts` table has per-court time fields; availability algorithm reads per-court hours |
| 2 | **Email reminders** | ✅ **Email only** (no SMS in MVP); provider **TBD** — skeleton/log implementation until provider selected | Email flows architected; delivery held until provider finalized |
| 3 | **Payments** | ✅ **MVP Skeleton** — personal e-wallet QR code / mobile number displayed; staff manually confirms transfers; no payment gateway | No Stripe or PCI scope in MVP; `payment_method: EWALLET|CASH`; `payment_reference` field on transactions |
| 4 | **Liability waiver** | ✅ **Removed** — not required for MVP | `liability_waivers` table dropped; customer DB simplified |
| 5 | **Guest bookings** | ✅ **Account required** — players must register to book | No guest checkout flow; walk-ins are looked up by registered phone/email |
| 6 | **Cancellation window** | ✅ **12 hours** — free cancellation if > 12 hrs before start | `cancellation_grace_hours = 12` seeded in `facility_settings`; enforced in cancel API |
| 7 | **Initial courts** | ✅ **4 courts** — seeded at launch with individual operating hours | 4 court records in seed script; each configurable independently |
| 8 | **Multi-location** | ✅ **Single location only** — no multi-tenant architecture | No `location_id` FK; `facility_settings.location_mode = SINGLE` |

---

## 11. Post-MVP Backlog

| Item | Notes |
|---|---|
| Payment gateway integration | Evaluate provider after MVP; upgrade e-wallet skeleton to automated flow |
| Email provider selection | Pick and integrate (e.g., Resend, SendGrid, Postmark) |
| SMS / push notifications | Add Twilio or similar after email is stable |
| Stripe Terminal / in-person card | If facility wants card reader at counter |
| Open play / drop-in sessions | Group booking / join-open-play feature |
| Multi-location support | Architecture upgrade if expansion planned |
| Mobile app (PWA) | Progressive Web App shell for player portal |

---

*Document maintained in: `IMPLEMENTATION_PLAN.md`*  
*Last updated: October 2026 · Version 1.1 — All decisions finalized*
