# DESIGN.md: Smart Campus Navigator

Direction: **calm, institutional, clear**. A campus office tool that a staff member can use on a
laptop or on a phone while walking the grounds. White work surfaces on a light slate page, one blue
for every action, colour used only when it carries meaning (status, map roles). No gradients, no
glass, no emoji.

Not based on a UXKIN comparison (not connected); built from the existing brand blue and common
admin-dashboard practice.

Tokens live in `src/index.css` (`@theme`). Use the token names (`bg-primary-600`, `text-ink-muted`),
never raw hex in components.

## Color

| Token | Value | Role |
|---|---|---|
| `primary-600` | #1d4ed8 | Primary buttons, links, active nav, focus rings (brand blue) |
| `primary-700` | #1e40af | Primary hover / pressed |
| `primary-50` / `primary-100` | #eff6ff / #dbeafe | Selected rows, active nav background, info notes |
| `ink` | #0f172a | Headings, body text |
| `ink-soft` | #475569 | Secondary text, labels |
| `ink-muted` | #64748b | Hints, meta, placeholders (≥4.5:1 on white) |
| `line` | #e2e8f0 | Borders, dividers |
| `canvas` | #f8fafc | Page background behind cards |
| `surface` | #ffffff | Cards, drawers, inputs |
| `success-600` / `success-50` | #059669 / #ecfdf5 | Saved, connected, "Happening now", entrances on the map |
| `warning-600` / `warning-50` | #d97706 / #fffbeb | Needs attention (unreachable building, missing entrance) |
| `danger-600` / `danger-50` | #dc2626 / #fef2f2 | Delete, errors, selected item on the map |

Map roles (fixed, also shown in the map legend): building `primary-600`, entrance `success-600`,
QR start point `qr` #7c3aed, walkway point `ink`, selected `danger-600`, path line `ink-soft`.

Light mode only for the admin (staff use it indoors and outdoors in daylight).

## Typography

Family: **Inter** (Google Fonts), fallback system UI. Weights: 400 body, 500 labels/buttons,
600 headings and numbers.

| Name | Size / line | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Badges, table meta, legend |
| `text-sm` | 14 / 20 | Table cells, secondary text, helper text |
| `text-base` | 16 / 24 | Body, inputs (16px keeps iOS from zooming) |
| `text-lg` | 18 / 28 | Card and drawer titles |
| `text-xl` | 20 / 28 | Section headings |
| `text-2xl` | 24 / 32 | Page titles |
| `text-3xl` | 30 / 36 | Stat numbers |

Numbers in stats and tables use `tabular-nums`.

## Spacing and layout

4px base (Tailwind scale). Common steps: 2 (8px) inside controls, 4 (16px) between fields and
card padding on phones, 6 (24px) card padding on desktop and between cards, 8 (32px) between page
sections.

- Desktop (≥1024px): fixed left sidebar 256px, content max width 1152px, 32px page padding.
- Phone: top bar with page title, bottom tab bar (64px) for the 5 sections, 16px gutters.
- Forms open in a **drawer**: right side panel 480px on desktop, full screen on phones.

## Shape and depth

- Radius: `rounded-md` (6px) inputs and small buttons, `rounded-lg` (8px) buttons, `rounded-xl`
  (12px) cards, drawers' inner panels, map frames. Badges are fully rounded.
- Shadows: `shadow-xs` cards (with a `line` border), `shadow-xl` drawers, dialogs and toasts.
  Nothing else casts a shadow.

## Components

- **Button**: primary (filled `primary-600`, white text), secondary (white, `line` border,
  `ink` text), quiet (no border, `ink-soft`, for Cancel and table actions), danger (filled
  `danger-600`). Height 40px (36px `sm`). Hover darkens one step; focus shows a 2px
  `primary-600` ring with 2px offset; disabled is 50% opacity, no pointer.
- **Input / select / textarea**: white, `line` border, `rounded-md`, 40px tall, 16px text.
  Label above (`text-sm` 500 `ink-soft`), hint or error below (`text-sm`, error in `danger-600`).
- **Card**: `surface`, `line` border, `rounded-xl`, `shadow-xs`. Header row with title and an
  optional action on the right.
- **Table / list**: rows separated by `line`; on phones each row becomes a stacked card line.
  Row actions are quiet icon buttons with a tooltip/label.
- **Badge**: `text-xs` 500, tinted background of its role colour (e.g. `success-50` +
  `success-600` text).
- **Navigation**: sidebar items 40px, icon + label; active = `primary-50` background,
  `primary-700` text. Bottom tab bar on phones with icon above label.
- **Drawer**: header (title + close), scrollable body, sticky footer with actions (primary right).
- **Confirm dialog**: replaces `window.confirm` for deletes; states what will be removed.
- **Toast**: bottom-centre on phones, bottom-right on desktop; success/error; auto-hides after 3 s.
- **Empty state**: icon, one-line explanation, the primary action.

## Icons and imagery

One icon set: **Lucide-style** 24px line icons, 2px stroke, drawn by `src/components/ui/AppIcon.vue`
(inline SVG, no icon font). Icons sit at 20px in buttons and nav, 16px inline with text. Never
emoji. Building photos are shown cropped (`object-cover`) with rounded corners; no stock
illustrations.
