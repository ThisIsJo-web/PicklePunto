# 🏓 PicklePunto Arena & Club — Staff Operations & Training Manual

Welcome to the **PicklePunto Staff Operations Manual**. This guide provides step-by-step instructions for front-desk reception, court marshals, and management staff on daily facility operations, court scheduling, counter walk-ins, Point-of-Sale (POS) tabs, inventory controls, and player management.

---

## 1. Facility Overview & System Roles

PicklePunto operates 4 tournament-grade pickleball courts with active session tracking:

| Court | Surface Type | Standard Rate | Operating Hours |
|---|---|---|---|
| **Court 1 — Center Court (Indoor)** | Pro Cushion Acrylic | ₱600.00 / hr | 06:00 – 22:00 |
| **Court 2 — North Court (Outdoor)** | Hardcourt Acrylic | ₱450.00 / hr | 08:00 – 22:00 |
| **Court 3 — South Court (Outdoor)** | Hardcourt Acrylic | ₱450.00 / hr | 08:00 – 22:00 |
| **Court 4 — Training Court (Covered)** | Polyurethane Cushion | ₱500.00 / hr | 07:00 – 21:00 |

### Staff Login Accounts
- **Admin Panel:** Navigate to `http://localhost:3000/admin/schedule`
- **Default Staff Account:** `staff@picklepunto.com`
- **Director / Admin Account:** `admin@picklepunto.com`

---

## 2. Daily Shift SOPs

### Morning Opening Checklist (05:45 AM)
1. Log in to the Admin Dashboard and open the **Schedule Grid** (`/admin/schedule`).
2. Verify that all 4 courts reflect active status with no accidental blocks.
3. Check **Inventory** (`/admin/inventory`) to verify paddle rental availability and beverage stock.
4. Confirm front-desk cash float (suggested ₱2,000 in loose change) and test receipt printer connectivity.

### Evening Closing Checklist (10:00 PM)
1. Go to **POS & Counter** (`/admin/pos`) and ensure all open court tabs are closed or settled.
2. Navigate to **Reports** (`/admin/reports`) to review the day's total gross sales and occupancy.
3. Conduct physical inventory count for pro shop retail and paddles; record any discrepancies using **⚡ Adjust Stock** (`/admin/inventory`) with reason tag `= Physical Audit`.

---

## 3. Court Schedule & Booking Management

### Schedule Grid Color Codes
- 🟩 **Green (Available):** Court is open for booking or immediate walk-in assignment.
- 🟦 **Blue (Confirmed):** Reservation is confirmed and paid.
- 🟨 **Yellow (Awaiting Payment / Reserved):** Player has reserved the slot; payment pending at counter.
- 🟥 **Red (Blocked):** Court locked for maintenance, coaching clinic, or tournament.
- ⬛ **Hatched Dark:** Outside operating hours for that specific court.

### Booking Court Time from Admin
1. Click any available time slot on the schedule grid, or click **+ New Booking**.
2. Select Court, Start Time, and Duration (30, 60, or 90 minutes).
3. Select an existing registered player from the dropdown, or toggle **Walk-In Guest** mode.
4. Add equipment rentals if requested (Paddles: ₱50/ea, Balls: ₱30/ea).
5. Choose payment method: **Cash**, **E-Wallet (GCash/Maya)**, or **Pay Later at Counter**.

---

## 4. Strict 30-Minute Physical Arrival Rule (No-Show Policy)

> [!IMPORTANT]
> **Arrival Rule Enforcement:**
> Online and phone reservations are protected upon booking. However, if players **do not physically arrive on-site within 30 minutes** of their scheduled start time:
> 1. The system automatically marks the reservation status as `NO_SHOW`.
> 2. The booked court slot is immediately reopened on the schedule grid as an available slot.
> 3. Staff may immediately reassign the opened court slot to waiting walk-in players.

