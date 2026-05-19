/**
 * Shared mock factories for the `~/db/schema` barrel and `drizzle-orm`.
 *
 * Bun's `mock.module(...)` is process-global. When a test file mocks
 * `~/db/schema` with a partial export surface, every subsequent test file
 * that loads production code importing from the barrel sees that partial
 * mock — and a missing export becomes `SyntaxError: Export named 'X' not
 * found`. Each test file therefore must declare the FULL barrel surface
 * even if only a subset is used by its own production-under-test.
 *
 * Use these factories in every `mock.module('~/db/schema', ...)` and
 * `mock.module('drizzle-orm', ...)` call site so the surface stays
 * consistent across files. Override individual fields inline when a
 * specific test needs different sentinel values.
 *
 * `mockSpecs` is a small helper for registering the same factory under
 * multiple specifier spellings (`'../foo'`, `'../../foo'`, `'~/foo'`),
 * which is required because Bun's mock store keys by literal specifier
 * string and a route may import the same module via any of those forms.
 *
 * See `.codebase-memory/adr.md` §7 for the canonical pattern and history
 * (commits `bbfaf3c`, `e296ab5`, `6aa01b9`).
 */

import { mock } from 'bun:test'

export function mockSpecs(specs: string[], factory: () => unknown): void {
  for (const spec of specs) {
    mock.module(spec, factory)
  }
}

