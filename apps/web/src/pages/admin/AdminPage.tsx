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
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Адміністрування користувачів
      </h2>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>
                Ім'я
              </th>
              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>
                Email
              </th>
              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>
                Роль
              </th>
              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>
                Зареєстрований
              </th>
              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>
                Пароль
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem' }}>{user.name}</td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {user.email}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  <select
                    value={user.role}
                    onChange={(e) => updateRole.mutate({ id: user.id, role: e.target.value as Role })}
                    style={{ width: 'auto', fontSize: '0.875rem' }}
                  >
                    {(['ATHLETE', 'TRAINER', 'ADMIN'] as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  {new Date(user.createdAt).toLocaleDateString('uk-UA')}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  {resetingId === user.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="password"
                        placeholder="Новий пароль"
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setResetError('') }}
                        style={{ width: 160, fontSize: '0.875rem' }}
                        autoFocus
                      />
                      <button
                        className="btn-primary"
                        style={{ fontSize: '0.8125rem', padding: '0.25rem 0.75rem' }}
                        onClick={() => handleResetSubmit(user.id)}
                        disabled={resetPassword.isPending}
                      >
                        Зберегти
                      </button>
                      <button
                        style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                        onClick={() => { setResetingId(null); setNewPassword(''); setResetError('') }}
                      >
                        ✕
                      </button>
                      {resetError && <span style={{ color: 'var(--color-error)', fontSize: '0.8125rem', width: '100%' }}>{resetError}</span>}
                    </div>
                  ) : (
                    <button
                      style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-muted)' }}
                      onClick={() => { setResetingId(user.id); setNewPassword(''); setResetError('') }}
                    >
                      Скинути пароль
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
