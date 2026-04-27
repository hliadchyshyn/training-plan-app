import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'
import {
  WatchWorkoutStepList,
  SPORT_OPTIONS,
  STEP_TYPE_OPTIONS,
  makeStep,
  fromWatchSteps,
  toWatchSteps,
  type DraftStep,
} from '../components/WatchWorkoutForm.js'

interface TemplateLibraryItem {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string | null
  creatorName: string
}

export default function CreateTemplatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canPublish = user?.role === 'TRAINER' || user?.role === 'ADMIN'

  const [name, setName] = useState('')
  const [sport, setSport] = useState<WatchSport>('RUNNING')
  const [notes, setNotes] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [steps, setSteps] = useState<DraftStep[]>([
    makeStep('WARMUP'),
    makeStep('ACTIVE'),
    makeStep('COOLDOWN'),
  ])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [error, setError] = useState('')

  const { data: templates = [], isLoading: isTemplatesLoading } = useQuery<TemplateLibraryItem[]>({
    queryKey: ['templates', 'prefill', sport],
    queryFn: () => api.get(`/templates?sport=${sport}`).then((r) => r.data),
  })

  const filteredTemplates = useMemo(() => {
    const search = librarySearch.trim().toLowerCase()
    if (!search) return templates
    return templates.filter((template) =>
      template.name.toLowerCase().includes(search) ||
      template.creatorName.toLowerCase().includes(search),
    )
  }, [librarySearch, templates])

  const selectedTemplate = filteredTemplates.find((template) => template.id === selectedTemplateId)

  const createMutation = useMutation({
    mutationFn: (data: unknown) => api.post('/templates', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/templates/${res.data.id}`)
    },
    onError: () => setError('Помилка збереження. Перевірте заповнені поля.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введіть назву шаблону')
    if (steps.length === 0) return setError('Додайте хоча б один крок')
    setError('')
    createMutation.mutate({
      name: name.trim(),
      sport,
      steps: toWatchSteps(steps),
      notes: notes || undefined,
      isPublic: canPublish ? isPublic : false,
    })
  }

  const handleFillFromTemplate = () => {
    if (!selectedTemplate) return
    setName(selectedTemplate.name)
    setNotes(selectedTemplate.notes ?? '')
    setSport(selectedTemplate.sport)
    setSteps(fromWatchSteps(selectedTemplate.steps))
    setError('')
  }

  return (
    <div className="page">
      <button className="btn-back" onClick={() => navigate('/templates')}>← Назад</button>
      <h2>Новий шаблон тренування</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>Взяти з бібліотеки</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
              Оберіть готовий шаблон, щоб підставити його у форму і швидко відредагувати під конкретне тренування.
            </p>
          </div>
          <span className="badge">{SPORT_OPTIONS.find((option) => option.value === sport)?.label}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <input
            type="text"
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Пошук по назві або автору"
            style={{ flex: '2 1 220px' }}
          />
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            style={{ flex: '3 1 260px' }}
          >
            <option value="">
              {isTemplatesLoading ? 'Завантаження шаблонів...' : filteredTemplates.length === 0 ? 'Немає шаблонів для цього спорту' : 'Оберіть шаблон'}
            </option>
            {filteredTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} • {template.creatorName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleFillFromTemplate}
            disabled={!selectedTemplate}
          >
            Підставити
          </button>
        </div>

        {selectedTemplate && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            {selectedTemplate.steps.length} кроків
            {selectedTemplate.notes ? ' • є нотатки' : ''}
            {' • автор: '}
            {selectedTemplate.creatorName}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: '2 1 200px' }}>
            <label>Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Інтервальне тренування 10x400м"
              required
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label>Вид спорту</label>
            <select value={sport} onChange={(e) => setSport(e.target.value as WatchSport)}>
              {SPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Нотатки (опціонально)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="card" style={{ marginBottom: 16, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Видимість шаблону</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                Поточний статус: <strong>{isPublic ? 'Публічний' : 'Персональний'}</strong>
              </p>
            </div>
            {canPublish ? (
              <label htmlFor="isPublic" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <span style={{ fontSize: 14 }}>Показувати в загальній бібліотеці</span>
              </label>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
                Лише тренер або адмін може змінювати публічність.
              </p>
            )}
          </div>
        </div>

        <h3 style={{ marginBottom: 8 }}>Кроки</h3>
        <WatchWorkoutStepList steps={steps} onChange={setSteps} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 20px' }}>
          {STEP_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.8125rem', padding: '4px 10px' }}
              onClick={() => setSteps((s) => [...s, makeStep(o.value)])}
            >
              + {o.label}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Збереження...' : 'Зберегти шаблон'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/templates')}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  )
}
