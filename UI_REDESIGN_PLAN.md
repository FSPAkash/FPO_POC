# UI Redesign Plan — FPO Integrated OS

## Design Philosophy

The current UI has the right bones — glassmorphism, aurora mesh, green palette — but feels cluttered and unfocused. The redesign strips every surface back to its minimum necessary information density and lets the glass effects actually breathe. The result should feel like a premium data tool: calm, confident, and precise.

**Principles:**
- Every element earns its space. No decorative chrome.
- Glass is a material, not a theme. Use it structurally, not decoratively.
- White space is content. Padding is not wasted.
- Information hierarchy is strict: primary stat > supporting data > action.
- The aurora mesh carries the brand character — everything above it stays neutral.

---

## Global Token Changes

These replace the current values in `index.css` `:root`.

### Background & Surface

```css
/* Page background — slightly cooler than current off-white */
--bg-base:        #F2F6F2;
--bg-mesh-opacity: 0.18;    /* reduce blob opacity from current 0.25–0.55 */

/* Glass tiers — less white, more true glass */
--glass-light:    rgba(255, 255, 255, 0.42);
--glass-normal:   rgba(255, 255, 255, 0.58);
--glass-strong:   rgba(255, 255, 255, 0.74);

/* Blur values — unchanged, they work */
--blur-sm:   blur(16px);
--blur-md:   blur(24px);
--blur-lg:   blur(32px);

/* Borders */
--border-glass:   1px solid rgba(203, 230, 200, 0.28);
--border-subtle:  1px solid rgba(203, 230, 200, 0.18);
```

### Color — Minimal Changes

Keep the entire existing green + gray palette. Add one token:

```css
--surface-inset:  rgba(27, 94, 32, 0.04);   /* table stripes, inset areas */
--green-tint-bg:  rgba(76, 175, 80, 0.08);  /* active states, selection */
```

### Typography — Tighten the Scale

Remove redundant sizes. Use only: 11px / 13px / 15px / 22px / 28px.

```css
--text-xs:    11px;   /* labels, table headers, meta */
--text-sm:    13px;   /* body, inputs, badge text */
--text-base:  15px;   /* card titles, nav items */
--text-lg:    22px;   /* section titles */
--text-xl:    28px;   /* stat values */
```

### Spacing — Increase Base Breathing Room

```css
--space-1:   6px;
--space-2:  12px;
--space-3:  20px;
--space-4:  32px;
--space-5:  48px;
```

### Border Radius — Slightly More Refined

```css
--radius-sm:   8px;
--radius-md:  12px;
--radius-lg:  16px;
--radius-xl:  20px;
--radius-pill: 100px;
```

---

## Aurora Mesh Background

**Problem:** Current blobs are too many, too large, and too opaque. They compete with content.

**Fix:** Reduce to 6 blobs max. Drop opacity ceiling to 0.20. Constrain sizes. Slow down animations.

```
Blob 1: top-left origin, 42vw / max 520px, green-100, opacity 0.18, drift 52s
Blob 2: top-right origin, 36vw / max 440px, green-50, opacity 0.15, drift 64s
Blob 3: center-right, 28vw / max 360px, green-200, opacity 0.12, breathe 18s
Blob 4: bottom-left, 38vw / max 480px, green-50, opacity 0.14, drift 44s
Blob 5: bottom-right accent, 22vw / max 280px, rgba(168,220,168,0.3), opacity 0.10, drift 70s
Blob 6: center wisp, 18vw / max 240px, rgba(203,230,200,0.2), opacity 0.08, breathe 22s
```

Remove blobs 7–10. The wisps add noise.

---

## Layout & Shell

### Top Bar — 60px (down from 72px)

The bar is purely functional. It holds identity, context controls, and nothing else.

```
[  F avatar  |  FPO Integrated OS  ]                    [  seed: XXXX  |  Role dropdown  |  Reseed button  ]
```

- Height: 60px
- Avatar: 32px circle, green gradient, letter "F"
- Title: 15px / 500 weight / gray-700
- Seed display: 11px pill badge, glass-light background, gray-500 text — reads as metadata not a control
- Role dropdown: ghost style, 13px, 32px height
- Reseed button: primary small — 32px height, 13px, tight padding
- Bottom border: `--border-glass`
- Background: `rgba(255,255,255,0.72)` + `blur(24px)` — stronger than content cards so it always reads above them

**Remove:** Data generation timestamp string from the bar. Move it to a subtle footer line inside each section if needed.

