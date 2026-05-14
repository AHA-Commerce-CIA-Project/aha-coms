import type { PortalEventHandler } from '../dispatch'

/**
 * `employment.updated` — HR-shape changes (branch, team, department,
 * position, phone, employmentStatus). Heroes denormalises these onto
 * `heroes_profiles.{branchKey,teamKey,departmentKey,...}` because
 * heroes' app shape consumes branch + team + department as
 * first-class display values; fast has no equivalent columns today
 * and adding them would be feature-not-task-driven scope.
 *
 * The handler is registered so portal's at-least-once delivery
 * lands in the dedup table and the dispatcher logs a clean
 * "no-op" rather than throwing on an unknown event. When fast
 * grows the columns (team-graph-driven assignment, branch-aware
 * notifications), update this handler to write through.
 */
export const handleEmploymentUpdated: PortalEventHandler = async () => {
  // intentional no-op until fast denormalises HR-shape fields
}
