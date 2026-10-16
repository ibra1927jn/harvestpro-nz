# HarvestPro NZ — Aesthetic Analysis Brief

## Context Document for UI/UX Design Research

---

## 1. WHAT IS HARVESTPRO NZ?

HarvestPro NZ is an **enterprise-grade Progressive Web App (PWA)** for managing cherry harvest operations in New Zealand orchards. It runs on mobile (primarily) and tablet devices, used outdoors in orchard fields under direct sunlight.

**Industry**: Agriculture Technology (AgTech) / Workforce Management
**Region**: Central Otago, New Zealand (cherry orchards)
**Users**: 50–200 concurrent field workers per orchard during harvest season (December–February)

### The Problem It Solves

During cherry harvest season, orchards employ large temporary workforces (pickers, runners, team leaders) who need to:

- Track bucket production in real-time
- Manage field logistics (bins, tractors, warehouse)
- Calculate pay based on piece-rate (per bucket) vs minimum wage guarantees
- Ensure NZ labor law compliance (minimum wage, break times)
- Communicate across the field without cellular coverage (offline-first)
- Grade fruit quality at the point of harvest

### Business Model

B2B SaaS for orchard operators. Each orchard is a tenant with Row-Level Security isolation in the database.

---

## 2. USER ROLES & PERSONAS

### 2.1 Orchard Manager (1–3 per orchard)

- **Who**: Operations director, sits in the office or walks the field
- **Device**: iPad or large phone
- **Needs**: Bird's-eye analytics, real-time KPIs, workforce oversight, cost tracking
- **Screens**: Dashboard with live stats, Teams management, Logistics overview, Timesheets, Messaging, Row HeatMap, Settings
- **Mindset**: Wants to feel in control. Needs power-user density without clutter. Think Bloomberg Terminal meets Field Command Center.

### 2.2 Team Leader (3–10 per orchard)

- **Who**: Experienced picker promoted to lead a crew of 8–20 pickers
- **Device**: Smartphone (budget to mid-range Android, some iPhones)
- **Needs**: Roll call (attendance), crew performance monitoring, row assignments, quick communication
- **Screens**: Home dashboard, Roll Call, Team list, Tasks/Rows, Chat, Profile
- **Mindset**: Moving constantly, glancing at the phone between supervising. Needs glanceable info, big touch targets, and outdoor readability.

### 2.3 Bucket Runner (5–15 per orchard)

- **Who**: Workers who collect full buckets from pickers, deliver empty ones, manage bin logistics
- **Device**: Smartphone (budget Android)
- **Needs**: QR scanning (scan picker sticker on bucket), bin tracking, quality grading, warehouse inventory
- **Screens**: Logistics (scan hub), Warehouse inventory, Runner team, Messaging
- **Mindset**: Hands often dirty/gloved. Needs massive touch targets, one-handed operation, quick scan flow (scan → grade → done in 3 taps).

### 2.4 QC Inspector (1–2 per orchard)

- **Who**: Quality control specialist checking fruit grades
- **Device**: Smartphone or tablet
- **Needs**: Quick grade entry (A/B/C/Reject), inspection history, grade distribution stats
- **Screens**: Inspection entry, History, Statistics
- **Mindset**: Methodical, needs efficiency in repetitive grading tasks.

---

## 3. CURRENT TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS 3 + custom CSS |
| State | Zustand (global store) |
| Backend | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Offline | IndexedDB (Dexie.js) + custom sync bridge |
| PWA | vite-plugin-pwa (Workbox) |
| Icons | Google Material Symbols (Outlined) |
| Font | Inter (Google Fonts) |
| Deployment | Vercel |
| Platform | Mobile-first PWA (installable) |

---

## 4. CURRENT AESTHETIC STATE (HONEST ASSESSMENT)

### What's Strong (Engine)

- ✅ Architecture is production-grade: RLS multi-tenancy, offline-first sync, audit logging
- ✅ Business logic is complete: payroll calculations, compliance alerts, real-time scanning
- ✅ All 23 screens are functional with real data flows
- ✅ Role-based routing and authentication works perfectly

### What's Weak (Aesthetics)

- ❌ **Inconsistent design language**: Some screens use white backgrounds, others dark. No unified theme.
- ❌ **Generic UI**: Cards look like default Tailwind components. No personality or brand identity.
- ❌ **No motion design**: Zero animations, transitions, or micro-interactions. Feels static and "dead".
- ❌ **Poor visual hierarchy**: Stats, labels, and actions compete for attention equally.
- ❌ **No data visualization polish**: Charts/graphs are basic. No delight in how data is presented.
- ❌ **Modals feel utilitarian**: Plain white boxes with forms. No glass, blur, or premium feel.
- ❌ **Navigation feels budget**: Bottom tabs look like a 2018 Material Design default.
- ❌ **No loading states with personality**: Just spinning circles. No skeleton screens, no shimmer.
- ❌ **Typography underutilized**: Inter font loaded but not leveraged (no variable weights, no size hierarchy).
- ❌ **Color palette is flat**: Primary red is used everywhere without supporting accent colors or gradients.
- ❌ **No outdoor readability mode**: Workers use this in full sunlight — needs high contrast alternative.
- ❌ **Touch targets too small**: Some buttons are 32px. Field workers need 48px minimum.

