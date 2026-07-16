---
name: CampusTrack
description: Placement assessment platform — galactic dark, cool-space, precision-instrument
colors:
  deck: "#0A0A0F"
  panel: "#14141E"
  rim: "#2A2A3E"
  ink: "#E8E0D8"
  annotation: "#7A7A8A"
  accent: "#4A9EFF"
  accent-light: "#7CB8FF"
  accent-dark: "#2D7DE0"
  verify: "#2DDE78"
  verify-light: "#5EED99"
  verify-dark: "#1CB85E"
  alert: "#FF3040"
  alert-light: "#FF6B77"
  alert-dark: "#D91A2A"
  clarify: "#B37DFF"
  clarify-light: "#CCA3FF"
  clarify-dark: "#8F4FEB"
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
  glow: "1px"
  toast: "10px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.deck}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.deck}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.annotation}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  input-default:
    backgroundColor: "{colors.deck}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.625rem 0.875rem"
  panel-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem"
---

# Design System: CampusTrack — Galactic Command

## 1. Overview

**Creative North Star: "The Lab Bench"**

A well-lit laboratory work surface at dusk. The room is dim, but the task lamp casts focused warm light across a brushed-steel bench. Every instrument is deliberate — calibrated, clean, ready for precision work.

The palette has been adapted to a **cool deep-space theme** — deep navy-black surfaces (`#0A0A0F`), nebula-blue panels (`#14141E`), and a Jedi blue accent (`#4A9EFF`) that replaces the original warm amber. This is not a dark-void consumer theme; it is an instrument panel at night — precise, authoritative, the glow of screens in a quiet spacecraft.

**Key Characteristics:**
- Cool deep-space surfaces (navy-black, not near-black or warm charcoal)
- Jedi blue accent used ≤10% of any screen — the active instrument, not decoration
- Animated CSS starfield background (three-layer box-shadow technique) with shooting stars
- Custom lightsaber cursor as a thematic signature (toggleable)
- Flat panels with directional blue-tinged shadows
- Technical typography — clean, precise, never decorative

**Explicit Rejections (from PRODUCT.md anti-references):**
- Gradient text, glassmorphism, decorative blurs
- Tiny uppercase tracked eyebrows above every section ("OVERVIEW", "FEATURES", "PRICING")
- Numbered section markers (01 / 02 / 03) as default scaffolding
- Side-stripe borders on cards
- Identical card grids
- The hero-metric template (big number + small label + gradient accent)
- Hand-drawn / sketchy SVG illustrations
- Any pattern that reads as AI-generated rather than designed

## 2. Colors: The Galactic Console Palette

The palette takes its character from a spacecraft instrument panel at night: deep cool blacks, faint nebula blues, and a single bright blue accent that reads as an active sensor reading.

### Primary
- **Jedi Blue** (`#4A9EFF` / `oklch(0.65 0.18 250)`): The single saturated accent. Used only for interactive elements — primary buttons, active states, focus rings, timer warnings. The active instrument on the panel.

### Neutral
- **Deep Space** (`#0A0A0F` / `oklch(0.05 0.005 260)`): The foundational background — the dark of space. Used for body background, input fields, and the outermost canvas.
- **Nebula Panel** (`#14141E` / `oklch(0.10 0.008 265)`): Slightly lifted cool dark. Used for cards, panels, sidebars, and surfaced containers — the instrument bezel.
- **Star Glow Rim** (`#2A2A3E` / `oklch(0.18 0.01 270)`): Subtle cool gray for borders, dividers, and separators. Precise 1px. Never glowing.
- **Warm Parchment Ink** (`#E8E0D8` / `oklch(0.90 0.01 75)`): Warm off-white with a trace of warmth to make it readable against cold backgrounds. Primary body text.
- **Stardust Gray** (`#7A7A8A` / `oklch(0.50 0.015 280)`): Cool medium gray. Secondary text, placeholders, disabled states. Reads at ≥4.5:1 against Deep Space.

### Semantic
- **Yoda Green** (`#2DDE78`): Correct answers, completed items, success states. Paired with its light/dark variants for badges and fills.
- **Sith Red** (`#FF3040`): Errors, warnings, urgent timer states, destructive actions.
- **Mace Purple** (`#B37DFF`): Informational cues, links, help text.

### Named Rules

