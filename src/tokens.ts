/*
 * @coms-portal/design-tokens — typed token exports
 *
 * Source of truth: src/tokens.yaml. Do not hand-edit — `bun run build`
 * regenerates this file. Use these constants when CSS custom properties
 * are not reachable (inline styles, chart libraries, runtime theming).
 */

export const colors = {
  brand: {
  "primary-dark": "#1D388B",
  "primary-light": "#96ADF5",
  "deep-navy": "#0F0E7F",
  "gold": "#F4C144",
  "gold-light": "#FFD97D",
  "purple": "#6D50B8",
  "sky-blue": "#759EEE",
  "penalti": "#C73E3E",
  "white": "#FFFFFF",
} as const,
  status: {
  "status-approved": "#16a34a",
  "status-approved-bg": "#22C55E26",
  "status-pending": "#a07700",
  "status-pending-bg": "#F4C14426",
  "status-challenged": "#6D50B8",
  "status-challenged-bg": "#6D50B826",
  "status-rejected": "#dc2626",
  "status-rejected-bg": "#EF44441A",
} as const,
  light: {
  "primary": "#325FEC",
  "background": "#F2F3F8",
  "foreground": "#1A1B2E",
  "card": "#FFFFFF",
  "card-foreground": "#1A1B2E",
  "primary-foreground": "#FFFFFF",
  "secondary": "#EBEDF5",
  "secondary-foreground": "#2E3566",
  "muted": "#F0F1F5",
  "muted-foreground": "#6B7094",
  "accent": "#EBEDF5",
  "accent-foreground": "#2E3566",
  "destructive": "#EF4444",
  "border": "#E0E2EC",
  "input": "#E0E2EC",
  "ring": "#325FEC",
} as const,
  dark: {
  "background": "#1C1E30",
  "foreground": "#F5F5FA",
  "card": "#272A40",
  "card-foreground": "#F5F5FA",
  "primary": "#6495FF",
  "primary-foreground": "#1E2240",
  "secondary": "#2E3250",
  "secondary-foreground": "#D8DAE5",
  "muted": "#333755",
  "muted-foreground": "#8890B0",
  "accent": "#2E3250",
  "accent-foreground": "#D8DAE5",
  "border": "#3C4060",
  "input": "#3C4060",
  "ring": "#6495FF",
} as const,
} as const

export const rounded = {
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
} as const

export const spacing = {
  "xs": "4px",
  "sm": "8px",
  "md": "12px",
  "lg": "16px",
  "xl": "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "48px",
  "6xl": "64px",
  "page-padding-desktop": "24px",
  "page-padding-mobile": "16px",
  "page-bottom-desktop": "32px",
  "page-bottom-mobile": "96px",
  "grid-gap-desktop": "16px",
  "grid-gap-mobile": "12px",
  "card-padding": "16px",
  "card-padding-hero": "20px",
  "service-bar-height": "36px",
  "header-height": "56px",
  "sidebar-collapsed": "64px",
  "sidebar-expanded": "256px",
  "mobile-nav-height": "64px",
  "touch-target-min": "44px",
  "page-max-width": "1024px",
  "content-max-width": "640px",
} as const

export const typography = {
  "hero-heading": {
    "fontFamily": "Manrope",
    "fontSize": "24px",
    "fontWeight": 800,
    "letterSpacing": "-0.02em",
  },
  "page-title": {
    "fontFamily": "Manrope",
    "fontSize": "20px",
    "fontWeight": 800,
  },
  "section-label": {
    "fontFamily": "Manrope",
    "fontSize": "11px",
    "fontWeight": 700,
    "letterSpacing": "0.05em",
  },
  "card-title": {
    "fontFamily": "Manrope",
    "fontSize": "14px",
    "fontWeight": 700,
  },
  "body-md": {
    "fontFamily": "Manrope",
    "fontSize": "14px",
    "fontWeight": 500,
  },
  "body-semibold": {
    "fontFamily": "Manrope",
    "fontSize": "14px",
    "fontWeight": 600,
  },
  "caption": {
    "fontFamily": "Manrope",
    "fontSize": "12px",
    "fontWeight": 500,
  },
  "caption-sm": {
    "fontFamily": "Manrope",
    "fontSize": "11px",
    "fontWeight": 500,
  },
  "badge-text": {
    "fontFamily": "Manrope",
    "fontSize": "10px",
    "fontWeight": 700,
    "letterSpacing": "0.02em",
  },
  "nav-item": {
    "fontFamily": "Manrope",
    "fontSize": "14px",
    "fontWeight": 500,
  },
  "nav-item-active": {
    "fontFamily": "Manrope",
    "fontSize": "14px",
    "fontWeight": 700,
  },
  "service-bar-text": {
    "fontFamily": "Manrope",
    "fontSize": "11px",
    "fontWeight": 600,
    "letterSpacing": "0.02em",
  },
  "service-bar-active": {
    "fontFamily": "Manrope",
    "fontSize": "11px",
    "fontWeight": 700,
    "letterSpacing": "0.02em",
  },
  "stat-value": {
    "fontFamily": "Manrope",
    "fontSize": "24px",
    "fontWeight": 800,
    "letterSpacing": "-0.02em",
  },
} as const

