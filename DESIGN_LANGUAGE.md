# Design Language - FPO Integrated OS

## Purpose

This file is the design source of truth for the FPO Integrated OS frontend. It documents the visual system, interaction patterns, and content rules that the current React app actually uses.

This project is not a generic dashboard. It is an operations console for an FPO workflow demo, so the interface should feel:

- calm
- trustworthy
- operational
- demo-ready
- human-in-the-loop by design

## Product Character

The UI should read like a working command center for agriculture operations, not like a flashy SaaS template.

- The base shell is light, crisp, and practical.
- Green is the primary brand signal because it reinforces agriculture, trust, and continuity.
- Urgency comes from content and status tone, not from noisy decoration.
- Human review is visible and intentional. The system should never imply full automation when a human decision is still needed.
- Decorative motion is reserved for hero moments like login, the floating phone, and the demo coach.

## Core Principles

1. Work before chrome. The most important action or queue should be visible without hunting.
2. Exceptions earn emphasis. Use color and stronger contrast for risk, backlog, and escalation, not for every card.
3. Humans stay in the loop. Approval, review, and handoff states should always be obvious.
4. Tell the story at the section level. Each page should lead with what matters now, then expand into detail.
5. Keep the shell consistent. Novelty belongs in contained demo surfaces, not in shared layout primitives.
6. Use motion for orientation. Animations should help users understand state change, not compete with the data.

## Visual System

### Color Tokens

Shared tokens live in [`frontend/src/index.css`](frontend/src/index.css).

| Token | Value | Use |
| --- | --- | --- |
| `--green-900` | `#1b5e20` | brand anchor, strong text, primary gradient start |
| `--green-700` | `#2d6f33` | darker success/action state |
| `--green-600` | `#388e3c` | primary accent |
| `--green-500` | `#4caf50` | active indicators, buttons, positive tone |
| `--green-300` | `#81c784` | hover borders, soft emphasis |
| `--green-200` | `#a8dca8` | soft borders, user chip |
| `--green-100` | `#cbe6c8` | mild fills |
| `--green-50` | `#e6f4ea` | pale success surface |
| `--bg-base` | `#f5fbf4` | app background |
| `--white` | `#ffffff` | main cards and surfaces |
| `--surface-inset` | `#ffffff` | inset row backgrounds |
| `--gray-50` | `#f5f7f5` | light neutral surface |
| `--gray-100` | `#e8ece8` | dividers |
| `--gray-200` | `#d0d5d0` | subtle borders |
| `--gray-300` | `#b0b8b0` | secondary controls |
| `--gray-400` | `#8a928a` | quiet text |
| `--gray-500` | `#6b736b` | helper text, metadata |
| `--gray-600` | `#4a524a` | secondary body text |
| `--gray-700` | `#2d332d` | strong body text |
| `--gray-800` | `#1a1f1a` | primary text |
| `--red-500` | `#ef5350` | critical states |
| `--amber-500` | `#ffa726` | warning / medium attention |

### Semantic Tone Rules

The shared tone system is deliberately small:

- `normal`: healthy, complete, or in-control
- `medium`: needs attention soon, but not blocked
- `high`: urgent, blocked, risky, or awaiting important human action
- `neutral`: informational, historical, or unclassified

Use green for normal, amber for medium, and red for high. Neutral should stay gray.

Do not introduce new global semantic colors unless a surface is a contained product simulation. The two approved exceptions already in the app are:

- WhatsApp-style green inside the floating farmer phone
- purple in the walkthrough visualization for explicit human intervention moments

### Surface Model

The current app uses restrained matte surfaces, not heavy glassmorphism.

- `glass-light`
- `glass-normal`
- `glass-strong`

Despite the class names, these shared shell surfaces are plain white cards with neutral borders and no backdrop blur. Treat the names as legacy implementation labels.

Use shared shell surfaces for:

- top bar
- sidebar
- stat cards
- tables
- workboard cards
- tracker panels
- queue columns

Use translucent / elevated surfaces only for contained, high-drama layers:

- login card
- sales cheatsheet
- floating farmer phone
- drawer panel
- command palette

### Borders and Shadows

Global border tokens:

- `--border-glass: 1px solid #e5e7eb`
- `--border-subtle: 1px solid #e5e7eb`

Shadow usage is selective:

- top bar: soft, wide shadow for separation
- primary buttons: modest lift
- drawers and overlays: deeper elevation
- static content cards: usually no large shadow

Avoid stacking multiple dramatic shadows on normal data surfaces.

## Typography

The type stack is intentionally familiar and utilitarian:

- `--font-sans: "Segoe UI", "Helvetica Neue", Arial, sans-serif`

Type tokens:

| Token | Value | Typical use |
| --- | --- | --- |
| `--text-xs` | `11px` | labels, metadata, badges |
| `--text-sm` | `13px` | controls, body copy, table cells |
| `--text-base` | `15px` | titles, nav labels |
| `--text-lg` | `22px` | section titles, key stats |
| `--text-xl` | `28px` | hero metric values |

Typography rules:

