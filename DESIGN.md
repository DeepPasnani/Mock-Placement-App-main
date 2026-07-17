---
name: CampusTrack
description: Placement assessment platform — warm bone, restrained ink, one deep pine accent
colors:
  deck: "#F3EFE2"
  panel: "#FBF9F2"
  rim: "#DFD4B8"
  ink: "#2A2419"
  annotation: "#8A8066"
  accent: "#2F5D56"
  accent-light: "#4C8078"
  accent-dark: "#1E4038"
  verify: "#4B7B3F"
  verify-light: "#6E9B60"
  verify-dark: "#365C2C"
  alert: "#AE4331"
  alert-light: "#C96952"
  alert-dark: "#8A3324"
  clarify: "#565C86"
  clarify-light: "#7A80A8"
  clarify-dark: "#3F4566"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.375
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
rounded:
  xs: "0.125rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "2.5rem"
  3xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.annotation}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    border: "1px solid {colors.rim}"
  input-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    border: "1px solid {colors.rim}"
  panel-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem"
    border: "1px solid {colors.rim}"
---

# Design System: CampusTrack — Bone & Ink

## 1. Overview

**Creative North Star: "The Exam Hall at Dawn"**

A quiet examination hall in the early morning. Warm bone-coloured desks, soft natural light through tall windows, the faint smell of paper. Everything is still, serious, and purposeful. Students arrive, sit down, and focus — the room does not distract them.

The palette is restrained: warm cream surfaces (`#F3EFE2`), off-white panels (`#FBF9F2`), deep warm ink text (`#2A2419`), and a single deep pine green accent (`#2F5D56`) that appears only where action is needed. This is not a "modern" or "tech" interface — it is an institutional tool designed for concentration during high-pressure exams.

**Key Characteristics:**
- Warm bone/cream backgrounds (not white, not dark)
- Single pine green accent used ≤15% of any screen — the action signal, never decoration
- Flat panels with soft, warm-tinted shadows on interaction
- Typography-first: clear hierarchy without decorative elements
- The interface disappears so the exam can happen

**Explicit Rejections (from PRODUCT.md anti-references):**
- Gradient text, glassmorphism, decorative blurs
- Tiny uppercase tracked eyebrows above every section ("OVERVIEW", "FEATURES", "PRICING")
- Numbered section markers (01 / 02 / 03) as default scaffolding
- Side-stripe borders on cards
- Identical card grids
- The hero-metric template (big number + small label + gradient accent)
- Hand-drawn / sketchy SVG illustrations
- Any pattern that reads as AI-generated rather than designed
- Dark mode as default (exam halls are brightly lit — light theme reduces contrast fatigue)

## 2. Colors: The Bone & Ink Palette

The palette is drawn from a physical exam room: bone-coloured desks, cream paper, ink, and the deep green of a blackboard or a marker board.

### Primary
- **Pine Green** (`#2F5D56` / `oklch(0.39 0.04 190)`): The single saturated accent. Used for interactive elements — primary buttons, active states, focus rings, selected filters. Always intentional, never decorative.

### Neutral
- **Warm Deck** (`#F3EFE2` / `oklch(0.94 0.015 85)`): The foundational background — worn wooden desks. Body background, input fields, muted containers.
- **Cream Panel** (`#FBF9F2` / `oklch(0.97 0.01 85)`): Slightly lighter lifted surface. Used for cards, panels, sidebars, modal content — the paper on the desk.
- **Warm Rim** (`#DFD4B8` / `oklch(0.86 0.025 80)`): Subtle warm border for dividers, separators, input outlines. Precise 1px.
- **Ink** (`#2A2419` / `oklch(0.18 0.01 55)`): Deep warm black — like good fountain pen ink on paper. Primary text, headings.
- **Annotation** (`#8A8066` / `oklch(0.56 0.025 70)`): Muted warm gray. Secondary text, placeholders, disabled states. Reads at ≥4.5:1 against deck/panel.

### Semantic
- **Verify Green** (`#4B7B3F`): Correct answers, completed items, success states. Paired with light/dark variants.
- **Alert Red** (`#AE4331`): Errors, warnings, destructive actions, urgent timer states.
- **Clarify Purple** (`#565C86`): Informational cues, help, secondary metadata.

