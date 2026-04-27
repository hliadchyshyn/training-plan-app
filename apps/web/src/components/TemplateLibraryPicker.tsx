import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'
import { templateStepsToPlanText } from '../utils/templateToPlanText.js'

interface TemplateLibraryItem {
  id: string
  name: string
  sport: WatchSport
  steps: WatchWorkoutStep[]
  notes?: string | null
  creatorName: string
}

const SPORT_LABEL: Record<WatchSport, string> = {
  RUNNING: 'Біг',
  CYCLING: 'Велосипед',
  SWIMMING: 'Плавання',
}

interface Props {
  title?: string
  description?: string
  buttonLabel?: string
  onApply: (template: TemplateLibraryItem & { planText: string }) => void
}

export function TemplateLibraryPicker({
  title = 'Додати з бібліотеки',
  description = 'Оберіть готове тренування з бібліотеки й підставте його в план.',
  buttonLabel = 'Додати в план',
  onApply,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const { data: templates = [], isLoading } = useQuery<TemplateLibraryItem[]>({
    queryKey: ['templates', 'plan-picker'],
    queryFn: () => api.get('/templates').then((r) => r.data),
  })

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return templates
    return templates.filter((template) =>
      template.name.toLowerCase().includes(normalizedSearch) ||
      template.creatorName.toLowerCase().includes(normalizedSearch),
    )
  }, [search, templates])

  const selectedTemplate = filteredTemplates.find((template) => template.id === selectedTemplateId)

  const handleApply = () => {
    if (!selectedTemplate) return
    onApply({
      ...selectedTemplate,
      planText: templateStepsToPlanText(selectedTemplate.steps),
    })
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{title}</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{description}</p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук по назві або автору"
          style={{ flex: '2 1 220px' }}
        />
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          style={{ flex: '3 1 260px' }}
        >
          <option value="">
            {isLoading ? 'Завантаження шаблонів...' : filteredTemplates.length === 0 ? 'Шаблони не знайдено' : 'Оберіть тренування'}
          </option>
          {filteredTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} • {SPORT_LABEL[template.sport]} • {template.creatorName}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={handleApply} disabled={!selectedTemplate}>
          {buttonLabel}
        </button>
      </div>

      {selectedTemplate && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {selectedTemplate.steps.length} кроків • {SPORT_LABEL[selectedTemplate.sport]} • автор: {selectedTemplate.creatorName}
        </p>
      )}
    </div>
  )
}
