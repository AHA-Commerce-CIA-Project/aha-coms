// @coms-portal/ui-react/chrome
//
// React variant of the suite-wide chrome shells: ServiceBar (top), Sidebar
// (desktop side), MobileTopBar + MobileBottomNav (mobile), SlideOverNav
// (mobile admin drawer). Mirrors @coms-portal/ui-svelte/chrome's surface
// (see ../../docs/svelte-chrome-audit.md).

export { ServiceBar, type ServiceBarProps, type ServiceItem } from './ServiceBar';
export {
  Sidebar,
  type SidebarProps,
  type NavItem,
  type NavSection,
} from './Sidebar';
export { MobileTopBar, type MobileTopBarProps } from './MobileTopBar';
export { MobileBottomNav, type MobileBottomNavProps } from './MobileBottomNav';
export { SlideOverNav, type SlideOverNavProps } from './SlideOverNav';
export {
  deriveServiceBarServices,
  type ServiceCatalogEntry,
  type ServiceBarItem,
} from './derive-services';
export { resolveTheme, type ThemePreference, type ResolvedTheme } from './resolve-theme';
