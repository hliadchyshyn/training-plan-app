import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client.js'
import type { Role } from '@training-plan/shared'

interface User {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
}

const ROLE_LABELS: Record<Role, string> = {
  ATHLETE: 'Спортсмен',
  TRAINER: 'Тренер',
  ADMIN: 'Адмін',
}

export function AdminPage() {
  const qc = useQueryClient()
  const [resetingId, setResetingId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState('')

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api.put(`/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.put(`/admin/users/${id}/password`, { password }),
    onSuccess: () => {
      setResetingId(null)
      setNewPassword('')
      setResetError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setResetError(msg ?? 'Помилка')
    },
  })

  const handleResetSubmit = (id: string) => {
    if (newPassword.length < 8) {
      setResetError('Мінімум 8 символів')
      return
    }
    resetPassword.mutate({ id, password: newPassword })
  }

  return (
    <div className="page">
      <h2 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '1.25rem' }}>Користувачі</h2>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {users.map((user) => (
          <div key={user.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.625rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{user.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                  {new Date(user.createdAt).toLocaleDateString('uk-UA')}
                </div>
              </div>
              <select
                value={user.role}
                onChange={(e) => updateRole.mutate({ id: user.id, role: e.target.value as Role })}
                style={{ width: 'auto', fontSize: '0.8125rem', flexShrink: 0 }}
              >
                {(['ATHLETE', 'TRAINER', 'ADMIN'] as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>

            {resetingId === user.id ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  placeholder="Новий пароль (мін. 8)"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setResetError('') }}
                  style={{ flex: 1, minWidth: 140, fontSize: '0.875rem' }}
                  autoFocus
                />
                <button className="btn-primary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={() => handleResetSubmit(user.id)} disabled={resetPassword.isPending}>
                  Зберегти
                </button>
                <button style={{ fontSize: '0.8125rem', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0.375rem' }} onClick={() => { setResetingId(null); setNewPassword(''); setResetError('') }}>
                  ✕
                </button>
                {resetError && <span style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', width: '100%' }}>{resetError}</span>}
              </div>
            ) : (
              <button
                style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-muted)' }}
                onClick={() => { setResetingId(user.id); setNewPassword(''); setResetError('') }}
              >
                Скинути пароль
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
