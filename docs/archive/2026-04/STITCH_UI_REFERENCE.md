# HarvestPro NZ — Stitch UI Reference (Complete Screen Descriptions)

> **Purpose**: This document describes every screen in the HarvestPro NZ enterprise cherry harvest management app. Use these descriptions as prompts for Google Stitch to generate high-fidelity dark-mode UI mockups.

> **Design System**: All screens follow a premium dark glassmorphism aesthetic:
>
> - **Background**: Deep navy `#0a0e1a`
> - **Cards**: Translucent glass panels (`rgba(255,255,255,0.04)`) with `backdrop-filter: blur(16px)` and 1px `rgba(255,255,255,0.08)` borders, `border-radius: 1rem`
> - **Accent Color**: Cherry red gradient (`#d91e36 → #ff1f3d`) with glow shadows
> - **Typography**: Inter font, white headings (`#e2e8f0`), slate-400 labels (`#94a3b8`)
> - **Icons**: Google Material Symbols (Outlined), 20–24px
> - **Platform**: Mobile-first PWA (375–430px width viewport)

---

## 1. LOGIN PAGE (`/login`)

### Layout

Full-screen dark gradient background (`from-slate-900 via-slate-800 to-slate-900`) with decorative blurred circles (red and green gradients, 50% opacity, 96px radius).

### Elements (top to bottom)

**Brand Header** (centered):

- Large rounded square icon (80×80px, cherry gradient background, white tractor `agriculture` Material Symbol icon inside)
- App name: "HarvestPro" in white + "NZ" in cherry red, 4xl bold
- Subtitle: "Enterprise Cherry Harvest Management" in slate-400, small text

**Glass Card** (centered, max-width 448px):

- Background: `rgba(255,255,255,0.07)` with `backdrop-blur-xl`, border `rgba(255,255,255,0.1)`, `border-radius: 1.5rem`, padding 32px
- **Tab Switcher**: 3 tabs in a pill container (`bg-white/5`, rounded-2xl). Tabs: "Sign In" | "Register" | "Demo". Active tab has cherry red background with glow shadow
- **Error Banner** (conditional): Red tinted pill with error icon and message text

**Sign In Form**:

- Label: "EMAIL" — uppercase, xs, bold, slate-400, tracking-wider
- Input: Full width, rounded-xl, `bg-white/5`, border `white/10`, focus border cherry red, white text, placeholder slate-500
- Label: "PASSWORD" — same style
- Input: Same style, type password, placeholder "••••••••"
- Submit Button: Full width, rounded-xl, cherry gradient (`from-primary to-primary-vibrant`), white bold text "SIGN IN" uppercase, glow shadow. Loading state shows spinning white circle + "Signing in..."

**Register Form** (when Register tab active):

- Same input style for: Full Name, Email, Password (min 6 chars)
- **Role Selector**: 3 cards in a grid (3 columns). Each card: `border-2 rounded-xl p-3`, icon + label. Roles: Manager (icon `admin_panel_settings`), Team Lead (icon `groups`), Runner (icon `local_shipping`). Selected card has cherry red border + tinted background
- Submit: "Create Account"

**Demo Mode** (when Demo tab active):

- Description text: "Explore the platform without an account. Select a role:"
- 3 large role buttons, full width, each a gradient card (rounded-2xl, p-4):
  - Manager: violet-to-purple gradient, icon `admin_panel_settings`, subtitle "Command center & analytics"
  - Team Leader: cherry red gradient, icon `groups`, subtitle "Manage pickers & rows"
  - Bucket Runner: sky-to-blue gradient, icon `local_shipping`, subtitle "Logistics & scanning"
- Each card has a frosted icon container (48×48, `bg-white/20 backdrop-blur-sm`), right arrow icon on right

**Trust Footer** (below card):

