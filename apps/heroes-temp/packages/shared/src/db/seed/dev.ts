// Spec 08 PR A1 stub.
// The pre-A1 seedDev() inserted teams + users + sample achievement rows for local dev.
// After the cutover, teams and the local users table are gone (taxonomies live on portal,
// identity is fanned out via webhooks). PR A2 will reintroduce a dev seed against
// heroes_profiles + portal-driven taxonomy_cache fixtures; for now this is a no-op so the
// schema migration can land independently.

interface BaseData {
  catBintang: { id: string }
  catPenalti: { id: string }
  catPoinAha: { id: string }
}

export async function seedDev(_base: BaseData): Promise<void> {
  console.log(
    '[spec-08-pr-a1] seedDev() is a no-op; reintroduce against heroes_profiles in PR A2.',
  )
}