### Left Sidebar — 220px expanded / 52px collapsed

Current sidebar is correct in concept but visually heavy.

**Changes:**
- Background: `rgba(255,255,255,0.52)` + `blur(20px)` — lighter than content area
- No section label "MODULE VIEWS" — it's obvious
- Nav items: 15px / 500 weight / gray-600 inactive, green-700 active
- Active item: left 3px solid green-500 + `--green-tint-bg` background fill
- Hover: `--green-tint-bg` fill, no border change
- Icon + label on one line, 40px row height
- Collapsed state: icon centered, 40px row height, tooltip on hover
- No dividers between groups — use 8px gap instead
- Sidebar itself has no border-right — the content area's glass edge provides natural separation

### Content Area

- Left margin: sidebar width (220px or 52px)
- Top margin: 60px (top bar)
- Padding: 28px
- Max content width: 1440px, centered if viewport is wider

---

## Component Redesigns

### Stat Cards

**Current problem:** Cards have colored left borders, mixed weights, inconsistent padding.

**New design:**

```
+-------------------------------+
|  LABEL                        |
|  28px value     [badge?]      |
|  11px sublabel                |
+-------------------------------+
```

- Glass: normal tier
- No colored left border on the card itself
- Instead: a small 6px × 6px circle dot in the severity color, placed left of the label
- Padding: 20px × 20px
- Label: 11px / 600 / uppercase / letter-spacing 0.06em / gray-500
- Value: 28px / 600 / tabular-nums / gray-800
- Sublabel: 11px / 400 / gray-400
- Optional badge (HIGH/MED) floats top-right inside the card: pill shape, severity colors
- Min width: 180px, auto-fill grid

### Tables

**Current problem:** Too dense, header styling inconsistent, row hover is weak.

**New design:**

- Container: glass-normal card wrapping the entire table
- Table header row: `--surface-inset` background, 11px / 600 / uppercase / gray-500 / letter-spacing 0.06em
- Cell text: 13px / 400 / gray-700
- Row height: 40px
- Stripe: even rows get `--surface-inset` background (very subtle)
- Hover row: `--green-tint-bg` background, no border
- No outer table border. Only a 1px `--border-subtle` separator between header and body.
- Action column buttons: ghost style, 28px height, tight padding
- Badges inline in cells: same pill design as stat cards
- Pagination: 13px, ghost pill buttons, shown only when rows > 10
- Table title sits above the card as a 15px / 600 heading, not inside the glass card

### Forms / Action Panels

**Current problem:** Forms sit inline within section content, feel bolted on.

**New design — Drawer pattern:**

All create/action forms become right-side drawers, 400px wide, overlaying content without a modal backdrop. A subtle shadow separates them.

```
Drawer:
- background: glass-strong (0.74 opacity, blur 32px)
- border-left: --border-glass
- box-shadow: -8px 0 32px rgba(27,94,32,0.08)
- padding: 28px
- slide-in from right: transform translateX(400px) → 0, 0.3s ease
- Close X button: top-right, 32px, ghost style
```

Form fields inside drawer:
- Labels: 11px / 600 / uppercase / gray-500 / letter-spacing 0.05em
- Inputs: full width, 40px height, glass input style (existing is fine)
- Field gap: 16px
- Submit button: primary, full width, 40px height, bottom of drawer
- Destructive/cancel: ghost, full width, sits above submit

**Exception:** The Execution Flow step forms stay inline — they are the primary content of that view, not secondary actions.

### Buttons

Primary button tightened:
```css
height: 36px;
padding: 0 18px;
border-radius: var(--radius-md);
font-size: 13px;
font-weight: 600;
background: linear-gradient(135deg, #1B5E20 0%, #388E3C 100%);
/* hover: brightness(1.08), shadow medium */
/* active: scale(0.97) */
```

Ghost button:
```css
height: 36px;
padding: 0 14px;
border-radius: var(--radius-md);
border: 1px solid rgba(203, 230, 200, 0.70);
font-size: 13px;
font-weight: 500;
color: var(--gray-600);
background: transparent;
/* hover: border green-300, color green-700, bg --green-tint-bg */
```

Small variants (tables, badges): same styles, height 28px, padding 0 10px.

### Badges / Pills

One consistent badge component:

```css
display: inline-flex;
align-items: center;
height: 20px;
padding: 0 8px;
border-radius: var(--radius-pill);
font-size: 11px;
font-weight: 600;
letter-spacing: 0.03em;
text-transform: uppercase;
```