export function fullSchemaBarrelMock(): Record<string, Record<string, string> | readonly string[]> {
  return {
    appRegistry: {
      id: 'appRegistry.id',
      slug: 'appRegistry.slug',
      name: 'appRegistry.name',
      url: 'appRegistry.url',
      status: 'appRegistry.status',
      serviceAccountEmail: 'appRegistry.serviceAccountEmail',
    },
    identityUsers: {
      id: 'identityUsers.id',
      gipUid: 'identityUsers.gipUid',
      // email and personalEmail removed by spec-06 PR A migration 0029.
      // Display email now resolves via identityUserEmails (multi-row).
      name: 'identityUsers.name',
      portalRole: 'identityUsers.portalRole',
      status: 'identityUsers.status',
      portalSub: 'identityUsers.portalSub',
      provisioningStatus: 'identityUsers.provisioningStatus',
      provisioningError: 'identityUsers.provisioningError',
      createdAt: 'identityUsers.createdAt',
      updatedAt: 'identityUsers.updatedAt',
      // Spec 06 PR F additions
      notes: 'identityUsers.notes',
      passwordSetAt: 'identityUsers.passwordSetAt',
      passwordOnlyAuth: 'identityUsers.passwordOnlyAuth',
      passwordLockoutUntil: 'identityUsers.passwordLockoutUntil',
    },
    identityUserEmails: {
      id: 'identityUserEmails.id',
      identityUserId: 'identityUserEmails.identityUserId',
      email: 'identityUserEmails.email',
      emailNormalized: 'identityUserEmails.emailNormalized',
      kind: 'identityUserEmails.kind',
      isPrimary: 'identityUserEmails.isPrimary',
      verifiedAt: 'identityUserEmails.verifiedAt',
      addedBy: 'identityUserEmails.addedBy',
      createdAt: 'identityUserEmails.createdAt',
      updatedAt: 'identityUserEmails.updatedAt',
    },
    identityUserEmailsHistory: {
      id: 'identityUserEmailsHistory.id',
      formerIdentityUserId: 'identityUserEmailsHistory.formerIdentityUserId',
      email: 'identityUserEmailsHistory.email',
      emailNormalized: 'identityUserEmailsHistory.emailNormalized',
      kind: 'identityUserEmailsHistory.kind',
      addedBy: 'identityUserEmailsHistory.addedBy',
      addedAt: 'identityUserEmailsHistory.addedAt',
      removedAt: 'identityUserEmailsHistory.removedAt',
      removedBy: 'identityUserEmailsHistory.removedBy',
      removedReason: 'identityUserEmailsHistory.removedReason',
    },
    authSessions: {
      id: 'authSessions.id',
      identityUserId: 'authSessions.identityUserId',
      authMethod: 'authSessions.authMethod',
      emailUsed: 'authSessions.emailUsed',
      deviceLabel: 'authSessions.deviceLabel',
      ipAddress: 'authSessions.ipAddress',
      createdAt: 'authSessions.createdAt',
      expiresAt: 'authSessions.expiresAt',
      revokedAt: 'authSessions.revokedAt',
      revokedReason: 'authSessions.revokedReason',
    },
    IDENTITY_USER_EMAIL_KINDS: ['workspace', 'personal'],
    IDENTITY_USER_EMAIL_ADDED_BY: ['admin', 'self', 'csv_import', 'sheet_sync', 'backfill', 'bootstrap'],
    AUTH_METHODS: ['workspace_oidc', 'personal_otp', 'password', 'admin_bypass'],
    otpRequestLog: {
      id: 'otpRequestLog.id',
      emailNormalized: 'otpRequestLog.emailNormalized',
      requestIp: 'otpRequestLog.requestIp',
      requestedAt: 'otpRequestLog.requestedAt',
      outcome: 'otpRequestLog.outcome',
    },
    otpCodes: {
      id: 'otpCodes.id',
      emailNormalized: 'otpCodes.emailNormalized',
      codeHash: 'otpCodes.codeHash',
      attemptsRemaining: 'otpCodes.attemptsRemaining',
      expiresAt: 'otpCodes.expiresAt',
      consumedAt: 'otpCodes.consumedAt',
      invalidatedAt: 'otpCodes.invalidatedAt',
      requestIp: 'otpCodes.requestIp',
      createdAt: 'otpCodes.createdAt',
    },
    oneTimeLoginLinks: {
      id: 'oneTimeLoginLinks.id',
      identityUserId: 'oneTimeLoginLinks.identityUserId',
      tokenHash: 'oneTimeLoginLinks.tokenHash',
      issuedAt: 'oneTimeLoginLinks.issuedAt',
      expiresAt: 'oneTimeLoginLinks.expiresAt',
      consumedAt: 'oneTimeLoginLinks.consumedAt',
    },
    SESSION_REVOKED_REASONS: ['logout', 'logout_other_device', 'logout_all_other', 'admin_revoke', 'status_change', 'superseded'],
    teams: { id: 'teams.id', name: 'teams.name' },
    teamMembers: { teamId: 'teamMembers.teamId', userId: 'teamMembers.userId' },
    teamAppAccess: { teamId: 'teamAppAccess.teamId', appId: 'teamAppAccess.appId' },
    memberAppRole: {
      userId: 'memberAppRole.userId',
      appId: 'memberAppRole.appId',
      appRole: 'memberAppRole.appRole',
    },
    accessAuditLog: {
      actorId: 'accessAuditLog.actorId',
      action: 'accessAuditLog.action',
      targetId: 'accessAuditLog.targetId',
      details: 'accessAuditLog.details',
      createdAt: 'accessAuditLog.createdAt',
    },
    authHandoffs: {
      id: 'authHandoffs.id',
      codeHash: 'authHandoffs.codeHash',
      appSlug: 'authHandoffs.appSlug',
      consumedAt: 'authHandoffs.consumedAt',
      expiresAt: 'authHandoffs.expiresAt',
    },
    sessionRevocations: {
      id: 'sessionRevocations.id',
      userId: 'sessionRevocations.userId',
      notBefore: 'sessionRevocations.notBefore',
      reason: 'sessionRevocations.reason',
      createdAt: 'sessionRevocations.createdAt',
    },
    appWebhookEndpoints: {
      id: 'appWebhookEndpoints.id',
      appId: 'appWebhookEndpoints.appId',
      url: 'appWebhookEndpoints.url',
      signingKey: 'appWebhookEndpoints.signingKey',
      status: 'appWebhookEndpoints.status',
    },
    webhookDeliveryJobs: {
      id: 'webhookDeliveryJobs.id',
      endpointId: 'webhookDeliveryJobs.endpointId',
      payload: 'webhookDeliveryJobs.payload',
      status: 'webhookDeliveryJobs.status',
      createdAt: 'webhookDeliveryJobs.createdAt',
      scheduledAt: 'webhookDeliveryJobs.scheduledAt',
    },
    portalBrokerSigningKeys: {
      kid: 'portalBrokerSigningKeys.kid',
      publicJwk: 'portalBrokerSigningKeys.publicJwk',
      privateSecretName: 'portalBrokerSigningKeys.privateSecretName',
      status: 'portalBrokerSigningKeys.status',
      algorithm: 'portalBrokerSigningKeys.algorithm',
      createdAt: 'portalBrokerSigningKeys.createdAt',
      activatedAt: 'portalBrokerSigningKeys.activatedAt',
      retiredAt: 'portalBrokerSigningKeys.retiredAt',
    },
    userAliases: {
      id: 'userAliases.id',
      identityUserId: 'userAliases.identityUserId',
      alias: 'userAliases.alias',
      aliasNormalized: 'userAliases.aliasNormalized',
      isPrimary: 'userAliases.isPrimary',
      source: 'userAliases.source',
      createdAt: 'userAliases.createdAt',
      tombstoned: 'userAliases.tombstoned',
    },
    aliasCollisionQueue: {
      id: 'aliasCollisionQueue.id',
      rawName: 'aliasCollisionQueue.rawName',
      rawNameNormalized: 'aliasCollisionQueue.rawNameNormalized',
      suggestedIdentityUserId: 'aliasCollisionQueue.suggestedIdentityUserId',
      source: 'aliasCollisionQueue.source',
      context: 'aliasCollisionQueue.context',
      status: 'aliasCollisionQueue.status',
      createdAt: 'aliasCollisionQueue.createdAt',
      resolvedAt: 'aliasCollisionQueue.resolvedAt',
      resolvedBy: 'aliasCollisionQueue.resolvedBy',
      resolutionAction: 'aliasCollisionQueue.resolutionAction',
    },
    appManifests: {
      appId: 'appManifests.appId',
      displayName: 'appManifests.displayName',
      schemaVersion: 'appManifests.schemaVersion',
      configSchema: 'appManifests.configSchema',
      taxonomies: 'appManifests.taxonomies',
      registeredAt: 'appManifests.registeredAt',
      updatedAt: 'appManifests.updatedAt',
    },
    appUserConfig: {
      portalSub: 'appUserConfig.portalSub',
      appId: 'appUserConfig.appId',
      config: 'appUserConfig.config',
      schemaVersion: 'appUserConfig.schemaVersion',
      updatedAt: 'appUserConfig.updatedAt',
      updatedBy: 'appUserConfig.updatedBy',
    },
    bulkEditLocks: {
      appId: 'bulkEditLocks.appId',
      acquiredBy: 'bulkEditLocks.acquiredBy',
      acquiredAt: 'bulkEditLocks.acquiredAt',
    },
    taxonomyEditLocks: {
      taxonomyId: 'taxonomyEditLocks.taxonomyId',
      acquiredBy: 'taxonomyEditLocks.acquiredBy',
      acquiredAt: 'taxonomyEditLocks.acquiredAt',
    },
    orgTaxonomies: {
      id: 'orgTaxonomies.id',
      taxonomyId: 'orgTaxonomies.taxonomyId',
      key: 'orgTaxonomies.key',
      value: 'orgTaxonomies.value',
      metadata: 'orgTaxonomies.metadata',
      createdAt: 'orgTaxonomies.createdAt',
      updatedAt: 'orgTaxonomies.updatedAt',
      updatedBy: 'orgTaxonomies.updatedBy',
    },
    SIGNING_KEY_STATUS: {
      CREATED: 'created',
      ACTIVE: 'active',
      RETIRING: 'retiring',
      RETIRED: 'retired',
    },
  }
}