- 3 inline badges: 🛡️ "RLS Secured" (green shield), ☁️ "Offline-First" (sky cloud icon), ✅ "NZ Compliant" (amber verified icon)
- Version text: "v4.2.0 • © 2024 HarvestPro NZ • Central Pac, Cromwell"

---

## 2. MANAGER DASHBOARD (`/manager` → Dashboard tab)

### Shell Layout

- **Background**: Solid `#0a0e1a` (deep navy), full height, `pb-20` for nav spacing
- **Header**: Sticky top, `glass-header` (rgba(10,14,26,0.8), blur 20px, subtle bottom border). Contains:
  - Left: Cherry gradient logo mark (40×40px rounded-xl, tractor icon) + "Harvest Manager" title (white, lg bold) + subtitle "Dashboard - [Orchard Name]" (slate-400, xs)
  - Right: Notification bell button (40×40, `bg-white/6`, rounded-xl, border `white/10`, slate-300 icon, red notification dot 2px in corner) + Profile initials button (40×40, cherry gradient, white bold text "TL")

- **Bottom Nav**: Fixed bottom, `glass-nav` (rgba(10,14,26,0.85), blur 20px, top border). 7 tabs horizontally:
  - `dashboard` | `teams` | `timesheet` | `logistics` | `messaging` | `map (labeled "Rows")` | `settings`
  - Active tab: cherry red text + icon filled variant + subtle glow blur behind icon
  - Inactive: slate-500, hover slate-300
  - Messaging tab has red notification dot
  - Labels: 10px uppercase

- **Broadcast FAB**: Fixed bottom-right (bottom 96px), cherry gradient rounded-full pill button (h-14, px-6), icon `campaign` + "Broadcast" text, glow shadow, hover scale 1.05

### Dashboard Content (scrollable)

**Section 1: Date + Actions Row**

- Left: "Today's Harvest" title (white, xl bold) + date subtitle (slate-400)
- Right: 2 icon buttons (rounded-xl, `bg-white/6`, border white/10): `download` (export) and `tune` (settings), cherry gradient accent

**Section 2: KPI Stat Cards** (horizontal scroll, 4 cards):
Each card is a `glass-card` (translucent dark, rounded-xl, p-4, min-w-140px):

- Top: Icon in rounded-lg colored container (cherry for primary, emerald for production, blue for speed, amber for earnings) + label text (slate-400, xs bold uppercase)
- Bottom: Large value (white, 2xl bold) + subtext trend indicator
- Cards: "Total Buckets" (shopping_basket icon), "Tons Harvested" (scale icon), "Avg Speed" (speed icon, "bkt/hr"), "Earnings" (payments icon, "$X,XXX")

**Section 3: Progress Panel** (glass-card, full width):

- Header: "Harvest Progress" + percentage badge (cherry bg, white text)
- Progress bar: `bg-white/10` rounded-full track, cherry gradient fill with glow effect + percentage label
- 2 sub-stats below: "Completed" count | "Remaining" count (grid cols-2)
- ETA line: "Estimated completion: X:XX PM" in slate-400

**Section 4: Live Floor / Activity Grid** (glass-card):

- Header: "Live Floor" + "🟢 LIVE" green indicator badge
- Divider: `border-white/10`
- Grid of picker avatars (5 columns): Each avatar is a 48px circle (`bg-white/10`, slate-400 initials) with bucket count below in xs bold. Top performers get cherry gradient ring

**Section 5: Velocity Chart** (glass-card):

- Header: "Picking Velocity" + time period selector
- Bar chart with dynamic height bars. Each bar represents an hour. Above target = green gradient, below = red gradient
- Horizontal target line indicator
- X-axis: hour labels. Y-axis: bucket count

**Section 6: Team Leaders Panel** (glass-card):

- Header: "Team Leaders" + count badge (orange bg)
- Orange left accent bar (2px)
- List of leaders: Each row has avatar circle (48px, `bg-white/10`), name (white bold), crew count (slate-400), bucket total (right-aligned, large bold orange text)

