import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { adminApi } from '$lib/admin-api'
import type { PortalRole } from '@coms-portal/shared'

export function employeesQuery(page = 1, limit = 20, search = '') {
  return createQuery({
    queryKey: ['employees', { page, limit, search }],
    queryFn: () => adminApi.getEmployees({ page, limit, search }),
  })
}

export function employeeQuery(id: string) {
  return createQuery({
    queryKey: ['employees', id],
    queryFn: () => adminApi.getEmployee(id),
  })
}

export function createEmployeeMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: {
      email: string
      personalEmail?: string
      name: string
      phone?: string
      department?: string
      position?: string
      branch?: 'indonesia' | 'thailand'
      portalRole?: PortalRole
      teamId?: string
      mobilePhone?: string
      birthDate?: string
      leaderName?: string
    }) => adminApi.createEmployee(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function updateEmployeeMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: async ({ id, data }: {
      id: string
      data: {
        portalRole?: string
        email?: string
        hasGoogleWorkspace?: boolean
        phone?: string
        mobilePhone?: string
        birthDate?: string
        leaderName?: string
        position?: string
        personalEmail?: string
        teamId?: string
        branch?: 'indonesia' | 'thailand'
      }
    }) => {
      return adminApi.updateEmployee(id, data)
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['employees', id] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function batchUpdateEmployeesMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: { ids: string[]; field: string; value: string }) => adminApi.batchUpdateEmployees(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function importEmployeesCsvMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: (body: { csv: string; preview?: boolean }) => adminApi.importEmployeesCsv(body),
    onSuccess: (result) => {
      if (result.mode === 'commit') {
        queryClient.invalidateQueries({ queryKey: ['employees'] })
      }
    },
  })
}