export const components = {
  "service-bar": {
    "backgroundColor": "linear-gradient(90deg, #0F0E7F, #1D388B)",
    "height": "36px",
    "textColor": "{colors.primary-light}",
  },
  "service-bar-tab": {
    "backgroundColor": "transparent",
    "textColor": "rgba(150, 173, 245, 0.6)",
    "rounded": "{rounded.service-tab}",
    "padding": "0 12px",
    "height": "26px",
  },
  "service-bar-tab-active": {
    "backgroundColor": "rgba(244, 193, 68, 0.15)",
    "textColor": "{colors.gold}",
  },
  "sidebar": {
    "backgroundColor": "{colors.card}",
    "width": "{spacing.sidebar-collapsed}",
  },
  "sidebar-expanded": {
    "width": "{spacing.sidebar-expanded}",
  },
  "sidebar-nav-item": {
    "backgroundColor": "transparent",
    "textColor": "{colors.muted-foreground}",
    "rounded": "{rounded.md}",
    "padding": "10px 12px",
  },
  "sidebar-nav-item-active": {
    "backgroundColor": "linear-gradient(90deg, rgba(50,95,236,0.12), rgba(50,95,236,0.04))",
    "textColor": "{colors.primary}",
  },
  "mobile-topbar": {
    "backgroundColor": "linear-gradient(135deg, rgba(15,14,127,0.92), rgba(29,56,139,0.90))",
    "height": "{spacing.header-height}",
  },
  "mobile-bottomnav": {
    "backgroundColor": "rgba(13, 18, 41, 0.85)",
    "height": "{spacing.mobile-nav-height}",
  },
  "button-gold": {
    "backgroundColor": "linear-gradient(135deg, #F4C144, #FFD97D)",
    "textColor": "#7a5800",
    "rounded": "{rounded.button}",
    "padding": "10px 16px",
    "height": "{spacing.touch-target-min}",
  },
  "button-gold-hover": {
    "backgroundColor": "linear-gradient(135deg, #e0ae38, #F4C144)",
  },
  "button-blue": {
    "backgroundColor": "linear-gradient(135deg, #325FEC, #759EEE)",
    "textColor": "{colors.white}",
    "rounded": "{rounded.button}",
    "padding": "10px 16px",
    "height": "{spacing.touch-target-min}",
  },
  "button-blue-hover": {
    "backgroundColor": "linear-gradient(135deg, #2850d0, #6590e0)",
  },
  "button-red": {
    "backgroundColor": "linear-gradient(135deg, #C73E3E, #E06B6B)",
    "textColor": "{colors.white}",
    "rounded": "{rounded.button}",
    "padding": "10px 16px",
    "height": "{spacing.touch-target-min}",
  },
  "button-purple": {
    "backgroundColor": "linear-gradient(135deg, #6D50B8, #9B7FE8)",
    "textColor": "{colors.white}",
    "rounded": "{rounded.button}",
    "padding": "10px 16px",
    "height": "{spacing.touch-target-min}",
  },
  "summary-card-gold": {
    "backgroundColor": "linear-gradient(135deg, #F4C144, #F9D46A, #FFD97D)",
    "textColor": "#7a5800",
    "rounded": "{rounded.card}",
    "padding": "{spacing.lg}",
  },
  "summary-card-blue": {
    "backgroundColor": "linear-gradient(135deg, #325FEC, #4B77F0, #759EEE)",
    "textColor": "{colors.white}",
    "rounded": "{rounded.card}",
    "padding": "{spacing.lg}",
  },
  "summary-card-red": {
    "backgroundColor": "linear-gradient(135deg, #C73E3E, #D45555, #E06B6B)",
    "textColor": "{colors.white}",
    "rounded": "{rounded.card}",
    "padding": "{spacing.lg}",
  },
  "card": {
    "backgroundColor": "{colors.card}",
    "rounded": "{rounded.card}",
    "padding": "{spacing.lg}",
  },
  "status-badge": {
    "rounded": "{rounded.badge}",
    "padding": "2px 6px",
  },
  "avatar-sm": {
    "size": "20px",
    "rounded": "{rounded.avatar}",
    "backgroundColor": "rgba(150, 173, 245, 0.25)",
  },
  "avatar-md": {
    "size": "32px",
    "rounded": "{rounded.avatar}",
    "backgroundColor": "rgba(50, 95, 236, 0.1)",
  },
  "avatar-lg": {
    "size": "40px",
    "rounded": "{rounded.avatar}",
    "backgroundColor": "rgba(50, 95, 236, 0.1)",
  },
  "avatar-xl": {
    "size": "80px",
    "rounded": "{rounded.avatar}",
    "backgroundColor": "rgba(50, 95, 236, 0.1)",
  },
  "hero-greeting": {
    "backgroundColor": "linear-gradient(135deg, #1D388B, #2550C8, #325FEC)",
    "rounded": "{rounded.card}",
    "padding": "{spacing.card-padding-hero}",
  },
  "mobile-fab": {
    "backgroundColor": "linear-gradient(135deg, #325FEC, #759EEE)",
    "textColor": "{colors.white}",
    "size": "56px",
    "rounded": "{rounded.avatar}",
  },
  "notification-panel": {
    "backgroundColor": "{colors.card}",
    "width": "380px",
  },
} as const

export type ColorBrandKey = keyof typeof colors.brand
export type ColorStatusKey = keyof typeof colors.status
export type ColorSemanticKey = keyof typeof colors.light
