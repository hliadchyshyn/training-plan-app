import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useRaces, type RaceEntry } from '../api/races.js'
import { useAuthStore } from '../store/auth.js'
import { RaceResultPill } from '../components/RaceBadge.js'
import { formatDate, toLocalDateStr } from '../utils/date.js'
import { addDays, daysUntil, daysUntilLabel, diffTone, splitRaces } from '../utils/races.js'
import { getErrorMessage } from '../utils/errors.js'

type Tab = 'upcoming' | 'past'
type AthleteOption = { id: string; name: string }

/** One year back and forward — well inside the API's 800-day window. */
const RANGE_DAYS = 365

const SELECT_STYLE = {
  padding: '0.25rem 0.5rem',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--color-border)',
  fontSize: '0.8125rem',
  maxWidth: 200,
}

function TabSegment({ value, onChange, counts }: { value: Tab; onChange: (t: Tab) => void; counts: Record<Tab, number> | null }) {
  return (
    <div style={{ display: 'flex', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', overflow: 'hidden', flexShrink: 0 }}>
      {(['upcoming', 'past'] as Tab[]).map((t, i) => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '0.25rem 0.75rem', fontSize: '0.8125rem', fontWeight: 500, borderRadius: 0,
          border: 'none', borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none',
          background: value === t ? 'var(--color-primary)' : 'transparent',
          color: value === t ? '#fff' : 'var(--color-text-muted)',
        }}>
          {t === 'upcoming' ? 'Майбутні' : 'Проведені'}{counts && ` (${counts[t]})`}
        </button>
      ))}
    </div>
  )
}

function EventTitle({ entry }: { entry: RaceEntry }) {
  const title = <span style={{ fontWeight: 500 }}>{entry.eventTitle}</span>
  // External data — only plain web links, never javascript:/data: URLs.
  return entry.eventUrl && /^https?:\/\//i.test(entry.eventUrl)
    ? <a href={entry.eventUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{title} ↗</a>
    : title
}

function RaceRow({ entry, today, showAthlete }: { entry: RaceEntry; today: string; showAthlete: boolean }) {
  const days = daysUntil(entry.eventDate, today)
  const upcoming = entry.result === null && days >= 0

  return (
    <div className="race-row" style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0.5rem', borderBottom: '1px solid var(--color-border)', alignItems: 'flex-start' }}>
      <div style={{ width: 72, flexShrink: 0 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{formatDate(entry.eventDate)}</div>
        {upcoming && (
          <div style={{ fontSize: '0.75rem', color: days <= 7 ? '#c2410c' : 'var(--color-text-muted)', fontWeight: days <= 7 ? 600 : 400 }}>
            {daysUntilLabel(days)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {showAthlete && (
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }} title={entry.email}>
            {entry.athlete?.name ?? entry.email}
          </div>
        )}
        <div style={{ fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
          <EventTitle entry={entry} />
          <span style={{ color: 'var(--color-text-muted)' }}> · {entry.distance}</span>
          {entry.location && <span style={{ color: 'var(--color-text-muted)' }}> · {entry.location}</span>}
        </div>
        {entry.registrationWpId === null && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>без анонсу</div>
        )}
      </div>

      <div className="race-row-side" style={{ flexShrink: 0, textAlign: 'right', fontSize: '0.8125rem' }}>
        {entry.goalTimeRaw && (
          <div style={{ color: 'var(--color-text-muted)' }}>ціль <strong style={{ color: 'var(--color-text)' }}>{entry.goalTimeRaw}</strong></div>
        )}
        {entry.result ? (
          <div style={{ marginTop: '0.125rem' }}><RaceResultPill entry={entry} /></div>
        ) : !upcoming ? (
          <div style={{ color: 'var(--color-text-muted)' }}>результату ще немає</div>
        ) : null}
      </div>
    </div>
  )
}

function PastSummary({ entries }: { entries: RaceEntry[] }) {
  const withGoal = entries.filter((e) => e.result && e.goalSeconds)
  if (withGoal.length === 0) return null
  const achieved = withGoal.filter((e) => diffTone(e) === 'better').length
  const pbs = entries.filter((e) => e.result?.isPersonalBest).length

  return (
    <div className="card" style={{ marginBottom: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: '0.875rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      <span style={{ color: '#15803d' }}>Ціль досягнута: <strong>{achieved} з {withGoal.length}</strong></span>
      {pbs > 0 && <span style={{ color: '#7c3aed' }}>Особистих рекордів: <strong>{pbs}</strong></span>}
    </div>
  )
}

export function RacesPage() {
  const user = useAuthStore((s) => s.user)
  const isTrainer = user?.role === 'TRAINER' || user?.role === 'ADMIN'
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming'
  const athleteId = searchParams.get('athlete') ?? ''

  const setParam = (key: string, value: string) =>
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })

  const today = toLocalDateStr(new Date())
  const { data = [], isLoading, error } = useRaces({
    from: addDays(today, -RANGE_DAYS),
    to: addDays(today, RANGE_DAYS),
    athleteId: athleteId || undefined,
  })

  const { data: athletes = [] } = useQuery<AthleteOption[]>({
    queryKey: ['all-athletes'],
    queryFn: () => api.get('/teams/athletes').then((r) => r.data),
    enabled: isTrainer,
  })

  const { upcoming, past } = useMemo(() => splitRaces(data, today), [data, today])
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <div className="page">
      <h2 style={{ marginBottom: '0.25rem' }}>Старти</h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        {isTrainer
          ? 'Анонси та результати спортсменів з tsclub.com.ua — оновлюються одразу, щойно спортсмен їх зберіг.'
          : 'Ваші анонси та результати з tsclub.com.ua.'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <TabSegment value={tab} onChange={(t) => setParam('tab', t === 'upcoming' ? '' : t)} counts={isLoading ? null : { upcoming: upcoming.length, past: past.length }} />
        {isTrainer && (
          <select value={athleteId} onChange={(e) => setParam('athlete', e.target.value)} style={{ ...SELECT_STYLE, marginLeft: 'auto' }}>
            <option value="">Всі спортсмени</option>
            {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{getErrorMessage(error, 'Не вдалося завантажити старти')}</p>}
      {isLoading && <p className="page-loading">Завантаження...</p>}

      {!isLoading && !error && tab === 'past' && <PastSummary entries={past} />}

      {!isLoading && !error && list.length === 0 && (
        <div className="card page-empty">
          {tab === 'upcoming'
            ? <>Немає запланованих стартів. Спортсмени додають їх у розділі <strong>Анонс</strong> на tsclub.com.ua.</>
            : 'Ще немає результатів за останній рік.'}
        </div>
      )}

      {list.length > 0 && (
        <div className="card" style={{ padding: '0 0.5rem' }}>
          {list.map((entry) => (
            <RaceRow key={entry.key} entry={entry} today={today} showAthlete={isTrainer} />
          ))}
        </div>
      )}
    </div>
  )
}
