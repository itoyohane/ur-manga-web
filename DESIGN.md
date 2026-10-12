---
version: alpha
name: Mobbin Minimal
description: A stark, editorial design system with bold typography, monochrome contrast, and spacious white-space-led composition.
colors:
  primary: "#000000"
  secondary: "#717171"
  tertiary: "#141414"
  neutral: "#ffffff"
  surface: "#ffffff"
  on-surface: "#000000"
  border: "#e5e7eb"
  muted-surface: "#f3f4f6"
  overlay: "#41414129"
  error: "#d92d20"
typography:
  headline-display:
    fontFamily: "M Saans 652"
    fontSize: "80px"
    fontWeight: 652
    lineHeight: "80px"
    letterSpacing: "-0.6px"
  headline-lg:
    fontFamily: "M Saans 652"
    fontSize: "57px"
    fontWeight: 652
    lineHeight: "68px"
    letterSpacing: "0px"
  headline-md:
    fontFamily: "M Saans 600"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: "48px"
    letterSpacing: "0px"
  headline-sm:
    fontFamily: "sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "0px"
  body-lg:
    fontFamily: "M Saans Variable Light"
    fontSize: "20px"
    fontWeight: 300
    lineHeight: "30px"
    letterSpacing: "0px"
  body-md:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0px"
  body-sm:
    fontFamily: "sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0px"
  label-lg:
    fontFamily: "M Saans 600"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "0px"
  label-md:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 456
    lineHeight: "24px"
    letterSpacing: "0px"
  label-sm:
    fontFamily: "sans-serif"
    fontSize: "12px"
    fontWeight: 456
    lineHeight: "16px"
    letterSpacing: "0px"
  caption:
    fontFamily: "sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "16px"
  md: "24px"
  lg: "80px"
  xl: "180px"
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    padding: "11px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    padding: "11px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.muted-surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.full}"
    padding: "11px 16px"
    height: "44px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "0px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "16px"
  input:
    backgroundColor: "{colors.muted-surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "11px 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  navbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    height: "64px"
  footer-cta:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

## Overview

Mobbin Minimal feels crisp, premium, and highly editorial. The interface relies on extreme white space, oversized type, and a restrained monochrome palette to communicate confidence and clarity. It is optimized for a design-savvy audience that values speed, visual order, and a curated sense of taste more than decorative UI.

## Colors

- **Primary (#000000):** The dominant ink tone used for headlines, core navigation, icons, and high-contrast emphasis. It gives the system its sharp, modern, almost print-like presence.
- **Secondary (#717171):** A soft gray for supporting text, subtle links, and low-priority UI. It keeps secondary content legible without competing with the main message.
- **Tertiary (#141414):** A near-black used for filled CTA buttons and dense control surfaces. It reads as slightly warmer and softer than pure black while preserving strong contrast.
- **Neutral (#ffffff):** The base canvas color for the page and most surfaces. White space is not empty here; it is a primary design material.
- **Surface (#ffffff):** Card and panel backgrounds stay aligned with the neutral base, reinforcing the flat, uninterrupted visual language.
- **On-surface (#000000):** The standard text and icon color for surfaces. It ensures crisp readability and keeps content visually grounded.
- **Border (#e5e7eb):** A very light structural border used sparingly to define cards and input edges without creating visual heaviness.
- **Muted-surface (#f3f4f6):** A soft gray fill for inputs and secondary controls. It creates a gentle contrast against white without feeling boxed in.
- **Overlay (#41414129):** A translucent neutral used for faint separators, control outlines, or subtle layered effects. It supports the understated depth model.
- **Error (#d92d20):** Reserved for validation and destructive states. It should be used minimally so it remains noticeable when needed.

## Typography

The type system is anchored by the custom M Saans family, with heavier 652-weight cuts for hero-scale headings and lighter variable weight for supportive copy. Headings are large, tight, and geometric, giving the layout a strong editorial voice; body text is calmer and more open, especially in the 20px light style used for explanatory copy. Labels and navigation use 600-weight or regular sans-serif treatments to stay sharp and unobtrusive.

Use `headline-display` for the main hero message, `headline-lg` and `headline-md` for major section titles, and `headline-sm` for smaller but still prominent headings. `body-lg` is ideal for the lead paragraph under a hero; `body-md` and `body-sm` support UI and longer-form content. `label-lg`, `label-md`, and `label-sm` are intended for buttons, navigation, chips, and compact metadata. Uppercase styling is not a dominant pattern here; instead, clarity comes from scale, weight, and spacing rather than all-caps labeling.

## Layout

The layout is fluid and centered, with a strong fixed-max-width feel for the hero content and generous margins on all sides. Vertical rhythm is intentionally expansive, using large section gaps to create a calm, almost poster-like composition. The spacing scale is sparse and deliberate: `xs` handles micro gaps, `sm` and `md` support standard UI breathing room, while `lg` and `xl` define major page separation and large section transitions.

Cards and embedded panels use modest internal padding rather than dense compartmentalization, preserving the airy aesthetic. Content clusters are aligned centrally or in clean horizontal rows, with visual hierarchy driven more by spacing and type size than by complex grid ornamentation.

## Elevation & Depth

The system is intentionally flat. Depth is created primarily through contrast, whitespace, and occasional soft borders rather than shadows. Cards and inputs use subtle outlines and muted fills to separate layers, but there is no heavy elevation stack or dramatic floating treatment.

When depth is needed, prefer tonal separation: white on white, light gray fills, and thin borders. This keeps the interface feeling fast, modern, and editorial instead of skeuomorphic or material-heavy.

## Shapes

The shape language is soft but disciplined. Interactive controls lean heavily on `rounded.full` for pill buttons and search fields, which gives the interface a friendly, polished feel. Structural containers use small to medium radii such as `rounded.sm` and `rounded.xl`, keeping surfaces distinct without becoming playful.

Overall, the system feels rounded at the edges but otherwise architectural and restrained.

## Components

Buttons are a core visual signature. Use `button-primary` for the main action: dark filled background, white text, `rounded.full`, 44px height, and compact horizontal padding. `button-secondary` should feel lighter and quieter, typically using a muted surface fill with dark text, while `button-link` is for low-emphasis navigation or utility actions and should remain text-only with no container. Hover states should preserve the same geometry and simply reinforce contrast, as in `button-primary-hover`.

Cards should use `card`: white background, 1px border, `rounded.sm`, and 16px padding. They should feel like simple framed content blocks rather than elevated surfaces. Inputs should follow the same visual family as pill buttons: soft muted fill, `rounded.full`, 44px height, and comfortable horizontal padding. Their purpose is to disappear into the page while still being obviously interactive.

Navigation items are minimal text links with strong spacing between them. The top bar should remain sparse and functional, with logos and icons rendered in black and muted labels for secondary actions. Chips and compact filters should use pill geometry and low-contrast fills, matching the search/filter patterns implied by the interface. Footer or large callout panels can use `footer-cta` with generous radius and padding to maintain the same calm, premium feel.

## Do's and Don'ts

- Do keep the page composition centered, airy, and dominated by whitespace.
- Do use large, bold headings with tight leading for hero messaging.
- Do favor monochrome contrast and subtle gray differentiation over colorful decoration.
- Do use pill-shaped buttons and inputs for a polished, approachable feel.
- Do keep cards and panels visually flat with light borders instead of deep shadows.
- Don't introduce saturated accent colors unless they serve a clear functional purpose.
- Don't crowd sections with dense grids or tightly stacked content.
- Don't over-round every surface; reserve the strongest radius for interactive controls and key callouts.