### Named Rules

**The Pine Accent Rule.** The green accent covers ≤15% of any given screen. Its rarity is the point — when green appears, the user knows something is actionable.

**The Warm Surface Rule.** Every surface carries a trace of warmth toward the deck hue. The warmth is not decorative — it creates the physical sensation of paper and wood, reducing eye strain in brightly-lit exam environments.

## 3. Typography

**Display Font:** Plus Jakarta Sans, system-ui, sans-serif (700 weight)
**Body Font:** Inter, system-ui, sans-serif (400/500/600 weights)
**Mono Font:** JetBrains Mono, Fira Code, monospace (all weights)

**Character:** A restrained technical pairing. Plus Jakarta Sans at 700 carries authority — panel headers, modal titles, the timer display. Inter at 0.875rem base is dense but legible for data-dense screens. JetBrains Mono brings precision to scores, timers, and code output.

### Hierarchy
- **Display** (700, `clamp(1.25rem, 2.5vw, 2rem)`, 1.2): Page titles, empty-state headings, modal titles. `text-wrap: balance`.
- **Headline** (600, `1.25rem`, 1.4): Section headers, panel titles. `text-wrap: balance`.
- **Title** (600, `1rem`, 1.5): Card headers, sub-section labels.
- **Body** (400, `0.875rem`, 1.375): The default reading size. Max line length 70ch.
- **Label** (500, `0.75rem`): Input labels, table headers, metadata. Never uppercase.
- **Caption** (400, `0.6875rem`): Tiny print, timestamps, secondary metadata.
- **2xs** (400, `0.625rem`, 1.4): The smallest legible size — timestamps on badges, supplementary data.
- **Mono Digit** (600, `tabular-nums`): Scores, timer values, rank numbers. Always `tabular-nums` for zero-width stability.

### Named Rules

**The No-Eyebrow Rule.** Section kickers in tiny uppercase tracked text ("OVERVIEW", "FEATURES", "PRICING") are forbidden.

**The Lab Notebook Rule.** All numerical data uses monospace tabular-nums. Digits must not shift the layout when values change.

## 4. Elevation

Bone & Ink uses warm, soft shadows with a parchment cast to create subtle depth — like paper cards resting on a desk.

### Shadow Vocabulary
- **Surface** (`0 1px 3px rgba(42,36,25,0.08)`): Cards and panels at rest. A hairline lift.
- **Raised** (`0 4px 12px rgba(42,36,25,0.08)`): Hovered cards, dropdown menus, popovers.
- **Modal** (`0 8px 30px rgba(42,36,25,0.16)`): Modal dialogs, slide-out panels.
- **Tooltip** (`0 12px 36px rgba(42,36,25,0.22)`): The highest layer — tooltips, toasts.

### Named Rules

**The Warm Shadow Rule.** Shadows use the ink color at low opacity (never pure black, never blue-tinted). They fall softly, as if from warm overhead lighting in a quiet hall.

**The Flat-At-Rest Rule.** Panels and cards have no shadow at idle unless they are interactive containers. The paper desk is flat until you touch it. Only modals, dropdowns, hovered items, and toasts cast shadows.

## 5. Components

### Buttons
- **Shape:** Gently rounded corners (0.75rem / 12px). Generous padding.
- **Primary (green fill):** Background `--accent` (`#2F5D56`), text `--panel`. The most important action on screen. Hover darkens (`--accent-dark`).
- **Ghost:** Transparent, `--annotation` text, `--rim` border at rest. Hover gains `--panel` background and `--ink` text.
- **Success (green fill):** Background `--verify`, text `--panel`.
- **Danger (red fill):** Background `--alert`, text `--panel`.
- **Clarify (purple fill):** Background `--clarify`, text `--panel`.
- **Sizes:** sm (0.25/0.5rem padding), md (0.5/1rem padding), lg (1/1.5rem padding).

