import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { IconBooks, IconDeviceWatch } from '@tabler/icons-react';
import { api } from '../api/client.js'
import type { WatchSport, WatchWorkoutStep } from '@training-plan/shared'
import {
  estimateWorkoutDurationSec,
  formatEstimatedDuration,
  SPORT_LABELS,
  SPORT_OPTIONS as BASE_SPORT_OPTIONS,
} from '../utils/watchWorkout.js'

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

const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Всі види' },
  ...BASE_SPORT_OPTIONS,
]

export default function TemplatesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [sport, setSport] = useState('')
  const [search, setSearch] = useState('')
  const [showInfo, setShowInfo] = useState(false)

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['templates', tab, sport],
    queryFn: () => {
      const params = new URLSearchParams()
      if (tab === 'mine') params.set('mine', 'true')
      if (sport) params.set('sport', sport)
      return api.get(`/templates?${params}`).then((r) => r.data)
    },
  })

  const filtered = search
      ? templates.filter((template) =>
            template.name.toLowerCase().includes(search.toLowerCase()),
        )
      : templates;

  return (
      <div className='page'>
          <div
              style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 16,
                  flexWrap: 'wrap',
              }}
          >
              <div style={{ flex: 1, minWidth: 280 }}>
                  <h2 style={{ margin: 0 }}>Шаблони</h2>
                  <p
                      style={{
                          margin: '4px 0 0',
                          fontSize: 13,
                          color: 'var(--color-text-muted)',
                      }}
                  >
                      Тут зберігаються шаблони тренувань, а також звідси можна
                      підготувати тренування для синхронізації на годинник.
                  </p>
              </div>
              <div className='templates-cta-row' style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                  <button
                      className='btn-secondary'
                      style={{ flex: 1, whiteSpace: 'nowrap' }}
                      onClick={() => navigate('/watch-workouts/new')}
                  >
                      <span
                          style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              whiteSpace: 'nowrap',
                          }}
                      >
                          <IconDeviceWatch size={16} />
                          Для годинника
                      </span>
                  </button>
                  <button
                      className='btn-primary'
                      style={{ flex: 1, whiteSpace: 'nowrap' }}
                      onClick={() =>
                          navigate('/watch-workouts/new?saveAsTemplate=1')
                      }
                  >
                      + Створити шаблон
                  </button>
              </div>
          </div>

          <div className='card' style={{ marginBottom: 16, padding: '0.75rem 1rem' }}>
              <button
                  type='button'
                  onClick={() => setShowInfo((value) => !value)}
                  aria-expanded={showInfo}
                  style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--color-text)',
                  }}
              >
                  <strong style={{ display: 'block', fontSize: 16 }}>
                      Про шаблони
                  </strong>
                  <span style={{ fontSize: 20, lineHeight: 1, color: 'var(--color-text-muted)' }}>
                      {showInfo ? '−' : '+'}
                  </span>
              </button>

              {showInfo && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                      <div
                          style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                          }}
                      >
                          <IconBooks
                              size={18}
                              style={{ flexShrink: 0, marginTop: 2 }}
                          />
                          <div>
                              <strong style={{ display: 'block', marginBottom: 2 }}>
                                  Шаблони для повторного використання
                              </strong>
                              <span
                                  style={{
                                      fontSize: 14,
                                      color: 'var(--color-text-muted)',
                                  }}
                              >
                                  Зберігайте типові тренування в бібліотеці, щоб
                                  швидко додавати їх у плани або готувати для
                                  годинника.
                              </span>
                          </div>
                      </div>
                      <div
                          style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                          }}
                      >
                          <IconDeviceWatch
                              size={18}
                              style={{ flexShrink: 0, marginTop: 2 }}
                          />
                          <div>
                              <strong style={{ display: 'block', marginBottom: 2 }}>
                                  Синхронізація на годинник як дія
                              </strong>
                              <span
                                  style={{
                                      fontSize: 14,
                                      color: 'var(--color-text-muted)',
                                  }}
                              >
                                  Якщо тренування потрібне один раз, створіть його
                                  звідси і одразу відправте в Intervals.icu або
                                  завантажте `.fit` для Garmin.
                              </span>
                          </div>
                      </div>
                  </div>
              )}
          </div>

          <div
              style={{
                  display: 'flex',
                  gap: 4,
                  marginBottom: 12,
                  borderBottom: '1px solid var(--color-border)',
                  paddingBottom: 0,
              }}
          >
              {(
                  [
                      ['all', 'Бібліотека'],
                      ['mine', 'Мої шаблони'],
                  ] as const
              ).map(([key, label]) => (
                  <button
                      key={key}
                      onClick={() => setTab(key)}
                      style={{
                          padding: '6px 14px',
                          fontSize: 14,
                          cursor: 'pointer',
                          border: 'none',
                          background: 'transparent',
                          fontWeight: tab === key ? 600 : 400,
                          color:
                              tab === key
                                  ? 'var(--color-primary)'
                                  : 'var(--color-text)',
                          borderBottom:
                              tab === key
                                  ? '2px solid var(--color-primary)'
                                  : '2px solid transparent',
                          marginBottom: -1,
                      }}
                  >
                      {label}
                  </button>
              ))}
          </div>

          <div
              style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 16,
                  flexWrap: 'wrap',
              }}
          >
              <input
                  type='text'
                  placeholder='Пошук за назвою...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                      flex: '2 1 160px',
                      padding: '6px 10px',
                      fontSize: 13,
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                  }}
              />
              <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  style={{
                      flex: '1 1 120px',
                      padding: '6px 10px',
                      fontSize: 13,
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                  }}
              >
                  {SPORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                          {option.label}
                      </option>
                  ))}
              </select>
          </div>

          {isLoading ? (
              <p className='page-loading'>Завантаження...</p>
          ) : filtered.length === 0 ? (
              <div className='page-empty'>
                  <IconBooks size={40} color='var(--color-text-muted)' />
                  <p>
                      {tab === 'mine'
                          ? 'У вас ще немає шаблонів.'
                          : 'Шаблонів не знайдено.'}
                  </p>
              </div>
          ) : (
              <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                  {filtered.map((template) => (
                      <div
                          key={template.id}
                          className='card'
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/templates/${template.id}`)}
                      >
                          <div
                              style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  gap: 8,
                              }}
                          >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                      style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          flexWrap: 'wrap',
                                      }}
                                  >
                                      <strong style={{ fontSize: '1rem' }}>
                                          {template.name}
                                      </strong>
                                      {template.isPublic && (
                                          <span
                                              className='badge'
                                              style={{
                                                  background:
                                                      'var(--mantine-color-blue-1)',
                                                  color: 'var(--mantine-color-blue-7)',
                                              }}
                                          >
                                              Публічний
                                          </span>
                                      )}
                                  </div>
                                  <div
                                      style={{
                                          marginTop: 4,
                                          display: 'flex',
                                          gap: 8,
                                          flexWrap: 'wrap',
                                      }}
                                  >
                                      <span className='badge'>
                                          {SPORT_LABELS[template.sport]}
                                      </span>
                                      <span className='badge'>
                                          {template.steps.length} кроків
                                      </span>
                                      {(() => {
                                          const duration = formatEstimatedDuration(
                                              estimateWorkoutDurationSec(
                                                  template.steps,
                                                  template.sport,
                                              ),
                                          );
                                          return duration ? (
                                              <span className='badge'>
                                                  {duration}
                                              </span>
                                          ) : null;
                                      })()}
                                  </div>
                                  {tab === 'all' && (
                                      <p
                                          style={{
                                              margin: '4px 0 0',
                                              fontSize: 12,
                                              color: 'var(--color-text-muted)',
                                          }}
                                      >
                                          {template.creatorName}
                                      </p>
                                  )}
                              </div>
                          </div>
                          {template.notes && (
                              <p
                                  style={{
                                      margin: '8px 0 0',
                                      fontSize: '0.875rem',
                                      color: 'var(--color-text-muted)',
                                  }}
                              >
                                  {template.notes}
                              </p>
                          )}
                      </div>
                  ))}
              </div>
          )}
      </div>
  );
}