---

## 3. MANAGER — TEAMS TAB

### Teams Toolbar (sticky top)

- Glass header bar (`bg-white/6`, backdrop-blur, border white/10, rounded-xl)
- Left: "Harvest Teams" title (white, lg bold) + orchard ID badge (slate-400 text)
- User count badge: circle with person icon + count
- Right action buttons (rounded-xl, border white/10 each):
  - "Link Leader" button (emerald accent, icon `link`)
  - "Import CSV" button (blue accent, icon `upload_file`)
  - "New Member" button (cherry gradient, white text, icon `person_add`, glow shadow)
- Search bar below: Full width input (`bg-white/6`, rounded-xl, border white/10), search icon, placeholder "Search members..."

### Team Leaders List

Each leader is a `TeamLeaderCard` — glass-card with:

- Top row: Avatar (48px, `bg-white/10`, border white/8) + Leader name (white bold) + role badge "LEADER" (emerald bg/text, xs) + crew count + total buckets (cherry text, xl bold, right-aligned)
- Expandable arrow icon (rotate animation on open)
- **Expanded Crew Section** (`bg-white/3`, rounded-lg, mt-2):
  - Each picker row: Avatar (36px), name (white sm), bucket count (right, white bold), and current row badge. Low performers have subtle red indicator (`bg-red-500/10`, border red-500/20)

### Runners Section (below teams)

- Section header: "Active Runners" + truck icon (blue accent, rounded-lg container)
- Each runner card: glass-card, avatar (40px, `bg-blue-500/20`, blue text) + name + status badge. Empty state: "No runners assigned" in slate-400

### Empty State (no teams)

- Large `groups` icon (64px, slate-500)
- "No team leaders yet" heading + "Link team leaders to see assigned crews" subtitle

---

## 4. MANAGER — LOGISTICS TAB

### Header

- "Logistics Overview" title + live badge

### Bin Status Grid (3 cards, grid cols-3)

Each card is glass-card:

- **Full Bins**: Green accent, icon `inventory_2`, large bold count, "FULL" label
- **In Progress**: Blue accent, icon `shopping_basket`, count, "FILLING" label
- **Empty Available**: Orange accent, icon `grid_view`, count, "EMPTY" label

### Tractor Fleet Status (glass-card)

- Header bar with truck icon + "Active Fleet" title
- Status indicators: "Available" (green dot + count), "In Transit" (blue dot + count), "Depot" (amber dot + count)
- Each vehicle listed below with route and capacity info

### Active Runners (glass-card)

- Header: "Active Runners" + count
- Each runner: Avatar circle (emerald bg), name, current location/bin, bucket count carried, time since last scan
- Progress indicator for current route

### State Legend

Row of colored badge pills: Green = "Full", Yellow = "In Progress", Red = "Critical", Gray = "Empty"

---

## 5. MANAGER — TIMESHEET TAB (TimesheetEditor)

### Header

- "Timesheets" title + date selector
- Filter buttons: "All" | "Present" | "Flagged"

### Timesheet Table (glass-card)

- Table header row (`bg-white/4`): Name | Check In | Check Out | Hours | Buckets | Pay | Status
- Each row: picker data with editable check-in/out times, calculated hours, bucket count, estimated pay (bold), status badge (green "Approved", yellow "Pending", red "Flagged")
- Flagged violations (minimum wage) shown with red warning icon
- Edit/save buttons per row
- Footer: Total hours, total pay, average rate

---

## 6. MANAGER — MESSAGING TAB (UnifiedMessagingView)

### Header

- "Messages" title + compose button (cherry accent)

### Channel List / Conversation View

- Left sidebar (or mobile: full-screen list): Channels and DMs
  - Channel items: Icon (group/person), channel name, last message preview, timestamp, unread badge (cherry circle)
- Chat area: Message bubbles with sender name, timestamp, read receipts
  - Outgoing: cherry gradient bubbles
  - Incoming: dark glass bubbles (`bg-white/6`)