---

## 5. COMPETITIVE LANDSCAPE & DESIGN INSPIRATION

### Direct Competitors (AgTech/Field Management)

| App | Design Notes |
|-----|-------------|
| **Hectre** (NZ) | Clean, fruit-themed, friendly. Green/white palette. Simple but feels "crafted". |
| **Croptracker** | Functional but dated UI. Desktop-first, not beautiful. |
| **Farmable** | Modern, uses illustrations and warm tones. Friendly, not corporate. |
| **Bushel** | Bold typography, agriculture photography as hero elements. |

### Aspirational Design References (not direct competitors)

| App | Why It's Relevant |
|-----|------------------|
| **Linear** | Dark mode done perfectly. Subtle gradients, glass cards, keyboard-first UX. Clean data density. |
| **Vercel Dashboard** | Dark glass, blurred overlays, subtle animations. Premium developer tool feel. |
| **Stripe Dashboard** | Data-rich but never cluttered. Perfect hierarchy. Microinteractions everywhere. |
| **Arc Browser** | Bold colors in dark mode, glassmorphism, playful yet professional. |
| **Apple Health** | How to show complex health data beautifully with gradients and clear hierarchy. |
| **Monzo Banking App** | How to make financial data feel personal and alive with colors and animations. |
| **Strava** | Outdoor activity tracking with beautiful data viz and social competition elements. |

---

## 6. UNIQUE DESIGN CHALLENGES

### 6.1 Outdoor Readability

- Used under **direct New Zealand summer sunlight** (UV index 12+)
- Needs either: extreme contrast dark mode, OR high-contrast sunlight mode
- We have a "Sunlight Mode" toggle that forces white bg + black text + solid borders

### 6.2 Dirty/Gloved Hands

- Workers wear gloves, have wet/dirty hands from fruit
- Touch targets must be minimum **48px** (ideally 56px for primary actions)
- Swipe gestures preferred over precise taps

### 6.3 Budget Devices

- Many workers use **budget Android phones** ($100–200 range)
- Performance matters: heavy blur effects, complex animations may lag
- Need to test: `backdrop-filter` performance, animation frame rates
- Consider: CSS `will-change`, reduced motion media query, GPU-accelerated transforms only

### 6.4 Internationalized Workforce

- Workers are from 15+ nationalities (NZ, Pacific Islands, SE Asia, Latin America)
- Icons > text where possible
- Color coding should be culturally universal (red=danger, green=good, etc.)
- Numbers should be prominent and instantly readable

### 6.5 Data Density vs Clarity

- Managers need **dense dashboards** (many KPIs visible at once)
- Team Leaders need **glanceable summaries** (2-second comprehension)
- Runners need **single-task focus** (scan, grade, confirm)
- Same design system must serve all three information densities

---

## 7. SCREEN INVENTORY

### Manager Role (7 tabs)

1. **Dashboard** — Live KPIs, progress bars, velocity charts, team leader panels, picker activity grid
2. **Teams** — Hierarchical team view (leaders → pickers), search, add/import members
3. **Timesheet** — Tabular attendance with pay calculations, compliance flags
4. **Logistics** — Bin inventory, tractor fleet, runner tracking
5. **Messaging** — Channels, DMs, broadcast system with priority levels
6. **Rows** — HeatMap visualization of orchard row harvesting density + row list
7. **Settings** — Orchard config, piece rate, minimum wage, offline toggles

### Team Leader Role (6 tabs)

1. **Home** — Personal greeting, KPI cards, safety monitor, crew performance, top 5 crew list
2. **Roll Call** — Attendance check-in/check-out with stats cards
3. **Team** — Full crew list with details, add/remove pickers
4. **Tasks** — Row assignments with progress bars, HeatMap integration
5. **Chat** — Messaging filtered to team scope
6. **Profile** — User info, day config, settings, sign out

### Runner Role (4 tabs)

1. **Logistics** — Scan hub (primary action), active bin, recent history, pending uploads
2. **Runners** — Team coordination view
3. **Warehouse** — Bin inventory (full/empty/in-progress), transport request
4. **Messaging** — Communications channel

### QC Inspector (3 tabs)

1. **Inspect** — Quick grade entry (A/B/C/Reject) with colored buttons
2. **History** — Past inspections log
3. **Statistics** — Grade distribution analytics

### Key Modals (popup overlays)