Colors map to severity exactly as existing — just applied through this single component shape.

---

## Section-by-Section Layout

### 1. Execution Flow

This is the guided demo — it needs clarity above all. The step sequence is the content.

**Layout:** Single-column, max 720px centered.

**Step card design:**
```
+--- Step N of 7 ------------------------------------------------+
| [status dot] STEP TITLE                          [role badge]   |
| Short description of what this step does                        |
|                                                                 |
| [form fields or action content here when active]               |
|                                                 [Action button] |
+----------------------------------------------------------------+
```

- Active step: glass-strong, green-500 left border 3px, full opacity
- Completed step: glass-light, left border green-300, body hidden (collapsed), shows checkmark and completion summary line
- Locked step: glass-light, 50% opacity, no border, lock icon
- Role-restricted: glass-light, amber left border, amber "Needs [Role]" pill

Steps stack vertically with 12px gap. No horizontal layout.

Below the steps, a compact progress bar shows "N of 7 steps complete" with a thin green fill line.

The "Latest WhatsApp thread" preview stays — render it as a narrow aside card (glass-normal, 320px wide) that floats right of the step stack on wide viewports, stacks below on narrow. Keep it small: last 3 messages only, with a "View full thread" link.

### 2. Registry

**Layout:** Full-width, vertical stack of sections.

At the top: 4 stat cards in a row (FPOs, Farmers, Plots, Seasons) — these provide context, not actions.

Below: each data table (FPO Directory, Farmer Registry, Plot Intelligence, Season Register, Communication Profiles, Geographies) is its own glass-normal card with the table title above it. Tables are collapsible — a small chevron toggle on the title collapses the table body, keeping only the header visible. This prevents the page from being overwhelming.

"Add Farmer" is a drawer (see form pattern above), triggered by a primary button in the top-right of the section header area.

### 3. Mock WhatsApp

**This section keeps the phone UI mock. Refinements only.**

**Layout:** Two columns — phone mockup (left) and office console (right).

**Phone mockup — cleaned up:**

The phone frame itself:
```
- Width: 320px, fixed
- Height: 620px, fixed
- Border-radius: 36px
- Background: #1A1A1A (dark phone body)
- Inner screen border-radius: 28px
- Screen background: #ECE5DD (WhatsApp green-gray)
- Box shadow: 0 24px 64px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.16)
- No notch, no buttons — minimalist silhouette
```

Inside the phone screen:
- WhatsApp header bar: #075E54 background, 44px height, farmer name in white 14px / 500
- Message thread: scrollable within the screen bounds
- Message bubbles:
  - Incoming (farmer): white bg, #3C4043 text, 13px, border-radius 0 12px 12px 12px, max-width 72%
  - Outgoing (FPO): #DCF8C6 bg, #3C4043 text, same radius mirrored
  - Timestamp: 10px / gray-400 / aligned right within bubble
- Input bar at bottom of screen: #F0F2F5 bg, 40px height, rounded pill input, send icon

**Farmer selector:** Sits above the phone frame, not inside it. A compact dropdown with a label "Viewing as farmer:".

**Scenario buttons:** A row of ghost pills below the phone (not inside). 13px, max 4 pills visible with overflow.

**Office Console (right column):**

Glass-normal card, fills available width.

- Tab bar at top: "Inbox" / "Escalations" — pill tabs, not underline tabs
- Inbox: list of tickets as rows — farmer name, intent badge, status badge, time. Clicking a row expands a reply thread below the list inline.
- Office reply form: sits at the bottom of the expanded thread, not in a separate area.
- Stats bar (New/In Progress/Resolved/Escalations): a compact 4-cell row of micro-stat chips above the tabs, 40px tall.

### 4. Snapshot (Dashboard)

**Layout:** The most visual section — make it feel like a command center.

Top row: 7 stat cards, auto-fill grid (minmax 160px).

Below: two cards side-by-side:
- Left: "Crop Mix" table (glass-normal, compact)
- Right: "Latest Price Signals" table (glass-normal, compact)

These two are sized 1fr / 1fr on wide screens, stack on narrow.

No other content in this section. Snapshot means exactly that: a moment-in-time view, not a full report.

### 5. Operations

**Current problem:** This section has the most content and feels like a dumped database.

**Fix — tabbed sub-navigation:**

Operations gets its own horizontal sub-nav below the section title:
`Demands | Procurement | Inventory | Collections | Settlements`

