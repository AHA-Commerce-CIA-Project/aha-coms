import * as Sentry from '@sentry/sveltekit'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
})

export const handleError = Sentry.handleErrorWithSentry()