**The Instrument Light Rule.** The blue accent covers ≤10% of any given screen. Its rarity is the point — when blue appears, the user knows something demands attention or action. Overuse turns the console into a Christmas tree.

**The Cold Surface Rule.** Every surface carries a cool trace toward blue. The coolness is not decorative — it creates the physical sensation of a dark instrument panel.

## 3. Typography

**Display Font:** Plus Jakarta Sans, system-ui, sans-serif (700 weight, tight tracking)
**Body Font:** Inter, system-ui, sans-serif (400/500/600 weights)
**Mono Font:** JetBrains Mono, Fira Code, monospace (all weights)

**Character:** A technical sans pairing with a confident display face. Plus Jakarta Sans at 700 weight carries authority — it is the instrument label, the panel header. Inter at 0.875rem base is dense but legible, designed for data-dense screens where every row counts. JetBrains Mono brings precision to scores, timers, and code. Together they read as an engineer's notebook, not a marketing site.

### Hierarchy
- **Display** (700, `clamp(1.25rem, 2.5vw, 2rem)`, 1.2): Page titles, empty-state headings, modal titles. `text-wrap: balance`.
- **Headline** (600, `1.25rem`, 1.4): Section headers, panel titles. `text-wrap: balance`.
- **Title** (600, `1rem`, 1.5): Card headers, sub-section labels.
- **Body** (400, `0.875rem`, 1.375): The default reading size. Max line length 70ch in prose contexts.
- **Label** (500, `0.75rem`): Input labels, table headers, metadata. Never uppercase.
- **Caption** (400, `0.6875rem`): Tiny print, timestamps, secondary metadata.
- **Mono Digit** (600, `tabular-nums`): Scores, timer values, rank numbers. Always `tabular-nums` for zero-width stability.

### Named Rules

**The No-Eyebrow Rule.** Section kickers in tiny uppercase tracked text ("OVERVIEW", "FEATURES", "PRICING") are forbidden. If a section needs a label, use the natural heading hierarchy.

**The Lab Notebook Rule.** All numerical data (scores, percentages, timer values, ranks) uses monospace tabular-nums. The digits must not shift the layout when values change — this is a precision instrument, not a dashboard.

## 4. Elevation

The Galactic Console uses tight, directional shadows with a blue cast to create depth — the way cockpit instrument bezels cast shadows from overhead panel lighting.

### Shadow Vocabulary
- **Surface** (`0 1px 3px rgba(0,0,0,0.6)`): Cards and panels at rest. A hairline lift that separates content from the deep-space background.
- **Raised** (`0 4px 12px rgba(74,158,255,0.15)`): Hovered cards, dropdown menus, popovers. A blue-tinged step up.
- **Modal** (`0 8px 24px rgba(74,158,255,0.2)`): Modal dialogs, slide-out panels. Blue glow suggests a floating instrument panel.
- **Tooltip** (`0 12px 36px rgba(0,0,0,0.7)`): The highest layer — tooltips, toasts, notifications.

### Named Rules

**The Cast Shadow Rule.** Shadows fall directionally from an implied top-left light source. They carry a subtle blue tone from the accent. The asymmetry creates a physical reading of depth.

**The Flat-At-Rest Rule.** Panels and cards have no shadow at idle unless they are interactive containers. The instrument panel is flat until you touch it. Only modals, dropdowns, hovered items, and toasts cast shadows.

## 5. Components

### Buttons
- **Shape:** Gently rounded corners (0.75rem / 12px). Generous internal padding.
- **Primary (blue fill):** Background `--accent` (`#4A9EFF`), text `--deck`. Jedi blue: the most important action on screen. Hover darkens (`--accent-dark`), press scales slightly (transform: scale(0.98)). Blue glow shadow on primary.
- **Ghost:** Transparent background, `--annotation` text, border `--rim` at rest. Hover gains `--panel` background and `--ink` text.
- **Lightsaber effect:** On hover, a thin glowing line extends from the center bottom of the button outward — a subtle saber ignition. Uses `transform: scaleX` for performant animation.
- **Semantic variants:** Verify (green fill), Alert (red fill), Clarify (purple fill) for their respective contexts.

### Inputs & Fields
- **Style:** Inset field with `--deck` background, `--rim` border, and `--ink` text.
- **Focus:** Blue border (`--accent`) with subtle blue glow ring (`ring-1 ring-accent/20`).
- **Error:** Red border (`--alert`) with red ring.