export function fullDrizzleOrmMock(): Record<string, unknown> {
  return {
    eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
    and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
    or: (...conditions: unknown[]) => ({ type: 'or', conditions }),
    not: (expr: unknown) => ({ type: 'not', expr }),
    ne: (left: unknown, right: unknown) => ({ type: 'ne', left, right }),
    asc: (col: unknown) => ({ type: 'asc', col }),
    desc: (col: unknown) => ({ type: 'desc', col }),
    ilike: (col: unknown, val: unknown) => ({ type: 'ilike', col, val }),
    inArray: (left: unknown, values: unknown) => ({ type: 'inArray', left, values }),
    gte: (left: unknown, right: unknown) => ({ type: 'gte', left, right }),
    lte: (left: unknown, right: unknown) => ({ type: 'lte', left, right }),
    gt: (left: unknown, right: unknown) => ({ type: 'gt', left, right }),
    lt: (left: unknown, right: unknown) => ({ type: 'lt', left, right }),
    isNull: (col: unknown) => ({ type: 'isNull', col }),
    isNotNull: (col: unknown) => ({ type: 'isNotNull', col }),
    count: (col?: unknown) => ({ type: 'count', col }),
    sql: new Proxy(
      (strings: TemplateStringsArray) => strings.join(''),
      { get: (_t, prop) => prop },
    ),
    relations: () => ({}),
    uniqueIndex: () => ({ on: () => ({ where: () => ({}) }) }),
    index: () => ({ on: () => ({}) }),
    unique: () => ({ on: () => ({}) }),
    pgTable: (_name: string, cols: unknown) => cols,
    uuid: () => ({ primaryKey: () => ({}), notNull: () => ({}) }),
    text: () => ({ notNull: () => ({ default: () => ({}) }) }),
    boolean: () => ({ notNull: () => ({ default: () => ({}) }) }),
    integer: () => ({ notNull: () => ({ default: () => ({}) }) }),
    jsonb: () => ({ notNull: () => ({ default: () => ({}) }) }),
    timestamp: () => ({ notNull: () => ({ defaultNow: () => ({}) }) }),
    foreignKey: () => ({ references: () => ({}) }),
    varchar: () => ({ notNull: () => ({ default: () => ({}) }) }),
    serial: () => ({ primaryKey: () => ({}) }),
    bigint: () => ({ notNull: () => ({}) }),
  }
}
