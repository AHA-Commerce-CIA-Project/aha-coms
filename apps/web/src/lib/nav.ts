import { LayoutDashboard, Users, Building2, AppWindow, FileText } from 'lucide-svelte'
import type { Component } from 'svelte'

export interface NavItem {
  href: string
  label: string
  icon: Component
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
  { href: '/admin/audit', label: 'Audit Log', icon: FileText },
]
