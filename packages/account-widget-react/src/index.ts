/*
 * @coms-portal/account-widget-react
 *
 * React variant of the shared account surface. Mounted in the chrome's right
 * slot. Presentational only — host loads `user`, widget renders avatar +
 * popover (profile, app switcher, sign-out).
 */

export {
  AccountWidget,
  type AccountWidgetProps,
  type AccountWidgetUser,
  type AppSwitcherEntry,
} from './AccountWidget';
export { signOut, type SignOutOptions } from './sign-out';
