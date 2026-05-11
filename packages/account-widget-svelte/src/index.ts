/*
 * @coms-portal/account-widget
 *
 * Shared account surface for the COMS suite. Mounted in the chrome's right
 * slot by every COMS app. Presentational only — host loads `user`, widget
 * renders avatar + popover (profile, app switcher, sign-out).
 */

export { default as AccountWidget } from './AccountWidget.svelte'
export { signOut, type SignOutOptions } from './sign-out'