### Cards / Panels
- **Corner Style:** 1rem (16px) radius for container panels, 0.75rem (12px) for nested cards.
- **Background:** `--panel` for container panels, `--deck` for muted variants.
- **Border:** Subtle 1px `--rim` border at rest. No shadow at idle (Flat-At-Rest Rule).
- **Internal Padding:** 1rem standard.

### Tables
- **Style:** Contained within a panel. Full-width with bordered header and row dividers.
- **Header:** `--annotation` label text, `--rim` bottom border.
- **Rows:** Hover gains a subtle blue tint (`bg-accent/5`).

### Modal
- **Overlay:** Deep Space (`--deck`) at 80% with subtle blur.
- **Content:** `--panel` background, `--rim` border, 1.5rem radius. Modal shadow with blue cast.

### Badges
- **Style:** Small rounded (0.375rem / 6px), all-caps monospace tracking.
- **Colors mirror semantics:** Verify green (completed), Alert red (failed), Accent blue (warning/in-progress), Annotation gray (neutral), Clarify purple (info).

### Timer
- **The signature component of CampusTrack.** Three states: Calm (default), Warning (1-5 min, blue), Urgent (<1 min, red pulsing).
- **Progress rail:** A thin colored bar under the timer fills from right to left.
- **Always monospace tabular-nums** for zero-width drift.

### Navigation (Admin Sidebar)
- **Style:** Fixed-width (13rem / 208px) panel on the left. Full-height.
- **Items:** Icon + label, rounded highlight on active (`--accent/10` background, `--accent` text).
- **User footer:** Bottom-anchored with avatar initial, name, email, and sign-out.

### Question Palette (Student Exam)
- **Grid:** 8×N buttons. Each button is 2rem (32px) square on desktop, 44px on mobile.
- **States:** Default (dark), Answered (green tint), Flagged (blue tint), Current (blue fill).

### Lightsaber Cursor (Thematic Signature)
- **Implementation:** Custom SVG cursor (32×48px) with hotspot at blade tip (16, 4).
- **Scope:** Applied globally via `html { cursor: url(...) }`.
- **Accessibility:** Respects `prefers-reduced-motion`; can be toggled off via user preference. Consider restricting to brand surfaces only for exam pages (small 32px targets need precise default cursor).

## 6. Do's and Don'ts

### Do:
- **Do** use the blue accent sparingly — ≤10% of any screen.
- **Do** use cool deep-space surfaces for all backgrounds and panels. Never pure black or warm charcoal.
- **Do** use directional shadows with a blue cast (top-left light source).
- **Do** use monospace tabular-nums for all scores, timer values, and numerical data.
- **Do** keep panels flat at rest — shadow only when interactive or modal.
- **Do** use `text-wrap: balance` on headings for even line lengths.
- **Do** provide a `prefers-reduced-motion` fallback for every animation.
- **Do** use `transform` and `opacity` for animations, never layout properties like `width` or `height`.

### Don't:
- **Don't** use gradient text (`background-clip: text` + gradient background) — ever.
- **Don't** use glassmorphism (frosted glass, backdrop-blur on cards) as a default pattern.
- **Don't** put tiny uppercase tracked eyebrows ("OVERVIEW", "FEATURES") above sections.
- **Don't** use numbered section markers (01 / 02 / 03) as default scaffolding.
- **Don't** use side-stripe borders (border-left > 1px colored accent) on cards or list items.
- **Don't** build identical card grids with icon + heading + text repeated endlessly.
- **Don't** use the hero-metric template (big number + small label + gradient accent).
- **Don't** use hand-drawn or sketchy SVG illustrations.
- **Don't** use box-shadow AND border together on the same element as decoration — pick one.
- **Don't** use border-radius above 1rem (16px) for containers or panels — full-pill is for tags only.
- **Don't** animate layout properties (width, height, position, margin, padding).
- **Don't** nest cards inside cards — use tonal surfaces instead.
- **Don't** use placeholder text at the same color as body text.
- **Don't** clip dropdowns inside overflow:hidden containers.
- **Don't** use the lightsaber cursor on high-precision exam surfaces (question palette buttons, 32px targets) — it reduces click accuracy. Reserve for brand/landing pages or make it toggleable.