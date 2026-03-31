import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ActionIcon } from '@mantine/core'
import { IconPlus, IconBooks } from '@tabler/icons-react'
import { api } from '../api/client.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'

interface Template {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string | null
  isPublic: boolean
  creatorId: string
  creatorName: string
  createdAt: string
}

const SPORT_LABEL: Record<WatchSport, string> = {
  RUNNING: 'Біг',
  CYCLING: 'Велосипед',
  SWIMMING: 'Плавання',
}

const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Всі види' },
  { value: 'RUNNING', label: 'Біг' },
  { value: 'CYCLING', label: 'Велосипед' },
  { value: 'SWIMMING', label: 'Плавання' },
]

function estimateDurationSec(steps: WatchWorkoutStep[], sport: WatchSport): number {
  const DEFAULT: Record<WatchSport, number> = { RUNNING: 330, CYCLING: 120, SWIMMING: 600 }
  let total = 0
  const stack: { count: number; sub: number }[] = []
  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') { stack.push({ count: step.repeatCount ?? 4, sub: 0 }); continue }
    if (step.type === 'REPEAT_END') {
      const f = stack.pop()
      if (f) { const v = f.sub * f.count; if (stack.length > 0) stack[stack.length - 1].sub += v; else total += v }
      continue
    }
    let dur = 0
    if (step.durationUnit === 'TIME' && step.durationValue) dur = step.durationValue
    else if (step.durationUnit === 'DISTANCE' && step.durationValue) {
      const pace = step.targetFrom && step.targetTo ? (step.targetFrom + step.targetTo) / 2 : (step.targetFrom ?? DEFAULT[sport])
      dur = (step.durationValue / 1000) * pace
    }
    if (stack.length > 0) stack[stack.length - 1].sub += dur; else total += dur
  }
  return Math.round(total)
}

function formatDuration(sec: number): string {
  if (sec <= 0) return ''
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `~${h}г ${m > 0 ? `${m}хв` : ''}`
  return m > 0 ? `~${m} хв` : '<1 хв'
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [sport, setSport] = useState('')
  const [search, setSearch] = useState('')

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['templates', tab, sport],
    queryFn: () => {
      const params = new URLSearchParams()
      if (tab === 'mine') params.set('mine', 'true')
      if (sport) params.set('sport', sport)
      return api.get(`/templates?${params}`).then((r) => r.data)
    },
  })

  const forkMutation = useMutation({
    mutationFn: (id: string) => api.post(`/templates/${id}/fork`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/templates/${res.data.id}`)
    },
  })

  const filtered = search
    ? templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : templates

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Бібліотека тренувань</h2>
        <button className="btn-primary hide-mobile" onClick={() => navigate('/templates/new')}>
          + Створити
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
        {([['all', 'Бібліотека'], ['mine', 'Мої шаблони']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '6px 14px', fontSize: 14, cursor: 'pointer', border: 'none',
              background: 'transparent', fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--color-primary)' : 'var(--color-text)',
              borderBottom: tab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Пошук за назвою..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '2 1 160px', padding: '6px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 6 }}
        />
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          style={{ flex: '1 1 120px', padding: '6px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 6 }}
        >
          {SPORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="page-loading">Завантаження...</p>
      ) : filtered.length === 0 ? (
        <div className="page-empty">
          <IconBooks size={40} color="var(--color-text-muted)" />
          <p>{tab === 'mine' ? 'У вас ще немає шаблонів.' : 'Шаблонів не знайдено.'}</p>
          <button className="btn-primary" onClick={() => navigate('/templates/new')}>
            Створити шаблон
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((t) => (
            <div key={t.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/templates/${t.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1rem' }}>{t.name}</strong>
                    {t.isPublic && (
                      <span className="badge" style={{ background: 'var(--mantine-color-blue-1)', color: 'var(--mantine-color-blue-7)' }}>
                        Публічний
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge">{SPORT_LABEL[t.sport]}</span>
                    <span className="badge">{t.steps.length} кроків</span>
                    {(() => { const d = formatDuration(estimateDurationSec(t.steps, t.sport)); return d ? <span className="badge">{d}</span> : null })()}
                  </div>
                  {tab === 'all' && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {t.creatorName}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '3px 8px', whiteSpace: 'nowrap' }}
                    onClick={() => forkMutation.mutate(t.id)}
                    disabled={forkMutation.isPending}
                  >
                    Зберегти копію
                  </button>
                </div>
              </div>
              {t.notes && (
                <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <ActionIcon className="fab" radius="xl" size={56} onClick={() => navigate('/templates/new')} aria-label="Створити шаблон">
        <IconPlus size={24} />
      </ActionIcon>
    </div>
  )
}
