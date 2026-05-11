const _APP_LAUNCHER_DATA: Readonly<Record<string, { label: string; url: string }>> = {
  portal: {
    label: 'COMS',
    url: 'https://coms.ahacommerce.net',
  },
  heroes: {
    label: 'Heroes',
    url: 'https://heroes.ahacommerce.net',
  },
}

let _warned = false

/**
 * @deprecated Fetch /api/userinfo instead. Will be removed in v1.5.0.
 */
export const APP_LAUNCHER: Readonly<Record<string, { label: string; url: string }>> = new Proxy(
  _APP_LAUNCHER_DATA,
  {
    get(target, prop, receiver) {
      if (!_warned) {
        _warned = true
        console.warn(
          '[@coms-portal/shared] APP_LAUNCHER is deprecated — fetch /api/userinfo instead. Will be removed in v1.5.0.',
        )
      }
      return Reflect.get(target, prop, receiver)
    },
  },
)

export type AppLauncherEntry = (typeof _APP_LAUNCHER_DATA)[keyof typeof _APP_LAUNCHER_DATA]
export type AppLauncherSlug = keyof typeof _APP_LAUNCHER_DATA
