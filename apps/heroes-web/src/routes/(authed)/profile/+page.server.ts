import type { PageServerLoad } from './$types'

// Profile data comes from userState (already hydrated from the auth layout).
export const load: PageServerLoad = async () => {
  return {}
}
