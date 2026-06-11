# Resneo Expo App vs Web Dashboard Gap Report

**Last Updated:** June 11, 2026  
**Scope:** Comprehensive feature parity analysis for daily staff workflows

---

## PRIORITY 1: TOP 10 CRITICAL GAPS

1. **Day Sheet / Table Management** — Web has full table grid, floor plan & covers. App lacks entirely (tables/floor-plan/day-sheet routes).
2. **Floor Plan Editor** — Web: interactive canvas (KonvaCanvas, table layout, live preview). App: no equivalent.
3. **Data Import Hub** — Web: multi-step wizard (upload, validate, map, review, import). App: no import feature.
4. **Reports Tab (Settings)** — Web: detailed analytics dashboard (bookings, clients, no-shows, deposits, CSV export). App has partial metrics only.
5. **Class Timetable / Events** — Web: class scheduling, event tickets, class products, recurring classes. App: no support.
6. **Compliance Type Builder** — Web: template editor for compliance forms. App: can only fill existing forms, no create/edit templates.
7. **Practitioner Calendar (Staff Leave & Staff Overrides)** — Web: Staff leave calendar, service overrides by practitioner. App lacks these UI workflows.
8. **Settings → Advanced (All Tabs)** — Web has 8 major setting sections (opening hours, booking rules, business closures, floor plan, table management, etc.). App has 9 separate manage screens but no "Settings" hub page.
9. **Booking Page / Widget Preview** — Web: preview + customize booking page layout, branding, embed widget. App: opens web only.
10. **Addons Library Management** — Web: addon group creation, variant management, reusable addon templates. App has basic support, limited UI.

---

## BY FEATURE AREA

### CALENDAR & SCHEDULING

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Day/Week/Month view | Full (practitioner calendar) | Full (day/week/month) | None | — |
| Drag-move bookings | Yes (calendar + grid) | Yes (day view) | Week/month drag move | High |
| Drag-resize bookings | Yes | Yes (day view) | Week/month drag resize | High |
| Walk-in entry | Quick modal + form | FAB menu → form | None | — |
| Booking blocks/breaks | Create/edit/delete + class instances | Create/edit/delete one-offs only | Cannot block for classes | Medium |
| Status quick-actions | Inline buttons + bulk modal | Inline buttons only | No bulk status change in list | Medium |
| Calendar arrival toggle | Yes (with keyboard shortcut) | Yes (on detail sheet) | None | — |
| Calendar columns (multi-staff) | Admin: unlimited; Staff: self or managed | Single calendar chip switcher | Cannot view 2+ calendars simultaneously | Medium |

Gap: App only supports single-calendar view; web allows side-by-side staff calendars (accessibility loss).

---

### BOOKINGS & RESERVATIONS

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Search bookings | Full text (name, phone, email, ID) | Full text (same fields) | None | — |
| Sort bookings | 8 keys (time, client, status, service, staff, deposit, type, party size) | 8 keys (same) | None | — |
| Service filter | Yes (appointments) | Yes (appointments) | None | — |
| Staff filter | Yes (appointments) | Yes (appointments) | None | — |
| Bulk message | SMS + email + both | SMS + email + both | None | — |
| Walk-in modal | Pre-fill party size, notes | Pre-fill time & walk-in flag only | Missing party size & notes | Medium |
| Booking detail | Full history, timeline, notes, docs | Full detail + edit | None | — |
| New booking form | Client select, service, staff, time, guests, payment, attachments | Same | None | — |

---

### CONTACTS / GUESTS / CLIENTS

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Contacts list | Dynamic filters (segment, tag, date, marketing) + pagination | Sort + tag + search + pagination | No advanced filters | Medium |
| Guest detail | Full household, bookings, documents, tags, campaigns | Basic profile + bookings + tags | No household, documents, campaigns | High |
| Bulk tagging | Tag + remove tag + message + merge (2-5) | Same | None | — |
| Contact export | Up to 250 as CSV (admin) | Up to 250 as CSV (admin) | None | — |
| Household linking | View + edit linked members | Not visible | Cannot manage household | Medium |

---

### AVAILABILITY & SCHEDULING

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Working hours | By-day editor, weekly template | By-day editor, weekly template | None | — |
| Breaks | By-day recurring + one-off | By-day recurring + one-off blocks | None | — |
| Staff leave | Calendar view (annual/sick/other) + multi-staff | Create/update form only | No calendar view; cannot see team leave | High |
| Business closures | Editable (date range + reason) | Not accessible | No closure management | High |
| Calendar availability rules | Service capacity, duration, booking rules | Partial (in manage/services) | Missing time-based rules UI | High |

---

### REPORTS & ANALYTICS

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| KPI cards | Bookings, no-shows, arrivals, deposits, revenue | Today only (KPIs + forecast + capacity) | No historical reports tab | **Critical** |
| Charts | Revenue trend, booking volume, client growth | Line + bar chart (7d/30d/90d) | Cannot filter/export | High |
| Clients tab | Guest visits, lifetime value, return rate | Not in app reports | Cannot slice by segment | High |
| CSV export | Booking log email, data export | CSV from clients list + reports | Limited scope | Medium |
| SMS usage | Monthly usage + billing breakdown | Banner only | Cannot see cost breakdown | Low |