- Section titles use `22px` and `600` weight.
- Operational labels use uppercase microcopy with increased letter spacing.
- Most body copy stays at `13px` to keep dense screens compact.
- Numeric values should use tabular alignment where comparison matters.
- Use sentence case for major headings. Reserve uppercase for small labels, pills, and metadata.

## Spacing and Shape

Spacing tokens:

| Token | Value |
| --- | --- |
| `--space-1` | `6px` |
| `--space-2` | `12px` |
| `--space-3` | `20px` |
| `--space-4` | `32px` |
| `--space-5` | `48px` |

Radius tokens:

| Token | Value |
| --- | --- |
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-xl` | `20px` |
| `--radius-pill` | `100px` |

Rules:

- Small utilities and chips use `8px` to `12px`.
- Cards use `16px`.
- Hero overlays can use `20px`.
- Pills and status chips should always be fully rounded.

## Layout System

### Shell

The base app shell is defined in [`frontend/src/components/layout/AppShell.jsx`](frontend/src/components/layout/AppShell.jsx).

- Top bar height: `60px`
- Sidebar width: `220px`
- Collapsed sidebar width: `52px`
- Content padding: `16px 20px`
- Layout pattern: fixed shell, sticky nav, fluid content

The shell should feel stable and quiet. Most visual change should happen inside content panels, not in the frame around them.

### Section Structure

Every major section should follow this rhythm:

1. Title and subtitle that explain the page in plain English.
2. Compact lead metrics or status summaries.
3. A prioritized work surface.
4. Full detail tables, queues, or drawers underneath.

`SectionPanel` is the shared wrapper for this pattern and should remain visually light.

### Grid Patterns

Common grids already in the codebase:

- stat grid: `repeat(auto-fit, minmax(150px, 1fr))`
- dashboard stat grid: `repeat(auto-fit, minmax(140px, 1fr))`
- equal split: `repeat(2, minmax(0, 1fr))`
- market split: `1.5fr / 1fr`
- communication split: `1.05fr / 1.35fr / 1fr`
- form grid: 4 equal columns

Prefer these existing layouts before inventing new grid systems.

## Core Components

### Navigation

The sidebar is terse by design:

- two-letter glyph
- short label
- clear active state
- optional collapsed icon-only mode

The active state uses a green left rail and a pale green fill. Keep navigation language concise.

### Top-Bar Meta Controls

Seed, mode, generated timestamp, role, reseed, and the signed-in user all live in pill-like controls.

These controls should feel like environment settings, not primary calls to action.

### Stat Cards

Defined by [`StatCard`](frontend/src/components/cards/StatCard.jsx).

Structure:

- label row with tone dot
- optional status badge
- large value
- helper text

Use stat cards for at-a-glance state, not for verbose explanations.

### Badges and Pills

Use badges to compress state into a single glance:

- short text only
- uppercase where appropriate
- consistent semantic tone
- no long sentences inside badges

Use pills for:

- filter tabs
- metadata chips
- count chips
- tracker links

### Buttons

Primary buttons use the green brand gradient and modest elevation.

- height: `36px`
- small variant: `28px`
- medium radius
- strong text weight

Ghost buttons are neutral, bordered, and used for secondary actions. Disabled buttons should reduce opacity and remove motion.

### Forms

Forms are structured for quick operational input:

- uppercase micro-labels
- `40px` inputs and selects
- `96px` minimum textareas
- white or near-white field backgrounds
- green focus ring

Drawers are the preferred form container for task creation and state changes. Avoid full-page forms unless the workflow truly needs them.

### Tables

Tables are still the densest information surface in the app, but they should stay easy to scan:

- uppercase header row
- quiet zebra striping
- pale green hover state
- filters above the table
- empty states centered and explicit

Horizontal scroll is acceptable inside tables. It is not acceptable for the entire page layout.

### Drawers

The drawer is the main action container for create, approve, aggregate, and compose flows.

- slides in from the right
- translucent white panel
- deeper elevation than normal cards
- strong header and subtitle
- no unnecessary nested chrome

Use a drawer when the user should keep page context while completing a focused task.

### Workboard Cards

Workboard cards are the preferred "lead surface" for section-specific operations pages. They combine:

- eyebrow
- title
- one-sentence explanation
- count
- optional action button
- concise table or list below

These cards are the main storytelling device for the product. They should highlight what deserves action first.

### Queue Columns

Queue columns are used when the workflow benefits from a light board metaphor:

- new
- in progress
- resolved

Keep the board readable and operational. This is not a kanban app with elaborate drag-and-drop behavior.

### Tracker Surface

The tracker is a deeper decision surface:

- searchable
- card list on the left
- focused detail on the right
- next action made explicit

Use the tracker pattern when users need to inspect, prioritize, and act on multi-step operational work.

### Command Palette

The command palette is a power-user layer:

- fast
- compact
- keyboard-friendly
- no long prose

Commands should be action-oriented and easy to scan.

## Signature Demo Surfaces

### Login Experience

The login page is the most expressive moment in the app.

- soft green gradient background
- blurred green orbs
- animated agent mesh
- centered translucent card
- short promise line: "Five agents. One command center."

This is the right place for visual drama because it introduces the concept before users enter the calmer shell.

### Floating Farmer Phone

The floating phone is a product simulation, not just a widget.

- it uses WhatsApp-adjacent green accents
- it can be dragged
- it keeps a believable message-thread structure
- it should feel tactile and live

Keep this surface self-contained. Its richer styling should not leak into the shared app shell.

### Sales Cheatsheet / Demo Coach

The cheatsheet is a guided demo layer for presenters.

- fixed bottom-left placement
- elevated translucent panel
- tabbed content
- lightweight chat metaphor
- product pitch and contextual coaching

It should feel supportive and confident, never like a generic AI sidebar.

## Section Intent

Current primary sections are defined in [`frontend/src/theme.js`](frontend/src/theme.js).

| Section | Intent |
| --- | --- |
| Command | the highest-level operating view |
| Walkthrough | narrative explanation of the agentic flow |
| Farmer Network | registry and foundational records |
| Fulfillment | operational intake, procurement, stock, collection, settlement |
| Market Execution | demand matching and downstream execution |
| Human Handoff Desk | office queue plus farmer-side simulation |
| Campaigns | communication inbox, advisories, broadcasts |
| Approvals | pending decisions and audit clarity |
| Carbon | quieter evidence and readiness workflows |

Each page should have one dominant story. Do not let lower-priority data compete with the main operational message.

## Content and Voice

The interface copy should sound like a smart operations teammate:

- direct
- plain-English
- specific
- lightly instructional
- never robotic

Good UI copy patterns already in the repo:

- "Needs review"
- "Ready next"
- "Orders and dispatches still in motion"
- "Approval items affecting cash release"

Copy rules:

- Prefer clear noun phrases for titles.
- Use subtitles to explain why the surface matters.
- Keep microcopy short and operational.
- Expose IDs, counts, and timestamps when they help users orient themselves.
- If an agent did something automatically, label that clearly.

## Motion

Shared motion should stay restrained:

- default transitions around `0.2s`
- subtle hover lift for clickable cards and primary buttons
- short entrance motion for panels
- stronger pulse only for demo-oriented FABs and hero elements

Do not reintroduce a constantly animated full-app background. Motion should be local and purposeful.

## Responsive Behavior

The UI is desktop-first, but it should collapse cleanly:

- sidebar can collapse
- overlays narrow at smaller widths
- fixed demo surfaces shrink before they disappear
- tables may scroll horizontally within their own container

Preserve the feeling of a stable command center even on smaller screens.

## Accessibility

Accessibility rules for this project:

- never rely on color alone for status
- keep text contrast strong against white surfaces
- maintain visible hover and focus states
- preserve readable control heights
- use real button and form semantics for interactive surfaces
- keep status labels explicit when a human decision is required

## Implementation Rules

When extending the frontend:

1. Start with existing tokens in [`frontend/src/index.css`](frontend/src/index.css).
2. Reuse existing component archetypes before inventing new ones.
3. Keep the shell matte and quiet.
4. Reserve strong visual treatment for contained demo surfaces.
5. Use green as the structural accent; use amber and red only for semantic state.
6. Keep titles and subtitles operational, not marketing-heavy.
7. Prefer one strong lead surface per page over many equally loud cards.

## Anti-Patterns

Avoid the following:

- reviving the old anomaly-dashboard language
- introducing a dark mode theme
- adding decorative backgrounds across the full app shell
- using purple, blue, or other accents as new primary brand colors
- making every card look equally urgent
- hiding human review states behind overly polished automation language
- building new forms as full-screen pages when a drawer is enough

## Key Files

| File | Responsibility |
| --- | --- |
| [`frontend/src/index.css`](frontend/src/index.css) | tokens, surfaces, global layout, component styling |
| [`frontend/src/theme.js`](frontend/src/theme.js) | navigation labels and section names |
| [`frontend/src/components/layout/AppShell.jsx`](frontend/src/components/layout/AppShell.jsx) | top bar, sidebar, shell framing |
| [`frontend/src/components/sections/SectionPanel.jsx`](frontend/src/components/sections/SectionPanel.jsx) | shared section wrapper |
| [`frontend/src/components/cards/StatCard.jsx`](frontend/src/components/cards/StatCard.jsx) | metric card pattern |
| [`frontend/src/components/auth/Login.jsx`](frontend/src/components/auth/Login.jsx) | login hero and entry experience |
| [`frontend/src/components/phone/FloatingFarmerPhone.jsx`](frontend/src/components/phone/FloatingFarmerPhone.jsx) | floating phone simulation |
| [`frontend/src/components/sales/SalesCheatsheet.jsx`](frontend/src/components/sales/SalesCheatsheet.jsx) | demo coach overlay |
| [`frontend/src/sectionViews.jsx`](frontend/src/sectionViews.jsx) | section-level UI patterns and workflow surfaces |

## Short Version

If you are unsure what to design, default to this:

- white operational shell
- green brand structure
- quiet neutrals
- red and amber only for attention
- one lead workflow per page
- strong subtitles that explain why the section matters
- contained visual drama only in login and demo overlays