- Compose bar: Input field + send button (cherry gradient circle, send icon)
- Broadcast messages have a megaphone icon and priority indicator (normal/high/urgent)

---

## 7. MANAGER — ROWS TAB (RowListView + HeatMapView)

### RowListView

- Block info header: Block name (bold), variety, row count, yield target
- Row list (scrollable): Each row card (glass-card):
  - Row number (large bold), picker count, bucket count
  - Progress bar (cherry gradient fill on dark track)
  - ETA to completion
  - Active pickers listed below with mini avatars
  - Click to expand: Detailed picker-level breakdown

### HeatMapView

- Title: "📊 HeatMap Histórico"
- Date range toggle: "📅 Hoy" | "📊 Últimos 7 días"
- Stats summary (4 stat cards in a row): Total Buckets, Active Rows, Completed, Pending
- Color legend: Green (≥100% target), Yellow (50-99%), Red (<50%)
- Heatmap grid: Each row is a colored strip whose background transitions from red (low) through yellow to green (completed). Opacity correlates to density score. Each strip shows:
  - Row number, bucket count, picker count
  - Avg buckets per picker, completion percentage
  - Mini progress bar inside

---

## 8. MANAGER — SETTINGS TAB

### Profile Section (glass-card)

- Avatar with initials + User name + role + email
- Online/Offline status indicator

### Day Configuration (glass-card)

- Orchard selector dropdown (dark glass input)
- Grid of 2: Piece Rate ($X.XX/bin, mono font), Minimum Wage ($X.XX/hr)
- Buckets per hour target slider/input
- Total rows in orchard

### App Settings

- Offline Mode toggle
- Sunlight Mode toggle (high contrast for outdoor use)
- Notification preferences
- "End of Day Report" button (cherry accent outline)
- "Sign Out" button (dark, full width)
- Version string at bottom

---

## 9. TEAM LEADER — HOME TAB (`/team-leader` → Home)

### Shell Layout

- Background: `bg-slate-50` → auto-themed to dark via CSS overrides
- Bottom nav: 6 tabs: Home | Roll Call | Team | Tasks | Chat | Profile
- Active tab: cherry red, filled icon

### Header (sticky)

- Greeting: "Kia Ora, [First Name]" (3xl bold white)
- Date: "Monday, 12 February" (slate-400)
- Avatar initials circle (top-right, 40px, cherry tint)

### KPI Grid (3 columns)

Cards in `bg-background-light` (dark themed):

- **Buckets**: shopping_basket icon (cherry), large bold count
- **Pay Est.**: payments icon, dollar amount
- **Tons**: scale icon, decimal value
Each card: centered icon above, value below, uppercase label at bottom

### Safety Monitor Card

Full-width card with left accent bar:

- **Safe state**: Green left border, "Morning Huddle" heading, "All crew active & verified" subtitle, green checkmark circle icon
- **Issue state**: Red left border, "Action Required" heading, "[Picker Name] (SUSPENDED)" subtitle, warning triangle in red circle

### Crew Performance Section

- Header row: "Crew Performance" + target badge ("3.6 bkt/hr" in cherry text, right-aligned)
- White card with:
  - "Daily Progress" label + percentage
  - Progress bar: cherry gradient fill on light track, with glow shadow
  - Feedback text: "Pace is slow. Encouragement needed." or "Good pace! Keep it up."

### Active Crew List

- Header: group icon + "Active Crew (N)" + "View All" link (cherry text)
- Top 5 pickers, each in a card:
  - Avatar circle (48px, initials) + Name (bold) + status badges (Row assignment: "Row 7" cherry pill, or "Bench" gray pill) + QC dots (3 small dots: green=pass, yellow=warning)
  - Right side: Large bucket count (2xl bold) + "Buckets" label

---

## 10. TEAM LEADER — ROLL CALL TAB (AttendanceView)