---

### SETTINGS & CONFIGURATION

#### Profile & Venue Info
| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Venue name, slug, address, phone | Editable form | Manage → Venue profile | None | — |
| Logo & cover photo | Upload + preview | Partial | No booking page preview | Low |
| Website & contact email | Editable | In manage/venue-profile | None | — |
| Cuisine & price band | Dropdown (restaurants) | Not visible | Cannot edit | Low |

#### Opening Hours & Closures
| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Weekly opening hours | Full editor | Full editor (manage/hours) | None | — |
| Business closures | Calendar + reason | Not in app | Cannot add closures | High |
| No-show grace minutes | Settings → Profile | Not visible | Cannot configure | Medium |

#### Booking Configuration
| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Booking types | Checkboxes | Manage → Booking settings | None | — |
| Guest account requirement | Toggle | Manage → Booking settings | None | — |
| Waitlist config | Enabled, max size, auto-offer | Settings tab (partial) | Partial access | Low |
| Booking rules | Advance notice, max advance, min duration | Settings redirects to web | Cannot edit in app | High |
| Deposit config | By-service + global default | Per-service only | No global policy editor | Medium |

#### Communications
| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Confirmation templates | SMS + email editors | Manage → Communications | None | — |
| Reminder scheduling | Hours before, opt-in | Manage → Communications | None | — |
| SMS allowance & billing | Live usage counter | Banner only | Cannot manage budget | Low |
| Notification preferences | Disable types | Limited | Cannot bulk-disable | Low |

#### Compliance
| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Compliance form templates | Full CRUD (Settings → Types tab) | View/assign/collect only | Cannot create/edit forms | **Critical** |
| Enforcement rules | Warn staff, warn client, block online, block all | Badges only | Cannot change level | High |
| Records list | All records + filter by type/status/dates | Today's check-ins only | No historical view | High |
| Form distribution | Resend, revoke, bulk send | Per-guest only | No bulk cohort send | Medium |

---

### TEAM & STAFF

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Staff list | Add, edit role, resend, reset password, assign calendar | Manage → Team (same) | None | — |
| Personal settings | Sign-in email, password, name, phone (all staff) | Manage → Account (limited) | Cannot change email/phone in app | Medium |
| Admin plan & billing | Plan status, invoices, payment method | Manage → Plan | None | — |

---

### ADVANCED FEATURES (Table, Class, Event Models)

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Table grid / day sheet | Full interactive grid, covers | Not supported | Tables not manageable | **Critical** |
| Floor plan editor | Konva canvas, placement, zones, combos | Not supported | Cannot edit layout | **Critical** |
| Class timetable | Recurring classes, sessions, products | Not supported | Classes invisible in app | **Critical** |
| Event tickets & sessions | Event manager, inventory, sessions | Not supported | Events invisible in app | High |
| Resource booking | Resource timeline, availability | Not supported | Resources invisible in app | Medium |
| Linked accounts | Multi-account scheduling | Not supported | No linked account view | Low |

---

### DATA IMPORT

| Feature | Web | App | Gap | Severity |
|---------|-----|-----|-----|----------|
| Import flow | 6-step wizard (upload → validate → map → review → import) | Not accessible | Cannot bulk-import | **Critical** |
| Mapping UI | Column mapping, data preview, field matching | Not in app | — | **Critical** |
| Error handling | Row-level validation report | Not in app | — | **Critical** |

Route: Requires createClient() (cookie-auth).

---

## SUMMARY BY SEVERITY

### **Critical** (blocks daily workflows)
- Table/floor plan management (entire features missing)
- Data import (wizard not in app)
- Compliance form template builder (create/edit)
- Reports with historical filtering
- Class/event timetables (zero support)

### **High** (impacts efficiency)
- Staff leave calendar (cannot view team time off)
- Business closure management
- Multi-staff calendar view
- Guest household linking
- Booking rules configuration
- Compliance record history

### **Medium** (nice-to-have)
- Advance booking configuration
- Addon library full management
- Floor plan preview
- SMS usage breakdown

---

## GAPS BY BOOKING MODEL COVERAGE

**Appointment-first:** Strongest app support (calendar, clients, compliance, reports lite)  
**Table-reservation:** Severely hampered (no day sheet, floor plan, table grid)  
**Classes/Events:** Not supported (zero in app)  
**Multi-model:** Fragmented (class/event links open web; appointments in app)

---

## RECOMMENDED NEXT PRIORITIES

1. **Compliance template builder** — App-native form editor (clone web's UI)
2. **Staff leave calendar** — Read-only leave view in availability.tsx
3. **Reports historical filtering** — Date-range picker in reports.tsx
4. **Business closures** — Closure UI in manage/hours
5. **Import wizard** (v2 release) — Multi-step flow with validation

---

*Report: C:\Resneo-app\Docs\APP_GAP_REPORT_R2.md*
