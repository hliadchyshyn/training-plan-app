import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ActionIcon } from '@mantine/core'
import { IconPlus, IconBooks, IconDeviceWatch } from '@tabler/icons-react';
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
  const defaultSecPerKm: Record<WatchSport, number> = {
      RUNNING: 330,
      CYCLING: 120,
      SWIMMING: 600,
  };
  let total = 0
  const stack: { count: number; sub: number }[] = []

  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') {
        stack.push({ count: step.repeatCount ?? 4, sub: 0 });
        continue;
    }

    if (step.type === 'REPEAT_END') {
      const frame = stack.pop();
      if (frame) {
          const contribution = frame.sub * frame.count;
          if (stack.length > 0) stack[stack.length - 1].sub += contribution;
          else total += contribution;
      }
      continue
    }

    let duration = 0;
    if (step.durationUnit === 'TIME' && step.durationValue) {
        duration = step.durationValue;
    } else if (step.durationUnit === 'DISTANCE' && step.durationValue) {
        const pace =
            step.targetFrom && step.targetTo
                ? (step.targetFrom + step.targetTo) / 2
                : (step.targetFrom ?? defaultSecPerKm[sport]);
        duration = (step.durationValue / 1000) * pace;
    }

    if (stack.length > 0) stack[stack.length - 1].sub += duration;
    else total += duration;
  }

  return Math.round(total)
}

function formatDuration(sec: number): string {
  if (sec <= 0) return ''
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `~${h}г ${m > 0 ? `${m} хв` : ''}`;
  return m > 0 ? `~${m} хв` : '<1 хв'
}

export default function TemplatesPage() {
  const navigate = useNavigate()
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                      className='btn-secondary hide-mobile'
                      onClick={() => navigate('/watch-workouts/new')}
                  >
                      <span
                          style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                          }}
                      >
                          <IconDeviceWatch size={16} />
                          Для годинника
                      </span>
                  </button>
                  <button
                      className='btn-primary hide-mobile'
                      onClick={() =>
                          navigate('/watch-workouts/new?saveAsTemplate=1')
                      }
                  >
                      + Створити шаблон
                  </button>
              </div>
          </div>

          <div className='card' style={{ marginBottom: 16 }}>
              <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
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
                  <div
                      style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                      }}
                  >
                      <button
                          className='btn-primary'
                          onClick={() =>
                              navigate('/watch-workouts/new?saveAsTemplate=1')
                          }
                      >
                          Створити шаблон
                      </button>
                      <button
                          className='btn-secondary'
                          onClick={() => navigate('/watch-workouts/new')}
                      >
                          Разове для годинника
                      </button>
                  </div>
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
                                          {SPORT_LABEL[template.sport]}
                                      </span>
                                      <span className='badge'>
                                          {template.steps.length} кроків
                                      </span>
                                      {(() => {
                                          const duration = formatDuration(
                                              estimateDurationSec(
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

          <ActionIcon
              className='fab'
              radius='xl'
              size={56}
              onClick={() => navigate('/watch-workouts/new?saveAsTemplate=1')}
              aria-label='Створити шаблон'
          >
              <IconPlus size={24} />
          </ActionIcon>
      </div>
  );
}