### Header (sticky)

- "Daily Roll Call" heading (2xl bold)
- Date: long format ("Monday, 12 February")
- Loading spinner (when syncing)

### Stats Cards (2-column grid)

- **Present**: Green-tinted card, large count (green-600, 2xl bold), "PRESENT" label
- **Absent**: Slate-tinted card, count, "ABSENT" label

### Crew List

Each member is a card:

- **Checked-in member**: White card, green-200 border, shadow. Green avatar circle with initials, name in bold, check-in time "In: 7:30 AM". Right: "Check Out" button (red-50 bg, red-600 text, small rounded)
- **Not checked-in member**: Slate-100 card, transparent border, 80% opacity. Slate avatar with initials, name in slate-500, "Not checked in" label. Right: "Check In" button (green-600 bg, white text, rounded-xl, shadow-green-200, icon `login`)
- Processing state: spinning `progress_activity` icon

### Empty State

- `group_off` icon (4xl, slate-400)
- "No crew found in your roster."

---

## 11. TEAM LEADER — TEAM TAB (TeamView)

### Header

- "My Team" title + member count badge
- "Add Picker" button (cherry accent)

### Picker List

Each picker card (white/glass):

- Avatar (56px circle) + Name (bold, lg) + Role label + Picker ID
- Stats row: Buckets today, current row, quality grade dots
- Action buttons: View details, Delete (with confirmation)
- Swipeable for quick actions

### Add Picker Modal (overlay)

- Dark glass overlay with blur
- Form: Name input, Email input, Phone input, Badge ID
- Role selector
- "Add to Team" button (cherry gradient)

---

## 12. TEAM LEADER — TASKS TAB (TasksView)

### View

- Header: "Row Assignments" + HeatMap toggle
- Row progress list: Each row card shows:
  - Row number (large, bold)
  - Assigned pickers list with mini avatars
  - Bucket count / Target count
  - Progress bar (cherry fill)
  - Row completion percentage
- "Assign Picker" button per row → opens RowAssignmentModal

### HeatMap Subview (toggle)

- Same HeatMapView as Manager, but filtered to team leader's assigned rows
- Shows only rows where their pickers are working

---

## 13. TEAM LEADER — CHAT TAB (MessagingView)

Same as Manager Messaging but filtered to:

- Team leader's crew conversations
- Broadcasts received
- Direct messages to/from manager

---

## 14. TEAM LEADER — PROFILE TAB (ProfileView)

### Header (sticky)

- "My Profile" + date + "● Online" status badge (green pulse dot)

### User Card (white/glass)

- Large avatar circle (64px, initials, cherry tint border)
- Full name (lg bold) + Role + Picker ID + Email

### Day Configuration Section

- Section header with tune icon (cherry)
- **Orchard Selector**: Dropdown styled dark glass
- **Stats Grid (2 columns)**:
  - Piece Rate: "$X.XX / bin" (mono, bold, read-only display)
  - Min Wage: "$X.XX / hr" (mono, bold, read-only display)
- **Offline Mode Toggle**: Label + custom switch

### Action Buttons

- "End of Day Report" button (cherry outline, full width, flag icon)
- "Sign Out" button (dark/black, full width, logout icon)
- Version: "HarvestPro NZ v1.2.0 • Build 2024" (tiny, centered)

---

## 15. RUNNER — LOGISTICS TAB (`/runner` → Logistics)

### Shell Layout

- Background: `bg-background-light` (auto-dark via overrides)
- Bottom nav: 4 tabs: Logistics | Runners | Warehouse | Messaging
- Active tab: cherry red, filled icon. Messaging has notification dot

### Header

- Large title area with user/logo
- Notification bell + Avatar

### Live Dashboard

- **Sync Status Banner** at top (if offline: yellow bar with sync icon and pending count)
- **Active Bin Card** (glass-card, large):
  - "Active Bin" header
  - Bin code (3xl bold) or "No bin selected" placeholder
  - Bin status indicator (green/yellow/red dot)
  - Bucket count in this bin

