# DESIGN.md — Task Manager design system

One theme for all roles. Admin, employee and client share one shell, the same `--tm-*` variables and the same components. Nothing is styled or coloured per role; roles differ only in what they can see and do (permissions, nav items, features), never in how it looks.
Tokens live in `src/styles/theme.css` (CSS variables, bridged to Tailwind in `@theme inline`), global helpers in `src/index.css`.

## References (`/design-refs`)

| File | Used for |
|---|---|
| `8-layout.png` | **Layout reference** (structure only, not its colours): top header, a slim vertical nav pill on the left, collapsible left panel, page header with a round back button. *The file was not in the repo when this layout was built, so the structure follows the written spec.* |
| `1`–`6` `*.png` | Earlier references for folders, calendar, checklist, main UI, profile and attendance screens. Their shapes still apply; their violet/aubergine colours are replaced by the lavender + charcoal palette below. |

## Principles

1. **Top header plus a slim left rail.** The header holds the logo, icon buttons and the avatar menu. Navigation is a narrow vertical charcoal pill fixed to the left of the screen (`SideNav`). No role gets a different shell.
2. **Lavender and charcoal.** Page `#F3F1F6`, cards white. Charcoal `#2A2933` for dark panels and the nav rail, `#3E3D4A` for rows, hover and primary buttons. Lavender `#C4B5E0` for the active nav pill, highlights and counters (always with charcoal text); deep lavender `#8F7FBF` for links and icons. No violet, aubergine, gold or pure black.
3. **Big and round.** Cards 20px, panels/modals 32px, buttons/inputs/chips/tabs are pills, icon buttons are circles.
4. **Bento.** Cards sit on the lavender canvas with compact padding (16–20px) and very light shadows; no heavy borders.
5. **Glass only on the header and overlays.** Header, modals, drawers, popovers, dropdowns, command palette and toasts. **Never** on cards, task lists or tables. Glass that holds text must be mostly opaque (see "Shape, depth, glass").
6. **Motion is feedback, not decoration.** Springs for popups, short ease-out for everything else, all of it off under `prefers-reduced-motion`.

## Layout

```
┌ Topbar (sticky) ────────────────────────────────────────────────────────────┐
│ logo + name                                   🔍 📅 🔔 ⚙  (avatar menu)     │
└──────────────────────────────────────────────────────────────────────────────┘
 ╭────╮ ┌ ProjectsPanel ┐ ┌ page ──────────────────────────────────────────────┐
 │ ⌂  │ │ (Projects     │ │ ( ← )  Big title                    [ Main action ]│
 │ ▣  │ │  pages only)  │ │        subtitle                                    │
 │ ✓  │ │               │ │ cards …                                            │
 │ 💬 │ └───────────────┘ └────────────────────────────────────────────────────┘
 │ 📢 │  SideNav: slim vertical charcoal pill, fixed left
 │ …  │  every item listed; scrolls inside if too tall
 ╰────╯
 phones: header (logo, ☰, search, bell, avatar) + page + floating bottom tab bar
```

