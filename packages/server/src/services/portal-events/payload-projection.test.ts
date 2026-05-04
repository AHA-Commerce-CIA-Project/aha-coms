import { describe, expect, it } from 'bun:test'
import type { WebhookUserEnvelope } from '@coms-portal/shared'
import {
  employmentUpdatedToDenormFields,
  envelopeToEmailCacheRow,
  envelopeToHeroesProfileRow,
  envelopeToUserConfigCacheRow,
} from './payload-projection'

const baseEnvelope: WebhookUserEnvelope = {
  user: {
    portalSub: '00000000-0000-0000-0000-000000000001',
    name: 'Alice Example',
    primaryAliasId: null,
  },
  contactEmail: 'alice@example.com',
  employment: {
    branch: { taxonomyId: 'branches', key: 'ID-JKT', value: 'Indonesia – Jakarta' },
    team: { taxonomyId: 'teams', key: 'team-ops', value: 'Ops Team' },
    department: { taxonomyId: 'departments', key: 'dept-eng', value: 'Engineering' },
    position: 'Senior Engineer',
    phone: '+62-812-345-678',
    employmentStatus: 'permanent',
    talentaId: 'TLT-001',
    attendanceName: 'Alice E.',
    leaderName: 'Bob Lead',
    birthDate: '1990-05-15',
  },
  appConfig: { config: { role: 'employee' }, schemaVersion: 2 },
}

describe('envelopeToHeroesProfileRow', () => {
  it('maps a complete envelope to a heroes_profiles row with denormalized taxonomy keys/values', () => {
    const row = envelopeToHeroesProfileRow(baseEnvelope)
    expect(row).toMatchObject({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Alice Example',
      branchKey: 'ID-JKT',
      branchValueSnapshot: 'Indonesia – Jakarta',
      teamKey: 'team-ops',
      teamValueSnapshot: 'Ops Team',
      departmentKey: 'dept-eng',
      departmentValueSnapshot: 'Engineering',
      position: 'Senior Engineer',
      phone: '+62-812-345-678',
      employmentStatus: 'permanent',
      talentaId: 'TLT-001',
      attendanceName: 'Alice E.',
      isActive: true,
    })
  })

  it('uses null for every denormalized field when employment is null (freshly provisioned, no HR data)', () => {
    const row = envelopeToHeroesProfileRow({ ...baseEnvelope, employment: null })
    expect(row.branchKey).toBeNull()
    expect(row.branchValueSnapshot).toBeNull()
    expect(row.teamKey).toBeNull()
    expect(row.departmentKey).toBeNull()
    expect(row.position).toBeNull()
    expect(row.phone).toBeNull()
    expect(row.employmentStatus).toBeNull()
    expect(row.attendanceName).toBeNull()
    expect(row.isActive).toBe(true)
    expect(row.id).toBe('00000000-0000-0000-0000-000000000001')
  })
})

describe('envelopeToEmailCacheRow', () => {
  it('extracts portalSub + contactEmail', () => {
    expect(envelopeToEmailCacheRow(baseEnvelope)).toEqual({
      portalSub: '00000000-0000-0000-0000-000000000001',
      contactEmail: 'alice@example.com',
    })
  })
})

describe('envelopeToUserConfigCacheRow', () => {
  it('returns null when the envelope has no appConfig', () => {
    const row = envelopeToUserConfigCacheRow({ ...baseEnvelope, appConfig: null })
    expect(row).toBeNull()
  })

  it('extracts portalSub + config + schemaVersion when appConfig is present', () => {
    expect(envelopeToUserConfigCacheRow(baseEnvelope)).toEqual({
      portalSub: '00000000-0000-0000-0000-000000000001',
      config: { role: 'employee' },
      schemaVersion: 2,
    })
  })
})

describe('employmentUpdatedToDenormFields', () => {
  it('returns only the fields explicitly present in the sparse payload (no key invented for absent fields)', () => {
    const update = employmentUpdatedToDenormFields({
      user: { portalSub: 'uid' },
      employment: { phone: '+62-999' },
      previousEmployment: { phone: '+62-000' },
    })
    expect(update).toEqual({ phone: '+62-999' })
    expect(Object.keys(update)).toEqual(['phone'])
  })

  it('expands a taxonomy ref into both _key and _valueSnapshot columns', () => {
    const update = employmentUpdatedToDenormFields({
      user: { portalSub: 'uid' },
      employment: {
        branch: { taxonomyId: 'branches', key: 'ID-BDG', value: 'Indonesia – Bandung' },
      },
      previousEmployment: {
        branch: { taxonomyId: 'branches', key: 'ID-JKT', value: 'Indonesia – Jakarta' },
      },
    })
    expect(update).toEqual({
      branchKey: 'ID-BDG',
      branchValueSnapshot: 'Indonesia – Bandung',
    })
  })

  it('persists null when a field is cleared (e.g. team unassigned)', () => {
    const update = employmentUpdatedToDenormFields({
      user: { portalSub: 'uid' },
      employment: { team: null, position: null },
      previousEmployment: {
        team: { taxonomyId: 'teams', key: 'team-ops', value: 'Ops' },
        position: 'Engineer',
      },
    })
    expect(update).toEqual({
      teamKey: null,
      teamValueSnapshot: null,
      position: null,
    })
  })
})