### Scan Buttons (2 large buttons)

- **Scan Bucket** (primary action button):
  - Full width, tall (h-16), cherry gradient, rounded-xl
  - QR code icon `qr_code_scanner` + "SCAN BUCKET" text (bold, uppercase)
  - Glow shadow, press animation scale 0.98
- **Scan Bin** (secondary):
  - Full width, lighter style (outline or white/6)
  - "SCAN BIN" text

### Today's Stats (grid)

- Buckets scanned today (large count)
- Bins served
- Grade distribution mini-chart (A/B/C/reject breakdown)

### Recent Scan History

- List of recent scans with timestamp, picker name, grade, bin code

### Pending Uploads Badge

- Orange/yellow badge showing count of offline-queued scans awaiting sync

---

## 16. RUNNER — RUNNERS TAB (RunnersView)

### Header

- "← Back" button + "Runner Team" title

### Active Runners List

Each runner card:

- Avatar (colored circle)
- Name + status ("Active" green badge, "Break" yellow, "Offline" gray)
- Current zone/location
- Buckets carried today

---

## 17. RUNNER — WAREHOUSE TAB (WarehouseView)

### Header

- "Warehouse Inventory" title
- Notification bell + Avatar

### Hero Card (large, white/glass)

- Cherry red left accent bar (2px, full height)
- Title: "Harvested Stock" subtitle, "Full Cherry Bins" heading
- Large bin icon (56px, red-50 bg, cherry icon)
- **Massive count** (6xl bold): number of full bins
- Footer: ✅ "Ready for Pickup" or "Awaiting Harvest"

### Inventory Grid (2 columns)

- **Empty Bins Available**: Orange accent. Icon `grid_view`, orange-50 bg. Large count + status badge ("Critical" if <5 bins, else "OK")
- **Bins In Progress**: Blue accent. Icon `shopping_basket`, blue-50 bg. Large count + "IN-FLOW" badge

### Truck Info Card (slate bg)

- Truck icon in white circle
- "Next Resupply Truck" heading
- Dynamic text: "Dispatch requested for full bins" or "Scheduled arrival in 45 mins from Depot A"

### Request Transport Button (fixed bottom)

- Full width, h-16, cherry bg, white text
- Truck icon + "REQUEST TRANSPORT" (bold, uppercase)
- Disabled state (50% opacity) when no full bins
- Shadow and press animation

---

## 18. RUNNER — MESSAGING TAB

Same layout as Manager/Team Leader messaging, filtered to:

- Runner-specific channels
- Broadcast receipts
- Direct messages

---

## 19. QUALITY CONTROL DASHBOARD (`/qc`)

### Header

- Emerald accent. QC clipboard icon (emerald-100 bg, emerald-600 icon)
- "Quality Control" title (xl bold) + "Fruit Inspection Dashboard" subtitle

### Navigation Tabs (horizontal, underline style)

- "New Inspection" (apple icon) | "History" (clipboard icon) | "Statistics" (chart icon)
- Active tab: emerald bottom border + emerald text
- Inactive: transparent border, gray-500

### Inspect Tab

**Quick Grade Entry Card** (white/glass, rounded-xl, p-6):

- "Quick Grade Entry" title (lg bold)
- Instruction text: "Scan or select a picker, then tap a grade to log the inspection."
- **4 Grade Buttons** (2×2 grid, rounded-xl, p-4):
  - **Grade A — Export**: Green bg (green-100), green checkmark icon, green text
  - **Grade B — Domestic**: Blue bg (blue-100), blue checkmark icon, blue text
  - **Grade C — Process**: Yellow bg (yellow-100), yellow warning icon, yellow text
  - **Reject**: Red bg (red-100), red X icon, red text

**Coming Soon Banner** (amber):

