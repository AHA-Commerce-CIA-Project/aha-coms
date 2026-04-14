import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { clientAuth } from '~/lib/gip-client'

export const Route = createFileRoute('/_authed/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { user } = Route.useRouteContext()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    try {
      const firebaseUser = clientAuth.currentUser
      if (!firebaseUser || !firebaseUser.email) throw new Error('Not authenticated')
      const cred = EmailAuthProvider.credential(firebaseUser.email, currentPw)
      await reauthenticateWithCredential(firebaseUser, cred)
      await updatePassword(firebaseUser, newPw)
      setStatus('success')
      setMessage('Password updated successfully.')
      setCurrentPw('')
      setNewPw('')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Failed to update password')
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Profile</h1>

      <div className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="grid gap-4 text-sm">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.portalRole} />
          <Row label="Teams" value={user.teamIds.length === 0 ? 'None' : `${user.teamIds.length} team(s)`} />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 text-sm font-semibold">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">New password</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          {status !== 'idle' && (
            <p className={`text-xs ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-800 pb-3 last:border-0 last:pb-0">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
