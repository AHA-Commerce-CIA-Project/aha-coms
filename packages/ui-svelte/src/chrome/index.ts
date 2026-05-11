// @coms-portal/ui/chrome
//
// Suite-wide chrome shells: ServiceBar (top), Sidebar (desktop side),
// MobileTopBar + MobileBottomNav (mobile). Each is host-agnostic — the
// consuming app passes data + state via props and mounts its own widgets
// (notably the account widget) into the right-slot snippets.
//
// Lifted from Heroes' canonical layout components during Phase 3 of Rev 3
// Spec 02. Source-of-truth visual reference: DESIGN.md in this repo.

export { default as ServiceBar } from './ServiceBar.svelte'
export { default as Sidebar } from './Sidebar.svelte'
export { default as MobileTopBar } from './MobileTopBar.svelte'
export { default as MobileBottomNav } from './MobileBottomNav.svelte'