### Late Arrival Resolution
If players arrive after the 30-minute grace period has voided their reservation:
- Check if the court was already reassigned to a walk-in player.
- If the court is still unassigned, staff can create an on-demand session for the remaining time.
- If the court is now occupied by walk-ins, offer the players the next available open slot or an alternative court.

---

## 5. Front-Desk Walk-In Flow

For players arriving directly at the reception counter without prior reservation:
1. Click the open slot on the Schedule grid, or click **+ New Booking** and toggle **Counter Walk-In**.
2. Enter the player's name and contact phone.
3. Select duration and collect tender:
   - **Cash:** Enter amount tendered; system displays exact change due.
   - **GCash / Maya:** Show the counter QR stand, verify payment reference number, and record the last 4–6 digits in the reference field.
4. The reservation confirms instantly and activates the court.

---

## 6. Point of Sale (POS) & Open Court Tabs

### Opening a Court Tab
1. Navigate to **POS & Counter** (`/admin/pos`).
2. In the right panel, select an active court (e.g., *Court 1 — Center Court*) or select *Walk-In Customer*.
3. Click items from the catalog (Beverages, Grips, Towels, Energy Bars) to add them to the tab cart.
4. Items remain attached to the court tab while the players enjoy their game.

### Settling / Checking Out a Tab
1. Select the open tab in the right-hand panel.
2. Click **Checkout Tab**.
3. Choose **Cash** (click quick tender buttons ₱100, ₱500, ₱1,000 for quick change calculation) or **E-Wallet**.
4. Click **Complete Payment**:
   - Stock quantities automatically deduct from inventory.
   - A printable thermal receipt slip opens with standard format for printing or digital copy.
   - The tab closes and is archived to the player's lifetime profile.

---

## 7. Inventory Controls & Stock Alerts

### Quick Stock Adjustments (`/admin/inventory`)
When a new supplier delivery arrives or items are damaged:
1. Click **⚡ Adjust** on the product row.
2. Select mode:
   - `➕ Restock (+)`: Adds delivery quantities.
   - `➖ Deduct (-)`: Accounts for breakages, damaged rackets, or expired drinks.
   - `🎯 Set Count (=)`: Overwrites to match physical stock count.
3. Click a predefined reason tag or type a custom memo.
4. Click **Confirm Adjustment**.

### Low-Stock Alerts
- Products at or below their reorder threshold display amber and red warning badges.
- Click **🔔 Audit Low Stock** on the top bar to trigger the automated alert sweep and log staff email notifications.

---

## 8. Customer Roster & Private Staff Notes (`/admin/customers`)

### Viewing Player History & Notes
1. Click any player row in the Customer Directory to open their slide-out profile drawer.
2. Review lifetime stats:
   - Total Court Spend vs. POS Refreshments Spend.
   - Booking Reliability ratio (Confirmed vs. No-Shows).
   - Full past booking history and active tabs.
3. **Staff Notes:** Type private observations in the notes box (e.g., *"Prefers Court 1 indoor due to lighting; plays doubles with Alex R."*) and click **Save Staff Notes**.
4. **Export CSV:** Click **📥 Export CSV** to download a spreadsheet roster of all registered players and lifetime spend.

---

## 9. Facility Settings & Emergency Blockouts

### Setting System Policies (`/admin/settings`)
Only Director/Admin accounts can modify facility-wide policies:
- **Arrival Grace Period:** Default `30 mins`.
- **Cancellation Grace Window:** Default `12 hours` before session start time.
- **Operating Hours:** Facility opening (`06:00`) and closing (`22:00`).
- **E-Wallet Coordinates:** GCash and Maya account names & numbers displayed on customer-facing screens.

### Emergency Court Blocks
If a net breaks, court surface is wet, or private tournament requires court reservation:
1. On the Schedule grid, click **Block Court Time**.
2. Select court, start time, end time, and reason (*"Surface Cleaning"*, *"Net Repair"*, *"Private Clinic"*).
3. The court immediately locks in red across both admin and player portal grids.
