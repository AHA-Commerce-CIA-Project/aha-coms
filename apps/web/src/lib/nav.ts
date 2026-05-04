import { LayoutDashboard, Users, Building2, AppWindow, FileText, GitMerge, Settings2, Tags } from 'lucide-svelte'

// lucide-svelte ships Svelte-4-flavored classes; the @coms-portal/ui consumer
// types `icon` as Svelte 5 `Component`. The two are runtime-compatible via
// Svelte 5's legacy mode but not assignable at the type level. Widen here so
// portal's NavItem assignments pass.
type IconComponent = unknown

export interface NavItem {
  href: string
  label: string
  icon: IconComponent
}

/** Always-visible items in desktop Sidebar / mobile MobileBottomNav. */
export const BASE_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
]

/** Admin-only items, shown when `hasPortalRole(user.portalRole, ['admin'])`. */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/employees', label: 'Employees', icon: Users },
  { href: '/admin/teams', label: 'Teams', icon: Building2 },
  { href: '/admin/apps', label: 'Apps', icon: AppWindow },
  { href: '/admin/aliases', label: 'Alias Queue', icon: GitMerge },
  { href: '/admin/app-config', label: 'App Config', icon: Settings2 },
  { href: '/admin/taxonomies', label: 'Taxonomies', icon: Tags },
  { href: '/admin/audit', label: 'Audit Log', icon: FileText },
]