### Inputs & Fields
- **Style:** `--panel` background, `--rim` border, `--ink` text. Soft warm aesthetic.
- **Focus:** Green border (`--accent`) with subtle green glow ring.
- **Error:** Red border (`--alert`) with red ring.
- **Placeholder:** `--annotation` at full opacity (not muted — 4.5:1 contrast against field bg).
- **Textarea:** Same styling, `resize: vertical`.

### Cards / Panels
- **Corner Style:** 1rem (16px) for container panels, 0.75rem (12px) for nested elements.
- **Background:** `--panel` for container, `--sunken` (5% ink) for muted variants.
- **Border:** Subtle 1px `--rim` border at rest. No shadow at idle.
- **Padding:** 1rem standard.

### Tables
- **Style:** Contained within a `.table-wrap` panel. Full-width with bordered header and row dividers.
- **Header:** Monospace uppercase tracking (0.625rem), `--annotation` color.
- **Rows:** Hover gains `--panel` background highlight.
- **Empty state:** Icon + message within the table panel.

### Modal
- **Overlay:** `rgba(42, 36, 25, 0.45)` with `backdrop-filter: blur(4px)`.
- **Content:** `--panel` background, `--rim` border, 1rem radius. Modal shadow.
- **Padding:** 1rem horizontal/vertical header, 1.5rem padding body, standard footer.

### Badges
- **Style:** Small rounded (0.5rem), all-caps monospace tracking, 0.625rem font.
- **Colors:** Verify green, Alert red, Accent green, Annotation gray, Clarify purple.

### Timer
- **Signature component.** Three states: Calm (default ink on sunken), Warning (green tint, 1–5 min), Urgent (red tint, <1 min, pulsing rail).
- **Rail:** A thin bar under the timer fills from right to left.
- **Always monospace tabular-nums** for zero-width drift.

### Navigation (Admin Sidebar)
- **Style:** Fixed left panel, full-height, `--panel` background.
- **Items:** Icon + label, rounded highlight on active (`--accent/10` background, `--accent` text).
- **User footer:** Bottom-anchored with avatar initial, name, email, sign-out.

### Question Palette (Student Exam)
- **Grid:** 8×N buttons. Each button 2rem (32px) square on desktop, 44px on mobile.
- **States:** Default (sunken), Answered (verify tint), Flagged (accent tint), Current (accent fill).

### Tabs
- **Style:** Contained within a sunken bar. Individual tab buttons with pill-style active state.
- **Active:** Cream panel background with surface shadow — the tab feels "lifted."
- **Inactive:** Transparent, annotation text, hover reveals ink color.

## 6. Do's and Don'ts

### Do:
- **Do** use the pine green accent sparingly — ≤15% of any screen.
- **Do** use warm bone/cream surfaces for all backgrounds. Never white, never dark.
- **Do** use warm-tinted shadows (ink at low opacity). Never pure black or blue shadows.
- **Do** use monospace tabular-nums for all scores, timer values, and numerical data.
- **Do** keep panels flat at rest — shadow only when interactive or modal.
- **Do** use `text-wrap: balance` on headings for even line lengths.
- **Do** provide a `prefers-reduced-motion` fallback for every animation.
- **Do** use `transform` and `opacity` for animations, never layout properties.
- **Do** use `::selection` styling with accent-tinted highlight.

### Don't:
- **Don't** use gradient text — ever.
- **Don't** use glassmorphism as a default pattern.
- **Don't** put tiny uppercase tracked eyebrows above sections.
- **Don't** use numbered section markers (01 / 02 / 03).
- **Don't** use side-stripe borders on cards or list items.
- **Don't** build identical card grids repeated endlessly.
- **Don't** use the hero-metric template.
- **Don't** use hand-drawn or sketchy SVG illustrations.
- **Don't** use box-shadow AND border together on the same element as decoration — pick one.
- **Don't** use border-radius above 1rem (16px) for containers — full-pill is for tags only.
- **Don't** animate layout properties.
- **Don't** nest cards inside cards — use tonal surfaces instead.
- **Don't** use muted placeholder text that fails 4.5:1 contrast.
- **Don't** clip dropdowns inside overflow:hidden containers.
- **Don't** default to dark mode — exam halls are brightly lit environments.