- **Shell** (`AppShell`): `Topbar`, `SideNav` (desktop rail; the content leaves 132px on the left for it), `NavDrawer` (phones), `ProjectsPanel`, the routed page and `BottomTabBar`. Content max width 1600px.
- **Nav items** come from one place, `navItems.tsx` (`WithNavItems`): `main` and `more` are listed one after the other in the left rail (the split only matters on phones, where the drawer shows `more` under a "More" heading). The rail and the phone drawer read the same model, so role-based visibility cannot drift. Admin main: Home, Projects, Task Hub, Chats, Office board; More: Activity, Calendar, Reviews, Team Members, Settings. Employee main: the same with My Tasks; More: Activity, Calendar, Reviews, Settings. Client main: Home, Chats, Approvals, Deliverables, Requirements; More: Book a meeting.
- **Header right** (desktop): status chip (full from 2xl, a round button below), focus menu, search (also Ctrl+K), calendar (team only), notifications, settings, avatar menu. Phones keep search, bell and avatar plus the ☰ drawer.
- **Projects panel** (`ProjectsPanel`): the project → subfolder tree (`SidebarTree`, with all create / rename / move / delete / reorder actions) as a charcoal panel on the left of `/admin|app/projects…` only. It collapses to a round reopen button (remembered per browser in `localStorage`, `tm-projects-panel`). On phones it sits above the page as a "Projects & folders" bar that folds the tree. Clients have no Projects pages and no panel.
- **Page header**: every page uses `PageHeader`: round back button (previous page, or the role's home when opened directly), big title, subtitle, and the page's main action on the right. Do not hand-roll an `<h1>` block.

## Page patterns

Every list or dashboard page is built from these three shared pieces, in this order: header, KPI row, filter bar, then the list/detail panel. Use them instead of hand-rolled markup, so all three roles match.

**KPI row** (`StatCard`, `src/components/ui/StatCard.tsx`). A white card: label top-left, round icon top-right, big number (34px, the app font, bold; padding 20, 36px round icon with a 16px glyph), optional trend pill (arrow + %, `delta`), a hint chip, and a mini chart beside the figure.
- `trend={number[]}` + `trendKind="bar" | "line"` draw `MiniChart` (last point solid, earlier ones faded). `progress` draws a bar under the figure for ratios.
- **Existing data only.** A series comes from data the page already loaded: `dailyCounts` / `upcomingCounts` / `weekTrend` in `src/utils/trend.ts` bucket dates per day and compare the last 7 days with the 7 before; or per-person / per-project arrays the API already returns. If a figure has no series (e.g. unread chats), show no chart. Never invent numbers.
- **Clickable.** Every StatCard is a click target: `to="/path?quick=..."` opens the page behind the number already filtered; `onClick` filters the current page or opens `ItemsDrawer` (name/avatar rows with links) when no page exists. Filters set this way show as removable chips in `FilterBar` (`chips`). Hover lifts the card and swaps the icon for an arrow; Enter/Space work.
- Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (3 cards: `xl:grid-cols-3`). Used on the admin, employee and client dashboards, Tasks, Reviews, Approvals and Deliverables.

**Filter bar** (`src/components/ui/FilterBar.tsx`). One row on a `--tm-card-muted` rounded strip, wrapping on small screens: `FilterSearch` (pill input), `FilterPill` (pill that opens a listbox; tinted lavender + shows the choice when active), `FilterDate` (date or month picker as a pill), `PillTabs` for modes. `FilterBar` takes `activeCount` and `onClear` and shows "N active" plus a Clear button. A filter counts as active when it differs from its default. Used on Tasks, Deliverables, Daily Updates, Team Members and the Office board. The filters themselves are the page's existing state; the bar only changes how they look.

**Master-detail** (`src/components/ui/MasterDetail.tsx`), for a list with a detail: Tasks, Reviews, Client approvals, Client deliverables; Chat uses the same look in `ChatWorkspace`.
- `MasterDetail`: a charcoal (`--tm-side-bg`) panel, radius 32, list left (`minmax(300px,380px)`), detail right. Segmented tabs (`PillTabs`) sit **notched into the panel's top edge**: centred on the edge with a rim in the page colour (`--tm-bg`). The list column is `.tm-dark-scope` (token re-pointing without a background), so token-based children render for dark.
- `MasterRow`: avatar, title, subtitle, status chip; **selected = lavender with charcoal text**.
- `DetailCard`: lavender gradient (`--tm-detail` → `--tm-detail-2`), white title, subtitle, badges, actions top-right. Content goes in `SubGrid` / `SubCard`: **solid `--tm-card` cards** on the gradient, so existing components (approval buttons, review actions, deliverable steppers) keep their normal colours and all their actions.
- `useMasterSelection(rows)` holds the open row (first by default). On a phone the list and detail take turns, with an "All" back button.
- Never put light-surface content directly inside `.tm-dark-scope`; its tokens are for dark. Put it in a `SubCard`, or re-point locally (e.g. `[--tm-card:#3e3d4a]` on a search input).

## Colour tokens

Always use the variables (`bg-[var(--tm-card)]`), never hex, so dark mode keeps working.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--tm-bg` / `--tm-bg-sunken` | `#f3f1f6` / `#eae7f0` | `#16151c` / `#111016` | page canvas / wells, hover fills |
| `--tm-card` / `--tm-card-muted` | `#ffffff` / `#f7f5fa` | `#22212b` / `#2a2933` | solid surfaces |
| `--tm-border` / `-strong` | `#e6e2ee` / `#cfcad9` | `#33323f` / `#4a4958` | hairlines, input borders |
| `--tm-ink` / `-soft` / `-muted` | `#2a2933` / `#3e3d4a` / `#7b7986` | `#f1eff6` / `#cfccda` / `#a19eaf` | text |
| `--tm-solid` / `-ink` / `-hover` / `-accent` | charcoal `#3e3d4a` / white / `#2a2933` / lavender `#c4b5e0` | lavender `#c4b5e0` / `#2a2933` / `#d5cbea` / `#2a2933` | circular icon buttons, primary controls and the glyph on them |
| `--tm-primary` | `#3e3d4a` | `#c4b5e0` | primary buttons |
| `--tm-primary-dark` | `#8f7fbf` | `#c4b5e0` | **text/icon** shade: links, chip text on the tint |
| `--tm-primary-hover` / `-light` | `#2a2933` / `#c4b5e0` | `#d5cbea` / `#a99bd3` | button hover fill / focus outline, soft rings |
| `--tm-primary-soft` / `-softer` | `#e7e2f2` / `#f1eef8` | `#2f2b40` / `#27243a` | selected rows, chips, folder back sheets (the lavender tint) |
| `--tm-on-primary` | white | `#2a2933` | text on a primary, success, warning or danger fill |
| `--tm-accent` / `--tm-accent-ink` | `#c4b5e0` / `#2a2933` | `#c4b5e0` / `#2a2933` | counters, switch, checked checkbox, progress and the text on them |
| `--tm-hero` / `--tm-hero-2` | `#2a2933` / `#3e3d4a` | `#111016` / `#2a2933` | dark hero/featured panels (white text), gradient end |
| `--tm-detail` / `-2` / `-ink` | `#8f7fbf` / `#a99bd3` / white | `#7a6aae` / `#8f7fbf` / white | detail cards: lavender gradient with white text |
| `--tm-side-bg` | `#2a2933` | `#111016` | dark panels: left nav rail, projects panel, phone tab bar |
| `--tm-success` / `-warning` / `-danger` / `-info` / `-neutral` (+ `-bg`, `-ring`) | unchanged status hues on pale tints | unchanged status hues on deep tints | status |

**Dark-panel scope.** `.tm-sidebar` (in `theme.css`, name kept for compatibility) re-points the tokens inside a dark panel: text white / `#e4e1ee`, muted `#a9a6b8`, rows and hover `#3e3d4a`, lines `#4a4958`, count badges `#3e3d4a`, and the active item = **lavender pill with charcoal text**. It is used by the left nav rail, the projects panel, the phone drawer and the bottom tab bar. Everything inside stays token-based, so the same markup works in light and dark mode.

**Dark mode** (`<html data-theme="dark">`): canvas `#16151c`, cards `#22212b`, panels `#111016`. Primary controls flip to lavender with charcoal text so they stay visible on dark cards. Shadows and scrims use a tinted `rgb(10 9 14)`, never `#000`.

**Contrast (known gaps).** The palette values are the spec's. Two combinations fall below WCAG AA for small text: muted `#7b7986` on the canvas `#f3f1f6` is about 3.7:1, and `--tm-primary-dark` `#8f7fbf` on white is about 3.6:1 (on the tint about 2.9:1). Both pass for large or bold text and UI components (3:1) but not 4.5:1 body-size text. If this matters, darken them to `#6f6c7c` and `#7461ad` in `theme.css`; nothing else needs to change. Charcoal on lavender (`#2a2933` on `#c4b5e0`) is about 8:1, white on charcoal 12:1+.

## Shape, depth, glass

- Radii: `--tm-radius-sm 14`, `-md 20`, `-lg 28`, `-xl 32`, `-card 20`, `-pill 999`.
- Shadows: `shadow-soft-xs/-sm/soft/-lg` (soft, large, charcoal-tinted; cards use `-sm`); `shadow-glow` (focus/hover halo).
- Glass: utility classes `glass` and `glass-strong` (panels that hold text: modals, menus, popovers, toasts). The header itself is a frosted strip (`--tm-bg` at 84% with a blur) on the canvas. Scrim behind modals: `--tm-scrim`.
- **Glass overlays must be mostly opaque for readability.** Any glass panel that holds text uses the surface colour at ~94% opacity, a blur of 24px or more, a soft border and a deep shadow. Content inside sits on solid `--tm-card`. Do not lower `--tm-glass-bg-strong` below 0.92.

## Components (shared, in `src/components`)

| Component | Spec |
|---|---|
| `Topbar` | Sticky frosted header, 76px. Logo (workspace logo or initial) + name on the left; round icon buttons (search, calendar, bell, settings), status chip and `AccountMenu` on the right. Phones: ☰, search, bell, avatar. |
| `SideNav` | Slim vertical charcoal pill (`.tm-sidebar`), 84px wide, fixed `left-4`, from below the header to 16px above the bottom, fully rounded ends. **Every nav item is listed directly, one under the other** (no "More"): the icon over a 10px label; active = lavender pill with charcoal text that slides between items (shared `layoutId`); count badges sit on the item corner. If the items do not fit the height, the rail scrolls inside itself (scrollbar hidden) and items and gaps shrink a little under 780px of height. Desktop only (`lg+`). |
| `NavDrawer` | Phones only: charcoal drawer opened by ☰ with every nav item (main, then More). |
| `ProjectsPanel` | Collapsible charcoal panel with the project tree on Projects pages (see Layout). |
| `BottomTabBar` | Floating charcoal pill (phones), lavender active tab. Unchanged in structure. |
| `PageHeader` | Round back button + big title + subtitle, actions right. Used by every page. |
| `HeroCard` | Radius 20, padding 20–24, title 20–24px. Charcoal `--tm-hero` gradient, curve pattern, white text; also the nudge and monthly-goal panels. |
| `Button` | Pill. `primary` (charcoal; lavender in dark), `solid`, `secondary`, `outline`, `subtle`, `ghost`, `danger`. Lifts 1.5px on hover, springs on press. |
| `Input` / `Select` | Pill, solid fill, lavender focus glow. `Textarea` radius 28. |
| `Card` | Solid, radius 20, padding 16–20 (`CardContent` 20), height fits content. Title 15px semibold, description 13px muted (max 2 lines). Corner arrow buttons 36px with 16px icons. Grid gaps 16px. Shadows light (`shadow-soft-sm` is 0 2px 12px at 4.5%). `interactive` lifts and gets a lavender border. |
| `Modal` / `Drawer` / `CommandPalette` | Glass panel over a blurred scrim, spring pop-in, solid circular close button. |
| `AccountMenu`, bell popover | Glass popover, `popoverVariants` spring. The avatar trigger shows name and title from 2xl up, the avatar alone below. |
| `Badge` / `StatusChip` | Pill, 11px text, padding 4/10; status hues unchanged. |
| `Avatar` | Round; initials tints from the token set; stack rings use the card colour. |
| `FolderCard` | Projects and subfolders. Folder-shaped tile, sheets peek out of the back, member avatars on the front. Decorative only. |
| Calendar page | Left rail: mini month + people avatars. Week grid on a solid card with pastel booking blocks. The booking form is a `glass-strong` popup. |
| `ItemCard` kit (`ItemCard.tsx`) | Subfolder Checklist, Deliverables and Mid-way changes, like Requirements: `ComposerCard` on top, then compact white `ItemCard`s (round icon tile, text, `FileChip`s, `AuthorStamp`) 12px apart, staggered in and collapsing smoothly on delete (wrap in `Stagger` + `AnimatePresence`). `ItemCardSkeletons` while loading. |
| `NoteStack` | Stacked notes that flip open into a large view. No longer used on the subfolder page. |
| `Switch` / `PillTabs` | Segmented pill control: sunken track, sliding active pill. Switch: lavender track when on. |
| `ToastHost` | Glass, springs in from the right. |
| Checkbox | Every native `<input type="checkbox">` is styled globally (rounded, lavender when checked with a charcoal tick, pop animation). Add `class="tm-native"` to opt out. |

## Motion (framer-motion — the `motion` package, imported from `motion/react`)

Helpers in `src/components/ui/motion.ts`; always gate on `useMotionPrefs().reduced`.

| Effect | Where |
|---|---|
| Page transition | `RouteTransition` (fade + 10px rise) |
| Staggered card entry | `Card`, `StatCard`, `HeroCard`, `StaggerItem` inherit the parent's `hidden`/`show` variants (55ms stagger) |
| Hover lift + glow | `Button`, interactive `Card` |
| Spring popups | `modalVariants`, `popoverVariants`, toasts |
| Nav pill slide | `SideNav` active pill (spring) |
| Checkbox pop | `tm-pop` keyframe in `index.css` |
| Number count-up | `CountUp` |
| Drag and drop feedback | add `tm-drag` (or `data-dragging="true"`) to the dragged item; `tm-drop` on a valid target |

`prefers-reduced-motion: reduce` zeroes CSS animation/transition durations globally (`index.css`) and every motion component skips transforms via `useMotionPrefs`.

## Rules for new UI

- Use shared components; no per-role colour branches. A UI change goes into a shared component so all three roles get it.
- New page → `PageHeader` for the title block; new nav item → `navItems.tsx` only.
- Colours from tokens only. On a primary fill use `--tm-on-primary`; on `--tm-solid` use `--tm-solid-ink`; on an accent fill use `--tm-accent-ink`; on a solid control's glyph use `--tm-solid-accent`. Coloured *text* uses `--tm-primary-dark`, never `--tm-primary` (charcoal in light mode, so it would not read as a link).
- Glass only for the header and overlays. Anything a person scans (lists, tables, chat) stays on solid `--tm-card`.
- UI work is visual only: never change logic, APIs, state, permissions or remove features.
