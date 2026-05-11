import { browser } from '$app/environment'

class UIState {
  sidebarCollapsed = $state(false)
  theme = $state<'light' | 'dark' | 'system'>('system')
  #initialized = false

  constructor() {
    if (browser) {
      const saved = localStorage.getItem('ui-state')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          this.sidebarCollapsed = parsed.sidebarCollapsed ?? false
          this.theme = parsed.theme ?? 'system'
        } catch {
          // ignore corrupt state
        }
      } else {
        // No localStorage yet — seed theme from cookie so first JS paint matches SSR
        const match = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/)
        if (match) {
          this.theme = (match[1] as 'light' | 'dark' | 'system') ?? 'system'
        }
      }
    }
  }

  /** Call from root layout $effect to register localStorage + cookie + DOM sync */
  initEffects() {
    if (this.#initialized) return
    this.#initialized = true

    $effect(() => {
      if (browser) {
        localStorage.setItem(
          'ui-state',
          JSON.stringify({
            sidebarCollapsed: this.sidebarCollapsed,
            theme: this.theme,
          }),
        )
        // Keep cookie in sync with localStorage so SSR always has current value
        document.cookie = `theme=${this.theme}; Path=/; Max-Age=31536000; SameSite=Lax`
        this.applyDomClass()
      }
    })
  }

  setTheme(next: 'light' | 'dark' | 'system') {
    this.theme = next
    if (typeof document !== 'undefined') {
      document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
    this.applyDomClass()
  }

  applyDomClass() {
    if (typeof document === 'undefined') return
    const resolved =
      this.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : this.theme
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed
  }

  setSidebarCollapsed(value: boolean) {
    this.sidebarCollapsed = value
  }
}

export const uiState = new UIState()
