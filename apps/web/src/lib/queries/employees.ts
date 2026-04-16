import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
import { api } from '$lib/api'

export function employeesQuery(page = 1, limit = 20, search = '') {
  return createQuery({
    queryKey: ['employees', { page, limit, search }],
    queryFn: async () => {
      const { data, error } = await api.api.v1.employees.get({
        query: { page: String(page), limit: String(limit), search },
      })
      if (error) throw error
      return data
    },
  })
}

export function employeeQuery(id: string) {
  return createQuery({
    queryKey: ['employees', id],
    queryFn: async () => {
      const { data, error } = await (api.api.v1.employees as any)[id].get()
      if (error) throw error
      return data
    },
  })
}

export function createEmployeeMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: async (body: {
      email: string
      name: string
      phone?: string
      department?: string
      position?: string
      portalRole?: 'employee' | 'admin' | 'super_admin'
      hasGoogleWorkspace?: boolean
    }) => {
      const { data, error } = await api.api.v1.employees.post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function updateEmployeeMutation() {
  const queryClient = useQueryClient()
  return createMutation({
    mutationFn: async ({ id, data }: { id: string; data: { portalRole?: string } }) => {
      const { data: result, error } = await (api.api.v1.employees as any)[id].patch(data)
      if (error) throw error
      return result
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
    mutationFn: async (body: { ids: string[]; field: string; value: string }) => {
      const { data, error } = await (api.api.v1.employees as any)['batch-update'].post(body)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
