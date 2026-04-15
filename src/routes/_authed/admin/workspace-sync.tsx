import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/workspace-sync')({
  beforeLoad: ({ context }) => {
    if (context.user.portalRole !== 'super_admin') throw redirect({ to: '/' })
  },
  component: WorkspaceSyncPage,
})

type SyncStatus = 'running' | 'completed' | 'failed'

interface SyncError {
  email: string
  message: string
}

interface SyncRecord {
  id: string
  status: SyncStatus
  triggeredBy: string
  startedAt: string | Date
  completedAt: string | Date | null
  totalWorkspaceUsers: number | null
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: SyncError[] | null
}

interface SyncHistoryResponse {
  data: SyncRecord[]
  total: number
  page: number
  limit: number
}

const STATUS_STYLES: Record<SyncStatus, string> = {
  running: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

function StatusBadge({ status }: { status: SyncStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

function StatCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-neutral-200">{value ?? '—'}</span>
    </div>
  )
}

function ErrorList({ errors }: { errors: SyncError[] }) {
  const [open, setOpen] = useState(false)

  if (errors.length === 0) return <span className="text-neutral-500">—</span>

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-red-400 underline underline-offset-2 hover:text-red-300"
      >
        {errors.length} error{errors.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          {errors.map((e, i) => (
            <li key={i} className="text-xs">
              <span className="font-mono text-red-400">{e.email}</span>
              <span className="mx-2 text-neutral-600">·</span>
              <span className="text-neutral-400">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LatestStatusCard({ record }: { record: SyncRecord }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-medium text-neutral-300">Latest Sync</h2>
        <StatusBadge status={record.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Triggered by</span>
          <span className="text-sm text-neutral-200">{record.triggeredBy ?? 'system'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Started at</span>
          <span className="text-sm text-neutral-200">
            {new Date(record.startedAt).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Completed at</span>
          <span className="text-sm text-neutral-200">
            {record.completedAt ? new Date(record.completedAt).toLocaleString() : '—'}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3 sm:grid-cols-5">
        <StatCell label="Total users" value={record.totalWorkspaceUsers} />
        <StatCell label="Created" value={record.created} />
        <StatCell label="Updated" value={record.updated} />
        <StatCell label="Deactivated" value={record.deactivated} />
        <StatCell label="Skipped" value={record.skipped} />
      </div>

      {(record.errors ?? []).length > 0 && (
        <div className="mt-4">
          <ErrorList errors={record.errors ?? []} />
        </div>
      )}
    </div>
  )
}

function WorkspaceSyncPage() {
  const [latestRecord, setLatestRecord] = useState<SyncRecord | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [history, setHistory] = useState<SyncRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(true)

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const limit = 20

  const fetchStatus = () => {
    setStatusLoading(true)
    api.api.v1['workspace-sync'].status.get().then(({ data }) => {
      if (data) setLatestRecord(data as SyncRecord)
      setStatusLoading(false)
    })
  }

  const fetchHistory = (p: number) => {
    setHistoryLoading(true)
    api.api.v1['workspace-sync'].history
      .get({ query: { page: String(p), limit: String(limit) } })
      .then(({ data }) => {
        if (data) {
          const d = data as SyncHistoryResponse
          setHistory(d.data)
          setTotal(d.total)
        }
        setHistoryLoading(false)
      })
  }

  useEffect(() => {
    fetchStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchHistory(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncError(null)
    const { error } = await api.api.v1['workspace-sync'].trigger.post({})
    if (error) {
      setSyncError('Sync failed to start. Please try again.')
      setSyncing(false)
      return
    }
    fetchStatus()
    fetchHistory(page)
    setSyncing(false)
  }

  const isRunning = latestRecord?.status === 'running'

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workspace Sync</h1>
        {isRunning ? (
          <span className="text-sm text-yellow-400">Sync in progress…</span>
        ) : (
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? 'Starting…' : 'Sync Now'}
          </button>
        )}
      </div>

      {syncError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {syncError}
        </div>
      )}

      <div className="mb-8">
        {statusLoading ? (
          <div className="h-44 animate-pulse rounded-xl bg-neutral-800" />
        ) : latestRecord ? (
          <LatestStatusCard record={latestRecord} />
        ) : (
          <p className="text-sm text-neutral-500">No sync has been run yet.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Sync History</h2>

        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-800" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-neutral-500">No sync history yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-800 text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Triggered By</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Deactivated</th>
                  <th className="px-4 py-3 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-neutral-900/50">
                    <td className="px-4 py-3">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {record.triggeredBy ?? (
                        <span className="text-neutral-500">system</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-400">
                      {new Date(record.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300">
                      {record.created ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300">
                      {record.updated ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300">
                      {record.deactivated ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ErrorList errors={record.errors ?? []} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
          <span>
            {total} record{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
              className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
