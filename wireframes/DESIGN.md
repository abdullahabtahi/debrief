---
name: Debrief Institutional
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#4c4546'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#191c1e'
  on-tertiary-container: '#818486'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  nav-primary:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  nav-secondary:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.5'
    letterSpacing: 0.01em
  card-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-main:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  metadata:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-page: 48px
  card-padding: 32px
  section-gap: 64px
---

## Brand & Style

The design system is engineered to evoke intellectual rigor and institutional authority. It targets founders and executive-level users who require a high-stakes rehearsal environment that feels like a private boardroom rather than a playground.

The aesthetic follows a **Premium Minimalist** philosophy with a specific focus on **Cinematic Layering**. By utilizing a high-key light mode, deep white spaces, and sophisticated blurred background accents, the interface achieves a sense of "expensive air"—a spatial quality that communicates clarity and analytical depth. Every interaction is intentional and restrained, avoiding the fleeting trends of typical consumer SaaS in favor of an editorial, permanent-feeling structure.

## Colors

The palette is strictly monochromatic and institutional, utilizing a foundation of high-contrast blacks and greys against expansive white surfaces.

- **Foundational Surfaces:** Pure white (#FFFFFF) for primary interactive cards and an off-white/grey-tinted background (#F8FAFC) to create subtle separation.
- **Typography & UI:** Black (#000000) is reserved for high-level headings and primary calls to action. Slate grey (#64748B) provides a sophisticated, readable mid-tone for body text and secondary metadata.
- **Atmospheric Accents:** A soft, cinematic gradient is applied only to the header area, blending cool blues and greys to add depth and visual interest without compromising the interface's professional integrity.

## Typography

This design system utilizes **Inter** exclusively to leverage its utilitarian, corporate-grade legibility. The hierarchy is strictly editorial, using scale and weight to guide the user through complex analytical data.

Primary navigation elements are oversized and bold, creating a clear architectural anchor for the platform. Secondary navigation uses a more restrained, underlined treatment for the active state, ensuring the interface remains lightweight. Line heights are generous throughout to maintain an airy, sophisticated reading experience, while negative letter spacing on larger headlines adds a premium, customized touch.

## Layout & Spacing

The layout follows a **Fixed-Grid philosophy** within a centralized container to ensure an organized, stable experience regardless of screen size. 

- **The Navigation Stack:** A dual-level horizontal header defines the top of the viewport. The top level contains the primary application pillars, while the secondary level manages contextual sub-views.
- **Information Density:** High internal padding within cards (32px) and generous gaps between sections (64px) prevent the UI from feeling cluttered.
- **Rhythm:** An 8px/4px base grid system ensures all elements, from icons to card widths, feel mathematically aligned and intentional.

## Elevation & Depth

Hierarchy is established through **Soft Cinematic Depth** rather than traditional drop shadows.

- **Base Layer:** The application background is a flat, matte off-white.
- **Surface Layer:** Floating cards utilize a very large, soft ambient shadow (blur radius > 40px, opacity < 4%) combined with a 1px subtle border (#E2E8F0) to define their edges cleanly.
- **Interactive Layer:** Elements like the floating "Add area" button occupy the highest elevation, using a solid black fill to pop against the white and grey layers beneath.
- **Glass Effects:** Subtle backdrop blurs (20px - 40px) are applied to the header area to blend the cinematic gradient into the content area, creating a seamless transition.

## Shapes

The shape language is defined by **pronounced, friendly geometric curves** that soften the clinical nature of the data. 

- **Cards:** Use a `rounded-xl` (24px) radius to emphasize the "floating container" aesthetic.
- **Buttons:** Primary action buttons are fully rounded (pill-shaped) to distinguish them from structural elements.
- **Circular Utilities:** Small utility buttons, such as the 'more' options on cards, are perfect circles, providing a distinct geometric contrast to the rectangular cards.

## Components

### Navigation
- **Primary Nav:** Plain text, no background containers. Active state is indicated by black text, inactive by light grey.
- **Secondary Nav:** Smaller text size. Active state includes a 2px black underline positioned 8px below the baseline.

### Cards
- **Floating Analytics Card:** Features high internal padding (32px). Includes a circular "more" (...) button in the top right and a circular "action" (e.g., edit) button in the bottom right. 
- **Card Content:** Titles are bold and prominent; descriptive text is kept to a 2-3 line maximum for clarity.

### Buttons
- **Pill Button (Primary):** Solid black background with white text. High-contrast and placed in the bottom right corner of the viewport as a "floating action" style element.
- **Utility Buttons:** Circular white containers with a 1px border (#E2E8F0) and centered icons.

### Inputs & Selectors
- **Context Selectors:** Found in the top right of the header, these utilize a rounded pill-shape with a subtle border and a chevron icon, signaling a dropdown for project switching.