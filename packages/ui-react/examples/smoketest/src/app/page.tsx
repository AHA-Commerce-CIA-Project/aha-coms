'use client';

import * as React from 'react';
import {
  BarChart3,
  ClipboardList,
  Home,
  Inbox,
  LayoutDashboard,
  Menu,
  Settings,
  Trophy,
  Users,
} from 'lucide-react';
import {
  MobileBottomNav,
  MobileTopBar,
  ServiceBar,
  Sidebar,
  SlideOverNav,
} from '@coms-portal/ui-react/chrome';
import { AccountWidget } from '@coms-portal/account-widget-react';

const SAMPLE_USER = {
  name: 'Bethel Abraham',
  email: 'bethel@example.com',
  portalRole: 'admin',
  apps: ['portal', 'heroes', 'fast'],
};

const SAMPLE_CATALOG = [
  { slug: 'portal', label: 'COMS', url: '/' },
  { slug: 'heroes', label: 'AHA HEROES', url: '/heroes' },
  { slug: 'fast', label: 'FAST', url: '/fast' },
];

const PRIMARY_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: ClipboardList },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const ADMIN_NAV = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

const SECTIONS = [
  { items: PRIMARY_NAV },
  { label: 'Admin', items: ADMIN_NAV },
];

const BOTTOM_NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Projects', icon: ClipboardList },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const ALL_NAV = [...PRIMARY_NAV, ...ADMIN_NAV];

export default function SmoketestPage() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [slideOverOpen, setSlideOverOpen] = React.useState(false);
  const currentPath = '/projects';
  const currentApp = 'fast';

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const services = SAMPLE_CATALOG.map((entry) =>
    entry.slug === currentApp
      ? { slug: entry.slug, label: entry.label }
      : { slug: entry.slug, label: entry.label, href: entry.url },
  );

  const accountWidget = (
    <AccountWidget
      currentApp={currentApp}
      portalOrigin="https://coms.ahacommerce.net"
      user={SAMPLE_USER}
      appSwitcher={SAMPLE_CATALOG}
      postLogoutRedirectUri="/"
    />
  );

  return (
    <>
      <ServiceBar
        services={services}
        currentApp={currentApp}
        theme={theme}
        onToggleTheme={toggleTheme}
        right={accountWidget}
      />

      <Sidebar
        sections={SECTIONS}
        currentPath={currentPath}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        logo={({ collapsed }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              F
            </div>
            {!collapsed && <span className="font-semibold tracking-wide">FAST</span>}
          </div>
        )}
        footer={({ collapsed }) => (
          <div className={collapsed ? 'text-center text-xs text-muted-foreground/70' : 'text-xs text-muted-foreground/70'}>
            {collapsed ? 'v0' : 'smoketest v0'}
          </div>
        )}
      />

      <MobileTopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        leading={
          <button
            type="button"
            onClick={() => setSlideOverOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 hover:bg-white/8 hover:text-white transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        }
        brand={
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-gold" />
            <span className="text-sm font-semibold text-white">FAST</span>
          </div>
        }
        right={accountWidget}
      />

      <MobileBottomNav items={BOTTOM_NAV} currentPath={currentPath} />

      <SlideOverNav
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        items={ALL_NAV}
        currentPath={currentPath}
        brand={
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-gold" />
            <span className="font-semibold tracking-wide">FAST</span>
          </div>
        }
        footer={
          <div className="px-3 py-2 text-xs text-muted-foreground/70">
            Signed in as {SAMPLE_USER.name}
          </div>
        }
      />

      <main className="pt-9 md:pl-16 md:pr-6 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <header>
            <h1 className="text-2xl font-bold mb-2">UI React smoketest</h1>
            <p className="text-muted-foreground">
              Every chrome component mounted with sample data. Toggle theme from the
              ServiceBar or MobileTopBar; resize past the <code>md</code> breakpoint
              (768px) to flip between desktop and mobile chrome; tap the leading menu
              icon on mobile to open the SlideOverNav.
            </p>
          </header>

          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="font-semibold">Current state</h2>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>theme: {theme}</li>
              <li>sidebar collapsed: {String(sidebarCollapsed)}</li>
              <li>slide-over open: {String(slideOverOpen)}</li>
              <li>currentPath: {currentPath}</li>
              <li>currentApp: {currentApp}</li>
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold mb-2">Visible chrome surfaces</h2>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>Desktop (≥768px):</strong> ServiceBar (top), Sidebar (left).</li>
              <li><strong>Mobile (&lt;768px):</strong> MobileTopBar, MobileBottomNav, SlideOverNav (drawer).</li>
              <li><strong>Both:</strong> AccountWidget in the right slot.</li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