- Scanner (camera QR viewfinder with manual fallback)
- Quality Rating (4-button grade selector)
- Broadcast (title + message + priority composer)
- Picker Details (stats, history, quality metrics)
- Add Picker / Add Runner (form modals)
- Row Assignment (picker-to-row linking)
- Export (CSV/PDF data download)

---

## 8. KEY INTERACTIONS & FLOWS

### Critical Flow: Bucket Scanning (Runner)

```
[Tap "SCAN BUCKET"] → [Camera opens, QR viewfinder] → [Scan picker sticker]
→ [Validate picker is checked in] → [Quality Grade modal: A/B/C/Reject]  
→ [Tap grade] → [Success haptic + toast] → [Back to logistics]
```

**Timing**: Must complete in **under 5 seconds total**. This happens 200-500 times per day per runner.

### Critical Flow: Roll Call (Team Leader)

```
[See crew list sorted by status] → [Tap "Check In" on absent picker]
→ [Instant green transition + haptic] → [Stats update: Present +1]
```

### Critical Flow: Dashboard Monitoring (Manager)

```
[Glance at KPI cards: buckets, tons, speed, earnings]
→ [Check progress bar: X% of target] → [Scan team leader panel]
→ [Identify underperforming crews] → [Tap to drill down]  
→ [Send broadcast if needed]
```

---

## 9. BRAND IDENTITY

### Current Brand Elements

- **Name**: HarvestPro NZ
- **Logo**: Tractor icon (Material Symbol `agriculture`) in a rounded square
- **Primary Color**: Cherry red `#d91e36` (the fruit being harvested)
- **Fonts**: Inter (400–900 weights available)
- **Tone**: Professional but approachable. Enterprise-ready but field-friendly.

### Brand Values To Reflect in Design

1. **Reliability** — This is critical infrastructure for a $50M+ industry. Must feel stable, not experimental.
2. **Speed** — Cherry harvest is time-sensitive (fruit spoils). The app should feel fast and urgent.
3. **Clarity** — Non-native English speakers need to understand instantly. Visual > textual.
4. **Trust** — Handles payroll data and compliance. Must feel secure and trustworthy.
5. **New Zealand** — Subtle NZ identity (Kia Ora greetings, NZ date formats, NZST timezone).

---

## 10. SPECIFIC QUESTIONS FOR AESTHETIC ANALYSIS

1. **Dark mode vs Light mode**: Given outdoor sunlight conditions, should we use dark-by-default with a sunlight toggle, or light-by-default with a dark option?

2. **Glassmorphism feasibility**: Is `backdrop-filter: blur()` performant enough for budget Android devices? What's the fallback?

3. **Color palette expansion**: Beyond cherry red, what supporting colors work for an AgTech app? How do we differentiate role-specific screens (Manager=?, Team Leader=?, Runner=?)?

4. **Animation budget**: How much motion/animation can a budget Android handle? What specific animation techniques are safe (CSS transforms) vs risky (full-page transitions, parallax)?

5. **Data visualization**: What chart/graph library or approach gives the best visual output for harvest data? (Bar charts, radial progress, area charts, spark lines)

6. **Typography scale**: What type scale (using Inter) creates the best hierarchy for glanceable information on mobile?

7. **Card design patterns**: What's the optimal card anatomy for a field app? (icon placement, stat size, label positioning, padding)

8. **Navigation pattern**: Bottom tab bar with icons — what makes it feel premium vs generic?

9. **Empty states**: How should we handle "no data" states to not feel like broken UI?

10. **Success/Error feedback**: What haptic/visual/audio patterns create the best feedback for scan-heavy workflows?

---

## 11. TECHNICAL CONSTRAINTS

- **CSS Only** approach preferred (no heavy JS animation libraries unless justified)
- **Tailwind CSS 3** is the styling framework — can use custom utilities, `@layer components`
- **No design tokens system currently** — should we implement one?
- **No component library** (no Shadcn, no MUI) — everything is custom
- **Google Material Symbols** for icons — committed to this icon set
- **Must pass** Lighthouse performance audit (>90 performance score)
- **Must work** on Chrome Android 90+, Safari iOS 15+, Chrome desktop

---

## 12. DESIRED OUTCOME

After the aesthetic upgrade, every screen should:

1. **Look like it costs $50k+** to build (premium SaaS feel)
2. **Be instantly comprehensible** at a 2-second glance
3. **Feel alive** with subtle motion and responsive feedback
4. **Work beautifully** in outdoor conditions (sunlight, glare)
5. **Run smoothly** on budget hardware (no jank, no lag)
6. **Have a consistent** design language across all 4 roles
7. **Inspire confidence** in orchard operators making purchasing decisions

The app's engine is production-ready. The aesthetics need to match that quality. We need the visual layer to communicate the same level of craft, reliability, and sophistication that the backend architecture already delivers.
