/// <reference types="@sveltejs/kit" />

import type { AuthUser } from '~/middleware/auth'

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: AuthUser | null
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