Each tab shows only its relevant stat cards + table(s). Switching tabs does not reload — just shows/hides content groups.

Tab bar style:
```
- Height: 40px
- Background: glass-light card
- Tab items: 13px / 500 / gray-600 inactive
- Active tab: green-700 text, 2px bottom border green-500
- Gap between tabs: 24px
```

Within each tab:
- 2–3 stat cards at top (relevant to that tab)
- One or two tables below
- Action buttons (Aggregate, Approve, etc.) sit as primary buttons in the top-right of the tab content area, not scattered throughout

Forms for GRN, issues, collections: drawers.

### 6. Communication

**Layout:** Three-column split on wide screens.

Left column (30%): Inbox table — compact rows, status badges inline, clicking a row populates center.
Center column (40%): Selected thread. Shows full message history. Reply form at bottom.
Right column (30%): Advisories and Escalations stacked vertically as compact tables.

On narrow screens: left and right collapse into tabs.

### 7. Market

**Current problem:** Too many tables competing for attention.

**Fix — lead with the matching engine.**

The Supply Demand Matching view is the most valuable part of this section. Make it prominent.

**Layout:**

Top: 6 stat cards (existing counts) — auto-fill.

Below: two-column layout.
- Left (60%): "Supply Demand Matching" table — this is the hero table. Wider, more room, match percentage gets a visual bar (thin green fill bar in the cell, 0–100%).
- Right (40%): "Buyer Demand Board" table stacked above "Active Sales Orders" table.

Remaining tables (Prices, Buyers, Dispatches) go into a collapsible section below, defaulting to collapsed. A ghost "Show market data" toggle expands them.

Create Buyer Demand: drawer. Create Sales Order: drawer triggered from match row action. Create Dispatch: drawer.

### 8. Carbon

**Layout:** Simple — this section has little data.

Top: 4 stat cards.
Below: two tables side-by-side (Practice Tracking | Project Aggregation).

Add a simple narrative card above the tables: glass-light, 13px text, explains what the carbon score means for this dataset. Italic, gray-600 text. Not interactive.

### 9. KPI Report

**Layout:** Report-style — meant to be read top-to-bottom.

Top: 6 stat cards.

Below that: "Business Readout" — a glass-normal card, full width, with the narrative text formatted as a brief report (left-padded, 15px / 400 / gray-700, max readable width 680px centered within the card).

Below: two tables side-by-side (Approval Queue | Audit Timeline).

Below: Role Permissions table — full width, collapsible by default.

---

## WhatsApp Phone Mockup — Full Specification

Since this component needs to be kept but cleaned up, here are the exact specs.

### Phone Shell

```css
.phone-frame {
  width: 320px;
  height: 620px;
  border-radius: 36px;
  background: #1C1C1E;
  padding: 10px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 24px 64px rgba(0,0,0,0.30),
    0 8px 24px rgba(0,0,0,0.18);
  flex-shrink: 0;
}

.phone-screen {
  width: 100%;
  height: 100%;
  border-radius: 28px;
  background: #ECE5DD;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

### WhatsApp Header Bar

```css
.wa-header {
  height: 56px;
  background: #075E54;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  flex-shrink: 0;
}

.wa-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #25D366, #128C7E);
}

.wa-name {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}

