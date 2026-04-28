/*
 * @coms-portal/design-tokens — Tailwind v3 preset (stub)
 *
 * v3 consumers only. The portal (Tailwind v4) imports `tokens.css`
 * directly via `@import "@coms-portal/design-tokens/css"` and does not
 * load this preset. Source of truth: src/tokens.yaml — do not hand-edit.
 */

export default {
  theme: {
    extend: {
      colors: {
        "primary-dark": "#1D388B",
        "primary-light": "#96ADF5",
        "deep-navy": "#0F0E7F",
        "gold": "#F4C144",
        "gold-light": "#FFD97D",
        "purple": "#6D50B8",
        "sky-blue": "#759EEE",
        "penalti": "#C73E3E",
        "white": "#FFFFFF",
        "status-approved": "#16a34a",
        "status-approved-bg": "#22C55E26",
        "status-pending": "#a07700",
        "status-pending-bg": "#F4C14426",
        "status-challenged": "#6D50B8",
        "status-challenged-bg": "#6D50B826",
        "status-rejected": "#dc2626",
        "status-rejected-bg": "#EF44441A",
      },
      borderRadius: {
        "sm": "6px",
        "md": "8px",
        "lg": "12px",
        "xl": "16px",
        "button": "12px",
        "card": "16px",
        "badge": "99px",
        "avatar": "9999px",
        "service-tab": "6px",
        "input": "12px",
      },
      spacing: {
        "xs": "0.25rem",
        "sm": "0.5rem",
        "md": "0.75rem",
        "lg": "1rem",
        "xl": "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "4xl": "2.5rem",
        "5xl": "3rem",
        "6xl": "4rem",
        "page-padding-desktop": "1.5rem",
        "page-padding-mobile": "1rem",
        "page-bottom-desktop": "2rem",
        "page-bottom-mobile": "6rem",
        "grid-gap-desktop": "1rem",
        "grid-gap-mobile": "0.75rem",
        "card-padding": "1rem",
        "card-padding-hero": "1.25rem",
        "service-bar-height": "2.25rem",
        "header-height": "3.5rem",
        "sidebar-collapsed": "4rem",
        "sidebar-expanded": "16rem",
        "mobile-nav-height": "4rem",
        "touch-target-min": "2.75rem",
        "page-max-width": "64rem",
        "content-max-width": "40rem",
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        manrope: ['Manrope', 'sans-serif'],
      },
    },
  },
}
