import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, fetch }) => {
  const userinfoRes = await fetch('/api/userinfo')
  const userinfo = userinfoRes.ok ? (await userinfoRes.json() as { apps?: { slug: string; label: string; url: string }[] }) : {}
  return { user: locals.user, apps: userinfo.apps ?? [] }
}