- Warning triangle icon + "Coming Soon" heading
- "Full inspection workflow with photo capture, notes, and automatic picker notifications is under development."

### History Tab

- Empty state: large clipboard icon (gray-300), "No inspections recorded today"

### Statistics Tab

- Empty state: large chart icon (gray-300), "Grade distribution analytics", "Will show trends once inspections are logged"

---

## 20. KEY MODALS

### Broadcast Modal (Manager)

- Full-screen overlay, dark glass bg with blur
- Glass card: Title input, message textarea, priority selector (Normal/High/Urgent with color indicators), character counter
- "Send Broadcast" button (cherry gradient, full width)
- Cancel button (muted)

### Scanner Modal

- Full-screen dark overlay
- Camera viewfinder area (centered, rounded, with scanning line animation)
- Title: "Scan [Bucket/Bin]" at top
- "Enter Code Manually" link below viewfinder
- Manual input: text field + confirm button
- Close X button (top-right)

### Quality Rating Modal

- Centered glass card
- Scanned code display
- 4 grade buttons (same as QC page): A | B | C | Reject
- Each button is colored per grade with icon
- Cancel button

### Picker Details Modal

- Slide-up dark glass panel
- Picker avatar (large, 72px) + name + ID
- Stats grid: Total buckets, Avg/hour, Quality %, Current row
- Recent scan history (mini list)
- "Close" or "Edit" buttons

### Add Picker Modal

- Dark glass overlay
- Form fields: Name, Email, Phone Number
- "Add to Team" submit button (cherry gradient)
- Close icon

### Row Assignment Modal

- Glass panel with picker list
- Each picker: checkbox + avatar + name + current row
- Row number input/selector
- "Assign" button (cherry accent)

### Export Modal

- Data format options (CSV, PDF)
- Date range selector
- "Export" button (cherry gradient)

### Chat/DM Modal

- Message thread with bubbles
- Compose bar with attachment options
- Send button (cherry circle)

---

## 21. COMMON COMPONENTS

### Toast Notifications

- Slide-down from top, auto-dismiss (3s)
- Types: Success (green accent), Error (red), Info (blue), Warning (amber)
- Icon + message text + close button

### Sync Status Monitor

- Top banner bar when offline
- Yellow/amber bg: "⏳ X changes pending sync" text
- Auto-hides when fully synced

### Trust Badges

- Inline badge row: Shield icon + "RLS Secured", Cloud icon + "Offline-First", Verified icon + "NZ Compliant"

---

## 22. NAVIGATION PATTERNS

### Manager App

- 7-tab bottom nav: Dashboard | Teams | Timesheet | Logistics | Messaging | Rows | Settings
- Fixed broadcast FAB on all tabs except Map and Messaging
- Modals open as overlays over current view

### Team Leader App

- 6-tab bottom nav: Home | Roll Call | Team | Tasks | Chat | Profile
- Header with greeting and KPI strip on Home tab
- View switching via tab selection

### Runner App

- 4-tab bottom nav: Logistics | Runners | Warehouse | Messaging
- Primary scan action always accessible via large CTA button
- Scanner modal workflow: Scan → Quality Grade → Confirm

---

## 23. DATA & STATE PATTERNS

### Real-Time Data Sources

- **Crew/Pickers**: Names, IDs, avatars, bucket counts, row assignments, quality grades, attendance status
- **Inventory/Bins**: Bin codes, status (empty/in-progress/full), location
- **Buckets**: Scan records with timestamp, picker ID, quality grade, bin association
- **Messages**: Broadcasts (title, body, priority), DMs, channel conversations
- **Orchard**: Name, ID, total rows, variety, target yield
- **Settings**: Piece rate ($/bin), minimum wage ($/hr), min buckets/hour target

### Offline-First

- All scans queue locally when offline
- Pending upload count shown in UI
- Auto-sync when connection restored
- SyncStatusMonitor shows real-time sync status