.wa-status {
  font-size: 11px;
  color: rgba(255,255,255,0.70);
  margin-top: 2px;
}
```

### Message Thread

```css
.wa-thread {
  flex: 1;
  overflow-y: auto;
  padding: 10px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wa-bubble {
  max-width: 72%;
  padding: 7px 9px 4px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #3C4043;
  position: relative;
}

.wa-bubble.incoming {
  background: #FFFFFF;
  border-radius: 0 8px 8px 8px;
  align-self: flex-start;
}

.wa-bubble.outgoing {
  background: #DCF8C6;
  border-radius: 8px 8px 0 8px;
  align-self: flex-end;
}

.wa-time {
  font-size: 10px;
  color: #9E9E9E;
  text-align: right;
  margin-top: 2px;
}

/* intent tag — small colored pill below the message text */
.wa-intent {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(7,94,84,0.10);
  color: #075E54;
  display: inline-block;
  margin-top: 3px;
}
```

### Input Bar

```css
.wa-input-bar {
  height: 52px;
  background: #F0F2F5;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.wa-input {
  flex: 1;
  height: 36px;
  border-radius: 20px;
  background: #FFFFFF;
  border: none;
  padding: 0 14px;
  font-size: 13px;
  color: #3C4043;
}

.wa-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #25D366;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
```

---

## Interaction Patterns

### Empty States

Every table needs an empty state. Glass-light card, centered content:
- 32px icon (SVG, thin stroke, gray-300)
- 14px "No [items] yet" in gray-500
- 12px "Actions here will appear once [context]" in gray-400
- Optional: small ghost button to trigger the relevant action

### Loading States

- Tables: skeleton rows — 3 rows of animated shimmer bars (gray-100 → gray-50 pulse)
- Stat cards: skeleton values — same shimmer
- No spinners except in buttons (inline spinner replaces text during submit)

### Feedback Toasts

Replace any inline success/error text with toasts:
- Position: bottom-right, 16px from edges
- Glass-strong card, 320px wide
- Left border 4px colored (green = success, red = error, amber = warning)
- Icon + message + auto-dismiss after 4s
- Stack multiple toasts with 8px gap

### Confirmation for Destructive Actions

Currently: none. Add a small inline confirmation for "Mark Paid" and "Approve":
- The button transforms to: `[Confirm?] [Yes] [Cancel]` inline — no modal.
- 0.2s transition.

---

## Animation Rules

Only three animation purposes are permitted:
1. **Entry**: elements entering the viewport — `fadeInUp`, 0.3s, stagger 0.04s between siblings
2. **Interaction feedback**: hover lift (-2px, shadow), tap scale (0.97)
3. **Background atmosphere**: aurora mesh blobs only

No looping animations on content. No bounce. No attention-seeking motion.

Drawer open/close: `transform: translateX(400px) → 0`, `0.28s cubic-bezier(0.4, 0, 0.2, 1)`.

Section switch: `opacity: 0 → 1` + `translateY(8px → 0)`, `0.25s ease` — subtle, not dramatic.

---

## Typography Hierarchy in Practice

```
Section page title      : 22px / 600 / gray-800
Section subtitle        : 13px / 400 / gray-500
Card / table title      : 15px / 600 / gray-700
Stat label              : 11px / 600 / uppercase / gray-500
Stat value              : 28px / 600 / tabular-nums / gray-800
Stat sublabel           : 11px / 400 / gray-400
Table header cell       : 11px / 600 / uppercase / gray-500
Table body cell         : 13px / 400 / gray-700
Badge text              : 11px / 600 / uppercase
Button text             : 13px / 600
Input text              : 13px / 400
Nav item active         : 15px / 600 / green-800
Nav item inactive       : 15px / 500 / gray-600
Drawer label            : 11px / 600 / uppercase / gray-500 / spacing 0.05em
Form helper text        : 11px / 400 / gray-400
```

---

## What to Remove

The following should be deleted outright, not redesigned:

- The "MODULE VIEWS" sidebar caption
- The data generation timestamp in the top bar
- Horizontal dividers inside cards (use spacing instead)
- Bold table borders (only use subtle 1px separators)
- The subsystem color classification table — not applicable to this app (left over from anomaly dashboard)
- Mesh blobs 7–10 (replace with 6 blob system above)
- Any instances of colored background on an entire section panel (use glass cards inside a neutral section area instead)

---

## Implementation Notes for the Design Agent

1. **Do not change any API calls or data logic.** Only CSS, JSX structure, and inline styles.

2. **All glass surfaces must have `backdrop-filter` + `background` + `border` + `border-radius` declared together.** Never one without the others.

3. **Glass opacity must be consistent by tier.** Do not invent new opacity values — use the three tier tokens.

4. **The sidebar and top bar are always visible.** They must have stronger glass than content cards so they never "disappear" against a bright blob.

5. **Phone mockup dimensions are fixed.** Do not make it responsive. On small screens, the WhatsApp section should scroll horizontally before breaking the phone frame.

6. **Tables inside glass cards do not get their own glass styling.** The enclosing card provides the glass context. Tables are plain inside.

7. **Form drawers slide over content, not push it.** The main layout does not shift when a drawer opens.

8. **Sub-navigation in Operations is purely a CSS show/hide toggle.** No routing changes needed.

9. **Severity dot colors:**
   - HIGH (red): `#EF5350`
   - MEDIUM (amber): `#FFA726`
   - NORMAL (green): `#4CAF50`
   - NEUTRAL (gray): `#8A928A`

10. **All interactive elements (buttons, rows, nav items) must have a visible hover state.** No element should be interactive and visually inert on hover.
