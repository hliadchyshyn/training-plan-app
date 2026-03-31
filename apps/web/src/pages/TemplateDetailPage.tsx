import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'
import UseTemplateModal from '../components/UseTemplateModal.js'

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

const STEP_LABEL: Record<WatchWorkoutStep['type'], string> = {
  WARMUP: 'Розминка',
  ACTIVE: 'Активно',
  RECOVERY: 'Відновлення',
  COOLDOWN: 'Заминка',
  REST: 'Відпочинок',
  REPEAT_BEGIN: '↩ Повтор',
  REPEAT_END: '↩ Кінець повтору',
}

const STEP_COLOR: Partial<Record<WatchWorkoutStep['type'], string>> = {
  WARMUP: '#f59e0b',
  ACTIVE: 'var(--mantine-color-blue-6)',
  RECOVERY: '#10b981',
  COOLDOWN: '#6366f1',
  REST: '#9ca3af',
}

function formatDuration(unit: WatchWorkoutStep['durationUnit'], value?: number): string {
  if (!value) return 'відкрита'
  if (unit === 'TIME') {
    const m = Math.floor(value / 60), s = value % 60
    return s > 0 ? `${m}:${String(s).padStart(2, '0')} хв` : `${m} хв`
  }
  if (unit === 'DISTANCE') return value >= 1000 ? `${(value / 1000).toFixed(1)} км` : `${value} м`
  return 'відкрита'
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60), s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [useModalOpen, setUseModalOpen] = useState(false)

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ['template', id],
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
  })

  const forkMutation = useMutation({
    mutationFn: () => api.post(`/templates/${id}/fork`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/templates/${res.data.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate('/templates')
    },
  })

  if (isLoading) return <p className="page-loading">Завантаження...</p>
  if (!template) return <p className="page-empty">Шаблон не знайдено</p>

  const isOwner = user?.id === template.creatorId
  const isAdmin = user?.role === 'ADMIN'
  let depth = 0

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/templates')}>← Бібліотека</button>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, flex: 1 }}>{template.name}</h2>
          {template.isPublic && (
            <span className="badge" style={{ background: 'var(--mantine-color-blue-1)', color: 'var(--mantine-color-blue-7)', alignSelf: 'center' }}>
              Публічний
            </span>
          )}
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Автор: {template.creatorName}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => setUseModalOpen(true)}>
            Використати
          </button>
          <button
            className="btn-secondary"
            onClick={() => forkMutation.mutate()}
            disabled={forkMutation.isPending}
          >
            {forkMutation.isPending ? '...' : 'Зберегти копію'}
          </button>
          {(isOwner || isAdmin) && (
            <button className="btn-secondary" onClick={() => navigate(`/templates/${id}/edit`)}>
              Редагувати
            </button>
          )}
          {(isOwner || isAdmin) && (
            <button
              className="btn-danger"
              onClick={() => { if (confirm('Видалити шаблон?')) deleteMutation.mutate() }}
            >
              Видалити
            </button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge">{SPORT_LABEL[template.sport]}</span>
          <span className="badge">{template.steps.filter((s) => !['REPEAT_BEGIN', 'REPEAT_END'].includes(s.type)).length} кроків</span>
          <span className="badge">{new Date(template.createdAt).toLocaleDateString('uk-UA')}</span>
        </div>
        {template.notes && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--color-text-muted)' }}>{template.notes}</p>
        )}
      </div>

      {/* Steps */}
      <h3 style={{ marginBottom: 8 }}>Структура тренування</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {template.steps.map((step, i) => {
          if (step.type === 'REPEAT_BEGIN') {
            depth++
            return (
              <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--mantine-color-gray-0)', border: '1px dashed var(--color-border)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                ↩ Повтор × {step.repeatCount ?? '?'}
              </div>
            )
          }
          if (step.type === 'REPEAT_END') {
            depth = Math.max(0, depth - 1)
            return (
              <div key={i} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--mantine-color-gray-0)', border: '1px dashed var(--color-border)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                ↩ Кінець повтору
              </div>
            )
          }

          const color = STEP_COLOR[step.type] ?? 'var(--mantine-color-gray-6)'
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 8, background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                marginLeft: depth > 0 ? 20 : 0,
              }}
            >
              <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color }}>
                  {step.name || STEP_LABEL[step.type]}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {formatDuration(step.durationUnit, step.durationValue)}
                  {step.targetUnit === 'PACE' && step.targetFrom && step.targetTo && (
                    <span style={{ marginLeft: 8 }}>
                      {formatPace(step.targetFrom)}–{formatPace(step.targetTo)}/км
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {useModalOpen && (
        <UseTemplateModal
          templateId={id!}
          templateName={template.name}
          opened={useModalOpen}
          onClose={() => setUseModalOpen(false)}
        />
      )}
    </div>
  )
}
